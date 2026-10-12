# TSFM Orbital Experiment — Design Decisions and Project Status

**Last updated:** 2026-06-05
**Status:** Phase 1 (data) and Phase 2 (smoke test) complete. Both models (Chronos-Bolt + Moirai) wired and working on `r(t)`. Exploratory phase-space experiments built. Phase 3 full sweep not yet wired.

---

## Purpose of this document

This is a living handoff document. It captures every design choice made for the project so far, the rationale behind those choices, and what is expected to happen next. The intent is that this document can be handed to another Claude conversation, a colleague, or a manager at any point and answer: *what is done, what is next, and why was each choice made?* It should be updated at the end of each major phase.

---

## Project overview

Test whether Time-Series Foundation Models (TSFMs) — specifically Chronos-Bolt (Amazon) and Moirai (Salesforce) — can usefully forecast planetary orbits despite never having been pretrained on orbital data. The hypothesis is that orbital data is sufficiently out-of-distribution for TSFMs that this is a genuine novel-domain generalization test. The project is framed by a healthy skepticism of TSFM marketing claims: it is designed to expose whether the technology is "real" or "fluff" in a way that produces a personally trustworthy answer.

## Goals

1. **(Gate) Capability probe.** Determine whether TSFMs can forecast unperturbed Keplerian orbits — and how their performance varies with orbital eccentricity, with the input/forecast ratio, and across two model families. Outcome: a clear personal verdict on whether TSFMs are trustworthy enough to use in the project owner's own (non-orbital) work.
2. **(Downstream) Hohmann transfer tool.** If Goal 1 passes, build a tool that uses a TSFM as a forward propagator plus an analytical "adjuster" function (residual physics correction) to solve Hohmann transfer orbit problems. Pursued only if the capability probe gives a green light.

The capability probe is treated as a **gate** for the Hohmann tool. If TSFMs fail the basic orbital forecasting test, the Hohmann tool is abandoned and the project's answer to "is the hype fluff" is "yes."

## Current status

- Design decisions are recorded below; **implementation progress, file inventory, findings, and deviations are in the "Implementation progress & findings (2026-06-05)" section near the bottom** — read that for the live state.
- Phases 1–2 done. Both model wrappers work on `r(t)`. Two exploratory phase-space experiments (start-time sweep, eccentricity heatmap) built for each model.
- Next: decide whether to fold findings into a structured Phase 3 sweep, or keep exploring phase-space. See "What's next".

---

## Design decisions

### Project framing

- **Eccentric orbits, not circular.** Circular orbits reduce to "continue a sinusoid," which TSFMs trivially handle and which does not probe whether the model captures physics. Eccentric orbits force the model to handle varying speed along the trajectory (Kepler's second law: equal areas in equal times, i.e., conservation of angular momentum).
- **Synthetic two-body orbital data, not real planetary ephemerides.** Cleaner experimental control. Real-data tests are a possible future extension.
- **No comparison baselines** (no naive persistence, seasonal naive, sinusoidal fit). Rationale: the eventual TSFM use case is *not* orbital data, so comparing to oscillation-specific baselines would not generalize. Errors are measured directly against the analytical ground-truth orbit from hapsira. Because we use normalized units (orbital radius ≈ 1), absolute error magnitudes are directly interpretable without baselines.

### Models under test

- **Head-to-head: Chronos-Bolt (Amazon) and Moirai (Salesforce), both run on the same data.** Two reasons: (a) user wants to compare model families directly; (b) testing both is itself a learning exercise about TSFM architectures.
- **Start with small-tier sizes: Chronos-Bolt-small (~48M params), Moirai-small (~14M params).** Small enough that each forecast on the available CPU is a couple of seconds; large enough that failures are likely model-architecture failures rather than parameter-count failures.
- **Escalation policy: if small-tier results look fishy or appear size-limited, re-run on base tier (Chronos-Bolt-base ~205M, Moirai-base ~91M).** User accepts multi-minute inference times for the larger sizes when needed.
- **Hardware: 12th gen Intel Core i7-1255U + Intel Iris Xe integrated graphics.** PyTorch does not natively use Iris Xe, so all inference runs on CPU. Do not over-optimize for this specific hardware — any eventual deployment target will also have CPU + GPU.

### Data design

- **Synthetic Keplerian orbits generated via hapsira's analytical propagator.** hapsira is the maintained community fork of poliastro (which is in maintenance-only mode). Battle-tested implementation of Kepler's-equation-based propagation. A hand-rolled solver will only be written if a niche case demands it.
- **Normalized units: gravitational parameter μ = 1, semi-major axis a = 1, orbital period = 2π.** Avoids astronomical magnitudes and unit-conversion plumbing. If problems arise, revert to physical units; assume normalized by default.
- **Eccentricity sweep: e ∈ {0.1, 0.3, 0.5, 0.7}.** Spans the difficulty curve from barely-elliptical (mostly tests periodicity continuation) to cometary-scale (sharp periapsis dips, strong physics test). Allows performance to be plotted as a function of eccentricity rather than reported as a single number.
- **Sampling: 256 samples per orbit, uniform in time.** Uniform-in-time matches what TSFMs assume (evenly spaced timesteps). 256 samples per orbit balances two needs: (a) enough resolution to capture the fast periapsis passage even at e = 0.7 (≈ 8 samples through the dip), and (b) enough timesteps in a 512-timestep context window to show roughly two full orbits.
- **5 realizations per (eccentricity, ratio) combination.** Each realization is a different starting phase along the orbit. Tests phase-invariance and prevents conclusions from a single lucky/unlucky configuration.

### Data representation

The forecasting task is run in two representations, separately:

- **`r(t)` — radial distance only.** A single scalar that oscillates between periapsis (closest point to the central body) and apoapsis (farthest point). Univariate. Both models handle this natively in a directly comparable way.
- **`(x(t), y(t))` — Cartesian position in the orbital plane.** Multivariate. Chronos-Bolt forecasts each axis as an independent univariate problem (two separate runs that do not coordinate). Moirai forecasts both axes jointly via its multivariate attention.

**Order of work:** `r(t)` first, then `(x, y)`. Four total (model, representation) combinations: Chronos-on-r, Chronos-on-xy, Moirai-on-r, Moirai-on-xy.

### Forecasting task design

For every (model, representation, eccentricity) combination, three context/forecast tiers are tested:

| Tier | Context length | Forecast horizon | What it tests |
|---|---|---|---|
| Easy | 1.5 orbits (384 samples) | 0.5 orbit (128 samples) | Pattern continuation when one full period has already repeated in context |
| Medium | 1 orbit (256 samples) | 1 orbit (256 samples) | Whether the model can reproduce a periodic structure after seeing exactly one period |
| Hard | 0.5 orbit (128 samples) | 0.5 orbit (128 samples) | Whether the model can extrapolate orbital completion from a partial view (never seen a full period) — the primary "physics vs. pattern matching" test |

- **Total test cases per (model, representation) combo:** 4 eccentricities × 3 ratios × 5 realizations = 60.
- **Total forecasts across the experiment:** 4 (model, representation) combos × 60 = 240 forecasts.
- **20 samples per forecast.** Moirai produces probabilistic forecasts (distributions, not point estimates), so each forecast is drawn 20 times. 20 is the standard TSFM default; enough to compute stable medians. (NOTE: Doesn't apply to Bolt — Bolt is a direct quantile regressor, not a sampler.)
- **Fixed random seed per run.** Reproducible — rerunning the script with the same code produces identical numbers.

### Metrics

- **Phase 1: pointwise accuracy only.**
  - **Median collapse:** take the median across the 20 sampled trajectories at each future timestep, producing one "best guess" trajectory.
  - **RMSE on `r(t)`** for the radius experiments.
  - **Per-axis RMSE on `x(t)` and `y(t)` plus 2D Euclidean trajectory RMSE** for the Cartesian experiments.
- **Phase 2 (later, after Phase 1 yields results): physics-aware metrics**, added by reprocessing already-saved trajectories without re-running inference. These probe whether the model has learned dynamics or only patterns:
  - **Specific orbital energy drift.** In normalized units, E = ½v² − 1/r is a constant of motion. Compute it from finite-differenced forecasted positions; check whether it drifts over the forecast horizon.
  - **Specific angular momentum drift.** L = x·vy − y·vx is also conserved. Different conservation law than energy, so a model could break one but not the other.
  - **Trajectory closure.** Does the forecasted orbit return to near its starting point after one period?
  - **Period preservation.** Does the forecasted oscillation occur at the right frequency?
- **Prediction intervals and calibration** (treating the 20 samples as a distribution rather than collapsing to median) are deferred until both pointwise and physics-aware metrics are in place.

### Implementation phasing (5 phases)

1. **Phase 1 — Data generation.** Build the hapsira-based orbit generator. Produce all (eccentricity, ratio, realization) series as numpy arrays. Validate by plotting a few. No models involved.
2. **Phase 2 — Single-model smoke test.** Get one (model, representation, case) combination working end-to-end. Verify the pipeline runs, the forecast looks sensible, RMSE computes.
3. **Phase 3 — Full sweep.** Extend to all 4 (model, representation) combos × 60 cases. Collect all pointwise metrics.
4. **Phase 4 — Physics-aware metrics.** Reprocess saved trajectories to compute energy/angular-momentum/closure/period metrics. No re-inference needed.
5. **Phase 5 — Analysis and writeup.** Plots, comparisons, narrative. Decide based on results whether to pursue Goal 2 (Hohmann transfer tool) or perturbed-orbit follow-ups.

Task tracking via TaskCreate begins at Phase 1.

---

## Deferred / out of scope (may revisit)

- **Perturbed orbits (J2 oblateness, third-body).** Decision will be made only if the unperturbed results are ambiguous or surprisingly good and warrant a follow-up stress test.
- **Prediction intervals and calibration metrics.** Will revisit after pointwise + physics-aware metrics are in place. No additional inference is needed to upgrade later since the 20 samples are already drawn.
- **Real planetary ephemerides** (instead of synthetic two-body data).
- **Physical units** (instead of normalized μ=1, a=1).
- **Comparison baselines** (intentionally excluded — see "Project framing").

---

## Working with the assistant

For any Claude conversation or collaborator picking this project up, the project owner has set these rules:

1. **The assistant does not edit project source files directly.** The user writes all code themselves as a learning exercise. The assistant may inspect commits and point out bugs at a description level, but never patches code. Memory files and explicitly-requested handoff documents like this one are the exceptions.
2. **The assistant does not produce paste-ready code unless directly asked.** Function descriptions, function signatures, bug-pointing, and small snippets demonstrating a new API are all fine. Large code blocks ready to copy-paste are not.
3. **Communication style.** Physics 1 + calculus level. Orbital mechanics terms are fine to use, but should be briefly defined conceptually using basic physics/calculus when introduced (e.g., "periapsis = closest point in the orbit").
4. **No assumptions about design choices.** The assistant should ask the user before committing to any non-trivial implementation decision.
5. **Narrated TSFM mechanics.** The user wants to understand what the models are doing internally, so explanations of architecture, normalization, quantization/patching, probabilistic outputs, etc. are expected as design and code choices are made.

---

## Implementation progress & findings (2026-06-05)

### Environment
- Python 3.12, `uv`-managed. Inference on CPU.
- **Dependency note:** adding Moirai forced a torch downgrade. `uni2ts` 2.0.0 pins `torch<2.5`; the project pin was lowered from `>=2.12.0` to **`torch>=2.2,<2.5`** so Chronos and Moirai coexist. Resolved: torch 2.4.1+cpu, numpy 1.26.4, scipy 1.11.4, pandas 2.3.3, gluonts 0.14.3, lightning 2.6.5. (Full detail in memory: `project-moirai-setup.md`.)

### Source layout
- `src/config.py` — constants. `ECCENTRICITIES=(0.1,0.3,0.5,0.7)`, `SAMPLES_PER_ORBIT=256`, `N_ORBITS=5` (so stored series are 1280 samples = 5 orbits), `TIERS` (easy/medium/hard), `PHASE_OFFSETS` (r0 starts at periapsis), `RANDOM_SEED=34`, `DATA_DIR`.
- `src/orbits.py` — `generate_orbit(eccentricity, phase_offset, n_orbits, samples_per_orbit) -> OrbitSeries` (fields `t,x,y,r,eccentricity,phase_offset`). hapsira analytical propagation.
- `src/models.py` — **two wrappers, both returning shape `(num_quantiles, prediction_length)`** so they're interchangeable:
  - `forecast_chronos_bolt(context, prediction_length, quantile_levels=[0.1,0.5,0.9])` — Bolt is a **direct quantile regressor** (`predict_quantiles`), not a sampler. Cached pipeline.
  - `forecast_moirai(context, prediction_length, quantile_levels=..., num_samples=50, patch_size=16)` — Moirai is a **sampling model**; draws 50 samples, reduces via `np.quantile(...,axis=0)`. Cached module. Fixed patch_size=16 (NOT "auto"). See `project-moirai-setup.md`.
- `scripts/`:
  - `generate_data.py` — writes `data/orbits/orbit_e{e}_r{0..4}.npz` (keys `t,x,y,r,...`).
  - `single_wave_chronos.py` / `single_wave_moirai.py` — single forecast + matplotlib plot (context / ground truth / median / 10–90% band via `fill_between`) with vertical lines at the context boundary and the +64 native-horizon mark. **Easy tier: 384-sample context → 128 forecast, e=0.3, r0.** Still uses the old loop-based `RMSE` (not `fast_rmse`) — a leftover from the smoke-test era.
  - `start_time_testing_chronos.py` / `_moirai.py` — sweep 50 random start phases (drawn without replacement) × the 4 base eccentricities. **256 context → 64 forecast (native horizon, no recursion).** Metric: **normalized RMSE = RMSE/(2e)** via local `fast_rmse`; scatter colored by eccentricity with per-eccentricity Spearman ρ + mean in the legend.
  - `eccentricity_heatmap_chronos.py` / `_moirai.py` — 2D heatmap (`ax.matshow`, `origin='lower'`, `aspect='auto'`). Rows = 19 eccentricities (0.05…0.95), **cols = 64 start indices (`START_STEP=4`)**, cell = normalized RMSE, **64-step forecast**. Orbits generated on the fly via `generate_orbit(e, 0.0)`. **~1216 forecasts/run.** Color scale is plain linear viridis (the `vmax` percentile-clip line is commented out). **Known issue:** both import `fast_rmse` via `from space.scripts.start_time_testing_chronos import fast_rmse`, which likely fails under `python -m scripts.x` (no importable `space` package) — needs a shared metrics helper instead.

### Key findings so far (Chronos-Bolt, `r(t)`)
*Caveat: these were observed during live exploration, partly at a 256-step (medium-tier) horizon. The committed scripts have since moved to a 64-step forecast horizon, so re-confirm the specifics against current settings.*
- **Bolt overshoots the periapsis floor.** On e=0.3 the median forecast dips *below* the physical minimum `r=1-e=0.7` (to ~0.65) in the first ~40 steps — an impossible radius. This happens **within the native 64-step horizon (single forward pass, not recursion)**, so it's a genuine model failure, not a recursive-decoding artifact. Verified from source that Bolt's first 64 steps are horizon-independent (see `project-chronos-bolt-horizon.md`). Reads as pattern-continuation with no physics constraint.
- **The forecast also lags in phase, stretches the period, and its 10–90% band excludes the ground truth** for much of the (256-step) horizon (confidently wrong / overconfident).
- **Heatmap pattern (from the earlier step-8 / 256-horizon run):** error is high when the forecast launches near periapsis (start near 0 and near the end of the first orbit) and low mid-orbit (near apoapsis), and the effect sharpens with eccentricity. Cyclic phase structure — the model's weak spot is the fast periapsis passage, not orbits in general. (A single start-time-vs-RMSE correlation understates this because phase is cyclic, not monotonic.)
- Moirai versions of all three experiments are built; **Moirai-vs-Bolt comparison on these plots is the immediate analysis to do** — including re-running the heatmaps at current settings.

### Deviations from the original design
- **"20 samples → median"** applies to Moirai only, and we use **50 samples** (not 20). Bolt is a quantile regressor (no sampling); its "median" is just the 0.5 quantile.
- **Extra exploratory experiments** beyond the original 5-phase plan: the start-time sweep and the fine-grained eccentricity heatmap (0.05–0.95) are phase-space probes that go beyond the doc's discrete {0.1,0.3,0.5,0.7} grid. They were added to understand *how* error depends on phase and eccentricity before committing to the structured 240-forecast sweep.
- **Normalized RMSE (÷2e)** is the comparison metric for `r(t)`; raw RMSE isn't comparable across eccentricities. (Memory: `project-rmse-conventions.md`.)

---

## What's next

- **Analyze Moirai vs Chronos** on the existing single_wave / start-time / heatmap plots. Does Moirai (native long-horizon, no 64-step recursion) avoid Bolt's periapsis-floor overshoot? Compare normalized-RMSE heatmaps side by side.
- **Decide sweep vs keep-exploring.** Either fold these findings into the structured Phase 3 sweep (4 model×rep combos × 60 cases, persisting trajectories to disk so Phase 4 physics metrics don't re-run inference), or run more phase-space probes first.
- **Then `(x, y)` Cartesian representation** — `forecast_moirai` already notes target_dim/feat-dim will change for multivariate; Chronos does x and y as two independent univariate runs.
- **Phase 4 physics-aware metrics** (energy/angular-momentum/closure/period drift) on saved trajectories.
- **Tooling cleanups:** the `single_wave` scripts may still carry minor leftovers from the smoke-test era; a shared metrics module (promote `fast_rmse`) would reduce duplication across the six experiment scripts.
