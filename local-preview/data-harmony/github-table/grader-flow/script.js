/* ===== [REDACTED] — Grader flow =====
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

/* ---------- Canonical schema (OMOP CDM) ----------
 * CANONICAL_TABLES carries the full column detail (type + description) so the
 * detail panel can render the entire target table for graders who don't know
 * it by heart. A representative subset of each OMOP table's columns is shown.
 * CANONICAL_SCHEMA (names only) is derived from it for the pickers. */

const CANONICAL_TABLES = {
  PERSON: {
    desc: "Central identity management for all persons in the database — uniquely identifies each patient with core demographics.",
    columns: [
      { name: "person_id", type: "bigint", desc: "Unique identifier for each person; every distinct id is treated as a distinct person." },
      { name: "gender_concept_id", type: "integer", desc: "Biological sex at birth as a standard concept id." },
      { name: "year_of_birth", type: "integer", desc: "Year of birth; used to compute age." },
      { name: "month_of_birth", type: "integer", desc: "Month of birth, when the precise date is available." },
      { name: "day_of_birth", type: "integer", desc: "Day of birth, when the precise date is available." },
      { name: "birth_datetime", type: "datetime", desc: "Full date and time of birth." },
      { name: "death_datetime", type: "datetime", desc: "Death date to be used in analysis, as determined by ETL logic." },
      { name: "race_concept_id", type: "integer", desc: "Race or ethnic background of the person as a standard concept." },
      { name: "ethnicity_concept_id", type: "integer", desc: "OMB ethnicity: Hispanic vs. Not Hispanic only." },
      { name: "person_source_value", type: "varchar(50)", desc: "Source identifier used to link back to persons in the source data." },
      { name: "gender_source_value", type: "varchar(50)", desc: "Biological sex as it appears in the source data; reference only." },
      { name: "ethnicity_source_value", type: "varchar(50)", desc: "Ethnicity as it appears in the source data; reference only." },
    ],
  },
  VISIT_OCCURRENCE: {
    desc: "Events where persons engage with the healthcare system for a duration of time — often called encounters.",
    columns: [
      { name: "visit_occurrence_id", type: "bigint", desc: "Unique id for the visit; links events across CDM tables." },
      { name: "person_id", type: "bigint", desc: "The person this visit belongs to." },
      { name: "visit_concept_id", type: "integer", desc: "Kind of visit (inpatient, outpatient…) as a standard Visit-domain concept." },
      { name: "visit_start_date", type: "date", desc: "Start date; for inpatient visits, the admission date." },
      { name: "visit_start_datetime", type: "datetime", desc: "Start date and time of the visit." },
      { name: "visit_end_date", type: "date", desc: "End date; for inpatient visits, the discharge date." },
      { name: "visit_end_datetime", type: "datetime", desc: "End date and time of the visit." },
      { name: "visit_type_concept_id", type: "integer", desc: "Provenance of the visit record (EHR, claims…)." },
      { name: "care_site_id", type: "bigint", desc: "Care site where the visit took place." },
      { name: "visit_source_value", type: "varchar(50)", desc: "Verbatim source value for the kind of visit (inpatient, emergency…)." },
      { name: "admitted_from_source_value", type: "varchar(50)", desc: "Verbatim source value for where the patient was admitted from." },
      { name: "discharge_to_concept_id", type: "integer", desc: "Where the patient was discharged to (home, long-term care…)." },
      { name: "preceding_visit_occurrence_id", type: "bigint", desc: "The person's previous visit, if any." },
    ],
  },
  VISIT_DETAIL: {
    desc: "Optional detail records under a VISIT_OCCURRENCE — e.g., movement between hospital units during an inpatient stay.",
    columns: [
      { name: "visit_detail_id", type: "bigint", desc: "Unique id for the visit-detail record." },
      { name: "person_id", type: "bigint", desc: "The person this record belongs to." },
      { name: "visit_detail_concept_id", type: "integer", desc: "Kind of visit detail as a standard Visit-domain concept." },
      { name: "visit_detail_start_date", type: "date", desc: "Start date of this detail episode (e.g., unit transfer-in)." },
      { name: "visit_detail_start_datetime", type: "datetime", desc: "Start date and time of this detail episode." },
      { name: "visit_detail_end_date", type: "date", desc: "End date of the patient–provider interaction." },
      { name: "visit_detail_end_datetime", type: "datetime", desc: "End date and time of this detail episode." },
      { name: "admitted_from_concept_id", type: "integer", desc: "Where the patient was admitted from." },
      { name: "discharge_to_source_value", type: "varchar(50)", desc: "Verbatim source value for where the patient was discharged to." },
      { name: "visit_detail_source_value", type: "varchar(50)", desc: "Verbatim source value for the kind of visit detail (e.g., care unit)." },
      { name: "visit_occurrence_id", type: "bigint", desc: "Links this detail record to its parent VISIT_OCCURRENCE." },
    ],
  },
  MEASUREMENT: {
    desc: "Structured values (numerical or categorical) from standardized examination or testing — lab tests, vital signs, etc.",
    columns: [
      { name: "measurement_id", type: "bigint", desc: "Unique key for a measurement record." },
      { name: "person_id", type: "bigint", desc: "The person the measurement is recorded for." },
      { name: "measurement_concept_id", type: "integer", desc: "Standard concept for the measurement; primary field for analysis." },
      { name: "measurement_date", type: "date", desc: "Date of the measurement." },
      { name: "measurement_datetime", type: "datetime", desc: "Date and time of the measurement." },
      { name: "value_as_number", type: "float", desc: "Numerical result of the measurement, if available." },
      { name: "value_as_concept_id", type: "integer", desc: "Categorical result mapped to a standard 'Meas Value' concept." },
      { name: "unit_concept_id", type: "integer", desc: "Standard Unit-domain concept for the source unit." },
      { name: "range_low", type: "float", desc: "Low end of the normal range, as provided by the source." },
      { name: "range_high", type: "float", desc: "High end of the normal range, as provided by the source." },
      { name: "visit_occurrence_id", type: "bigint", desc: "The visit during which the measurement occurred." },
      { name: "measurement_source_value", type: "varchar(50)", desc: "Verbatim source value for the measurement (e.g., a local code)." },
      { name: "unit_source_value", type: "varchar(50)", desc: "Verbatim source value for the unit." },
      { name: "value_source_value", type: "varchar(50)", desc: "Verbatim result value from the source data." },
    ],
  },
  DRUG_EXPOSURE: {
    desc: "Records of exposure to a drug — prescriptions, over-the-counter medicines, vaccines, biologics.",
    columns: [
      { name: "drug_exposure_id", type: "bigint", desc: "Unique key for the drug record." },
      { name: "person_id", type: "bigint", desc: "The person the drug is recorded for." },
      { name: "drug_concept_id", type: "integer", desc: "Standard concept for the drug product; primary field for analysis." },
      { name: "drug_exposure_start_date", type: "date", desc: "Start date of the drug record." },
      { name: "drug_exposure_start_datetime", type: "datetime", desc: "Start date and time." },
      { name: "drug_exposure_end_date", type: "date", desc: "Day the drug exposure ended." },
      { name: "drug_exposure_end_datetime", type: "datetime", desc: "End date and time." },
      { name: "drug_type_concept_id", type: "integer", desc: "Provenance: prescription written vs. dispensed vs. administered…" },
      { name: "quantity", type: "float", desc: "Quantity of drug." },
      { name: "route_concept_id", type: "integer", desc: "Route of administration as a standard concept." },
      { name: "visit_occurrence_id", type: "bigint", desc: "The visit during which the drug was prescribed or administered." },
      { name: "drug_source_value", type: "varchar(50)", desc: "Verbatim drug value from the source (e.g., NDC code or name)." },
      { name: "route_source_value", type: "varchar(50)", desc: "Verbatim route value from the source data." },
      { name: "dose_unit_source_value", type: "varchar(50)", desc: "Verbatim dose unit from the source data." },
    ],
  },
  OBSERVATION: {
    desc: "Clinical facts about a person that don't fit other domains — social and lifestyle facts, medical history, etc.",
    columns: [
      { name: "observation_id", type: "bigint", desc: "Unique key for an observation record." },
      { name: "person_id", type: "bigint", desc: "The person the observation is recorded for." },
      { name: "observation_concept_id", type: "integer", desc: "Standard concept for the observation; primary field for analysis." },
      { name: "observation_date", type: "date", desc: "Date of the observation." },
      { name: "observation_datetime", type: "datetime", desc: "Date and time of the observation." },
      { name: "value_as_number", type: "float", desc: "Numerical result, if applicable." },
      { name: "value_as_string", type: "varchar(60)", desc: "Categorical result, if applicable." },
      { name: "value_as_concept_id", type: "integer", desc: "Result as a standard concept, when applicable." },
      { name: "observation_source_value", type: "varchar(50)", desc: "Verbatim source value for the observation." },
      { name: "value_as_datetime", type: "datetime", desc: "Result stored as a date value, when applicable." },
    ],
  },
  PAYER_PLAN_PERIOD: {
    desc: "Periods of continuous enrollment under a specific health-plan benefit structure from a given payer.",
    columns: [
      { name: "payer_plan_period_id", type: "bigint", desc: "Unique id per person–payer–plan–period combination." },
      { name: "person_id", type: "bigint", desc: "The person covered by the plan." },
      { name: "payer_plan_period_start_date", type: "date", desc: "Start date of plan coverage." },
      { name: "payer_plan_period_end_date", type: "date", desc: "End date of plan coverage." },
      { name: "payer_concept_id", type: "integer", desc: "The organization who reimburses the provider." },
      { name: "payer_source_value", type: "varchar(50)", desc: "The payer as it appears in the source data." },
      { name: "plan_concept_id", type: "integer", desc: "The specific health benefit plan enrolled in." },
      { name: "plan_source_value", type: "varchar(50)", desc: "The plan as it appears in the source data." },
    ],
  },
};

const CANONICAL_SCHEMA = Object.fromEntries(
  Object.entries(CANONICAL_TABLES).map(([t, def]) => [t, def.columns.map((c) => c.name)])
);

/* ---------- Mock pairings (upstream matcher: MIMIC-III → OMOP CDM) ----------
 * suggested points at a column of a CANONICAL_TABLES table; the detail panel
 * renders that entire table with the suggested column highlighted. */

const PAIRINGS = [
  { id: "p1",  novel: { table: "PATIENTS", column: "SUBJECT_ID", type: "INTEGER", desc: "Unique identifier for an individual patient.", samples: ["10006", "10011", "10013"] },
    suggested: { table: "PERSON", column: "person_id", type: "bigint" },
    confidence: "high" },
  { id: "p2",  novel: { table: "ADMISSIONS", column: "HADM_ID", type: "INTEGER", desc: "Unique id for a single hospital admission (1000000–1999999).", samples: ["142345", "105331", "165520"] },
    suggested: { table: "VISIT_OCCURRENCE", column: "visit_occurrence_id", type: "bigint" },
    confidence: "high" },
  { id: "p3",  novel: { table: "ADMISSIONS", column: "ADMITTIME", type: "TIMESTAMP", desc: "Date and time the patient was admitted to the hospital.", samples: ["2164-10-23 21:09:00", "2126-08-14 22:32:00", "2125-10-04 23:36:00"] },
    suggested: { table: "VISIT_OCCURRENCE", column: "visit_start_datetime", type: "datetime" },
    confidence: "high" },
  { id: "p4",  novel: { table: "ADMISSIONS", column: "DISCHTIME", type: "TIMESTAMP", desc: "Date and time the patient was discharged from the hospital.", samples: ["2164-11-01 17:15:00", "2126-08-28 18:59:00"] },
    suggested: { table: "VISIT_OCCURRENCE", column: "visit_end_datetime", type: "datetime" },
    confidence: "high" },
  { id: "p5",  novel: { table: "PATIENTS", column: "GENDER", type: "STRING", desc: "Genotypical sex of the patient.", samples: ["M", "F", "F"] },
    suggested: { table: "PERSON", column: "gender_source_value", type: "varchar(50)" },
    confidence: "high" },
  { id: "p6",  novel: { table: "PATIENTS", column: "DOB", type: "TIMESTAMP", desc: "Date of birth of the patient.", samples: ["2094-03-05 00:00:00", "2090-06-05 00:00:00", "2038-09-03 00:00:00"] },
    suggested: { table: "PERSON", column: "birth_datetime", type: "datetime" },
    confidence: "med" },
  { id: "p7",  novel: { table: "ADMISSIONS", column: "ADMISSION_TYPE", type: "STRING", desc: "Type of admission (EMERGENCY, ELECTIVE, URGENT, NEWBORN).", samples: ["EMERGENCY", "ELECTIVE", "URGENT"] },
    suggested: { table: "VISIT_OCCURRENCE", column: "visit_type_concept_id", type: "integer" },
    confidence: "med" },
  { id: "p8",  novel: { table: "ICUSTAYS", column: "INTIME", type: "TIMESTAMP", desc: "Date and time the patient was transferred into the ICU.", samples: ["2164-10-23 21:10:15", "2126-08-14 22:34:00"] },
    suggested: { table: "VISIT_DETAIL", column: "visit_detail_start_datetime", type: "datetime" },
    confidence: "med" },
  { id: "p9",  novel: { table: "LABEVENTS", column: "VALUENUM", type: "DOUBLE", desc: "Lab value in numeric form.", samples: ["4.1", "139", "7.35"] },
    suggested: { table: "MEASUREMENT", column: "value_as_number", type: "float" },
    confidence: "med" },
  { id: "p10", novel: { table: "PRESCRIPTIONS", column: "DRUG", type: "STRING", desc: "Name of the drug prescribed.", samples: ["Warfarin", "Heparin Sodium", "Insulin - Regular"] },
    suggested: { table: "DRUG_EXPOSURE", column: "drug_source_value", type: "varchar(50)" },
    confidence: "low" },
  { id: "p11", novel: { table: "ADMISSIONS", column: "MARITAL_STATUS", type: "STRING", desc: "Patient demographic — marital status.", samples: ["MARRIED", "SINGLE", "WIDOWED"] },
    suggested: { table: "PERSON", column: "ethnicity_concept_id", type: "integer" },
    confidence: "low" },
  { id: "p12", novel: { table: "ADMISSIONS", column: "INSURANCE", type: "STRING", desc: "Patient demographic — insurance/payer.", samples: ["Medicare", "Private", "Medicaid"] },
    suggested: { table: "VISIT_OCCURRENCE", column: "visit_source_value", type: "varchar(50)" },
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

  // Render the ENTIRE canonical table so a grader who doesn't know the
  // schema can skim every column and confirm the suggestion is the best fit.
  const tableDef = CANONICAL_TABLES[p.suggested.table];
  const colRows = tableDef.columns.map((c) => {
    const isSuggested = c.name === p.suggested.column;
    return `
      <tr class="canon-row ${isSuggested ? "suggested-row" : ""}" data-col="${c.name}"
          title="${isSuggested ? "Suggested match" : "Click to reassign to this column"}">
        <td class="canon-name">${c.name}${isSuggested ? ' <span class="suggest-chip">★ suggested</span>' : ""}</td>
        <td class="canon-type">${c.type}</td>
        <td class="canon-desc">${c.desc}</td>
      </tr>`;
  }).join("");

  panel.innerHTML = `
    ${finalizedNote}
    <div class="detail-header">
      <div class="detail-title">${pairName(p)}</div>
      <span class="conf-badge ${conf.cssClass}">${conf.label} confidence</span>
    </div>

    <div class="match-flow">
      <div class="match-card">
        <h3>Incoming (novel — MIMIC-III)</h3>
        <div class="card-name">${p.novel.table}.${p.novel.column}</div>
        <span class="card-type">${p.novel.type}</span>
        <div class="card-desc">${p.novel.desc}</div>
      </div>
    </div>

    <div class="section">
      <h2>Canonical table: ${p.suggested.table} <span class="table-note">(${tableDef.columns.length} columns shown)</span></h2>
      <div class="table-desc">${tableDef.desc}</div>
      <table class="canon-table">
        <tr><th>Column</th><th>Type</th><th>Description</th></tr>
        ${colRows}
      </table>
      <div class="alt-hint">The suggested match is highlighted. Click any other row to pre-fill a Reassign verdict.</div>
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
        <li><span class="k">Confidence</span><span class="v">${conf.label}</span></li>
        <li><span class="k">Novel datatype</span><span class="v">${p.novel.type}</span></li>
        <li><span class="k">Canonical datatype</span><span class="v">${p.suggested.type}</span></li>
      </ul>
    </div>`;

  // Non-suggested rows pre-fill a Reassign verdict aimed at that column.
  panel.querySelectorAll(".canon-row:not(.suggested-row)").forEach((row) =>
    row.addEventListener("click", () => {
      if (isBulk() || isFinalized(p.id)) return;
      $("verdict-select").value = "reassign";
      populateReassignTables(p.suggested.table);
      populateReassignColumns(p.suggested.table, row.dataset.col);
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
