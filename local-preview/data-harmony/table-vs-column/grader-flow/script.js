/* ===== [REDACTED] — Grader flow (Table vs Column) =====
 * Based on github-table, plus:
 *  - Decluttered detail panel (no sample values / match details) and queue
 *    rows (no target subtext).
 *  - Column | Table view toggle; Table view splits into Input | Canonical
 *    read-only alignment diagrams with live-updating lines.
 *  - localStorage-backed demo state shared with the admin page: your verdicts
 *    appear there as grader "You"; admin finalizations lock pairings here.
 */

/* ---------- Demo store (shared with admin via localStorage) ---------- */

const STORE_KEY = "dh-table-vs-column-demo-v1";

function loadStore() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; }
  catch { return {}; }
}

function saveStore(patch) {
  localStorage.setItem(STORE_KEY, JSON.stringify({ ...loadStore(), ...patch }));
}

/* ---------- Config (modularity layer) ---------- */

const CONFIG = {
  confidenceLevels: [
    { key: "high", label: "High", cssClass: "conf-high", rank: 3 },
    { key: "med",  label: "Med",  cssClass: "conf-med",  rank: 2 },
    { key: "low",  label: "Low",  cssClass: "conf-low",  rank: 1 },
  ],
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

/* ---------- Canonical schema (OMOP CDM) ---------- */

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

/* ---------- Mock pairings (upstream matcher: MIMIC-III → OMOP CDM) ---------- */

const PAIRINGS = [
  { id: "p1",  novel: { table: "PATIENTS", column: "SUBJECT_ID", type: "INTEGER", desc: "Unique identifier for an individual patient." },
    suggested: { table: "PERSON", column: "person_id", type: "bigint" },
    confidence: "high" },
  { id: "p2",  novel: { table: "ADMISSIONS", column: "HADM_ID", type: "INTEGER", desc: "Unique id for a single hospital admission (1000000–1999999)." },
    suggested: { table: "VISIT_OCCURRENCE", column: "visit_occurrence_id", type: "bigint" },
    confidence: "high" },
  { id: "p3",  novel: { table: "ADMISSIONS", column: "ADMITTIME", type: "TIMESTAMP", desc: "Date and time the patient was admitted to the hospital." },
    suggested: { table: "VISIT_OCCURRENCE", column: "visit_start_datetime", type: "datetime" },
    confidence: "high" },
  { id: "p4",  novel: { table: "ADMISSIONS", column: "DISCHTIME", type: "TIMESTAMP", desc: "Date and time the patient was discharged from the hospital." },
    suggested: { table: "VISIT_OCCURRENCE", column: "visit_end_datetime", type: "datetime" },
    confidence: "high" },
  { id: "p5",  novel: { table: "PATIENTS", column: "GENDER", type: "STRING", desc: "Genotypical sex of the patient." },
    suggested: { table: "PERSON", column: "gender_source_value", type: "varchar(50)" },
    confidence: "high" },
  { id: "p6",  novel: { table: "PATIENTS", column: "DOB", type: "TIMESTAMP", desc: "Date of birth of the patient." },
    suggested: { table: "PERSON", column: "birth_datetime", type: "datetime" },
    confidence: "med" },
  { id: "p7",  novel: { table: "ADMISSIONS", column: "ADMISSION_TYPE", type: "STRING", desc: "Type of admission (EMERGENCY, ELECTIVE, URGENT, NEWBORN)." },
    suggested: { table: "VISIT_OCCURRENCE", column: "visit_type_concept_id", type: "integer" },
    confidence: "med" },
  { id: "p8",  novel: { table: "ICUSTAYS", column: "INTIME", type: "TIMESTAMP", desc: "Date and time the patient was transferred into the ICU." },
    suggested: { table: "VISIT_DETAIL", column: "visit_detail_start_datetime", type: "datetime" },
    confidence: "med" },
  { id: "p9",  novel: { table: "LABEVENTS", column: "VALUENUM", type: "DOUBLE", desc: "Lab value in numeric form." },
    suggested: { table: "MEASUREMENT", column: "value_as_number", type: "float" },
    confidence: "med" },
  { id: "p10", novel: { table: "PRESCRIPTIONS", column: "DRUG", type: "STRING", desc: "Name of the drug prescribed." },
    suggested: { table: "DRUG_EXPOSURE", column: "drug_source_value", type: "varchar(50)" },
    confidence: "low" },
  { id: "p11", novel: { table: "ADMISSIONS", column: "MARITAL_STATUS", type: "STRING", desc: "Patient demographic — marital status." },
    suggested: { table: "PERSON", column: "ethnicity_concept_id", type: "integer" },
    confidence: "low" },
  { id: "p12", novel: { table: "ADMISSIONS", column: "INSURANCE", type: "STRING", desc: "Patient demographic — insurance/payer." },
    suggested: { table: "VISIT_OCCURRENCE", column: "visit_source_value", type: "varchar(50)" },
    confidence: "low" },
];

/* ---------- State ---------- */

const store = loadStore();

const state = {
  verdicts: store.graderVerdicts || {},       // pairingId -> { verdict, message, payload }
  finalDecisions: store.finalDecisions || {}, // admin decisions: lock pairings here
  drafts: {},
  activeId: null,
  selected: new Set(),
  bulkSnapshot: null,
  lastAction: null,
  view: "column",           // "column" | "table"
  side: "input",            // table view: "input" | "canonical"
  activeNovelTable: null,   // selection in table+input mode
  activeCanonTable: null,   // selection in table+canonical mode
};

function persistVerdicts() {
  saveStore({ graderVerdicts: state.verdicts });
}

/* ---------- Helpers ---------- */

const $ = (id) => document.getElementById(id);

const confidenceOf = (p) => CONFIG.confidenceLevels.find((c) => c.key === p.confidence);

const verdictOf = (key) => CONFIG.verdicts.find((v) => v.key === key);

const pairName = (p) => `${p.novel.table}.${p.novel.column}`;

const sortedPairings = () =>
  [...PAIRINGS].sort((a, b) => confidenceOf(b).rank - confidenceOf(a).rank);

const isBulk = () => state.selected.size >= 2;

const isFinalized = (id) => !!state.finalDecisions[id];

/* Resolve where a pairing currently points, honoring live decisions:
 * admin final decision > this grader's verdict > upstream suggestion.
 * Returns { kind: "map"|"expand"|"none"|"reject", status, table?, column?, columns? } */
function currentTarget(p) {
  const d = state.finalDecisions[p.id] || state.verdicts[p.id];
  if (!d) return { kind: "map", status: "pending", table: p.suggested.table, column: p.suggested.column };
  switch (d.verdict) {
    case "accept":
      return { kind: "map", status: "accept", table: p.suggested.table, column: p.suggested.column };
    case "reassign":
      return { kind: "map", status: "reassign", table: d.payload.table, column: d.payload.column };
    case "expand":
      return { kind: "expand", status: "expand", table: d.payload.table, columns: d.payload.columns, expandKind: d.payload.kind };
    case "assignNone":
      return { kind: "none", status: "none" };
    case "reject":
      return { kind: "reject", status: "reject" };
    default:
      return { kind: "map", status: "pending", table: p.suggested.table, column: p.suggested.column };
  }
}

const novelTables = () => [...new Set(PAIRINGS.map((p) => p.novel.table))];

const pairingsOfNovelTable = (t) => PAIRINGS.filter((p) => p.novel.table === t);

/* Canonical tables (or proposed expansion tables) currently targeted. */
function targetedCanonTables() {
  const tables = [];
  for (const p of PAIRINGS) {
    const t = currentTarget(p);
    if ((t.kind === "map" || t.kind === "expand") && !tables.includes(t.table)) tables.push(t.table);
  }
  return tables;
}

const pairingsTargeting = (table) =>
  PAIRINGS.filter((p) => {
    const t = currentTarget(p);
    return (t.kind === "map" || t.kind === "expand") && t.table === table;
  });

/* ---------- Sidebar rendering ---------- */

function renderQueue() {
  const list = $("queue-list");
  list.innerHTML = "";

  if (state.view === "column") {
    $("queue-title").textContent = "Pairings";
    $("queue-count").textContent = PAIRINGS.length;
    for (const p of sortedPairings()) list.appendChild(pairingRow(p));
  } else if (state.side === "input") {
    $("queue-title").textContent = "Novel tables";
    const tables = novelTables();
    $("queue-count").textContent = tables.length;
    for (const t of tables) list.appendChild(tableRow(t, `${pairingsOfNovelTable(t).length} columns`, state.activeNovelTable, "novel"));
  } else {
    $("queue-title").textContent = "Canonical tables";
    const tables = targetedCanonTables();
    $("queue-count").textContent = tables.length;
    for (const t of tables) {
      const proposed = !CANONICAL_TABLES[t];
      list.appendChild(tableRow(t, `${pairingsTargeting(t).length} pairing${pairingsTargeting(t).length === 1 ? "" : "s"}`, state.activeCanonTable, proposed ? "proposed" : "canon"));
    }
  }

  const done = Object.keys(state.verdicts).length;
  renderProgress(done, PAIRINGS.length);
  $("bulk-hint").textContent = state.view === "column" && isBulk() ? `${state.selected.size} selected` : "";
}

function pairingRow(p) {
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
  info.innerHTML = `<div class="pair-name">${pairName(p)}</div>`;

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
  return li;
}

function tableRow(name, subtitle, activeName, kind) {
  const li = document.createElement("li");
  li.className = "queue-item table-item";
  if (name === activeName) li.classList.add("active");

  const info = document.createElement("div");
  info.className = "pair-info";
  info.innerHTML = `
    <div class="pair-name">${name}</div>
    <div class="table-count">${subtitle}</div>`;

  const meta = document.createElement("div");
  meta.className = "pair-meta";
  if (kind === "proposed") meta.innerHTML = `<span class="kind-chip">proposed</span>`;

  li.append(info, meta);
  li.addEventListener("click", () => selectTable(name));
  return li;
}

function renderProgress(done, total) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  $("grader-progress").innerHTML = `
    <span>Reviewed ${done}/${total}</span>
    <div class="bar"><div class="bar-fill" style="width:${pct}%"></div></div>`;
}

/* ---------- Detail panel: column view ---------- */

function renderDetail() {
  const panel = $("detail-panel");
  if (state.view === "table") {
    renderDiagram(panel);
    return;
  }

  const p = PAIRINGS.find((x) => x.id === state.activeId);
  if (!p) {
    panel.innerHTML = `<div class="empty-detail">Select a pairing from the queue to review it.</div>`;
    return;
  }

  const conf = confidenceOf(p);
  const finalizedNote = isFinalized(p.id)
    ? `<div class="finalized-note">🔒 This pairing has been finalized by the admin and can no longer be changed.</div>`
    : "";

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
    </div>`;

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

/* ---------- Detail panel: table-view diagrams (read-only) ----------
 * Left column = the selected anchor table; right column = every table on the
 * other side of its pairings, showing matched columns only. SVG lines connect
 * rows and always reflect live decisions (pending / accept / reassign /
 * expand); assign-none and reject show a chip and no line.
 */

const LINE_STYLES = {
  pending:  { cls: "line-pending" },
  accept:   { cls: "line-accept" },
  reassign: { cls: "line-reassign" },
  expand:   { cls: "line-expand" },
};

const STATUS_CHIPS = {
  none:   `<span class="verdict-mini-chip chip-none">∅ no match</span>`,
  reject: `<span class="verdict-mini-chip chip-reject">✗ rejected</span>`,
};

function renderDiagram(panel) {
  if (state.side === "input") renderInputDiagram(panel);
  else renderCanonicalDiagram(panel);
}

function confBadge(p) {
  const conf = confidenceOf(p);
  return `<span class="conf-badge ${conf.cssClass}">${conf.label}</span>`;
}

/* Table view · Input: one novel table on the left, its targets on the right. */
function renderInputDiagram(panel) {
  const table = state.activeNovelTable;
  const pairings = table ? pairingsOfNovelTable(table) : [];
  if (!table || !pairings.length) {
    panel.innerHTML = `<div class="empty-detail">Select a novel table from the list.</div>`;
    return;
  }

  // Anchor rows: every column of the novel table (name, type, description,
  // confidence, plus a chip when the verdict removed its line).
  const anchorRows = pairings.map((p) => {
    const t = currentTarget(p);
    const chip = STATUS_CHIPS[t.kind] || "";
    const lock = isFinalized(p.id) ? `<span class="lock-chip">🔒</span>` : "";
    return `
      <div class="mini-row" data-src="${p.id}">
        <div class="mini-row-main">
          <span class="mini-col-name">${p.novel.column}</span>
          <span class="mini-col-type">${p.novel.type}</span>
          ${confBadge(p)} ${chip} ${lock}
        </div>
        <div class="mini-col-desc">${p.novel.desc}</div>
      </div>`;
  }).join("");

  // Group targets by table (matched columns only; expansions get their own
  // purple "proposed" group so it's obvious they don't exist yet).
  const groups = new Map(); // groupKey -> { title, tag, cls, rows: Map }
  const links = [];         // { srcId, targetKey, status }

  for (const p of pairings) {
    const t = currentTarget(p);
    if (t.kind === "map") {
      const gk = `canon:${t.table}`;
      if (!groups.has(gk)) groups.set(gk, { title: t.table, tag: "canonical", cls: "", rows: new Map() });
      const def = (CANONICAL_TABLES[t.table]?.columns || []).find((c) => c.name === t.column);
      const ck = `${gk}.${t.column}`;
      groups.get(gk).rows.set(ck, `
        <div class="mini-row target" data-target="${ck}">
          <div class="mini-row-main">
            <span class="mini-col-name">${t.column}</span>
            <span class="mini-col-type">${def ? def.type : ""}</span>
          </div>
        </div>`);
      links.push({ srcId: p.id, targetKey: ck, status: t.status });
    } else if (t.kind === "expand") {
      const gk = `proposed:${t.table}`;
      if (!groups.has(gk)) {
        groups.set(gk, {
          title: t.table,
          tag: t.expandKind === "table" ? "proposed table" : "proposed column",
          cls: "proposed", rows: new Map(),
        });
      }
      for (const c of t.columns) {
        const ck = `${gk}.${c.name}`;
        groups.get(gk).rows.set(ck, `
          <div class="mini-row target proposed" data-target="${ck}">
            <div class="mini-row-main">
              <span class="mini-col-name">${c.name}</span>
              <span class="mini-col-type">${c.type}</span>
            </div>
          </div>`);
        links.push({ srcId: p.id, targetKey: ck, status: "expand" });
      }
    }
  }

  paintDiagram(panel, {
    heading: `Alignment map — novel table <span class="mono">${table}</span>`,
    anchorTitle: table,
    anchorTag: "novel",
    anchorSide: "left", // novel is input: always on the left
    anchorRows, groups, links,
  });
}

/* Table view · Canonical: one canonical table on the left, novel sources right. */
function renderCanonicalDiagram(panel) {
  const table = state.activeCanonTable;
  const pairings = table ? pairingsTargeting(table) : [];
  if (!table || !pairings.length) {
    panel.innerHTML = `<div class="empty-detail">Select a canonical table from the list.</div>`;
    return;
  }

  const proposedTable = !CANONICAL_TABLES[table];

  // Anchor rows: matched columns of the canonical table (plus proposed
  // expansion columns, purple). Two pairings hitting one column share a row —
  // that collision is exactly what this view exists to expose.
  const anchorCols = new Map();
  const links = [];
  const groups = new Map();

  for (const p of pairings) {
    const t = currentTarget(p);
    const cols = t.kind === "expand" ? t.columns : [{ name: t.column }];
    for (const col of cols) {
      const ck = `anchor.${col.name}`;
      if (!anchorCols.has(ck)) {
        const def = (CANONICAL_TABLES[table]?.columns || []).find((c) => c.name === col.name);
        const proposed = t.kind === "expand";
        const type = def ? def.type : (col.type || "");
        anchorCols.set(ck, `
          <div class="mini-row target ${proposed ? "proposed" : ""}" data-target="${ck}">
            <div class="mini-row-main">
              <span class="mini-col-name">${col.name}</span>
              <span class="mini-col-type">${type}</span>
              ${proposed ? '<span class="verdict-mini-chip chip-expand">⊞ proposed</span>' : ""}
            </div>
          </div>`);
      }

      const gk = `novel:${p.novel.table}`;
      if (!groups.has(gk)) groups.set(gk, { title: p.novel.table, tag: "novel", cls: "", rows: new Map() });
      const rk = `${gk}.${p.novel.column}`;
      groups.get(gk).rows.set(rk, `
        <div class="mini-row" data-src="${p.id}">
          <div class="mini-row-main">
            <span class="mini-col-name">${p.novel.column}</span>
            <span class="mini-col-type">${p.novel.type}</span>
            ${confBadge(p)}
          </div>
          <div class="mini-col-desc">${p.novel.desc}</div>
        </div>`);
      links.push({ srcId: p.id, targetKey: ck, status: t.status });
    }
  }

  paintDiagram(panel, {
    heading: `Alignment map — canonical table <span class="mono">${table}</span>`,
    anchorTitle: table,
    anchorTag: proposedTable ? "proposed table" : "canonical",
    anchorCls: proposedTable ? "proposed" : "",
    anchorSide: "right", // canonical is output: always on the right
    anchorRows: [...anchorCols.values()].join(""),
    groups, links,
  });
}

/* Shared diagram painter + SVG line pass. The anchor table sits on the side
 * matching data direction: novel (input) left, canonical (output) right. */
function paintDiagram(panel, { heading, anchorTitle, anchorTag, anchorCls = "", anchorRows, groups, links, anchorSide = "left" }) {
  const groupHtml = [...groups.values()].map((g) => `
    <div class="mini-table ${g.cls}">
      <div class="mini-table-title">${g.title} <span class="mini-tag ${g.cls}">${g.tag}</span></div>
      ${[...g.rows.values()].join("")}
    </div>`).join("");

  const anchorHtml = `
    <div class="mini-table anchor ${anchorCls}">
      <div class="mini-table-title">${anchorTitle} <span class="mini-tag ${anchorCls}">${anchorTag}</span></div>
      ${anchorRows}
    </div>`;

  const leftHtml = anchorSide === "left" ? anchorHtml : groupHtml;
  const rightHtml = anchorSide === "left" ? groupHtml : anchorHtml;

  panel.innerHTML = `
    <div class="detail-header">
      <div class="detail-title">${heading}</div>
    </div>
    <div class="diagram-hint">Lines reflect live decisions. Click any row to select its pairing — the action box (lower left) acts on the selection.</div>
    <div class="diagram" id="diagram">
      <svg class="diagram-svg" id="diagram-svg"></svg>
      <div class="diagram-col left">${leftHtml}</div>
      <div class="diagram-col right">${rightHtml}</div>
    </div>`;

  wireDiagramSelection(links);
  // Synchronous: layout is available immediately after the innerHTML write,
  // and rAF doesn't fire in backgrounded tabs.
  drawDiagramLines(links);
}

/* Clicking either side of a pairing selects it for the action box; the
 * selected pairing is highlighted on both sides. */
function wireDiagramSelection(links) {
  const diagram = $("diagram");
  if (!diagram) return;

  // A shared target row (two novel columns → one canonical column) selects
  // the first pairing that links to it.
  const targetPid = new Map();
  for (const l of links) if (!targetPid.has(l.targetKey)) targetPid.set(l.targetKey, l.srcId);

  diagram.querySelectorAll("[data-src]").forEach((row) =>
    row.addEventListener("click", () => selectDiagramPairing(row.dataset.src))
  );
  diagram.querySelectorAll("[data-target]").forEach((row) => {
    const pid = targetPid.get(row.dataset.target);
    if (pid) row.addEventListener("click", () => selectDiagramPairing(pid));
  });

  const activeSrc = diagram.querySelector(`[data-src="${state.activeId}"]`);
  if (activeSrc) activeSrc.classList.add("selected");
  for (const l of links) {
    if (l.srcId !== state.activeId) continue;
    const t = diagram.querySelector(`[data-target="${CSS.escape(l.targetKey)}"]`);
    if (t) t.classList.add("selected");
  }
}

function selectDiagramPairing(id) {
  selectPairing(id); // loads the pairing's draft/verdict into the action box
}

function drawDiagramLines(links) {
  const diagram = $("diagram");
  const svg = $("diagram-svg");
  if (!diagram || !svg) return;

  const box = diagram.getBoundingClientRect();
  svg.setAttribute("width", diagram.scrollWidth);
  svg.setAttribute("height", diagram.scrollHeight);

  const paths = [];
  for (const link of links) {
    const src = diagram.querySelector(`[data-src="${link.srcId}"]`);
    const dst = diagram.querySelector(`[data-target="${CSS.escape(link.targetKey)}"]`);
    if (!src || !dst) continue;

    const s = src.getBoundingClientRect();
    const d = dst.getBoundingClientRect();

    // The anchor sits left, matches sit right — but in canonical mode the
    // link source (novel column) is on the RIGHT. Draw from the edge facing
    // the other element either way.
    const srcOnLeft = s.left < d.left;
    const x1 = (srcOnLeft ? s.right : s.left) - box.left;
    const y1 = s.top + s.height / 2 - box.top;
    const x2 = (srcOnLeft ? d.left : d.right) - box.left;
    const y2 = d.top + d.height / 2 - box.top;

    const bend = (x2 - x1) * 0.45;
    const style = LINE_STYLES[link.status] || LINE_STYLES.pending;
    paths.push(`<path class="diagram-line ${style.cls}"
      d="M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}"/>`);
  }

  svg.innerHTML = paths.join("");
}

window.addEventListener("resize", () => {
  if (state.view === "table") renderDetail();
});

/* ---------- View toggles ---------- */

function setView(view) {
  if (state.view === view) return;
  state.view = view;

  // Bulk selection is a column-view concept; leaving column view exits bulk
  // and restores the single-mode form (never lose work).
  if (view === "table" && state.selected.size) {
    state.selected.clear();
    populateVerdictSelect();
    if (state.bulkSnapshot) {
      applyFormState(state.bulkSnapshot);
      state.bulkSnapshot = null;
    }
  }

  // Land on the table containing the pairing being worked on.
  const active = PAIRINGS.find((p) => p.id === state.activeId);
  if (view === "table") {
    if (!state.activeNovelTable) state.activeNovelTable = active ? active.novel.table : novelTables()[0];
    if (!state.activeCanonTable || !targetedCanonTables().includes(state.activeCanonTable)) {
      const t = active ? currentTarget(active) : null;
      state.activeCanonTable = (t && t.table && targetedCanonTables().includes(t.table))
        ? t.table : targetedCanonTables()[0];
    }
  }

  document.querySelectorAll("#view-toggle button").forEach((b) =>
    b.classList.toggle("active", b.dataset.view === view)
  );
  $("side-toggle").classList.toggle("hidden", view !== "table");
  document.body.classList.toggle("table-view", view === "table");

  renderQueue();
  renderDetail();
  syncActionBox();
}

function setSide(side) {
  if (state.side === side) return;
  state.side = side;
  if (side === "canonical" && !targetedCanonTables().includes(state.activeCanonTable)) {
    state.activeCanonTable = targetedCanonTables()[0] || null;
  }
  document.querySelectorAll("#side-toggle button").forEach((b) =>
    b.classList.toggle("active", b.dataset.side === side)
  );
  renderQueue();
  renderDetail();
}

function selectTable(name) {
  if (state.side === "input") state.activeNovelTable = name;
  else state.activeCanonTable = name;
  renderQueue();
  renderDetail();
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
    verdict: $("verdict-select").value || "accept",
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

function syncActionBox() {
  const bulk = isBulk();
  const verdict = $("verdict-select").value;

  $("bulk-banner").classList.toggle("hidden", !bulk);
  $("bulk-count").textContent = state.selected.size;

  $("reassign-form").classList.toggle("hidden", bulk || verdict !== "reassign");
  $("expand-form").classList.toggle("hidden", bulk || verdict !== "expand");

  const msg = $("verdict-message");
  msg.classList.toggle("hidden", bulk || verdict === "expand");
  msg.placeholder = verdict === "assignNone"
    ? "Reason (required)"
    : "Message (optional)";

  const kind = document.querySelector('input[name="expand-kind"]:checked').value;
  $("expand-table-fields").classList.toggle("hidden", kind !== "table");
  $("expand-column-fields").classList.toggle("hidden", kind !== "column");

  // In Table view the detail panel no longer names the pairing being acted
  // on, so the action box carries an explicit target label.
  const active = PAIRINGS.find((p) => p.id === state.activeId);
  const actingOn = $("acting-on");
  actingOn.classList.toggle("hidden", state.view !== "table" || bulk || !active);
  if (active) actingOn.innerHTML = `Acting on: <span class="mono">${pairName(active)}</span>`;

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
    state.bulkSnapshot = readFormState();
    populateVerdictSelect();
    if (!verdictOf($("verdict-select").value).bulk) $("verdict-select").value = "accept";
  } else if (wasBulk && !nowBulk) {
    populateVerdictSelect();
    applyFormState(state.bulkSnapshot);
    state.bulkSnapshot = null;
  }

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
      verdict: $("verdict-select").value,
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
  persistVerdicts();

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
    persistVerdicts();

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
    persistVerdicts();
    selectPairing(a.id);
  } else if (a.type === "bulk") {
    for (const e of a.entries) {
      if (e.previous) state.verdicts[e.id] = e.previous;
      else delete state.verdicts[e.id];
    }
    persistVerdicts();
  }
  state.lastAction = null;
  $("undo-toast").classList.add("hidden");
  renderQueue();
  renderDetail();
  syncActionBox();
}

/* ---------- Cross-page sync + demo reset ---------- */

// If the admin page (in another tab) finalizes decisions, update live.
window.addEventListener("storage", (e) => {
  if (e.key !== STORE_KEY) return;
  const s = loadStore();
  state.finalDecisions = s.finalDecisions || {};
  renderQueue();
  renderDetail();
  syncActionBox();
});

function resetDemo() {
  if (!window.confirm("Reset the demo? All grader verdicts, admin decisions, and schedules are cleared.")) return;
  localStorage.removeItem(STORE_KEY);
  window.location.reload();
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

  document.querySelectorAll("#view-toggle button").forEach((b) =>
    b.addEventListener("click", () => setView(b.dataset.view))
  );
  document.querySelectorAll("#side-toggle button").forEach((b) =>
    b.addEventListener("click", () => setSide(b.dataset.side))
  );

  $("reset-demo-btn").addEventListener("click", resetDemo);

  // Open with the top unreviewed pairing selected (verdicts may have been
  // restored from a previous demo session).
  const first = sortedPairings().find((p) => !state.verdicts[p.id] && !isFinalized(p.id));
  state.activeId = first ? first.id : sortedPairings()[0].id;
  const existing = state.verdicts[state.activeId];
  if (existing) applyFormState(verdictToFormState(existing));
  renderQueue();
  renderDetail();
  syncActionBox();
}

init();

/* ---------- Weekly availability (When2Meet-style) ----------
 * Free/busy only. Persisted in the shared demo store so the admin's Meet
 * overlay includes "You", and the popup stops nagging once saved.
 */

const SCHEDULE = {
  days: ["Mon", "Tue", "Wed", "Thu", "Fri"],
  startHour: 9,
  slotsPerDay: 16,
};

const storedSchedule = store.schedule || null;

const scheduleState = {
  free: new Set(storedSchedule ? storedSchedule.free : []),
  submitted: !!(storedSchedule && storedSchedule.submitted),
  snapshot: null,
  painting: null,
};

const slotKey = (d, s) => `${d}-${s}`;

function slotLabel(s) {
  if (s % 2) return "";
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
          e.preventDefault();
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
  saveStore({ schedule: { free: [...scheduleState.free], submitted: true } });
  $("schedule-modal").classList.add("hidden");
  state.lastAction = null;
  showToast("Availability saved for the week");
});

$("schedule-skip").addEventListener("click", () => {
  scheduleState.free = new Set(scheduleState.snapshot);
  scheduleState.snapshot = null;
  $("schedule-modal").classList.add("hidden");
});

// Start-of-week prompt: appears on load until the grader saves a schedule.
if (!scheduleState.submitted) openScheduleModal(true);
