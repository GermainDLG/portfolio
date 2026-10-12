/* ===== Data Harmony — Grader flow =====
 * Modular POC. Config-driven pieces (confidence buckets, reasons, verdicts)
 * are isolated in CONFIG so the next phase (9 confidence buckets,
 * constrained reason lists) is a data change, not a redesign.
 */

/* ---------- Config (modularity layer) ---------- */

const CONFIG = {
  // Swap for 9 percentage buckets next phase; UI renders whatever is here.
  confidenceLevels: [
    { key: "high", label: "High", cssClass: "conf-high", rank: 3 },
    { key: "med",  label: "Med",  cssClass: "conf-med",  rank: 2 },
    { key: "low",  label: "Low",  cssClass: "conf-low",  rank: 1 },
  ],
  // mode: "freetext" today; switch to "options" + populate list next phase.
  reasons: { mode: "freetext", options: [] },
  verdicts: [
    { key: "accept",     label: "Accept",      bulk: true  },
    { key: "reject",     label: "Reject",      bulk: true  },
    { key: "reassign",   label: "Reassign",    bulk: false },
    { key: "assignNone", label: "Assign None", bulk: false },
    { key: "expand",     label: "Expand",      bulk: false },
  ],
  postgresTypes: [
    "text", "varchar(255)", "integer", "bigint", "numeric", "boolean",
    "date", "timestamp", "timestamptz", "uuid", "jsonb", "bytea",
  ],
};

/* ---------- Canonical schema (OMOP CDM — reassign / expansion targets) ---------- */

const CANONICAL_SCHEMA = {
  PERSON: ["person_id", "gender_concept_id", "year_of_birth", "month_of_birth", "day_of_birth", "birth_datetime", "death_datetime", "race_concept_id", "ethnicity_concept_id", "person_source_value", "gender_source_value", "gender_source_concept_id", "race_source_value", "ethnicity_source_value"],
  VISIT_OCCURRENCE: ["visit_occurrence_id", "person_id", "visit_concept_id", "visit_start_date", "visit_start_datetime", "visit_end_date", "visit_end_datetime", "visit_type_concept_id", "care_site_id", "visit_source_value", "admitted_from_source_value", "discharge_to_concept_id"],
  VISIT_DETAIL: ["visit_detail_id", "person_id", "visit_detail_concept_id", "visit_detail_start_date", "visit_detail_start_datetime", "visit_detail_end_date", "visit_detail_end_datetime", "admitted_from_concept_id", "discharge_to_source_value", "visit_detail_source_value", "visit_occurrence_id"],
  MEASUREMENT: ["measurement_id", "person_id", "measurement_concept_id", "measurement_date", "measurement_datetime", "value_as_number", "value_as_concept_id", "unit_concept_id", "range_low", "range_high", "visit_occurrence_id", "measurement_source_value", "unit_source_value", "value_source_value"],
  DRUG_EXPOSURE: ["drug_exposure_id", "person_id", "drug_concept_id", "drug_exposure_start_date", "drug_exposure_start_datetime", "drug_exposure_end_date", "drug_exposure_end_datetime", "drug_type_concept_id", "quantity", "sig", "route_concept_id", "lot_number", "visit_occurrence_id", "drug_source_value", "route_source_value", "dose_unit_source_value"],
  OBSERVATION: ["observation_id", "person_id", "observation_concept_id", "observation_date", "observation_datetime", "value_as_number", "value_as_string", "value_as_concept_id", "observation_source_value", "value_as_datetime"],
  PAYER_PLAN_PERIOD: ["payer_plan_period_id", "person_id", "payer_plan_period_start_date", "payer_plan_period_end_date", "payer_concept_id", "payer_source_value", "plan_concept_id", "plan_source_value"],
};

/* ---------- Mock pairings (upstream matcher: MIMIC-III → OMOP CDM) ----------
 * score is the matcher's point estimate for the top suggestion; alternates are
 * the next 4 candidates from its confidence-interval ranking. */

const PAIRINGS = [
  { id: "p1", score: 0.97,
    novel: { table: "PATIENTS", column: "SUBJECT_ID", type: "INTEGER", desc: "Unique identifier for an individual patient.", samples: ["10006", "10011", "10013"] },
    suggested: { table: "PERSON", column: "person_id", type: "bigint", desc: "Unique identifier for each person; every distinct id is treated as a distinct person." },
    alternates: [
      { table: "PERSON", column: "person_source_value", type: "varchar(50)", score: 0.89 },
      { table: "VISIT_OCCURRENCE", column: "person_id", type: "bigint", score: 0.71 },
      { table: "VISIT_DETAIL", column: "person_id", type: "bigint", score: 0.66 },
      { table: "MEASUREMENT", column: "person_id", type: "bigint", score: 0.58 },
    ],
    confidence: "high" },
  { id: "p2", score: 0.95,
    novel: { table: "ADMISSIONS", column: "HADM_ID", type: "INTEGER", desc: "Unique id for a single hospital admission (1000000–1999999).", samples: ["142345", "105331", "165520"] },
    suggested: { table: "VISIT_OCCURRENCE", column: "visit_occurrence_id", type: "bigint", desc: "Identifies unique interactions between a person and the health care system; links events to a visit." },
    alternates: [
      { table: "VISIT_DETAIL", column: "visit_occurrence_id", type: "bigint", score: 0.77 },
      { table: "MEASUREMENT", column: "visit_occurrence_id", type: "bigint", score: 0.63 },
      { table: "DRUG_EXPOSURE", column: "visit_occurrence_id", type: "bigint", score: 0.60 },
      { table: "VISIT_OCCURRENCE", column: "visit_source_value", type: "varchar(50)", score: 0.41 },
    ],
    confidence: "high" },
  { id: "p3", score: 0.94,
    novel: { table: "ADMISSIONS", column: "ADMITTIME", type: "TIMESTAMP", desc: "Date and time the patient was admitted to the hospital.", samples: ["2164-10-23 21:09:00", "2126-08-14 22:32:00", "2125-10-04 23:36:00"] },
    suggested: { table: "VISIT_OCCURRENCE", column: "visit_start_datetime", type: "datetime", desc: "Date and time the visit started; for inpatient visits, the admission time." },
    alternates: [
      { table: "VISIT_OCCURRENCE", column: "visit_start_date", type: "date", score: 0.82 },
      { table: "VISIT_DETAIL", column: "visit_detail_start_datetime", type: "datetime", score: 0.57 },
      { table: "OBSERVATION", column: "observation_datetime", type: "datetime", score: 0.33 },
      { table: "MEASUREMENT", column: "measurement_datetime", type: "datetime", score: 0.29 },
    ],
    confidence: "high" },
  { id: "p4", score: 0.93,
    novel: { table: "ADMISSIONS", column: "DISCHTIME", type: "TIMESTAMP", desc: "Date and time the patient was discharged from the hospital.", samples: ["2164-11-01 17:15:00", "2126-08-28 18:59:00"] },
    suggested: { table: "VISIT_OCCURRENCE", column: "visit_end_datetime", type: "datetime", desc: "Date and time the visit ended; for inpatient visits, the discharge time." },
    alternates: [
      { table: "VISIT_OCCURRENCE", column: "visit_end_date", type: "date", score: 0.80 },
      { table: "VISIT_DETAIL", column: "visit_detail_end_datetime", type: "datetime", score: 0.55 },
      { table: "PERSON", column: "death_datetime", type: "datetime", score: 0.21 },
      { table: "OBSERVATION", column: "observation_datetime", type: "datetime", score: 0.19 },
    ],
    confidence: "high" },
  { id: "p5", score: 0.91,
    novel: { table: "PATIENTS", column: "GENDER", type: "STRING", desc: "Genotypical sex of the patient.", samples: ["M", "F", "F"] },
    suggested: { table: "PERSON", column: "gender_source_value", type: "varchar(50)", desc: "Biological sex of the person as it appears in the source data; for reference only." },
    alternates: [
      { table: "PERSON", column: "gender_concept_id", type: "integer", score: 0.88 },
      { table: "PERSON", column: "gender_source_concept_id", type: "integer", score: 0.52 },
      { table: "PERSON", column: "race_source_value", type: "varchar(50)", score: 0.18 },
      { table: "OBSERVATION", column: "value_as_string", type: "varchar(60)", score: 0.15 },
    ],
    confidence: "high" },
  { id: "p6", score: 0.72,
    novel: { table: "PATIENTS", column: "DOB", type: "TIMESTAMP", desc: "Date of birth of the patient.", samples: ["2094-03-05 00:00:00", "2090-06-05 00:00:00", "2038-09-03 00:00:00"] },
    suggested: { table: "PERSON", column: "birth_datetime", type: "datetime", desc: "Full date and time of birth of the person." },
    alternates: [
      { table: "PERSON", column: "year_of_birth", type: "integer", score: 0.64 },
      { table: "PERSON", column: "month_of_birth", type: "integer", score: 0.31 },
      { table: "PERSON", column: "day_of_birth", type: "integer", score: 0.29 },
      { table: "OBSERVATION", column: "value_as_datetime", type: "datetime", score: 0.12 },
    ],
    confidence: "med" },
  { id: "p7", score: 0.66,
    novel: { table: "ADMISSIONS", column: "ADMISSION_TYPE", type: "STRING", desc: "Type of admission (EMERGENCY, ELECTIVE, URGENT, NEWBORN).", samples: ["EMERGENCY", "ELECTIVE", "URGENT"] },
    suggested: { table: "VISIT_OCCURRENCE", column: "visit_type_concept_id", type: "integer", desc: "Concept id capturing the provenance of the visit record (EHR, claims, etc.)." },
    alternates: [
      { table: "VISIT_OCCURRENCE", column: "visit_source_value", type: "varchar(50)", score: 0.61 },
      { table: "VISIT_OCCURRENCE", column: "visit_concept_id", type: "integer", score: 0.55 },
      { table: "VISIT_OCCURRENCE", column: "admitted_from_source_value", type: "varchar(50)", score: 0.24 },
      { table: "VISIT_DETAIL", column: "visit_detail_source_value", type: "varchar(50)", score: 0.18 },
    ],
    confidence: "med" },
  { id: "p8", score: 0.69,
    novel: { table: "ICUSTAYS", column: "INTIME", type: "TIMESTAMP", desc: "Date and time the patient was transferred into the ICU.", samples: ["2164-10-23 21:10:15", "2126-08-14 22:34:00"] },
    suggested: { table: "VISIT_DETAIL", column: "visit_detail_start_datetime", type: "datetime", desc: "Date and time the visit-detail episode (e.g., an ICU stay) started." },
    alternates: [
      { table: "VISIT_DETAIL", column: "visit_detail_start_date", type: "date", score: 0.58 },
      { table: "VISIT_OCCURRENCE", column: "visit_start_datetime", type: "datetime", score: 0.44 },
      { table: "MEASUREMENT", column: "measurement_datetime", type: "datetime", score: 0.17 },
      { table: "OBSERVATION", column: "observation_datetime", type: "datetime", score: 0.15 },
    ],
    confidence: "med" },
  { id: "p9", score: 0.64,
    novel: { table: "LABEVENTS", column: "VALUENUM", type: "DOUBLE", desc: "Lab value in numeric form.", samples: ["4.1", "139", "7.35"] },
    suggested: { table: "MEASUREMENT", column: "value_as_number", type: "float", desc: "Numerical value of the measurement result, if available." },
    alternates: [
      { table: "MEASUREMENT", column: "value_source_value", type: "varchar(50)", score: 0.48 },
      { table: "OBSERVATION", column: "value_as_number", type: "float", score: 0.42 },
      { table: "MEASUREMENT", column: "range_high", type: "float", score: 0.11 },
      { table: "MEASUREMENT", column: "range_low", type: "float", score: 0.10 },
    ],
    confidence: "med" },
  { id: "p10", score: 0.44,
    novel: { table: "PRESCRIPTIONS", column: "DRUG", type: "STRING", desc: "Name of the drug prescribed.", samples: ["Warfarin", "Heparin Sodium", "Insulin - Regular"] },
    suggested: { table: "DRUG_EXPOSURE", column: "drug_source_value", type: "varchar(50)", desc: "Verbatim drug value from the source data (e.g., an NDC code or name)." },
    alternates: [
      { table: "DRUG_EXPOSURE", column: "drug_concept_id", type: "integer", score: 0.41 },
      { table: "DRUG_EXPOSURE", column: "sig", type: "varchar(MAX)", score: 0.20 },
      { table: "DRUG_EXPOSURE", column: "lot_number", type: "varchar(50)", score: 0.08 },
      { table: "OBSERVATION", column: "value_as_string", type: "varchar(60)", score: 0.07 },
    ],
    confidence: "low" },
  { id: "p11", score: 0.31,
    novel: { table: "ADMISSIONS", column: "MARITAL_STATUS", type: "STRING", desc: "Patient demographic — marital status.", samples: ["MARRIED", "SINGLE", "WIDOWED"] },
    suggested: { table: "PERSON", column: "ethnicity_concept_id", type: "integer", desc: "OMB-defined ethnicity: Hispanic or Not Hispanic. Races and ethnic backgrounds are not stored here." },
    alternates: [
      { table: "PERSON", column: "ethnicity_source_value", type: "varchar(50)", score: 0.28 },
      { table: "OBSERVATION", column: "value_as_string", type: "varchar(60)", score: 0.24 },
      { table: "PERSON", column: "race_source_value", type: "varchar(50)", score: 0.19 },
      { table: "OBSERVATION", column: "observation_source_value", type: "varchar(50)", score: 0.16 },
    ],
    confidence: "low" },
  { id: "p12", score: 0.29,
    novel: { table: "ADMISSIONS", column: "INSURANCE", type: "STRING", desc: "Patient demographic — insurance/payer.", samples: ["Medicare", "Private", "Medicaid"] },
    suggested: { table: "VISIT_OCCURRENCE", column: "visit_source_value", type: "varchar(50)", desc: "Verbatim source value representing the kind of visit (inpatient, outpatient, emergency…)." },
    alternates: [
      { table: "PAYER_PLAN_PERIOD", column: "payer_source_value", type: "varchar(50)", score: 0.27 },
      { table: "PAYER_PLAN_PERIOD", column: "plan_source_value", type: "varchar(50)", score: 0.22 },
      { table: "OBSERVATION", column: "value_as_string", type: "varchar(60)", score: 0.13 },
      { table: "VISIT_OCCURRENCE", column: "admitted_from_source_value", type: "varchar(50)", score: 0.09 },
    ],
    confidence: "low" },
];

// Example of a pairing the admin already finalized: grader can view but not revise.
const FINALIZED_IDS = new Set(["p4"]);

/* ---------- State ---------- */

const state = {
  verdicts: {},        // pairingId -> { verdict, message, payload }
  drafts: {},          // pairingId -> saved form state (never lose work)
  activeId: null,      // pairing shown in the detail panel
  selected: new Set(), // checked pairing ids (bulk)
  bulkSnapshot: null,  // single-mode form state saved when entering bulk
  lastAction: null,    // for the Undo toast
};

/* ---------- Helpers ---------- */

const $ = (id) => document.getElementById(id);

const confidenceOf = (p) => CONFIG.confidenceLevels.find((c) => c.key === p.confidence);

const verdictOf = (key) => CONFIG.verdicts.find((v) => v.key === key);

const pairName = (p) => `${p.novel.table}.${p.novel.column}`;

const sortedPairings = () =>
  [...PAIRINGS].sort((a, b) => confidenceOf(b).rank - confidenceOf(a).rank);

const isBulk = () => state.selected.size >= 2;

const isFinalized = (id) => FINALIZED_IDS.has(id);

/* ---------- Queue rendering ---------- */

function renderQueue() {
  const list = $("queue-list");
  list.innerHTML = "";

  for (const p of sortedPairings()) {
    const li = document.createElement("li");
    li.className = "queue-item";
    if (p.id === state.activeId) li.classList.add("active");
    if (state.verdicts[p.id]) li.classList.add("done");
    if (isFinalized(p.id)) li.classList.add("finalized");

    const check = document.createElement("input");
    check.type = "checkbox";
    check.className = "queue-check";
    check.checked = state.selected.has(p.id);
    check.disabled = isFinalized(p.id);
    check.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleSelect(p.id, check.checked);
    });

    const info = document.createElement("div");
    info.className = "pair-info";
    info.innerHTML = `
      <div class="pair-name">${pairName(p)}</div>
      <div class="pair-target">→ ${p.suggested.table}.${p.suggested.column}</div>`;

    const meta = document.createElement("div");
    meta.className = "pair-meta";
    const conf = confidenceOf(p);
    meta.innerHTML = `<span class="conf-badge ${conf.cssClass}">${conf.label}</span>`;
    if (isFinalized(p.id)) {
      meta.innerHTML += `<span class="lock-chip">🔒 finalized</span>`;
    } else if (state.verdicts[p.id]) {
      meta.innerHTML += `<span class="verdict-chip">${verdictOf(state.verdicts[p.id].verdict).label}</span>`;
    }

    li.append(check, info, meta);
    li.addEventListener("click", () => selectPairing(p.id));
    list.appendChild(li);
  }

  const done = Object.keys(state.verdicts).length + FINALIZED_IDS.size;
  $("queue-count").textContent = PAIRINGS.length;
  renderProgress(done, PAIRINGS.length);
  $("bulk-hint").textContent = isBulk() ? `${state.selected.size} selected` : "";
}

function renderProgress(done, total) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  $("grader-progress").innerHTML = `
    <span>Reviewed ${done}/${total}</span>
    <div class="bar"><div class="bar-fill" style="width:${pct}%"></div></div>`;
}

/* ---------- Detail panel ---------- */

function renderDetail() {
  const panel = $("detail-panel");
  const p = PAIRINGS.find((x) => x.id === state.activeId);
  if (!p) {
    panel.innerHTML = `<div class="empty-detail">Select a pairing from the queue to review it.</div>`;
    return;
  }

  const conf = confidenceOf(p);
  const finalizedNote = isFinalized(p.id)
    ? `<div class="finalized-note">🔒 This pairing has been finalized by the admin and can no longer be changed.</div>`
    : "";

  panel.innerHTML = `
    ${finalizedNote}
    <div class="detail-header">
      <div class="detail-title">${pairName(p)}</div>
      <span class="conf-badge ${conf.cssClass}">${conf.label} confidence · ${Math.round(p.score * 100)}%</span>
    </div>

    <div class="match-flow">
      <div class="match-card">
        <h3>Incoming (novel — MIMIC-III)</h3>
        <div class="card-name">${p.novel.table}.${p.novel.column}</div>
        <span class="card-type">${p.novel.type}</span>
        <div class="card-desc">${p.novel.desc}</div>
      </div>
      <div class="match-arrow">→</div>
      <div class="match-card">
        <h3>Suggested canonical (OMOP)</h3>
        <div class="card-name">${p.suggested.table}.${p.suggested.column}</div>
        <span class="card-type">${p.suggested.type}</span>
        <div class="card-desc">${p.suggested.desc}</div>
      </div>
    </div>

    <div class="section">
      <h2>Other possible options</h2>
      <div class="alt-list">
        ${p.alternates.map((a, i) => `
          <div class="alt-row" data-alt="${i}" title="Reassign to this column">
            <span class="alt-rank">#${i + 2}</span>
            <span class="alt-name">${a.table}.${a.column}</span>
            <span class="alt-type">${a.type}</span>
            <span class="alt-score">${Math.round(a.score * 100)}%</span>
          </div>`).join("")}
      </div>
      <div class="alt-hint">Click an option to pre-fill a Reassign verdict.</div>
    </div>

    <div class="section">
      <h2>Sample values</h2>
      <table class="sample-table">
        <tr><th>${p.novel.column}</th></tr>
        ${p.novel.samples.map((s) => `<tr><td>${s}</td></tr>`).join("")}
      </table>
    </div>

    <div class="section">
      <h2>Match details</h2>
      <ul class="kv-list">
        <li><span class="k">Suggested by</span><span class="v">upstream matcher v2.3</span></li>
        <li><span class="k">Confidence</span><span class="v">${conf.label} (${Math.round(p.score * 100)}%)</span></li>
        <li><span class="k">Novel datatype</span><span class="v">${p.novel.type}</span></li>
        <li><span class="k">Canonical datatype</span><span class="v">${p.suggested.type}</span></li>
      </ul>
    </div>`;

  // Alternates pre-fill a Reassign verdict — same one-click loop as the
  // sticky dropdown, aimed at the clicked candidate instead.
  panel.querySelectorAll(".alt-row").forEach((row) =>
    row.addEventListener("click", () => {
      if (isBulk() || isFinalized(p.id)) return;
      const a = p.alternates[Number(row.dataset.alt)];
      $("verdict-select").value = "reassign";
      populateReassignTables(a.table);
      populateReassignColumns(a.table, a.column);
      syncActionBox();
    })
  );
}

/* ---------- Action box: form state save/load ---------- */

function readFormState() {
  return {
    verdict: $("verdict-select").value,
    message: $("verdict-message").value,
    reassignTable: $("reassign-table").value,
    reassignColumn: $("reassign-column").value,
    expandKind: document.querySelector('input[name="expand-kind"]:checked').value,
    expandTableName: $("expand-table-name").value,
    expandTargetTable: $("expand-target-table").value,
    expandReason: $("expand-reason").value,
    expandColumns: [...document.querySelectorAll(".expand-col-row")].map((row) => ({
      name: row.querySelector("input").value,
      type: row.querySelector("select").value,
    })),
  };
}

function applyFormState(s) {
  if (!s) s = defaultFormState();
  $("verdict-select").value = s.verdict;
  $("verdict-message").value = s.message;
  populateReassignTables(s.reassignTable);
  populateReassignColumns(s.reassignTable, s.reassignColumn);
  document.querySelector(`input[name="expand-kind"][value="${s.expandKind}"]`).checked = true;
  $("expand-table-name").value = s.expandTableName;
  $("expand-target-table").value = s.expandTargetTable;
  $("expand-reason").value = s.expandReason;
  renderExpandColumns(s.expandColumns);
  syncActionBox();
}

function defaultFormState() {
  return {
    verdict: $("verdict-select").value || "accept", // dropdown is sticky: keep last choice
    message: "",
    reassignTable: Object.keys(CANONICAL_SCHEMA)[0],
    reassignColumn: CANONICAL_SCHEMA[Object.keys(CANONICAL_SCHEMA)[0]][0],
    expandKind: "table",
    expandTableName: "",
    expandTargetTable: Object.keys(CANONICAL_SCHEMA)[0],
    expandReason: "",
    expandColumns: [{ name: "", type: CONFIG.postgresTypes[0] }],
  };
}

function saveDraft() {
  if (state.activeId && !isBulk()) state.drafts[state.activeId] = readFormState();
}

/* ---------- Action box: rendering ---------- */

function populateVerdictSelect() {
  const sel = $("verdict-select");
  const prev = sel.value;
  const opts = isBulk() ? CONFIG.verdicts.filter((v) => v.bulk) : CONFIG.verdicts;
  sel.innerHTML = opts
    .map((v) => `<option value="${v.key}">${v.label}</option>`)
    .join("");
  if (opts.some((v) => v.key === prev)) sel.value = prev;
}

function populateReassignTables(selectedTable) {
  $("reassign-table").innerHTML = Object.keys(CANONICAL_SCHEMA)
    .map((t) => `<option value="${t}" ${t === selectedTable ? "selected" : ""}>${t}</option>`)
    .join("");
}

function populateReassignColumns(table, selectedColumn) {
  const cols = CANONICAL_SCHEMA[table] || [];
  $("reassign-column").innerHTML = cols
    .map((c) => `<option value="${c}" ${c === selectedColumn ? "selected" : ""}>${c}</option>`)
    .join("");
}

function populateExpandTargetTables() {
  $("expand-target-table").innerHTML = Object.keys(CANONICAL_SCHEMA)
    .map((t) => `<option value="${t}">${t}</option>`)
    .join("");
}

function renderExpandColumns(columns) {
  const wrap = $("expand-columns");
  wrap.innerHTML = "";
  for (const col of columns) {
    wrap.appendChild(makeExpandColumnRow(col));
  }
}

function makeExpandColumnRow(col = { name: "", type: CONFIG.postgresTypes[0] }) {
  const row = document.createElement("div");
  row.className = "expand-col-row";

  const name = document.createElement("input");
  name.type = "text";
  name.placeholder = "column_name";
  name.value = col.name;

  const type = document.createElement("select");
  type.innerHTML = CONFIG.postgresTypes
    .map((t) => `<option value="${t}" ${t === col.type ? "selected" : ""}>${t}</option>`)
    .join("");

  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "remove-col-btn";
  remove.textContent = "−";
  remove.title = "Remove column";
  remove.addEventListener("click", () => {
    if (document.querySelectorAll(".expand-col-row").length > 1) row.remove();
  });

  row.append(name, type, remove);
  return row;
}

/* Show/hide subforms + message box, set submit label. Called on any mode change. */
function syncActionBox() {
  const bulk = isBulk();
  const verdict = $("verdict-select").value;

  $("bulk-banner").classList.toggle("hidden", !bulk);
  $("bulk-count").textContent = state.selected.size;

  // Subforms only exist in single mode
  $("reassign-form").classList.toggle("hidden", bulk || verdict !== "reassign");
  $("expand-form").classList.toggle("hidden", bulk || verdict !== "expand");

  // Expand replaces the message box with its mini-form (which owns the reason
  // field); bulk mode hides the message box entirely.
  const msg = $("verdict-message");
  msg.classList.toggle("hidden", bulk || verdict === "expand");
  msg.placeholder = verdict === "assignNone"
    ? "Reason (required)"
    : "Message (optional)";

  // Expand-form: toggle new-table vs new-column fields
  const kind = document.querySelector('input[name="expand-kind"]:checked').value;
  $("expand-table-fields").classList.toggle("hidden", kind !== "table");
  $("expand-column-fields").classList.toggle("hidden", kind !== "column");

  // Submit button always states the action it will take
  const btn = $("submit-btn");
  const label = verdictOf(verdict).label;
  btn.textContent = bulk ? `${label} ${state.selected.size} pairings` : label;
  btn.classList.toggle("danger", verdict === "reject");

  const locked = !bulk && state.activeId && isFinalized(state.activeId);
  btn.disabled = locked || (!bulk && !state.activeId);
  $("action-error").classList.add("hidden");
}

/* ---------- Selection / navigation ---------- */

function selectPairing(id) {
  if (state.activeId === id) return;
  saveDraft();
  state.activeId = id;
  if (!isBulk()) {
    // Load the pairing's saved draft, or its submitted verdict, so a grader
    // revisiting a reviewed row sees exactly what they chose.
    const existing = state.drafts[id] || verdictToFormState(state.verdicts[id]);
    applyFormState(existing);
  }
  renderQueue();
  renderDetail();
  syncActionBox();
}

function verdictToFormState(v) {
  if (!v) return null;
  const s = defaultFormState();
  s.verdict = v.verdict;
  s.message = v.message || "";
  if (v.verdict === "reassign" && v.payload) {
    s.reassignTable = v.payload.table;
    s.reassignColumn = v.payload.column;
  }
  if (v.verdict === "expand" && v.payload) {
    s.expandKind = v.payload.kind;
    s.expandTableName = v.payload.kind === "table" ? v.payload.table : "";
    s.expandTargetTable = v.payload.kind === "column" ? v.payload.table : s.expandTargetTable;
    s.expandColumns = v.payload.columns.map((c) => ({ ...c }));
    s.expandReason = v.message;
    s.message = "";
  }
  return s;
}

function toggleSelect(id, checked) {
  const wasBulk = isBulk();
  if (checked) state.selected.add(id);
  else state.selected.delete(id);
  const nowBulk = isBulk();

  if (!wasBulk && nowBulk) {
    // Entering bulk: snapshot the single-mode form so nothing is lost.
    state.bulkSnapshot = readFormState();
    populateVerdictSelect();
    if (!verdictOf($("verdict-select").value).bulk) $("verdict-select").value = "accept";
  } else if (wasBulk && !nowBulk) {
    // Leaving bulk: restore the form exactly as it was.
    populateVerdictSelect();
    applyFormState(state.bulkSnapshot);
    state.bulkSnapshot = null;
  }

  // Detail panel shows the most recently selected pairing.
  if (checked) {
    state.activeId = id;
    renderDetail();
  }

  renderQueue();
  syncActionBox();
}

function autoAdvance() {
  const next = sortedPairings().find(
    (p) => !state.verdicts[p.id] && !isFinalized(p.id)
  );
  state.activeId = next ? next.id : null;
  if (state.activeId) {
    const existing = state.drafts[state.activeId] || null;
    applyFormState(existing || {
      ...defaultFormState(),
      verdict: $("verdict-select").value, // sticky dropdown survives advance
    });
  }
  renderQueue();
  renderDetail();
  syncActionBox();
}

/* ---------- Submitting verdicts ---------- */

function validateSingle(form) {
  if (form.verdict === "assignNone" && !form.message.trim()) {
    return "Assign None requires a reason.";
  }
  if (form.verdict === "expand") {
    if (!form.expandReason.trim()) return "Expansion requires a reason.";
    if (form.expandKind === "table" && !form.expandTableName.trim()) {
      return "New table needs a name.";
    }
    const cols = form.expandColumns.filter((c) => c.name.trim());
    if (cols.length === 0) return "Define at least one column.";
  }
  return null;
}

function buildVerdict(form) {
  const v = { verdict: form.verdict, message: form.message.trim(), payload: null };
  if (form.verdict === "reassign") {
    v.payload = { table: form.reassignTable, column: form.reassignColumn };
  }
  if (form.verdict === "expand") {
    v.payload = {
      kind: form.expandKind,
      table: form.expandKind === "table" ? form.expandTableName.trim() : form.expandTargetTable,
      columns: form.expandColumns.filter((c) => c.name.trim()),
    };
    v.message = form.expandReason.trim();
  }
  return v;
}

function submitSingle() {
  const form = readFormState();
  const err = validateSingle(form);
  if (err) {
    const el = $("action-error");
    el.textContent = err;
    el.classList.remove("hidden");
    return;
  }

  const id = state.activeId;
  state.lastAction = {
    type: "single",
    id,
    previous: state.verdicts[id] ? { ...state.verdicts[id] } : null,
  };
  state.verdicts[id] = buildVerdict(form);
  delete state.drafts[id];

  showToast(`${pairName(PAIRINGS.find((p) => p.id === id))} — ${verdictOf(form.verdict).label}`);
  autoAdvance();
}

function submitBulk() {
  const verdict = $("verdict-select").value;
  const ids = [...state.selected];
  const label = verdictOf(verdict).label.toLowerCase();

  $("bulk-modal-title").textContent = `Confirm bulk ${label}`;
  $("bulk-modal-text").textContent =
    `You are about to ${label} ${ids.length} pairings:`;
  $("bulk-modal-list").innerHTML = ids
    .map((id) => `<li>${pairName(PAIRINGS.find((p) => p.id === id))}</li>`)
    .join("");

  const confirmBtn = $("bulk-confirm");
  confirmBtn.className = `btn ${verdict === "reject" ? "danger" : "primary"}`;
  confirmBtn.onclick = () => {
    state.lastAction = {
      type: "bulk",
      entries: ids.map((id) => ({
        id,
        previous: state.verdicts[id] ? { ...state.verdicts[id] } : null,
      })),
    };
    for (const id of ids) {
      state.verdicts[id] = { verdict, message: "", payload: null };
      delete state.drafts[id];
    }
    state.selected.clear();

    // Exit bulk mode and restore the single-mode form.
    populateVerdictSelect();
    applyFormState(state.bulkSnapshot);
    state.bulkSnapshot = null;

    $("bulk-modal").classList.add("hidden");
    showToast(`${ids.length} pairings — ${verdictOf(verdict).label}`);
    autoAdvance();
  };

  $("bulk-modal").classList.remove("hidden");
}

/* ---------- Undo toast ---------- */

let toastTimer = null;

function showToast(text) {
  $("toast-text").textContent = text;
  $("undo-toast").classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $("undo-toast").classList.add("hidden"), 6000);
}

function undoLast() {
  const a = state.lastAction;
  if (!a) return;
  if (a.type === "single") {
    if (a.previous) state.verdicts[a.id] = a.previous;
    else delete state.verdicts[a.id];
    selectPairing(a.id);
  } else {
    for (const e of a.entries) {
      if (e.previous) state.verdicts[e.id] = e.previous;
      else delete state.verdicts[e.id];
    }
  }
  state.lastAction = null;
  $("undo-toast").classList.add("hidden");
  renderQueue();
  renderDetail();
  syncActionBox();
}

/* ---------- Wiring ---------- */

function init() {
  populateVerdictSelect();
  populateExpandTargetTables();
  applyFormState(defaultFormState());

  $("verdict-select").addEventListener("change", syncActionBox);

  $("reassign-table").addEventListener("change", () =>
    populateReassignColumns($("reassign-table").value)
  );

  document.querySelectorAll('input[name="expand-kind"]').forEach((r) =>
    r.addEventListener("change", syncActionBox)
  );

  $("add-column-btn").addEventListener("click", () =>
    $("expand-columns").appendChild(makeExpandColumnRow())
  );

  $("submit-btn").addEventListener("click", () =>
    isBulk() ? submitBulk() : submitSingle()
  );

  $("bulk-cancel").addEventListener("click", () =>
    $("bulk-modal").classList.add("hidden")
  );

  $("toast-undo-btn").addEventListener("click", undoLast);

  // Open with the top pairing selected.
  state.activeId = sortedPairings()[0].id;
  renderQueue();
  renderDetail();
  syncActionBox();
}

init();

/* ---------- Weekly availability (When2Meet-style) ----------
 * Free/busy only — no event details. SCHEDULE config drives the grid shape
 * (days shown, first hour, half-hour slot count) so changing the work window
 * is a data change, not a redesign.
 */

const SCHEDULE = {
  days: ["Mon", "Tue", "Wed", "Thu", "Fri"],
  startHour: 9,     // grid begins 9:00 AM
  slotsPerDay: 16,  // half-hour boxes through 5:00 PM
};

const scheduleState = {
  free: new Set(),   // "day-slot" keys the grader marked free
  submitted: false,  // has this week's schedule been saved yet?
  snapshot: null,    // copy taken on open, restored on cancel/skip
  painting: null,    // during drag: true = paint free, false = erase
};

const slotKey = (d, s) => `${d}-${s}`;

function slotLabel(s) {
  if (s % 2) return ""; // label hours only; half-hour rows get tick lines
  const h = SCHEDULE.startHour + s / 2;
  const h12 = ((h + 11) % 12) + 1;
  return `${h12}:00 ${h < 12 ? "AM" : "PM"}`;
}

function buildScheduleGrid(container, isFree, editable) {
  container.innerHTML = "";
  container.classList.toggle("editable", editable);

  container.appendChild(Object.assign(document.createElement("div"), { className: "sched-head" }));
  for (const d of SCHEDULE.days) {
    const h = document.createElement("div");
    h.className = "sched-head";
    h.textContent = d;
    container.appendChild(h);
  }

  for (let s = 0; s < SCHEDULE.slotsPerDay; s++) {
    const t = document.createElement("div");
    t.className = "sched-time" + (s % 2 ? "" : " hour");
    t.textContent = slotLabel(s);
    container.appendChild(t);

    for (let d = 0; d < SCHEDULE.days.length; d++) {
      const cell = document.createElement("div");
      cell.className = "sched-cell" + (s % 2 ? "" : " hour");
      cell.dataset.key = slotKey(d, s);
      if (isFree(d, s)) cell.classList.add("free");
      if (editable) {
        cell.addEventListener("mousedown", (e) => {
          e.preventDefault(); // no text selection while dragging
          scheduleState.painting = !scheduleState.free.has(cell.dataset.key);
          paintScheduleCell(cell);
        });
        cell.addEventListener("mouseenter", () => {
          if (scheduleState.painting !== null) paintScheduleCell(cell);
        });
      }
      container.appendChild(cell);
    }
  }
}

function paintScheduleCell(cell) {
  if (scheduleState.painting) {
    scheduleState.free.add(cell.dataset.key);
    cell.classList.add("free");
  } else {
    scheduleState.free.delete(cell.dataset.key);
    cell.classList.remove("free");
  }
}

document.addEventListener("mouseup", () => { scheduleState.painting = null; });

function openScheduleModal(firstRun) {
  scheduleState.snapshot = new Set(scheduleState.free);
  $("schedule-skip").textContent = firstRun ? "Skip for now" : "Cancel";
  buildScheduleGrid(
    $("schedule-grid"),
    (d, s) => scheduleState.free.has(slotKey(d, s)),
    true
  );
  $("schedule-modal").classList.remove("hidden");
}

$("edit-schedule-btn").addEventListener("click", () => openScheduleModal(false));

$("schedule-save").addEventListener("click", () => {
  scheduleState.submitted = true;
  scheduleState.snapshot = null;
  $("schedule-modal").classList.add("hidden");
  state.lastAction = null; // schedule saves aren't verdicts: toast Undo is a no-op
  showToast("Availability saved for the week");
});

$("schedule-skip").addEventListener("click", () => {
  // Discard unsaved painting — same never-lose-work contract as verdict drafts.
  scheduleState.free = new Set(scheduleState.snapshot);
  scheduleState.snapshot = null;
  $("schedule-modal").classList.add("hidden");
});

// Start-of-week prompt: appears on load until the grader saves a schedule.
if (!scheduleState.submitted) openScheduleModal(true);
