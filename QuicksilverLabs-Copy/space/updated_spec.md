# TSFM Orbital Experiment — Updated Spec & Handoff

**Last updated:** 2026-06-09
**Supersedes the live-state sections of `design_doc.md`.** The original `design_doc.md` still holds the project framing, rationale, and the original 5-phase plan. This file is the current source of truth for repo state, conventions, and what's next. Read this first.

---

## 1. Project purpose (unchanged)

Test whether Time-Series Foundation Models (TSFMs) can usefully forecast planetary orbits despite never being pretrained on orbital data. The project is a deliberate, skeptical capability probe: is the TSFM hype "real or fluff" for a genuinely out-of-distribution domain? Two goals:

1. **(Gate) Capability probe** — can TSFMs forecast Keplerian orbits, and how does performance vary with eccentricity, context/forecast ratio, representation, and model family? Produces a personal verdict on whether TSFMs are trustworthy.
2. **(Downstream, gated on #1) Hohmann transfer tool** — TSFM as forward propagator + analytical residual corrector. Only pursued if the probe gives a green light.

The probe is structured as a difficulty ramp: start with things a TSFM *should* handle, then make it progressively harder and watch where it breaks.

---

## 2. Difficulty ramp — where we are

| Stage | Representation | Variables | Status |
|---|---|---|---|
| Easy | `r(t)` radial distance | 1 (univariate) | ✅ Done |
| Medium | `(x, y)` planar position | 2 (joint multivariate) | ✅ Done |
| **Next** | **`(x, y, vx, vy)` phase-space state** | **4** | **▶ Starting (Idea 1)** |
| Later | Precessing orbit under J2 | 2–4 | Planned (Idea 4) |

**Framing of the ramp:** `r(t)` is "continue a wave" — TSFMs should ace it (and largely did, modulo the periapsis-floor overshoot below). `(x, y)` adds joint multivariate coupling. The next stages add (a) a calculus constraint between channels (velocity = derivative of position) and (b) broken periodicity (precession), each designed to separate *learned dynamics* from *pattern matching*.

---

## 3. Models under test

**IMPORTANT — the model lineup changed from `design_doc.md`.** The doc describes Chronos-**Bolt** and Moirai-**1.1-R**. The code has since migrated to the **v2** families:

- **Chronos-2** — `amazon/chronos-2` (base) and `autogluon/chronos-2-small`. Native multivariate (shares information across variates). Direct quantile regressor. Model context length **8192** (per checkpoint config; the `default_context_length=2048` class attribute is *not* used at inference). Long horizons use an internal autoregressive long-horizon heuristic past the native output length.
- **Moirai-2** — `Salesforce/moirai-2.0-R-small`. Also multivariate via `target_dim`. **Hard context cap of 512** (enforced by an assert in the wrapper). Returns quantiles directly via `forecast.quantile(q)` (no manual sampling step, unlike Moirai-1.1).

**Decision (2026-06-09):** going forward the new harder tests are **Chronos-2 only**. Moirai was used for the `r(t)` and `(x,y)` comparisons and is no longer the focus. Its wrapper still works and stays in the repo.

### Verified wrapper API & shape conventions (`src/models.py`)

Both wrappers share a return convention so they're interchangeable:
- **Univariate:** returns `(n_quantiles, prediction_length)`.
- **Multivariate:** returns `(n_quantiles, prediction_length, target_dim)`.

`forecast_chronos2_base / _small(context, prediction_length, quantile_levels=[0.1,0.5,0.9], target_dim=1)`
- **Input:** variate-major. Univariate → 1-D `(T,)`. Multivariate → 2-D `(target_dim, T)` (e.g. `np.stack([x_ctx, y_ctx])`). Wrapped in a list (`[context]`) before `predict_quantiles`.
- **Output handling:** `predict_quantiles` returns a list; element shape `(n_variates, pred_len, n_q)`. Branch on `target_dim`:
  - `==1` → `.squeeze(0).swapaxes(0,1)` → `(n_q, pred_len)`.
  - `>1` → reverse all axes (`.T`) → `(n_q, pred_len, target_dim)`. (Use `quantiles[0].numpy().T`; `.T` on a 3-D torch tensor is deprecated/warns.)
- **Context limit:** 8192. You don't pass `context_length` — it defaults to the model max. The lever is how many points you slice into the context array.
- **Sharp edge:** nothing validates that `target_dim` matches the context's first axis. Pass a 2-D context with `target_dim=1` and it silently mangles the output.

`forecast_moirai2(context, prediction_length, quantile_levels=[0.1,0.5,0.9], target_dim=1)`
- **Input:** same variate-major `(target_dim, T)` convention; gluonts entry `{"start": pd.Period, "target": (target_dim, T)}`.
- **Output:** `forecast.quantile(q)` returns `(pred_len, target_dim)`; stacking over quantiles → `(n_q, pred_len, target_dim)` — same convention as Chronos (verified drop-in).
- **Caps & caveats:** `assert context.shape[-1] <= 512`. The multivariate path is vendor-flagged "not tested" in the uni2ts source — verified correct by source trace **and** a runtime shape print, but re-print `.shape` if internals change.

### Orientation gotcha (bit us once, keep in mind)
- **Model input** is **variate-major** `(target_dim, T)` — stack with `np.stack([...], axis=0)` (default).
- **Model output / metric arrays** are **time-major** `(pred_len, target_dim)` — when rebuilding ground-truth pairs for metrics, stack with `np.stack([...], axis=1)`. Default `axis=0` here silently produces wrong distances.

---

## 4. Repo structure

```
space/
├── design_doc.md            # original framing + rationale (Bolt/Moirai-1.1 era)
├── updated_spec.md          # THIS FILE — current source of truth
├── pyproject.toml           # uv-managed; torch pinned >=2.2,<2.5 (Chronos+Moirai coexist)
├── src/
│   ├── config.py            # constants (see below)
│   ├── orbits.py            # generate_orbit() via hapsira; OrbitSeries dataclass
│   ├── models.py            # forecast_chronos2_base/_small, forecast_moirai2
│   └── metrics.py           # fast_rmse, normalized_rmse, trajectory_rmse
├── scripts/
│   ├── generate_data.py     # writes data/orbits/*.npz (shared — NOT radius-specific)
│   ├── radius/              # univariate r(t) experiments
│   │   ├── single_wave_chronos.py / _moirai.py
│   │   ├── start_time_testing_chronos.py / _moirai.py
│   │   └── eccentricity_heatmap_chronos.py / _moirai.py
│   └── XYPairs/             # multivariate (x,y) experiments
│       └── (single-wave phase-space reconstruction script)
├── notebooks/
│   └── explore_orbits.ipynb # x-vs-y and t-vs-r sanity plots
└── data/orbits/             # orbit_e{e}_r{realization}.npz, keys: t,x,y,r,eccentricity,phase_offset
```

**Running scripts:** as modules from project root, e.g. `python -m scripts.radius.single_wave_chronos`, `python -m scripts.XYPairs.<name>`. All scripts import only from `src.*` (no sibling-script imports), so the folder layout is free to change. No `__init__.py` needed (namespace packages under `-m`).

### `src/config.py` key constants
- `ECCENTRICITIES = (0.1, 0.3, 0.5, 0.7)`
- `MU = 1.0`, `A = 1.0`, `PERIOD = 2π` (normalized units)
- `SAMPLES_PER_ORBIT = 256`, `N_ORBITS = 36` (stored series = 9216 samples), `N_REALIZATIONS = 5`
- `PHASE_OFFSETS` — 5 starting true-anomalies, wrapped to (−π, π]
- `RANDOM_SEED = 34`, `DATA_DIR`
- `TIERS` — easy (ctx 384 / fc 128), medium (256/256), hard (128/128)

### `src/orbits.py`
- `generate_orbit(eccentricity, phase_offset, n_orbits=N_ORBITS, samples_per_orbit=SAMPLES_PER_ORBIT) -> OrbitSeries`
- `OrbitSeries` fields: `t, x, y, r, eccentricity, phase_offset`
- hapsira analytical propagation; **planar** (`inc=0`, asserts `|z| < 1e-10`); normalized units; attractor is a unit-mass point body.

### `src/metrics.py`
- `fast_rmse(real, predicted)` — `√(mean((real−predicted)²))`, vectorized.
- `normalized_rmse(real, predicted, eccentricity)` — `fast_rmse / (2e)`. The `2e` is the peak-to-peak radial swing (periapsis `a(1−e)` to apoapsis `a(1+e)`), making error comparable across eccentricities. **`r`-specific** — does not transfer to `(x,y)`. Requires `e ∈ (0,1)`.
- `trajectory_rmse(real_xy, predicted_xy) -> float` — per-step Euclidean distance `np.linalg.norm(real_xy − predicted_xy, axis=1)` then RMS over steps. Inputs `(pred_len, 2)`. Identically equals `√(rmse_x² + rmse_y²)`; it's the single "how far off in the plane" scalar.

---

## 5. Key findings so far

**Chronos (radius, `r(t)`):**
- **Periapsis-floor overshoot.** Median forecast dips *below* the physical minimum `r = 1−e` near periapsis (an impossible radius). On Chronos-Bolt this was confirmed to occur within the native single-pass horizon (not a recursion artifact) — a genuine model failure, reading as pattern-continuation with no physics constraint. Re-confirm whether Chronos-2 still does this.
- Forecasts also lagged in phase, stretched the period, and produced overconfident intervals (10–90% band excluding ground truth) on longer horizons.
- Heatmap: error is highest when the forecast launches near periapsis (the fast part of the orbit) and lowest mid-orbit; sharpens with eccentricity. The model's weak spot is the fast periapsis passage, not orbits in general.

**`(x, y)` planar (Chronos-2 joint multivariate, Moirai-2):**
- Pipeline working end-to-end. Phase-space reconstruction plots generate and look correct for both Chronos-2-small and Moirai-2. (Detailed quantitative comparison still to be written up.)

---

## 6. The `(x, y)` phase-space test (just completed) — reference pattern

The XYPairs single-wave script is the template the next tests build on:
1. Load `.npz`; slice context (`x[:CTX]`, `y[:CTX]`) and true-future window for metrics.
2. `context = np.stack([x_ctx, y_ctx])` → `(2, T)`; call `forecast_chronos2_base(context, FC, target_dim=2)` → `(n_q, pred_len, 2)`.
3. Unpack median `result[1]` → columns are predicted x, y.
4. Metrics: per-axis `fast_rmse` ×2 + `trajectory_rmse` (build `real_xy` with `axis=1`).
5. **Plot (phase-space, matches `explore_orbits.ipynb`):** `set_aspect("equal")`; true orbit as a complete **black** ellipse (plot the context — ≥1 full orbit makes the ellipse complete); model forecast as **dotted orange** over it; `+` at origin. No uncertainty band (doesn't render cleanly in a parametric x–y view). Keep `FORECAST_LENGTH ≤ SAMPLES_PER_ORBIT` so the orange arc doesn't loop over itself.

Design decisions locked in: **joint multivariate** (not independent per-axis) for Chronos-2; **explicit `target_dim` param** on the wrappers.

---

## 7. NEXT — Idea 1: Full phase-space state `(x, y, vx, vy)`

**Goal:** add velocity channels so the model must respect a calculus constraint, not just spatial correlation.

### Variables (4)
- `x, y` — planar position (already have).
- `vx, vy` — planar velocity components.

### Data-generation changes (low cost)
- Extend `OrbitSeries` with `vx, vy` fields.
- In `generate_orbit`, obtain velocities either (a) from hapsira's ephemeris velocity output, or (b) by finite-differencing `x, y` w.r.t. `t` (`np.gradient`). Prefer hapsira's analytical velocity if readily available; finite-difference is an acceptable fallback (note the endpoint inaccuracy).
- Update `generate_data.py` to save `vx, vy` into the `.npz`.
- **Scale note:** in normalized units (μ=1, a=1) the circular speed is ≈1, so velocity magnitudes are order-1 — comparable to position magnitudes (which span ±(1+e)). Chronos normalizes per-variate internally, so differing channel scales are handled, but worth confirming.

### What makes it harder
- **Derivative coupling.** `vx, vy` are the exact time-derivatives of `x, y`. The four channels are bound by calculus, and **nothing forces a TSFM to honor that** — it sees four correlated series. A model that's pattern-matching can produce a predicted position track and a predicted velocity track that are mutually inconsistent.
- **Sharp velocity feature.** By vis-viva, `v = √(2/r − 1)` in these units — speed peaks sharply at periapsis (`r = 1−e`) and is minimal at apoapsis (`r = 1+e`). The velocity channels have a fast spike in exactly the region the model already mishandled on `r`.

### What it tests
- Whether joint multivariate attention captures the position↔velocity derivative relationship and keeps them **kinematically consistent** (does predicted `x` look like the integral of predicted `vx`?).
- Whether it reproduces the periapsis speed-up rather than smearing it.

### Metrics & plots (proposed)
- Per-axis `fast_rmse` on all four channels; separate **position** trajectory RMSE and **velocity** trajectory RMSE (2-D Euclidean each).
- **Kinematic-consistency check (physics-aware):** finite-difference the *predicted* position and compare to the *predicted* velocity. Large disagreement = the model is treating the channels independently.
- **Plots:** position in the x–y plane (as now). Velocity in the `vx–vy` plane — note the **velocity hodograph of a Keplerian orbit is a circle**, so the predicted velocity track should trace a circle; deviations are an immediately legible failure signal.
- Call site: `np.stack([x_ctx, y_ctx, vx_ctx, vy_ctx])` → `(4, T)`, `target_dim=4`. Wrapper already handles any `target_dim` with no code change.

---

## 8. LATER — Idea 4: Precessing orbit under J2

**Goal:** break exact periodicity so pure pattern-replay fails — the sharpest "physics vs pattern-matching" discriminator.

### Variables (2–4)
- `x, y` (and optionally `vx, vy` from Idea 1).

### Data-generation changes (highest cost — new propagator)
- Replace the analytical Kepler propagation with **numerical (Cowell) integration including a J2 oblateness perturbation**. hapsira provides J2 perturbation forces + a Cowell propagator.
- The synthetic attractor needs an oblateness coefficient `J2` and an equatorial radius `R` (beyond the current pure point-mass μ=1 setup) — so the normalized-units convention needs a small extension. **Decision needed:** choose `J2`/`R` (and possibly orbit altitude) so precession is visible over the stored horizon but the orbit is still recognizably elliptical.
- This is the deferred "perturbed orbits" item from `design_doc.md` finally being taken up.

### What makes it harder
- **Apsidal precession** — J2 makes the argument of periapsis advance each orbit, so the ellipse's long axis slowly rotates. The trajectory is **quasi-periodic, not periodic**: the context never repeats exactly.
- A model that replays its most recent period is now **systematically wrong**, and the error grows with horizon.

### What it tests
- The core project question: does the model extrapolate a slowly-evolving trajectory (evidence of learned dynamics) or just copy-paste the last loop (pattern matching)?
- Whether feeding velocity channels (Idea 1's representation) helps the model "feel" the precession.

### Metrics & plots (proposed)
- Trajectory RMSE as before, expected to grow faster with horizon than the unperturbed case.
- **Precession-rate metric:** estimate the apsidal advance per orbit in the forecast vs. the true value — directly measures whether the model captured the drift.
- **Plot:** the black reference is no longer a single closed ellipse — it's a rosette (precessing ellipse). Overlay the orange forecast; a pattern-matcher's orange will close back on the *old* ellipse orientation instead of advancing.

---

## 9. Working-with-assistant rules (unchanged, enforced)

1. **Assistant does not edit project source files.** User writes all code as a learning exercise. Exceptions: memory files and explicitly-requested handoff docs like this one.
2. **No unsolicited paste-ready code.** Descriptions, signatures, bug-pointing, and small new-API snippets are fine; full function bodies / whole-file rewrites are not.
3. **Teach concept-first.** For each new function/constant/import: explain conceptually, wait for confirmation, then give the structured description. Don't chain snippets into a de-facto full implementation.
4. **No assumptions on design choices** — verify against this spec / `design_doc.md`, then ask.
5. **Verify library claims from source** — read the actual `.venv` source before asserting shapes/behavior.
6. **Communication level:** Physics 1 + calculus. Define orbital terms briefly when introduced. Narrate what the TSFM is doing internally (normalization, patching, quantiles, multivariate attention).

---

## 10. Immediate next step

Start **Idea 1**: extend `OrbitSeries`/`generate_orbit` with `vx, vy`, regenerate data, then build an XYPairs-style 4-variable script (`target_dim=4`) with the position + velocity-hodograph plots and the kinematic-consistency check.
