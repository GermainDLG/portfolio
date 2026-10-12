/* ===== Data Harmony — Admin flow =====
 * Modular POC. CONFIG isolates the pieces expected to change next phase
 * (confidence buckets, reason modes, grader cap).
 */

/* ---------- Config (modularity layer) ---------- */

const CONFIG = {
  confidenceLevels: [
    { key: "high", label: "High", cssClass: "conf-high", rank: 3 },
    { key: "med",  label: "Med",  cssClass: "conf-med",  rank: 2 },
    { key: "low",  label: "Low",  cssClass: "conf-low",  rank: 1 },
  ],
  reasons: { mode: "freetext", options: [] },
  finalVerdicts: [
    { key: "accept",     label: "Accept",      bulk: true  },
    { key: "reject",     label: "Reject",      bulk: true  },
    { key: "reassign",   label: "Reassign",    bulk: false },
    { key: "assignNone", label: "Assign None", bulk: false },
  ],
  maxGraders: 5,      // hard cap in the popup; bump here when policy changes
  minGraders: 3,      // going below is allowed but warned
  minReviews: 3,      // pairings with fewer verdicts get flagged
};

/* CANONICAL_TABLES carries full column detail (type + description) so the
 * detail panel can render the entire target table; a representative subset of
 * each OMOP table's columns is shown. CANONICAL_SCHEMA is derived for pickers. */

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

/* ---------- Graders ---------- */

const REMOVED_GRADERS = []; // keep names/verdict attribution after removal

let GRADERS = [
  { id: "g1", name: "Priya Raman",  email: "priya@quicksilverlabs.ai",  reviewed: 10, total: 10 },
  { id: "g2", name: "Marcus Webb",  email: "marcus@quicksilverlabs.ai", reviewed: 8,  total: 10 },
  { id: "g3", name: "Sofía Duarte", email: "sofia@quicksilverlabs.ai",  reviewed: 10, total: 10 },
  { id: "g4", name: "Tom Askew",    email: "tom@quicksilverlabs.ai",    reviewed: 4,  total: 10 },
];

/* ---------- Mock match decisions (grader review complete or in progress) ----------
 * votes: graderId -> { verdict, reason, payload? } — verdicts shown as a compact
 * tally on the queue row; reasoning only appears at the bottom of the detail panel. */

const MATCHES = [
  { id: "m1",
    novel: { table: "PATIENTS", column: "SUBJECT_ID", type: "INTEGER", desc: "Unique identifier for an individual patient.", samples: ["10006", "10011"] },
    suggested: { table: "PERSON", column: "person_id", type: "bigint" },
    confidence: "high",
    votes: {
      g1: { verdict: "accept", reason: "SUBJECT_ID is the MIMIC patient key; person_id is its OMOP equivalent." },
      g2: { verdict: "accept", reason: "Direct identity mapping — INTEGER→bigint widens safely." },
      g3: { verdict: "accept", reason: "Clear match." },
      g4: { verdict: "accept", reason: "Agree with the matcher." },
    } },
  { id: "m2",
    novel: { table: "ADMISSIONS", column: "ADMITTIME", type: "TIMESTAMP", desc: "Date and time the patient was admitted to the hospital.", samples: ["2164-10-23 21:09:00", "2126-08-14 22:32:00"] },
    suggested: { table: "VISIT_OCCURRENCE", column: "visit_start_datetime", type: "datetime" },
    confidence: "high",
    votes: {
      g1: { verdict: "accept", reason: "Admission time is the visit start for inpatient encounters." },
      g2: { verdict: "accept", reason: "Straightforward." },
      g3: { verdict: "accept", reason: "TIMESTAMP→datetime is fine." },
      g4: { verdict: "accept", reason: "Match." },
    } },
  { id: "m3",
    novel: { table: "ADMISSIONS", column: "ADMISSION_TYPE", type: "STRING", desc: "Type of admission (EMERGENCY, ELECTIVE, URGENT, NEWBORN).", samples: ["EMERGENCY", "ELECTIVE", "URGENT"] },
    suggested: { table: "VISIT_OCCURRENCE", column: "visit_type_concept_id", type: "integer" },
    confidence: "med",
    votes: {
      g1: { verdict: "accept", reason: "EMERGENCY/ELECTIVE/URGENT map cleanly through the Visit Type vocabulary." },
      g2: { verdict: "reject", reason: "Raw strings aren't concept ids — needs vocabulary mapping first; the verbatim value belongs in visit_source_value." },
      g3: { verdict: "accept", reason: "Accept with concept mapping in the ETL." },
      g4: { verdict: "reject", reason: "STRING→integer concept id is not a direct column match." },
    } },
  { id: "m4",
    novel: { table: "ADMISSIONS", column: "LANGUAGE", type: "STRING", desc: "Patient demographic — language.", samples: ["ENGL", "SPAN", "RUSS"] },
    suggested: { table: "PERSON", column: "ethnicity_concept_id", type: "integer" },
    confidence: "low",
    votes: {
      g1: { verdict: "reject", reason: "Language is not ethnicity — bad suggestion." },
      g2: { verdict: "expand", reason: "OMOP PERSON has no language field; keep the raw MIMIC value as a new source column.",
            payload: { kind: "column", table: "PERSON", columns: [{ name: "language_source_value", type: "text" }] } },
      g3: { verdict: "expand", reason: "Same — PERSON needs a language_source_value column.",
            payload: { kind: "column", table: "PERSON", columns: [{ name: "language_source_value", type: "text" }] } },
      g4: { verdict: "reject", reason: "Not a match." },
    } },
  { id: "m5",
    novel: { table: "ICUSTAYS", column: "FIRST_CAREUNIT", type: "STRING", desc: "First ICU type in which the patient was cared for.", samples: ["MICU", "CCU", "SICU"] },
    suggested: { table: "VISIT_DETAIL", column: "admitted_from_concept_id", type: "integer" },
    confidence: "low",
    votes: {
      g1: { verdict: "reassign", reason: "FIRST_CAREUNIT is the unit the stay happened in, not where the patient was admitted from — it's the source value of the visit detail itself.",
            payload: { table: "VISIT_DETAIL", column: "visit_detail_source_value" } },
      g3: { verdict: "accept", reason: "First care unit ≈ where the ICU episode starts, close enough." },
    } },
  { id: "m6",
    novel: { table: "LABEVENTS", column: "VALUEUOM", type: "STRING", desc: "Unit of measurement for the lab value.", samples: ["mEq/L", "mg/dL", "%"] },
    suggested: { table: "MEASUREMENT", column: "unit_concept_id", type: "integer" },
    confidence: "med",
    votes: {
      g1: { verdict: "accept", reason: "Units can be mapped to standard UCUM concepts downstream." },
      g2: { verdict: "accept", reason: "Matches the unit field." },
      g3: { verdict: "reassign", reason: "Raw strings like mEq/L are source values; unit_concept_id requires mapped UCUM concepts.",
            payload: { table: "MEASUREMENT", column: "unit_source_value" } },
      g4: { verdict: "accept", reason: "Unit match." },
    } },
];

/* ---------- Mock schema expansion requests ----------
 * signature identifies duplicates: approving one approves all with the same signature. */

const EXPANSIONS = [
  { id: "e1", requestedBy: "g2", pairing: "ADMISSIONS.LANGUAGE",
    kind: "column", table: "PERSON",
    columns: [{ name: "language_source_value", type: "text" }],
    reason: "OMOP PERSON has no field for preferred language; keep the raw MIMIC value as a source column.",
    signature: "column:PERSON:language_source_value" },
  { id: "e2", requestedBy: "g3", pairing: "ADMISSIONS.LANGUAGE",
    kind: "column", table: "PERSON",
    columns: [{ name: "language_source_value", type: "text" }],
    reason: "Same — PERSON needs a language_source_value column.",
    signature: "column:PERSON:language_source_value" },
  { id: "e3", requestedBy: "g1", pairing: "ADMISSIONS.MARITAL_STATUS",
    kind: "column", table: "PERSON",
    columns: [{ name: "marital_status_source_value", type: "text" }],
    reason: "Marital status maps to NA in the mapping doc, but it's demographic data worth keeping on PERSON.",
    signature: "column:PERSON:marital_status_source_value" },
  { id: "e4", requestedBy: "g4", pairing: "ADMISSIONS.EDREGTIME",
    kind: "table", table: "ed_registration",
    columns: [
      { name: "ed_registration_id", type: "uuid" },
      { name: "visit_occurrence_id", type: "bigint" },
      { name: "ed_reg_datetime", type: "timestamptz" },
      { name: "ed_out_datetime", type: "timestamptz" },
    ],
    reason: "ED registration/discharge is a paired time interval per admission — it doesn't fit a single VISIT_OCCURRENCE column.",
    signature: "table:ed_registration" },
];

/* ---------- State ---------- */

const state = {
  tab: "matches",            // "matches" | "expansions"
  finalDecisions: {},        // matchId -> { verdict, message, payload }
  expansionDecisions: {},    // expansionId -> { decision: "approved"|"rejected", message }
  activeId: null,
  selected: new Set(),       // bulk selection (match tab only)
  bulkSnapshot: null,
  lastAction: null,
  locked: false,             // decisions stay revisable until the admin locks them
};

/* ---------- Helpers ---------- */

const $ = (id) => document.getElementById(id);

const confidenceOf = (m) => CONFIG.confidenceLevels.find((c) => c.key === m.confidence);

const verdictOf = (key) => CONFIG.finalVerdicts.find((v) => v.key === key);

const pairName = (m) => `${m.novel.table}.${m.novel.column}`;

// Looks through active then removed graders: a removed grader's submitted
// verdicts stay visible and attributed.
const findGrader = (id) =>
  GRADERS.find((g) => g.id === id) || REMOVED_GRADERS.find((g) => g.id === id);

const sortedMatches = () =>
  [...MATCHES].sort((a, b) => confidenceOf(b).rank - confidenceOf(a).rank);

const isBulk = () => state.tab === "matches" && state.selected.size >= 2;

const voteCount = (m) => Object.keys(m.votes).length;

const isUnderReviewed = (m) => voteCount(m) < CONFIG.minReviews;

const VOTE_GLYPHS = {
  accept:     { glyph: "✓", cls: "t-accept",   chip: "vote-accept",   label: "Accept" },
  reject:     { glyph: "✗", cls: "t-reject",   chip: "vote-reject",   label: "Reject" },
  reassign:   { glyph: "↪", cls: "t-reassign", chip: "vote-reassign", label: "Reassign" },
  assignNone: { glyph: "∅", cls: "t-none",     chip: "vote-none",     label: "Assign None" },
  expand:     { glyph: "⊞", cls: "t-expand",   chip: "vote-expand",   label: "Expand" },
};

function tallyHtml(m) {
  const counts = {};
  for (const v of Object.values(m.votes)) {
    counts[v.verdict] = (counts[v.verdict] || 0) + 1;
  }
  return Object.entries(counts)
    .map(([k, n]) => `<span class="${VOTE_GLYPHS[k].cls}">${n}${VOTE_GLYPHS[k].glyph}</span>`)
    .join(" ");
}

/* ---------- Top bar: grader progress ---------- */

function renderGraderProgress() {
  $("grader-progress-row").innerHTML = GRADERS.map((g) => {
    const pct = g.total ? Math.round((g.reviewed / g.total) * 100) : 0;
    const complete = g.reviewed >= g.total ? " complete" : "";
    return `
      <div class="grader-progress">
        <span class="name">${g.name.split(" ")[0]}</span>
        <div class="bar"><div class="bar-fill${complete}" style="width:${pct}%"></div></div>
        <span class="fraction">${g.reviewed}/${g.total}</span>
      </div>`;
  }).join("");
}

/* ---------- Queue rendering ---------- */

function renderQueue() {
  const list = $("queue-list");
  list.innerHTML = "";

  if (state.tab === "matches") {
    for (const m of sortedMatches()) list.appendChild(matchRow(m));
  } else {
    for (const e of EXPANSIONS) list.appendChild(expansionRow(e));
  }

  $("matches-count").textContent =
    MATCHES.filter((m) => !state.finalDecisions[m.id]).length;
  $("expansions-count").textContent =
    EXPANSIONS.filter((e) => !state.expansionDecisions[e.id]).length;
}

function matchRow(m) {
  const li = document.createElement("li");
  li.className = "queue-item";
  if (m.id === state.activeId) li.classList.add("active");
  const decision = state.finalDecisions[m.id];
  if (decision) li.classList.add(decision.verdict === "reject" ? "rejected" : "done");

  const check = document.createElement("input");
  check.type = "checkbox";
  check.className = "queue-check";
  check.checked = state.selected.has(m.id);
  check.disabled = state.locked && !!decision; // locked decisions can't enter bulk
  check.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleSelect(m.id, check.checked);
  });

  const info = document.createElement("div");
  info.className = "pair-info";
  const underFlag = isUnderReviewed(m)
    ? `<span class="under-flag">⚠ ${voteCount(m)}/${CONFIG.minReviews} reviews</span>`
    : "";
  info.innerHTML = `
    <div class="pair-name">${pairName(m)}</div>
    <div class="pair-target">→ ${m.suggested.table}.${m.suggested.column}</div>
    <div class="tally">${tallyHtml(m)} ${underFlag}</div>`;

  const meta = document.createElement("div");
  meta.className = "pair-meta";
  const conf = confidenceOf(m);
  meta.innerHTML = `<span class="conf-badge ${conf.cssClass}">${conf.label}</span>`;
  if (decision) {
    meta.innerHTML += `<span class="status-chip">${state.locked ? "🔒 " : ""}${verdictOf(decision.verdict).label}</span>`;
  }

  li.append(check, info, meta);
  li.addEventListener("click", () => selectItem(m.id));
  return li;
}

function expansionRow(e) {
  const li = document.createElement("li");
  li.className = "queue-item";
  if (e.id === state.activeId) li.classList.add("active");
  const decision = state.expansionDecisions[e.id];
  if (decision) li.classList.add(decision.decision === "approved" ? "done" : "rejected");

  const grader = findGrader(e.requestedBy);

  const info = document.createElement("div");
  info.className = "pair-info";
  info.innerHTML = `
    <div class="pair-name">${e.kind === "table" ? e.table : `${e.table}.${e.columns[0].name}`}</div>
    <div class="pair-target">for ${e.pairing} · by ${grader ? grader.name : "removed grader"}</div>`;

  const meta = document.createElement("div");
  meta.className = "pair-meta";
  meta.innerHTML = `<span class="kind-chip">${e.kind === "table" ? "New table" : "New column"}</span>`;
  if (decision) meta.innerHTML += `<span class="status-chip">${decision.decision}</span>`;

  li.append(info, meta);
  li.addEventListener("click", () => selectItem(e.id));
  return li;
}

/* ---------- Detail panel ---------- */

function renderDetail() {
  const panel = $("detail-panel");
  if (!state.activeId) {
    panel.innerHTML = `<div class="empty-detail">Select an item from the queue to review it.</div>`;
    return;
  }
  if (state.tab === "matches") renderMatchDetail(panel);
  else renderExpansionDetail(panel);
}

function renderMatchDetail(panel) {
  const m = MATCHES.find((x) => x.id === state.activeId);
  if (!m) { panel.innerHTML = ""; return; }
  const conf = confidenceOf(m);
  const decision = state.finalDecisions[m.id];

  const decisionNote = decision
    ? `<div class="finalized-note ${decision.verdict === "reject" ? "rejected" : ""}">
         Finalized: ${verdictOf(decision.verdict).label}${decision.message ? ` — “${decision.message}”` : ""}
       </div>`
    : "";

  // Votes render LAST, below all pairing information, so the admin reads the
  // evidence before the graders' arguments. "Jump to Reasoning" makes the
  // second visit one click instead of a scroll hunt.
  // Union of active graders and everyone who voted, so removed graders'
  // verdicts stay visible.
  const voterIds = [...new Set([...GRADERS.map((g) => g.id), ...Object.keys(m.votes)])];
  const voteCards = voterIds.map((gid) => {
    const g = findGrader(gid) || { name: "Removed grader", id: gid };
    const removed = !GRADERS.some((x) => x.id === gid);
    const v = m.votes[gid];
    if (!v) return removed ? "" : `<div class="missing-vote">⚠ ${g.name} has not reviewed this pairing yet.</div>`;
    const glyph = VOTE_GLYPHS[v.verdict];
    let detail = "";
    if (v.verdict === "reassign" && v.payload) {
      detail = `<div class="vote-detail">→ ${v.payload.table}.${v.payload.column}</div>`;
    }
    if (v.verdict === "expand" && v.payload) {
      detail = `<div class="vote-detail">⊞ ${v.payload.kind === "table" ? "new table" : "new column on"} ${v.payload.table}
        (${v.payload.columns.map((c) => `${c.name} ${c.type}`).join(", ")})</div>`;
    }
    return `
      <div class="vote-card">
        <div class="vote-card-header">
          <span class="vote-grader">${g.name}${removed ? " (removed)" : ""}</span>
          <span class="vote-chip ${glyph.chip}">${glyph.label}</span>
        </div>
        ${detail}
        ${v.reason ? `<div class="vote-reason">${v.reason}</div>` : ""}
      </div>`;
  }).join("");

  // Render the ENTIRE canonical table so an admin who doesn't know the
  // schema can skim every column and confirm the suggestion is the best fit.
  const tableDef = CANONICAL_TABLES[m.suggested.table];
  const colRows = tableDef.columns.map((c) => {
    const isSuggested = c.name === m.suggested.column;
    return `
      <tr class="canon-row ${isSuggested ? "suggested-row" : ""}" data-col="${c.name}"
          title="${isSuggested ? "Suggested match" : "Click to reassign to this column"}">
        <td class="canon-name">${c.name}${isSuggested ? ' <span class="suggest-chip">★ suggested</span>' : ""}</td>
        <td class="canon-type">${c.type}</td>
        <td class="canon-desc">${c.desc}</td>
      </tr>`;
  }).join("");

  panel.innerHTML = `
    ${decisionNote}
    <div class="detail-header">
      <div class="detail-title">${pairName(m)}</div>
      <div class="detail-header-right">
        <button class="jump-btn" id="jump-reasoning-btn">↓ Jump to Reasoning</button>
        <span class="conf-badge ${conf.cssClass}">${conf.label} confidence</span>
      </div>
    </div>

    <div class="match-flow">
      <div class="match-card">
        <h3>Incoming (novel — MIMIC-III)</h3>
        <div class="card-name">${m.novel.table}.${m.novel.column}</div>
        <span class="card-type">${m.novel.type}</span>
        <div class="card-desc">${m.novel.desc}</div>
      </div>
    </div>

    <div class="section">
      <h2>Canonical table: ${m.suggested.table} <span class="table-note">(${tableDef.columns.length} columns shown)</span></h2>
      <div class="table-desc">${tableDef.desc}</div>
      <table class="canon-table">
        <tr><th>Column</th><th>Type</th><th>Description</th></tr>
        ${colRows}
      </table>
      <div class="alt-hint">The suggested match is highlighted. Click any other row to pre-fill a Reassign decision.</div>
    </div>

    <div class="section">
      <h2>Sample values</h2>
      <table class="sample-table">
        <tr><th>${m.novel.column}</th></tr>
        ${m.novel.samples.map((s) => `<tr><td>${s}</td></tr>`).join("")}
      </table>
    </div>

    <div class="section">
      <h2>Match details</h2>
      <ul class="kv-list">
        <li><span class="k">Suggested by</span><span class="v">upstream matcher v2.3</span></li>
        <li><span class="k">Confidence</span><span class="v">${conf.label}</span></li>
        <li><span class="k">Grader reviews</span><span class="v">${voteCount(m)}/${GRADERS.length}</span></li>
      </ul>
    </div>

    <div class="section" id="reasoning-section">
      <h2>Grader verdicts &amp; reasoning</h2>
      ${voteCards}
      <button class="meet-btn" id="meet-btn" title="Overlay all graders' availability to find a meeting time">📅 Meet</button>
    </div>`;

  $("meet-btn").addEventListener("click", () => openMeetModal(m));

  $("jump-reasoning-btn").addEventListener("click", () =>
    $("reasoning-section").scrollIntoView({ behavior: "smooth", block: "start" })
  );

  // Non-suggested rows pre-fill a Reassign final decision.
  panel.querySelectorAll(".canon-row:not(.suggested-row)").forEach((row) =>
    row.addEventListener("click", () => {
      if (isBulk() || state.finalDecisions[m.id]) return;
      $("verdict-select").value = "reassign";
      $("reassign-table").value = m.suggested.table;
      populateReassignColumns(m.suggested.table);
      $("reassign-column").value = row.dataset.col;
      syncActionBox();
    })
  );
}

function renderExpansionDetail(panel) {
  const e = EXPANSIONS.find((x) => x.id === state.activeId);
  if (!e) { panel.innerHTML = ""; return; }
  const grader = findGrader(e.requestedBy);
  const decision = state.expansionDecisions[e.id];

  const dupes = EXPANSIONS.filter((x) => x.signature === e.signature && x.id !== e.id);
  const dupNote = dupes.length
    ? `<div class="dup-note">⊞ ${dupes.length} other request${dupes.length > 1 ? "s" : ""} ask${dupes.length > 1 ? "" : "s"} for this same expansion
       (${dupes.map((d) => d.pairing).join(", ")}). Approving this one approves ${dupes.length > 1 ? "them all" : "it too"}.</div>`
    : "";

  const decisionNote = decision
    ? `<div class="finalized-note ${decision.decision === "rejected" ? "rejected" : ""}">
         ${decision.decision === "approved" ? "Approved" : "Rejected"}${decision.message ? ` — “${decision.message}”` : ""}
       </div>`
    : "";

  panel.innerHTML = `
    ${decisionNote}
    ${dupNote}
    <div class="detail-header">
      <div class="detail-title">${e.kind === "table" ? e.table : `${e.table}.${e.columns[0].name}`}</div>
      <span class="kind-chip">${e.kind === "table" ? "New table" : "New column"}</span>
    </div>

    <div class="expansion-spec">
      <div class="spec-kind">${e.kind === "table" ? "Proposed new table" : `Proposed new column on ${e.table}`}</div>
      <div class="spec-name">${e.table}</div>
      <table class="sample-table">
        <tr><th>Column</th><th>Type</th></tr>
        ${e.columns.map((c) => `<tr><td>${c.name}</td><td>${c.type}</td></tr>`).join("")}
      </table>
    </div>

    <div class="section">
      <h2>Request details</h2>
      <ul class="kv-list">
        <li><span class="k">Requested by</span><span class="v">${grader ? grader.name : "removed grader"}</span></li>
        <li><span class="k">For pairing</span><span class="v">${e.pairing}</span></li>
      </ul>
    </div>

    <div class="section">
      <h2>Reason</h2>
      <div class="vote-card"><div class="vote-reason">${e.reason}</div></div>
    </div>`;
}

/* ---------- Action box ---------- */

function populateVerdictSelect() {
  const sel = $("verdict-select");
  const prev = sel.value;
  const opts = isBulk()
    ? CONFIG.finalVerdicts.filter((v) => v.bulk)
    : CONFIG.finalVerdicts;
  sel.innerHTML = opts
    .map((v) => `<option value="${v.key}">${v.label}</option>`)
    .join("");
  if (opts.some((v) => v.key === prev)) sel.value = prev;
}

function populateReassignTables() {
  $("reassign-table").innerHTML = Object.keys(CANONICAL_SCHEMA)
    .map((t) => `<option value="${t}">${t}</option>`)
    .join("");
  populateReassignColumns($("reassign-table").value);
}

function populateReassignColumns(table) {
  $("reassign-column").innerHTML = (CANONICAL_SCHEMA[table] || [])
    .map((c) => `<option value="${c}">${c}</option>`)
    .join("");
}

function syncActionBox() {
  const onMatches = state.tab === "matches";
  $("match-controls").classList.toggle("hidden", !onMatches);
  $("expansion-controls").classList.toggle("hidden", onMatches);

  const bulk = isBulk();
  $("bulk-banner").classList.toggle("hidden", !bulk);
  $("bulk-count").textContent = state.selected.size;

  if (onMatches) {
    const verdict = $("verdict-select").value;
    $("reassign-form").classList.toggle("hidden", bulk || verdict !== "reassign");

    const msg = $("verdict-message");
    msg.classList.toggle("hidden", bulk);
    msg.placeholder = verdict === "assignNone" ? "Reason (required)" : "Message (optional)";

    const m = MATCHES.find((x) => x.id === state.activeId);
    $("under-review-warning").classList.toggle(
      "hidden", bulk || !m || !isUnderReviewed(m)
    );

    const btn = $("submit-btn");
    const label = verdictOf(verdict).label;
    btn.textContent = bulk
      ? `Finalize: ${label} ${state.selected.size} pairings`
      : `Finalize: ${label}`;
    btn.classList.toggle("danger", verdict === "reject");
    // Decisions stay revisable until the admin locks them.
    const decidedLocked = state.locked && m && !!state.finalDecisions[m.id];
    btn.disabled = !bulk && (!m || decidedLocked);
    $("locked-note").classList.toggle("hidden", bulk || !decidedLocked);
    $("action-error").classList.add("hidden");
  } else {
    $("under-review-warning").classList.add("hidden");
    const e = EXPANSIONS.find((x) => x.id === state.activeId);
    const decidedLocked = state.locked && e && !!state.expansionDecisions[e.id];
    $("locked-note").classList.toggle("hidden", !decidedLocked);
    $("approve-expansion-btn").disabled = !e || decidedLocked;
    $("reject-expansion-btn").disabled = !e || decidedLocked;
  }
}

/* ---------- Selection / navigation ---------- */

function selectItem(id) {
  state.activeId = id;
  renderQueue();
  renderDetail();
  syncActionBox();
}

function toggleSelect(id, checked) {
  const wasBulk = isBulk();
  if (checked) state.selected.add(id);
  else state.selected.delete(id);
  const nowBulk = isBulk();

  if (!wasBulk && nowBulk) {
    state.bulkSnapshot = {
      verdict: $("verdict-select").value,
      message: $("verdict-message").value,
    };
    populateVerdictSelect();
    if (!verdictOf($("verdict-select").value).bulk) $("verdict-select").value = "accept";
  } else if (wasBulk && !nowBulk) {
    populateVerdictSelect();
    if (state.bulkSnapshot) {
      $("verdict-select").value = state.bulkSnapshot.verdict;
      $("verdict-message").value = state.bulkSnapshot.message;
    }
    state.bulkSnapshot = null;
  }

  if (checked) {
    state.activeId = id;
    renderDetail();
  }
  renderQueue();
  syncActionBox();
}

function switchTab(tab) {
  state.tab = tab;
  state.activeId = null;
  state.selected.clear();
  state.bulkSnapshot = null;
  document.querySelectorAll(".tab").forEach((t) =>
    t.classList.toggle("active", t.dataset.tab === tab)
  );
  // Auto-select the first undecided item in the new tab.
  if (tab === "matches") {
    const first = sortedMatches().find((m) => !state.finalDecisions[m.id]);
    state.activeId = first ? first.id : null;
    populateVerdictSelect();
  } else {
    const first = EXPANSIONS.find((e) => !state.expansionDecisions[e.id]);
    state.activeId = first ? first.id : null;
  }
  renderQueue();
  renderDetail();
  syncActionBox();
}

function autoAdvanceMatches() {
  const next = sortedMatches().find((m) => !state.finalDecisions[m.id]);
  state.activeId = next ? next.id : null;
  renderQueue();
  renderDetail();
  syncActionBox();
}

/* ---------- Finalizing match decisions ---------- */

function finalizeSingle() {
  const m = MATCHES.find((x) => x.id === state.activeId);
  if (!m) return;
  const verdict = $("verdict-select").value;
  const message = $("verdict-message").value.trim();

  if (verdict === "assignNone" && !message) {
    const el = $("action-error");
    el.textContent = "Assign None requires a reason.";
    el.classList.remove("hidden");
    return;
  }

  const commit = () => {
    const payload = verdict === "reassign"
      ? { table: $("reassign-table").value, column: $("reassign-column").value }
      : null;
    state.lastAction = {
      type: "single", id: m.id,
      previous: state.finalDecisions[m.id] ? { ...state.finalDecisions[m.id] } : null,
    };
    state.finalDecisions[m.id] = { verdict, message, payload };
    $("verdict-message").value = "";
    showToast(`${pairName(m)} finalized — ${verdictOf(verdict).label}`);
    autoAdvanceMatches();
  };

  if (isUnderReviewed(m)) {
    $("warn-modal-text").textContent =
      `${pairName(m)} has only ${voteCount(m)} of ${CONFIG.minReviews} required grader reviews. Finalize it anyway?`;
    $("warn-confirm").onclick = () => {
      $("warn-modal").classList.add("hidden");
      commit();
    };
    $("warn-modal").classList.remove("hidden");
  } else {
    commit();
  }
}

function finalizeBulk() {
  const verdict = $("verdict-select").value;
  const ids = [...state.selected];
  const label = verdictOf(verdict).label.toLowerCase();

  $("bulk-modal-title").textContent = `Confirm bulk ${label}`;
  $("bulk-modal-text").textContent = `You are about to finalize ${ids.length} pairings as “${verdictOf(verdict).label}”:`;
  $("bulk-modal-list").innerHTML = ids
    .map((id) => `<li>${pairName(MATCHES.find((m) => m.id === id))}</li>`)
    .join("");

  const under = ids.filter((id) => isUnderReviewed(MATCHES.find((m) => m.id === id)));
  const warn = $("bulk-modal-warning");
  if (under.length) {
    warn.textContent = `⚠ ${under.length} of these pairings have fewer than ${CONFIG.minReviews} grader reviews.`;
    warn.classList.remove("hidden");
  } else {
    warn.classList.add("hidden");
  }

  const confirmBtn = $("bulk-confirm");
  confirmBtn.className = `btn ${verdict === "reject" ? "danger" : "primary"}`;
  confirmBtn.onclick = () => {
    state.lastAction = {
      type: "bulk",
      entries: ids.map((id) => ({
        id,
        previous: state.finalDecisions[id] ? { ...state.finalDecisions[id] } : null,
      })),
    };
    for (const id of ids) {
      state.finalDecisions[id] = { verdict, message: "", payload: null };
    }
    state.selected.clear();
    populateVerdictSelect();
    if (state.bulkSnapshot) {
      $("verdict-select").value = state.bulkSnapshot.verdict;
      $("verdict-message").value = state.bulkSnapshot.message;
      state.bulkSnapshot = null;
    }
    $("bulk-modal").classList.add("hidden");
    showToast(`${ids.length} pairings finalized — ${verdictOf(verdict).label}`);
    autoAdvanceMatches();
  };

  $("bulk-modal").classList.remove("hidden");
}

/* ---------- Expansion decisions ---------- */

function decideExpansion(decision) {
  const e = EXPANSIONS.find((x) => x.id === state.activeId);
  if (!e) return;
  const message = $("expansion-message").value.trim();

  // Approving one request approves every duplicate of the same expansion.
  // The selected request is always included, even if it already has a
  // decision, so decisions can be revised until they are locked.
  const group = decision === "approved"
    ? EXPANSIONS.filter((x) => x.signature === e.signature && (x.id === e.id || !state.expansionDecisions[x.id]))
    : [e];

  state.lastAction = {
    type: "expansion",
    entries: group.map((x) => ({
      id: x.id,
      previous: state.expansionDecisions[x.id] ? { ...state.expansionDecisions[x.id] } : null,
    })),
  };
  for (const x of group) {
    state.expansionDecisions[x.id] = { decision, message };
  }
  $("expansion-message").value = "";

  const dupText = group.length > 1 ? ` (+${group.length - 1} duplicate request${group.length > 2 ? "s" : ""})` : "";
  showToast(`${e.table} ${decision}${dupText}`);

  const next = EXPANSIONS.find((x) => !state.expansionDecisions[x.id]);
  state.activeId = next ? next.id : e.id;
  renderQueue();
  renderDetail();
  syncActionBox();
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
    if (a.previous) state.finalDecisions[a.id] = a.previous;
    else delete state.finalDecisions[a.id];
    state.activeId = a.id;
  } else if (a.type === "bulk") {
    for (const en of a.entries) {
      if (en.previous) state.finalDecisions[en.id] = en.previous;
      else delete state.finalDecisions[en.id];
    }
  } else if (a.type === "expansion") {
    for (const en of a.entries) {
      if (en.previous) state.expansionDecisions[en.id] = en.previous;
      else delete state.expansionDecisions[en.id];
    }
    state.activeId = a.entries[0].id;
  }
  state.lastAction = null;
  $("undo-toast").classList.add("hidden");
  renderQueue();
  renderDetail();
  syncActionBox();
}

/* ---------- Lock decisions ---------- */

function lockDecisions() {
  state.locked = true;
  state.selected.clear();
  state.bulkSnapshot = null;
  state.lastAction = null;               // a locked decision can't be undone
  $("undo-toast").classList.add("hidden");
  $("lock-modal").classList.add("hidden");
  const btn = $("lock-decisions-btn");
  btn.textContent = "🔒 Decisions Locked";
  btn.disabled = true;
  populateVerdictSelect();               // restore full options if bulk was active
  renderQueue();
  renderDetail();
  syncActionBox();
}

/* ---------- Manage graders ---------- */

function renderGradersModal() {
  const list = $("grader-list");
  list.innerHTML = GRADERS.map((g) => {
    const initials = g.name.split(" ").map((w) => w[0]).join("").slice(0, 2);
    return `
      <li>
        <span class="grader-avatar">${initials}</span>
        <span class="grader-name">
          <span class="nm">${g.name}</span><br>
          <span class="em">${g.email} · ${g.reviewed}/${g.total} reviewed</span>
        </span>
        <button class="remove-grader-btn" data-id="${g.id}" title="Remove grader">−</button>
      </li>`;
  }).join("");

  list.querySelectorAll(".remove-grader-btn").forEach((btn) =>
    btn.addEventListener("click", () => confirmRemoveGrader(btn.dataset.id))
  );

  const atCap = GRADERS.length >= CONFIG.maxGraders;
  $("add-grader-btn").disabled = atCap;
  $("new-grader-email").disabled = atCap;
  $("grader-cap-note").textContent = atCap
    ? `Grader cap reached (${CONFIG.maxGraders}). Remove a grader to add another.`
    : `${GRADERS.length}/${CONFIG.maxGraders} graders assigned. Assignments carry over each week.`;

  const warn = $("graders-warning");
  if (GRADERS.length < CONFIG.minGraders) {
    warn.textContent = `⚠ Fewer than ${CONFIG.minGraders} graders — new pairings will be flagged as under-reviewed.`;
    warn.classList.remove("hidden");
  } else {
    warn.classList.add("hidden");
  }
}

function confirmRemoveGrader(id) {
  const g = GRADERS.find((x) => x.id === id);
  $("remove-grader-text").textContent =
    `${g.name} will lose dashboard access. Their submitted verdicts stay visible and counted; their ungraded pairings simply won't be graded by them.`;
  $("remove-grader-confirm").onclick = () => {
    REMOVED_GRADERS.push(g);
    GRADERS = GRADERS.filter((x) => x.id !== id);
    $("remove-grader-modal").classList.add("hidden");
    renderGradersModal();
    renderGraderProgress();
    renderQueue();   // vote counts / under-review flags can change
    renderDetail();
    syncActionBox();
  };
  $("remove-grader-modal").classList.remove("hidden");
}

function addGrader() {
  const input = $("new-grader-email");
  const email = input.value.trim();
  if (!email || !email.includes("@") || GRADERS.length >= CONFIG.maxGraders) return;
  const name = email.split("@")[0].replace(/[._]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
  GRADERS.push({
    id: `g${Date.now()}`,
    name, email,
    reviewed: 0,
    total: MATCHES.length + EXPANSIONS.length,
  });
  input.value = "";
  renderGradersModal();
  renderGraderProgress();
}

/* ---------- Wiring ---------- */

function init() {
  populateVerdictSelect();
  populateReassignTables();
  renderGraderProgress();

  document.querySelectorAll(".tab").forEach((t) =>
    t.addEventListener("click", () => switchTab(t.dataset.tab))
  );

  $("verdict-select").addEventListener("change", syncActionBox);
  $("reassign-table").addEventListener("change", () =>
    populateReassignColumns($("reassign-table").value)
  );

  $("submit-btn").addEventListener("click", () =>
    isBulk() ? finalizeBulk() : finalizeSingle()
  );

  $("approve-expansion-btn").addEventListener("click", () => decideExpansion("approved"));
  $("reject-expansion-btn").addEventListener("click", () => decideExpansion("rejected"));

  $("bulk-cancel").addEventListener("click", () => $("bulk-modal").classList.add("hidden"));
  $("warn-cancel").addEventListener("click", () => $("warn-modal").classList.add("hidden"));

  $("lock-decisions-btn").addEventListener("click", () => {
    if (!state.locked) $("lock-modal").classList.remove("hidden");
  });
  $("lock-cancel").addEventListener("click", () => $("lock-modal").classList.add("hidden"));
  $("lock-confirm").addEventListener("click", lockDecisions);

  $("toast-undo-btn").addEventListener("click", undoLast);

  $("manage-graders-btn").addEventListener("click", () => {
    renderGradersModal();
    $("graders-modal").classList.remove("hidden");
  });
  $("graders-close").addEventListener("click", () => $("graders-modal").classList.add("hidden"));
  $("add-grader-btn").addEventListener("click", addGrader);
  $("new-grader-email").addEventListener("keydown", (e) => {
    if (e.key === "Enter") addGrader();
  });
  $("remove-grader-cancel").addEventListener("click", () =>
    $("remove-grader-modal").classList.add("hidden")
  );

  // Open on the match-decisions tab with the top item selected.
  state.activeId = sortedMatches()[0].id;
  renderQueue();
  renderDetail();
  syncActionBox();
}

init();

/* ---------- Grader availability + Meet (When2Meet-style) ----------
 * Free/busy overlays across ALL active graders. A slot is green only when
 * every grader who submitted a schedule is free then. SCHEDULE config drives
 * the grid shape so changing the work window is a data change.
 */

const SCHEDULE = {
  days: ["Mon", "Tue", "Wed", "Thu", "Fri"],
  startHour: 9,     // grid begins 9:00 AM
  slotsPerDay: 16,  // half-hour boxes through 5:00 PM
};

const slotKey = (d, s) => `${d}-${s}`;

function slotLabel(s) {
  if (s % 2) return ""; // label hours only
  const h = SCHEDULE.startHour + s / 2;
  const h12 = ((h + 11) % 12) + 1;
  return `${h12}:00 ${h < 12 ? "AM" : "PM"}`;
}

// Expand [day, fromSlot, toSlot] ranges into a Set of "day-slot" keys.
function freeSet(ranges) {
  const set = new Set();
  for (const [d, from, to] of ranges) {
    for (let s = from; s <= to; s++) set.add(slotKey(d, s));
  }
  return set;
}

// Mock schedules submitted by the graders this week (slot 0 = 9:00 AM).
// Graders added later have no entry and are excluded (with a note) until
// they submit.
const GRADER_SCHEDULES = {
  g1: freeSet([[0, 0, 7], [1, 0, 7], [2, 0, 7], [3, 0, 7], [3, 10, 13], [4, 0, 7]]),
  g2: freeSet([[0, 2, 9], [1, 2, 7], [2, 4, 9], [3, 10, 15], [4, 0, 5]]),
  g3: freeSet([[0, 4, 7], [1, 2, 11], [2, 0, 3], [3, 8, 15], [4, 2, 9]]),
  g4: freeSet([[0, 4, 11], [1, 3, 8], [2, 2, 6], [3, 9, 14], [4, 4, 9]]),
};

function buildAvailabilityGrid(container, isFree) {
  container.innerHTML = "";

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
      if (isFree(d, s)) cell.classList.add("free");
      container.appendChild(cell);
    }
  }
}

function openMeetModal(m) {
  const withSched = GRADERS.filter((g) => GRADER_SCHEDULES[g.id]);
  const missing = GRADERS.filter((g) => !GRADER_SCHEDULES[g.id]);

  $("meet-modal-title").textContent = `Meet about ${pairName(m)}`;
  $("meet-modal-sub").textContent = withSched.length
    ? `Green = every grader is free (${withSched.map((g) => g.name.split(" ")[0]).join(", ")}). Mon–Fri, 9:00 AM–5:00 PM, half-hour blocks.`
    : "No grader schedules have been submitted this week.";

  // A slot is green only if ALL graders with schedules are free then.
  buildAvailabilityGrid($("meet-grid"), (d, s) =>
    withSched.length > 0 &&
    withSched.every((g) => GRADER_SCHEDULES[g.id].has(slotKey(d, s)))
  );

  const warn = $("meet-missing");
  if (missing.length) {
    warn.textContent = `⚠ No schedule submitted yet (not included in overlay): ${missing.map((g) => g.name).join(", ")}`;
    warn.classList.remove("hidden");
  } else {
    warn.classList.add("hidden");
  }

  $("meet-modal").classList.remove("hidden");
}

$("meet-close").addEventListener("click", () => $("meet-modal").classList.add("hidden"));
