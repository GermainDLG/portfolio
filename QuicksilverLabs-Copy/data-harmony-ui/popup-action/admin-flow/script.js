/* ===== Concordia — Admin flow (Popup Action) =====
 * Based on table-vs-column, plus:
 *  - The bottom-left finalize controls are gone for match decisions. Each
 *    pairing carries a Continue button (suggested row in Column view;
 *    selected novel row in Table view) that opens the finalize popup:
 *    decision dropdown on top, view-aware reassign picker, always-"Submit".
 *    The Schema Expansions tab keeps its Approve/Reject controls.
 *  - Reassign is click-a-column within the suggested table (spec: a pairing
 *    never moves to a different canonical table); the matcher's two runner-up
 *    candidates are chipped "Suggested Match".
 *  - Enter opens the popup for the selected pairing and submits it; the
 *    under-review warning shows inside the popup, and the warn modal still
 *    guards finalizing under-reviewed pairings.
 *  - The 📅 Meet button now also renders below the table-view diagrams.
 */

/* ---------- Demo store (shared with grader via localStorage) ---------- */

const STORE_KEY = "dh-popup-action-demo-v1";

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
  finalVerdicts: [
    { key: "accept",     label: "Accept",      bulk: true  },
    { key: "reject",     label: "Reject",      bulk: true  },
    { key: "reassign",   label: "Reassign",    bulk: false },
    { key: "assignNone", label: "Assign None", bulk: false },
  ],
  maxGraders: 5,
  minGraders: 3,
  minReviews: 3,
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

/* ---------- Graders ----------
 * Four mock graders plus "You" — the live grader from the grader page.
 * Your reviewed count, votes, expansion requests, and schedule all come from
 * the shared demo store. */

const REMOVED_GRADERS = [];

let GRADERS = [
  { id: "g1",  name: "Priya Raman",  email: "priya@quicksilverlabs.ai",  reviewed: 12, total: 12 },
  { id: "g2",  name: "Marcus Webb",  email: "marcus@quicksilverlabs.ai", reviewed: 11, total: 12 },
  { id: "g3",  name: "Sofía Duarte", email: "sofia@quicksilverlabs.ai",  reviewed: 12, total: 12 },
  { id: "g4",  name: "Tom Askew",    email: "tom@quicksilverlabs.ai",    reviewed: 11, total: 12 },
  { id: "you", name: "You",          email: "davis@quicksilverlabs.ai",  reviewed: 0,  total: 12 },
];

/* ---------- Match decisions: the same 12 pairings the graders see ----------
 * votes: graderId -> { verdict, reason, payload? }. "you" votes are injected
 * live from the demo store. p8 has two mock votes, so it stays under-reviewed
 * until You weigh in. alternates: the matcher's two runner-up candidates,
 * always columns of the suggested table (reassigns never change tables). */

const MATCHES = [
  { id: "p1",  novel: { table: "PATIENTS", column: "SUBJECT_ID", type: "INTEGER", desc: "Unique identifier for an individual patient." },
    suggested: { table: "PERSON", column: "person_id", type: "bigint" },
    alternates: ["person_source_value", "year_of_birth"],
    confidence: "high",
    votes: {
      g1: { verdict: "accept", reason: "SUBJECT_ID is the MIMIC patient key; person_id is its OMOP equivalent." },
      g2: { verdict: "accept", reason: "Direct identity mapping — INTEGER→bigint widens safely." },
      g3: { verdict: "accept", reason: "Clear match." },
      g4: { verdict: "accept", reason: "Agree with the matcher." },
    } },
  { id: "p2",  novel: { table: "ADMISSIONS", column: "HADM_ID", type: "INTEGER", desc: "Unique id for a single hospital admission (1000000–1999999)." },
    suggested: { table: "VISIT_OCCURRENCE", column: "visit_occurrence_id", type: "bigint" },
    alternates: ["visit_source_value", "preceding_visit_occurrence_id"],
    confidence: "high",
    votes: {
      g1: { verdict: "accept", reason: "Admission id is the visit key." },
      g2: { verdict: "accept", reason: "Straightforward." },
      g3: { verdict: "accept", reason: "Match." },
      g4: { verdict: "accept", reason: "Match." },
    } },
  { id: "p3",  novel: { table: "ADMISSIONS", column: "ADMITTIME", type: "TIMESTAMP", desc: "Date and time the patient was admitted to the hospital." },
    suggested: { table: "VISIT_OCCURRENCE", column: "visit_start_datetime", type: "datetime" },
    alternates: ["visit_start_date", "visit_end_datetime"],
    confidence: "high",
    votes: {
      g1: { verdict: "accept", reason: "Admission time is the visit start for inpatient encounters." },
      g2: { verdict: "accept", reason: "Straightforward." },
      g3: { verdict: "accept", reason: "TIMESTAMP→datetime is fine." },
      g4: { verdict: "accept", reason: "Match." },
    } },
  { id: "p4",  novel: { table: "ADMISSIONS", column: "DISCHTIME", type: "TIMESTAMP", desc: "Date and time the patient was discharged from the hospital." },
    suggested: { table: "VISIT_OCCURRENCE", column: "visit_end_datetime", type: "datetime" },
    alternates: ["visit_end_date", "visit_start_datetime"],
    confidence: "high",
    votes: {
      g1: { verdict: "accept", reason: "Discharge time is the visit end." },
      g2: { verdict: "accept", reason: "Mirror of ADMITTIME." },
      g3: { verdict: "accept", reason: "Match." },
      g4: { verdict: "accept", reason: "Match." },
    } },
  { id: "p5",  novel: { table: "PATIENTS", column: "GENDER", type: "STRING", desc: "Genotypical sex of the patient.", },
    suggested: { table: "PERSON", column: "gender_source_value", type: "varchar(50)" },
    alternates: ["gender_concept_id", "ethnicity_source_value"],
    confidence: "high",
    votes: {
      g1: { verdict: "accept", reason: "Verbatim M/F belongs in the source-value column." },
      g2: { verdict: "accept", reason: "Source value is right; concept id is derived in ETL." },
      g3: { verdict: "accept", reason: "Match." },
      g4: { verdict: "reassign", reason: "Concept id is the analysis field — map M/F to standard concepts and store there.",
            payload: { table: "PERSON", column: "gender_concept_id" } },
    } },
  { id: "p6",  novel: { table: "PATIENTS", column: "DOB", type: "TIMESTAMP", desc: "Date of birth of the patient." },
    suggested: { table: "PERSON", column: "birth_datetime", type: "datetime" },
    alternates: ["year_of_birth", "month_of_birth"],
    confidence: "med",
    votes: {
      g1: { verdict: "accept", reason: "Full birth timestamp fits birth_datetime." },
      g2: { verdict: "accept", reason: "Match; year/month/day derive from it." },
      g3: { verdict: "accept", reason: "Match." },
      g4: { verdict: "accept", reason: "Match." },
    } },
  { id: "p7",  novel: { table: "ADMISSIONS", column: "ADMISSION_TYPE", type: "STRING", desc: "Type of admission (EMERGENCY, ELECTIVE, URGENT, NEWBORN)." },
    suggested: { table: "VISIT_OCCURRENCE", column: "visit_type_concept_id", type: "integer" },
    alternates: ["visit_source_value", "visit_concept_id"],
    confidence: "med",
    votes: {
      g1: { verdict: "accept", reason: "EMERGENCY/ELECTIVE/URGENT map cleanly through the Visit Type vocabulary." },
      g2: { verdict: "reject", reason: "Raw strings aren't concept ids — needs vocabulary mapping first; the verbatim value belongs in visit_source_value." },
      g3: { verdict: "accept", reason: "Accept with concept mapping in the ETL." },
      g4: { verdict: "reject", reason: "STRING→integer concept id is not a direct column match." },
    } },
  { id: "p8",  novel: { table: "ICUSTAYS", column: "INTIME", type: "TIMESTAMP", desc: "Date and time the patient was transferred into the ICU." },
    suggested: { table: "VISIT_DETAIL", column: "visit_detail_start_datetime", type: "datetime" },
    alternates: ["visit_detail_start_date", "visit_detail_end_datetime"],
    confidence: "med",
    votes: {
      g1: { verdict: "accept", reason: "ICU transfer-in is the start of the visit-detail episode." },
      g3: { verdict: "accept", reason: "Match." },
    } },
  { id: "p9",  novel: { table: "LABEVENTS", column: "VALUENUM", type: "DOUBLE", desc: "Lab value in numeric form." },
    suggested: { table: "MEASUREMENT", column: "value_as_number", type: "float" },
    alternates: ["value_source_value", "value_as_concept_id"],
    confidence: "med",
    votes: {
      g1: { verdict: "accept", reason: "Numeric lab result maps to value_as_number." },
      g2: { verdict: "accept", reason: "Match." },
      g3: { verdict: "accept", reason: "Match." },
      g4: { verdict: "accept", reason: "Match." },
    } },
  { id: "p10", novel: { table: "PRESCRIPTIONS", column: "DRUG", type: "STRING", desc: "Name of the drug prescribed." },
    suggested: { table: "DRUG_EXPOSURE", column: "drug_source_value", type: "varchar(50)" },
    alternates: ["drug_concept_id", "dose_unit_source_value"],
    confidence: "low",
    votes: {
      g1: { verdict: "accept", reason: "Verbatim drug name is exactly what drug_source_value holds." },
      g2: { verdict: "accept", reason: "Concept id derives from it downstream." },
      g3: { verdict: "accept", reason: "Match." },
      g4: { verdict: "reject", reason: "Names should be mapped to drug_concept_id; keeping only the raw string loses standardization." },
    } },
  { id: "p11", novel: { table: "ADMISSIONS", column: "MARITAL_STATUS", type: "STRING", desc: "Patient demographic — marital status." },
    suggested: { table: "PERSON", column: "ethnicity_concept_id", type: "integer" },
    alternates: ["ethnicity_source_value", "race_concept_id"],
    confidence: "low",
    votes: {
      g1: { verdict: "reject", reason: "Marital status is not ethnicity — bad suggestion." },
      g2: { verdict: "expand", reason: "OMOP PERSON has no marital-status field; keep the raw value as a new source column.",
            payload: { kind: "column", table: "PERSON", columns: [{ name: "marital_status_source_value", type: "text" }] } },
      g3: { verdict: "expand", reason: "Same — PERSON needs a marital_status_source_value column.",
            payload: { kind: "column", table: "PERSON", columns: [{ name: "marital_status_source_value", type: "text" }] } },
      g4: { verdict: "reject", reason: "Not a match." },
    } },
  { id: "p12", novel: { table: "ADMISSIONS", column: "INSURANCE", type: "STRING", desc: "Patient demographic — insurance/payer." },
    suggested: { table: "VISIT_OCCURRENCE", column: "visit_source_value", type: "varchar(50)" },
    alternates: ["admitted_from_source_value", "visit_concept_id"],
    confidence: "low",
    votes: {
      g1: { verdict: "assignNone", reason: "Insurance is payer data — it needs the payer-plan-period linkage, not a visit column; nothing in VISIT_OCCURRENCE fits." },
      g2: { verdict: "assignNone", reason: "Agree — payer information doesn't belong on the visit record; no direct home in VISIT_OCCURRENCE." },
      g3: { verdict: "assignNone", reason: "Insurance needs the whole payer-plan-period linkage, not a single column; no direct home." },
      g4: { verdict: "reject", reason: "visit_source_value is for visit kind, not payer." },
    } },
];

/* ---------- Schema expansion requests ----------
 * Mock requests from the graders, plus live requests generated from "You"
 * expand verdicts on the grader page. signature identifies duplicates. */

const BASE_EXPANSIONS = [
  { id: "e1", requestedBy: "g2", pairing: "ADMISSIONS.MARITAL_STATUS",
    kind: "column", table: "PERSON",
    columns: [{ name: "marital_status_source_value", type: "text" }],
    reason: "OMOP PERSON has no marital-status field; keep the raw MIMIC value as a source column.",
    signature: "column:PERSON:marital_status_source_value" },
  { id: "e2", requestedBy: "g3", pairing: "ADMISSIONS.MARITAL_STATUS",
    kind: "column", table: "PERSON",
    columns: [{ name: "marital_status_source_value", type: "text" }],
    reason: "Same — PERSON needs a marital_status_source_value column.",
    signature: "column:PERSON:marital_status_source_value" },
  { id: "e3", requestedBy: "g4", pairing: "ADMISSIONS.EDREGTIME",
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

let EXPANSIONS = [];

const expansionSignature = (payload) =>
  payload.kind === "table"
    ? `table:${payload.table}`
    : `column:${payload.table}:${payload.columns.map((c) => c.name).join(",")}`;

/* Rebuild EXPANSIONS = mocks + live "You" expand verdicts. Idempotent. */
function rebuildExpansions() {
  const s = loadStore();
  const yours = Object.entries(s.graderVerdicts || {})
    .filter(([, v]) => v.verdict === "expand")
    .map(([pid, v]) => {
      const m = MATCHES.find((x) => x.id === pid);
      return {
        id: `you-${pid}`,
        requestedBy: "you",
        pairing: m ? pairName(m) : pid,
        kind: v.payload.kind,
        table: v.payload.table,
        columns: v.payload.columns,
        reason: v.message || "(no reason given)",
        signature: expansionSignature(v.payload),
      };
    });
  EXPANSIONS = [...BASE_EXPANSIONS, ...yours];
}

/* Inject/refresh "You" votes from the grader page. Idempotent. */
function injectYouVotes() {
  const s = loadStore();
  const verdicts = s.graderVerdicts || {};
  for (const m of MATCHES) {
    delete m.votes.you;
    const v = verdicts[m.id];
    if (v) {
      m.votes.you = { verdict: v.verdict, reason: v.message || "(no message)", payload: v.payload || undefined };
    }
  }
  const you = GRADERS.find((g) => g.id === "you");
  if (you) you.reviewed = Object.keys(verdicts).length;
}

/* ---------- State ---------- */

const initialStore = loadStore();

const state = {
  tab: "matches",
  finalDecisions: initialStore.finalDecisions || {},
  expansionDecisions: initialStore.expansionDecisions || {},
  drafts: {},               // matchId -> popup form state
  activeId: null,
  selected: new Set(),
  lastAction: null,
  locked: !!initialStore.locked,
  view: "column",           // "column" | "table"  (matches tab only)
  side: "input",            // table view: "input" | "canonical"
  activeNovelTable: null,
  activeCanonTable: null,
};

/* Finalize popup state. chosenColumn is the reassign pick (within the
 * suggested table). */
const modal = {
  open: false,
  mode: "single",  // "single" | "bulk"
  id: null,
  ids: [],
  chosenColumn: null,
};

const persistDecisions = () =>
  saveStore({ finalDecisions: state.finalDecisions, expansionDecisions: state.expansionDecisions, locked: state.locked });

/* ---------- Helpers ---------- */

const $ = (id) => document.getElementById(id);

const confidenceOf = (m) => CONFIG.confidenceLevels.find((c) => c.key === m.confidence);

const verdictOf = (key) => CONFIG.finalVerdicts.find((v) => v.key === key);

const pairName = (m) => `${m.novel.table}.${m.novel.column}`;

const findGrader = (id) =>
  GRADERS.find((g) => g.id === id) || REMOVED_GRADERS.find((g) => g.id === id);

const sortedMatches = () =>
  [...MATCHES].sort((a, b) => confidenceOf(b).rank - confidenceOf(a).rank);

const isBulk = () => state.tab === "matches" && state.view === "column" && state.selected.size >= 2;

const voteCount = (m) => Object.keys(m.votes).length;

const isUnderReviewed = (m) => voteCount(m) < CONFIG.minReviews;

/* A decision can be revised until Lock Decisions makes it permanent. */
const canDecide = (id) => !(state.locked && state.finalDecisions[id]);

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

/* Where does a pairing currently point? Final decision wins; otherwise the
 * upstream suggestion. Used by the read-only table-view diagrams. */
function currentTarget(m) {
  const d = state.finalDecisions[m.id];
  if (!d) return { kind: "map", status: "pending", table: m.suggested.table, column: m.suggested.column };
  switch (d.verdict) {
    case "accept":
      return { kind: "map", status: "accept", table: m.suggested.table, column: m.suggested.column };
    case "reassign":
      return { kind: "map", status: "reassign", table: d.payload.table, column: d.payload.column };
    case "assignNone":
      return { kind: "none", status: "none" };
    case "reject":
      return { kind: "reject", status: "reject" };
    default:
      return { kind: "map", status: "pending", table: m.suggested.table, column: m.suggested.column };
  }
}

const pairingsOfNovelTable = (t) => MATCHES.filter((m) => m.novel.table === t);

/* Average confidence rank of a table's pairings — the table lists sort by
 * it so "easier", generally more confident tables float to the top. */
const avgConfidence = (pairings) =>
  pairings.reduce((sum, m) => sum + confidenceOf(m).rank, 0) / pairings.length;

const novelTables = () =>
  [...new Set(MATCHES.map((m) => m.novel.table))]
    .sort((a, b) => avgConfidence(pairingsOfNovelTable(b)) - avgConfidence(pairingsOfNovelTable(a)));

function targetedCanonTables() {
  const tables = [];
  for (const m of MATCHES) {
    const t = currentTarget(m);
    if (t.kind === "map" && !tables.includes(t.table)) tables.push(t.table);
  }
  return tables.sort((a, b) => avgConfidence(pairingsTargeting(b)) - avgConfidence(pairingsTargeting(a)));
}

const pairingsTargeting = (table) =>
  MATCHES.filter((m) => {
    const t = currentTarget(m);
    return t.kind === "map" && t.table === table;
  });

/* ---------- Queue rendering ---------- */

function renderQueue() {
  const list = $("queue-list");
  list.innerHTML = "";

  if (state.tab === "expansions") {
    for (const e of EXPANSIONS) list.appendChild(expansionRow(e));
  } else if (state.view === "column") {
    for (const m of sortedMatches()) list.appendChild(matchRow(m));
  } else if (state.side === "input") {
    for (const t of novelTables()) {
      list.appendChild(tableRow(t, `${pairingsOfNovelTable(t).length} columns`, state.activeNovelTable, "novel"));
    }
  } else {
    for (const t of targetedCanonTables()) {
      const n = pairingsTargeting(t).length;
      list.appendChild(tableRow(t, `${n} pairing${n === 1 ? "" : "s"}`, state.activeCanonTable, "canon"));
    }
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
  check.disabled = state.locked && !!decision;
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
  if (state.tab === "expansions") {
    if (!state.activeId) {
      panel.innerHTML = `<div class="empty-detail">Select an expansion request from the queue.</div>`;
      return;
    }
    renderExpansionDetail(panel);
    return;
  }
  if (state.view === "table") {
    renderDiagram(panel);
    return;
  }
  if (!state.activeId) {
    panel.innerHTML = `<div class="empty-detail">Select an item from the queue to review it.</div>`;
    return;
  }
  renderMatchDetail(panel);
}

/* Vote cards for a pairing — used by the column-view detail panel and below
 * the table-view diagram. */
function voteCardsHtml(m) {
  const voterIds = [...new Set([...GRADERS.map((g) => g.id), ...Object.keys(m.votes)])];
  return voterIds.map((gid) => {
    const g = findGrader(gid) || { name: "Removed grader", id: gid };
    const removed = !GRADERS.some((x) => x.id === gid);
    const v = m.votes[gid];
    if (!v) return removed ? "" : `<div class="missing-vote">⚠ ${g.name} ${gid === "you" ? "have" : "has"} not reviewed this pairing yet.</div>`;
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
  // evidence before the graders' arguments.
  const voteCards = voteCardsHtml(m);

  const tableDef = CANONICAL_TABLES[m.suggested.table];
  const colRows = tableDef.columns.map((c) => {
    const isSuggested = c.name === m.suggested.column;
    const continueBtn = isSuggested && canDecide(m.id)
      ? ` <button type="button" class="continue-btn" id="continue-btn">Continue</button>`
      : "";
    return `
      <tr class="canon-row ${isSuggested ? "suggested-row" : ""}">
        <td class="canon-name">${c.name}${isSuggested ? ' <span class="suggest-chip">★ suggested</span>' : ""}${continueBtn}</td>
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
      <div class="alt-hint">The suggested match is highlighted. Continue (or Enter) opens the finalize popup.</div>
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

  const btn = panel.querySelector("#continue-btn");
  if (btn) btn.addEventListener("click", () => openActionModal(m.id));
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

/* ---------- Table-view diagrams (read-only; final decision else suggestion) ---------- */

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

  // The selected pairing's grader verdicts render below the map so the admin
  // can weigh grader input (and book a Meet) without leaving Table view.
  const m = MATCHES.find((x) => x.id === state.activeId);
  if (m && panel.querySelector("#diagram")) {
    panel.insertAdjacentHTML("beforeend", `
      <div class="section diagram-reasoning">
        <h2>Grader verdicts &amp; reasoning — <span class="mono">${pairName(m)}</span></h2>
        ${voteCardsHtml(m)}
        <button class="meet-btn" id="meet-btn" title="Overlay all graders' availability to find a meeting time">📅 Meet</button>
      </div>`);
    $("meet-btn").addEventListener("click", () => openMeetModal(m));
  }
}

function confBadge(m) {
  const conf = confidenceOf(m);
  return `<span class="conf-badge ${conf.cssClass}">${conf.label}</span>`;
}

function rowContinueBtn(m) {
  return m.id === state.activeId && canDecide(m.id)
    ? `<button type="button" class="continue-btn row-continue" data-continue="${m.id}">Continue</button>`
    : "";
}

function renderInputDiagram(panel) {
  const table = state.activeNovelTable;
  const pairings = table ? pairingsOfNovelTable(table) : [];
  if (!table || !pairings.length) {
    panel.innerHTML = `<div class="empty-detail">Select a novel table from the list.</div>`;
    return;
  }

  const anchorRows = pairings.map((m) => {
    const t = currentTarget(m);
    const chip = STATUS_CHIPS[t.kind] || "";
    const tally = `<span class="row-tally">${tallyHtml(m)}</span>`;
    return `
      <div class="mini-row" data-src="${m.id}">
        <div class="mini-row-main">
          <span class="mini-col-name">${m.novel.column}</span>
          <span class="mini-col-type">${m.novel.type}</span>
          ${confBadge(m)} ${chip} ${tally} ${rowContinueBtn(m)}
        </div>
        <div class="mini-col-desc">${m.novel.desc}</div>
      </div>`;
  }).join("");

  const groups = new Map();
  const links = [];

  for (const m of pairings) {
    const t = currentTarget(m);
    if (t.kind !== "map") continue;
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
    links.push({ srcId: m.id, targetKey: ck, status: t.status });
  }

  paintDiagram(panel, {
    heading: `Alignment map — novel table <span class="mono">${table}</span>`,
    anchorTitle: table,
    anchorTag: "novel",
    anchorSide: "left", // novel is input: always on the left
    anchorRows, groups, links,
  });
}

function renderCanonicalDiagram(panel) {
  const table = state.activeCanonTable;
  const pairings = table ? pairingsTargeting(table) : [];
  if (!table || !pairings.length) {
    panel.innerHTML = `<div class="empty-detail">Select a canonical table from the list.</div>`;
    return;
  }

  const anchorCols = new Map();
  const links = [];
  const groups = new Map();

  for (const m of pairings) {
    const t = currentTarget(m);
    const ck = `anchor.${t.column}`;
    if (!anchorCols.has(ck)) {
      const def = (CANONICAL_TABLES[table]?.columns || []).find((c) => c.name === t.column);
      anchorCols.set(ck, `
        <div class="mini-row target" data-target="${ck}">
          <div class="mini-row-main">
            <span class="mini-col-name">${t.column}</span>
            <span class="mini-col-type">${def ? def.type : ""}</span>
          </div>
        </div>`);
    }

    const gk = `novel:${m.novel.table}`;
    if (!groups.has(gk)) groups.set(gk, { title: m.novel.table, tag: "novel", cls: "", rows: new Map() });
    const rk = `${gk}.${m.novel.column}`;
    groups.get(gk).rows.set(rk, `
      <div class="mini-row" data-src="${m.id}">
        <div class="mini-row-main">
          <span class="mini-col-name">${m.novel.column}</span>
          <span class="mini-col-type">${m.novel.type}</span>
          ${confBadge(m)} ${rowContinueBtn(m)}
        </div>
        <div class="mini-col-desc">${m.novel.desc}</div>
      </div>`);
    links.push({ srcId: m.id, targetKey: ck, status: t.status });
  }

  paintDiagram(panel, {
    heading: `Alignment map — canonical table <span class="mono">${table}</span>`,
    anchorTitle: table,
    anchorTag: "canonical",
    anchorSide: "right", // canonical is output: always on the right
    anchorRows: [...anchorCols.values()].join(""),
    groups, links,
  });
}

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
    <div class="diagram-hint">Lines show final decisions where made, otherwise the upstream suggestion. Click any row to select its pairing, then Continue (or Enter) opens the finalize popup; its grader verdicts appear below the map.</div>
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

/* Clicking either side of a pairing selects it; the selected pairing is
 * highlighted on both sides and its novel row grows the Continue button. */
function wireDiagramSelection(links) {
  const diagram = $("diagram");
  if (!diagram) return;

  // A shared target row (two novel columns → one canonical column) selects
  // the first pairing that links to it.
  const targetPid = new Map();
  for (const l of links) if (!targetPid.has(l.targetKey)) targetPid.set(l.targetKey, l.srcId);

  diagram.querySelectorAll("[data-src]").forEach((row) =>
    row.addEventListener("click", () => selectItem(row.dataset.src))
  );
  diagram.querySelectorAll("[data-target]").forEach((row) => {
    const pid = targetPid.get(row.dataset.target);
    if (pid) row.addEventListener("click", () => selectItem(pid));
  });

  diagram.querySelectorAll("[data-continue]").forEach((btn) =>
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      openActionModal(btn.dataset.continue);
    })
  );

  const activeSrc = diagram.querySelector(`[data-src="${state.activeId}"]`);
  if (activeSrc) activeSrc.classList.add("selected");
  for (const l of links) {
    if (l.srcId !== state.activeId) continue;
    const t = diagram.querySelector(`[data-target="${CSS.escape(l.targetKey)}"]`);
    if (t) t.classList.add("selected");
  }
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
  if (state.tab === "matches" && state.view === "table") renderDetail();
  if (modal.open && modal.mode === "single" && $("verdict-select").value === "reassign" && state.view === "table") {
    const m = MATCHES.find((x) => x.id === modal.id);
    if (m) drawModalLine(m);
  }
});

/* ---------- View toggles ---------- */

function setView(view) {
  if (state.view === view) return;
  state.view = view;

  // Bulk selection is a column-view concept; leaving column view exits bulk.
  if (view === "table" && state.selected.size) state.selected.clear();

  const active = MATCHES.find((m) => m.id === state.activeId);
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
  syncActiveToTable();
  document.querySelectorAll("#side-toggle button").forEach((b) =>
    b.classList.toggle("active", b.dataset.side === side)
  );
  renderQueue();
  renderDetail();
}

function selectTable(name) {
  if (state.side === "input") state.activeNovelTable = name;
  else state.activeCanonTable = name;
  syncActiveToTable();
  renderQueue();
  renderDetail();
}

/* Keep the popup target inside the visible diagram: switching tables (or
 * sides) auto-selects the displayed table's top row, so Enter/Continue never
 * act on a pairing from the previous table. */
function syncActiveToTable() {
  const pairings = state.side === "input"
    ? pairingsOfNovelTable(state.activeNovelTable)
    : pairingsTargeting(state.activeCanonTable);
  if (!pairings.some((m) => m.id === state.activeId)) {
    state.activeId = pairings[0] ? pairings[0].id : null;
  }
}

/* ---------- Action box: bulk bar (matches) + expansion controls ---------- */

function syncActionBox() {
  const onMatches = state.tab === "matches";
  const bulk = isBulk();

  // On the matches tab the box only exists for bulk mode; single decisions
  // happen in the popup.
  $("action-box").classList.toggle("hidden", onMatches && !bulk);
  $("match-controls").classList.toggle("hidden", !onMatches);
  $("expansion-controls").classList.toggle("hidden", onMatches);

  if (onMatches) {
    if (bulk) {
      $("bulk-count").textContent = state.selected.size;
      $("bulk-continue-btn").textContent = `Continue with ${state.selected.size} pairings`;
    }
  } else {
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
  if (checked) state.selected.add(id);
  else state.selected.delete(id);

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
  document.querySelectorAll(".tab").forEach((t) =>
    t.classList.toggle("active", t.dataset.tab === tab)
  );
  if (tab === "matches") {
    const first = sortedMatches().find((m) => !state.finalDecisions[m.id]);
    state.activeId = first ? first.id : null;
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
  state.activeId = next ? next.id : state.activeId;
  renderQueue();
  renderDetail();
  syncActionBox();
}

/* ---------- Finalize popup: form state ---------- */

function defaultFormState() {
  return { verdict: "accept", message: "", reassignColumn: null };
}

function decisionToFormState(d) {
  if (!d) return null;
  return {
    verdict: d.verdict,
    message: d.message || "",
    reassignColumn: d.verdict === "reassign" && d.payload ? d.payload.column : null,
  };
}

function readFormState() {
  return {
    verdict: $("verdict-select").value,
    message: $("verdict-message").value,
    reassignColumn: modal.chosenColumn,
  };
}

function applyFormState(s) {
  if (!s) s = defaultFormState();
  $("verdict-select").value = s.verdict;
  $("verdict-message").value = s.message;
  modal.chosenColumn = s.reassignColumn;
}

function populateVerdictSelect(bulk) {
  const opts = bulk ? CONFIG.finalVerdicts.filter((v) => v.bulk) : CONFIG.finalVerdicts;
  $("verdict-select").innerHTML = opts
    .map((v) => `<option value="${v.key}">${v.label}</option>`)
    .join("");
}

/* ---------- Finalize popup: open / close / sections ---------- */

function openActionModal(id) {
  const m = MATCHES.find((x) => x.id === id);
  if (!m || !canDecide(id)) return;
  modal.open = true;
  modal.mode = "single";
  modal.id = id;
  modal.ids = [];

  if (state.activeId !== id) {
    state.activeId = id;
    renderQueue();
    renderDetail();
  }

  $("action-title").textContent = `Finalize ${pairName(m)}`;
  populateVerdictSelect(false);
  applyFormState(state.drafts[id] || decisionToFormState(state.finalDecisions[id]));
  $("bulk-list-wrap").classList.add("hidden");

  const warn = $("modal-under-review");
  warn.textContent = `⚠ This pairing has only ${voteCount(m)} of ${CONFIG.minReviews} required grader reviews.`;
  warn.classList.toggle("hidden", !isUnderReviewed(m));

  // Unhide before rendering sections: the reassign diagram measures layout.
  $("action-modal").classList.remove("hidden");
  syncModalSections();
}

function openBulkModal() {
  if (!isBulk()) return;
  modal.open = true;
  modal.mode = "bulk";
  modal.id = null;
  modal.ids = [...state.selected];
  modal.chosenColumn = null;

  $("action-title").textContent = `Bulk finalize — ${modal.ids.length} pairings`;
  populateVerdictSelect(true);
  $("verdict-select").value = "accept";
  $("bulk-text").textContent = `The decision applies to all ${modal.ids.length} selected pairings:`;
  $("bulk-list").innerHTML = modal.ids
    .map((id) => `<li>${pairName(MATCHES.find((m) => m.id === id))}</li>`)
    .join("");
  $("bulk-list-wrap").classList.remove("hidden");

  const under = modal.ids.filter((id) => isUnderReviewed(MATCHES.find((m) => m.id === id)));
  const warn = $("modal-under-review");
  warn.textContent = `⚠ ${under.length} of these pairings ${under.length === 1 ? "has" : "have"} fewer than ${CONFIG.minReviews} grader reviews.`;
  warn.classList.toggle("hidden", !under.length);

  $("action-modal").classList.remove("hidden");
  syncModalSections();
}

function closeActionModal(saveDraft) {
  if (modal.mode === "single" && saveDraft && modal.id) {
    state.drafts[modal.id] = readFormState();
  }
  modal.open = false;
  modal.id = null;
  modal.ids = [];
  modal.chosenColumn = null;
  $("action-modal").classList.add("hidden");
}

function syncModalSections() {
  const bulk = modal.mode === "bulk";
  const verdict = $("verdict-select").value;

  $("reassign-area").classList.toggle("hidden", bulk || verdict !== "reassign");
  if (!bulk && verdict === "reassign") renderReassignArea();

  const msg = $("verdict-message");
  msg.classList.toggle("hidden", bulk);
  msg.placeholder = verdict === "assignNone"
    ? "Reason (required)"
    : "Message (optional)";

  $("action-error").classList.add("hidden");
}

/* ---------- Finalize popup: reassign picker ----------
 * Mimics the active view (full canonical table in Column view, a mini
 * alignment diagram in Table view). The pick stays within the suggested
 * table (spec); the matcher's top pick keeps its ★ and the two runner-ups
 * are chipped "Suggested Match". */

function reassignChips(m, colName) {
  if (colName === m.suggested.column) return ' <span class="suggest-chip">★ suggested</span>';
  if (m.alternates.includes(colName)) return ' <span class="suggest-chip alt">Suggested Match</span>';
  return "";
}

/* Picker order: suggested first, the two runner-ups next, the rest
 * alphabetically. */
function reassignColumns(m) {
  const priority = (name) =>
    name === m.suggested.column ? 0
      : m.alternates.includes(name) ? 1 + m.alternates.indexOf(name)
      : 3;
  return [...CANONICAL_TABLES[m.suggested.table].columns].sort(
    (a, b) => priority(a.name) - priority(b.name) || a.name.localeCompare(b.name)
  );
}

function renderReassignArea() {
  const m = MATCHES.find((x) => x.id === modal.id);
  const area = $("reassign-area");
  if (!m) { area.innerHTML = ""; return; }
  if (state.view === "table") renderReassignDiagram(area, m);
  else renderReassignTable(area, m);
}

function renderReassignTable(area, m) {
  const rows = reassignColumns(m).map((c) => {
    const isSuggested = c.name === m.suggested.column;
    const chosen = c.name === modal.chosenColumn;
    return `
      <tr class="canon-row ${isSuggested ? "suggested-row" : "pickable"} ${chosen ? "chosen" : ""}" data-col="${c.name}"
          title="${isSuggested ? "Current suggested match" : "Click to reassign to this column"}">
        <td class="canon-name">${c.name}${reassignChips(m, c.name)}${chosen ? ' <span class="chosen-chip">✓ new target</span>' : ""}</td>
        <td class="canon-type">${c.type}</td>
        <td class="canon-desc">${c.desc}</td>
      </tr>`;
  }).join("");

  area.innerHTML = `
    <div class="subform">
      <label class="field-label">Reassign within ${m.suggested.table}</label>
      <div class="reassign-novel">
        <span class="mini-col-name">${m.novel.table}.${m.novel.column}</span>
        <span class="mini-col-type">${m.novel.type}</span>
        <div class="mini-col-desc">${m.novel.desc}</div>
      </div>
      <table class="canon-table">
        <tr><th>Column</th><th>Type</th><th>Description</th></tr>
        ${rows}
      </table>
      <div class="alt-hint">Click a column to choose the new target. ★ is the matcher's top pick; “Suggested Match” marks its two runner-ups.</div>
    </div>`;

  area.querySelectorAll(".canon-row.pickable").forEach((row) =>
    row.addEventListener("click", () => {
      modal.chosenColumn = row.dataset.col;
      renderReassignTable(area, m);
    })
  );
}

function renderReassignDiagram(area, m) {
  const canonRows = reassignColumns(m).map((c) => {
    const isSuggested = c.name === m.suggested.column;
    const chosen = c.name === modal.chosenColumn;
    return `
      <div class="mini-row target ${isSuggested ? "suggested" : "pickable"} ${chosen ? "chosen" : ""}" data-col="${c.name}"
           title="${isSuggested ? "Current suggested match" : "Click to reassign to this column"}">
        <div class="mini-row-main">
          <span class="mini-col-name">${c.name}</span>
          <span class="mini-col-type">${c.type}</span>
          ${reassignChips(m, c.name)}${chosen ? ' <span class="chosen-chip">✓ new target</span>' : ""}
        </div>
        <div class="mini-col-desc">${c.desc}</div>
      </div>`;
  }).join("");

  area.innerHTML = `
    <div class="subform">
      <label class="field-label">Reassign within ${m.suggested.table}</label>
      <div class="diagram modal-diagram" id="modal-diagram">
        <svg class="diagram-svg" id="modal-diagram-svg"></svg>
        <div class="diagram-col left">
          <div class="mini-table anchor">
            <div class="mini-table-title">${m.novel.table} <span class="mini-tag">novel</span></div>
            <div class="mini-row" data-src="novel">
              <div class="mini-row-main">
                <span class="mini-col-name">${m.novel.column}</span>
                <span class="mini-col-type">${m.novel.type}</span>
                ${confBadge(m)}
              </div>
              <div class="mini-col-desc">${m.novel.desc}</div>
            </div>
          </div>
        </div>
        <div class="diagram-col right">
          <div class="mini-table">
            <div class="mini-table-title">${m.suggested.table} <span class="mini-tag">canonical</span></div>
            ${canonRows}
          </div>
        </div>
      </div>
      <div class="alt-hint">Click a column to choose the new target. ★ is the matcher's top pick; “Suggested Match” marks its two runner-ups.</div>
    </div>`;

  area.querySelectorAll(".mini-row.pickable").forEach((row) =>
    row.addEventListener("click", () => {
      modal.chosenColumn = row.dataset.col;
      renderReassignDiagram(area, m);
    })
  );

  drawModalLine(m);
}

/* One line: novel column → current pick (blue), or the suggested column
 * (dashed) until one is picked. */
function drawModalLine(m) {
  const diagram = $("modal-diagram");
  const svg = $("modal-diagram-svg");
  if (!diagram || !svg) return;

  const box = diagram.getBoundingClientRect();
  svg.setAttribute("width", diagram.scrollWidth);
  svg.setAttribute("height", diagram.scrollHeight);

  const src = diagram.querySelector('[data-src="novel"]');
  const dstCol = modal.chosenColumn || m.suggested.column;
  const dst = diagram.querySelector(`.mini-row[data-col="${CSS.escape(dstCol)}"]`);
  if (!src || !dst) { svg.innerHTML = ""; return; }

  const s = src.getBoundingClientRect();
  const d = dst.getBoundingClientRect();
  const x1 = s.right - box.left;
  const y1 = s.top + s.height / 2 - box.top;
  const x2 = d.left - box.left;
  const y2 = d.top + d.height / 2 - box.top;

  const bend = (x2 - x1) * 0.45;
  const cls = modal.chosenColumn ? "line-reassign" : "line-pending";
  svg.innerHTML = `<path class="diagram-line ${cls}"
    d="M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}"/>`;
}

/* ---------- Finalize popup: submitting ---------- */

function showModalError(text) {
  const el = $("action-error");
  el.textContent = text;
  el.classList.remove("hidden");
}

function submitAction() {
  if (!modal.open) return;
  if (modal.mode === "bulk") { submitBulkFinalize(); return; }

  const m = MATCHES.find((x) => x.id === modal.id);
  if (!m) return;
  const verdict = $("verdict-select").value;
  const message = $("verdict-message").value.trim();

  if (verdict === "assignNone" && !message) {
    showModalError("Assign None requires a reason.");
    return;
  }
  if (verdict === "reassign" && !modal.chosenColumn) {
    showModalError("Select a column to reassign to.");
    return;
  }

  const chosenColumn = modal.chosenColumn;
  const commit = () => {
    const payload = verdict === "reassign"
      ? { table: m.suggested.table, column: chosenColumn }
      : null;
    state.lastAction = {
      type: "single", id: m.id,
      previous: state.finalDecisions[m.id] ? { ...state.finalDecisions[m.id] } : null,
    };
    state.finalDecisions[m.id] = { verdict, message, payload };
    delete state.drafts[m.id];
    persistDecisions();
    closeActionModal(false);
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

function submitBulkFinalize() {
  const verdict = $("verdict-select").value;
  const ids = modal.ids;

  state.lastAction = {
    type: "bulk",
    entries: ids.map((id) => ({
      id,
      previous: state.finalDecisions[id] ? { ...state.finalDecisions[id] } : null,
    })),
  };
  for (const id of ids) {
    state.finalDecisions[id] = { verdict, message: "", payload: null };
    delete state.drafts[id];
  }
  state.selected.clear();
  persistDecisions();

  closeActionModal(false);
  showToast(`${ids.length} pairings finalized — ${verdictOf(verdict).label}`);
  autoAdvanceMatches();
}

/* ---------- Expansion decisions ---------- */

function decideExpansion(decision) {
  const e = EXPANSIONS.find((x) => x.id === state.activeId);
  if (!e) return;
  const message = $("expansion-message").value.trim();

  // Approving one request approves every duplicate of the same expansion.
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
  persistDecisions();
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
  persistDecisions();
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
  state.lastAction = null;
  persistDecisions();
  if (modal.open) closeActionModal(false);
  $("undo-toast").classList.add("hidden");
  $("lock-modal").classList.add("hidden");
  const btn = $("lock-decisions-btn");
  btn.textContent = "🔒 Decisions Locked";
  btn.disabled = true;
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
    renderQueue();
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
    total: MATCHES.length,
  });
  input.value = "";
  renderGradersModal();
}

/* ---------- Keyboard shortcuts ----------
 * Enter opens the finalize popup for the selected pairing (or the bulk
 * popup), submits it once open, and confirms the under-review warning.
 * ArrowDown inside the popup expands the decision dropdown; the open picker
 * natively handles up/down navigation and Enter-selects the highlighted
 * item. Message boxes keep Enter-for-newline; buttons and links keep their
 * native Enter behavior outside the popup. */

function otherModalOpen() {
  return ["graders-modal", "remove-grader-modal", "lock-modal", "meet-modal"]
    .some((id) => !$(id).classList.contains("hidden"));
}

document.addEventListener("keydown", (e) => {
  const warnOpen = !$("warn-modal").classList.contains("hidden");

  if (e.key === "Escape") {
    if (warnOpen) {
      $("warn-modal").classList.add("hidden");
    } else if (modal.open) {
      e.preventDefault();
      closeActionModal(true);
    }
    return;
  }
  if (e.key === "ArrowDown" && modal.open && !warnOpen) {
    const tag = e.target.tagName;
    if (tag === "TEXTAREA" || tag === "INPUT") return;    // caret movement
    const sel = $("verdict-select");
    sel.focus();
    // Once the picker is open the browser handles up/down navigation and
    // Enter-selects the highlighted option natively. Without showPicker
    // support the arrow falls through to the focused select, which steps
    // the selection instead.
    if (sel.showPicker) {
      e.preventDefault();
      try { sel.showPicker(); } catch { /* already open or not allowed */ }
    }
    return;
  }
  if (e.key !== "Enter") return;

  if (warnOpen) {
    e.preventDefault();
    $("warn-confirm").click();
    return;
  }

  if (modal.open) {
    if (e.target.tagName === "TEXTAREA") return;          // newline
    if (e.target.id === "action-cancel") return;          // keyboard cancel
    e.preventDefault();
    submitAction();
    return;
  }

  if (state.tab !== "matches") return;
  if (otherModalOpen()) return;
  const tag = e.target.tagName;
  if (["INPUT", "TEXTAREA", "SELECT", "BUTTON", "A"].includes(tag)) return;

  if (isBulk()) openBulkModal();
  else if (state.activeId && canDecide(state.activeId)) openActionModal(state.activeId);
});

/* ---------- Cross-page sync + demo reset ---------- */

// The grader page (in another tab) saves verdicts/schedule live; refresh.
window.addEventListener("storage", (e) => {
  if (e.key !== STORE_KEY) return;
  injectYouVotes();
  rebuildExpansions();
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
  injectYouVotes();
  rebuildExpansions();

  document.querySelectorAll(".tab").forEach((t) =>
    t.addEventListener("click", () => switchTab(t.dataset.tab))
  );

  $("verdict-select").addEventListener("change", syncModalSections);

  $("action-submit").addEventListener("click", submitAction);
  $("action-cancel").addEventListener("click", () => closeActionModal(true));
  $("bulk-continue-btn").addEventListener("click", openBulkModal);

  $("approve-expansion-btn").addEventListener("click", () => decideExpansion("approved"));
  $("reject-expansion-btn").addEventListener("click", () => decideExpansion("rejected"));

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

  document.querySelectorAll("#view-toggle button").forEach((b) =>
    b.addEventListener("click", () => setView(b.dataset.view))
  );
  document.querySelectorAll("#side-toggle button").forEach((b) =>
    b.addEventListener("click", () => setSide(b.dataset.side))
  );

  $("reset-demo-btn").addEventListener("click", resetDemo);

  if (state.locked) {
    const btn = $("lock-decisions-btn");
    btn.textContent = "🔒 Decisions Locked";
    btn.disabled = true;
  }

  // Open on the match-decisions tab with the top undecided item selected.
  const first = sortedMatches().find((m) => !state.finalDecisions[m.id]);
  state.activeId = first ? first.id : sortedMatches()[0].id;
  renderQueue();
  renderDetail();
  syncActionBox();
}

init();

/* ---------- Grader availability + Meet (When2Meet-style) ----------
 * A slot is green only when every grader who submitted a schedule is free.
 * "You" schedule comes live from the grader page via the demo store. */

const SCHEDULE = {
  days: ["Mon", "Tue", "Wed", "Thu", "Fri"],
  startHour: 9,
  slotsPerDay: 16,
};

const slotKey = (d, s) => `${d}-${s}`;

function slotLabel(s) {
  if (s % 2) return "";
  const h = SCHEDULE.startHour + s / 2;
  const h12 = ((h + 11) % 12) + 1;
  return `${h12}:00 ${h < 12 ? "AM" : "PM"}`;
}

function freeSet(ranges) {
  const set = new Set();
  for (const [d, from, to] of ranges) {
    for (let s = from; s <= to; s++) set.add(slotKey(d, s));
  }
  return set;
}

const MOCK_SCHEDULES = {
  g1: freeSet([[0, 0, 7], [1, 0, 7], [2, 0, 7], [3, 0, 7], [3, 10, 13], [4, 0, 7]]),
  g2: freeSet([[0, 2, 9], [1, 2, 7], [2, 4, 9], [3, 10, 15], [4, 0, 5]]),
  g3: freeSet([[0, 4, 7], [1, 2, 11], [2, 0, 3], [3, 8, 15], [4, 2, 9]]),
  g4: freeSet([[0, 4, 11], [1, 3, 8], [2, 2, 6], [3, 9, 14], [4, 4, 9]]),
};

function graderSchedules() {
  const s = loadStore();
  const all = { ...MOCK_SCHEDULES };
  if (s.schedule && s.schedule.submitted) {
    all.you = new Set(s.schedule.free);
  }
  return all;
}

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
  const schedules = graderSchedules();
  const withSched = GRADERS.filter((g) => schedules[g.id]);
  const missing = GRADERS.filter((g) => !schedules[g.id]);

  $("meet-modal-title").textContent = `Meet about ${pairName(m)}`;
  $("meet-modal-sub").textContent = withSched.length
    ? `Green = every grader is free (${withSched.map((g) => g.name.split(" ")[0]).join(", ")}). Mon–Fri, 9:00 AM–5:00 PM, half-hour blocks.`
    : "No grader schedules have been submitted this week.";

  buildAvailabilityGrid($("meet-grid"), (d, s) =>
    withSched.length > 0 &&
    withSched.every((g) => schedules[g.id].has(slotKey(d, s)))
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
