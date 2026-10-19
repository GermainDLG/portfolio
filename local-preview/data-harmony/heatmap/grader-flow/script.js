/* ===== Concordia — Grader flow (Heatmap) =====
 * Based on popup-action, with the detail display replaced by a BDIViz-style
 * confidence heatmap:
 *  - One heatmap per table pair: novel columns on the y-axis, ALL canonical
 *    columns on the x-axis, every cell shaded by a 0-1 confidence score that
 *    fades from the panel background (low) to deep blue (high).
 *  - Clicking a square expands it into a floating card anchored at the cell:
 *    sample values from both columns, the exact confidence %, a 1-2 sentence
 *    rationale, and the Continue button.
 *  - Continue/Enter opens the popup-action popup; selecting a cell off the
 *    suggested column preloads a Reassign to that column.
 *  - Scores for queue pairings (and their runner-ups) are hand-authored;
 *    every other cell gets a deterministic generated score + rationale.
 *  - Light/dark theme toggle, persisted in the shared demo store.
 */

/* ---------- Demo store (shared with admin via localStorage) ---------- */

const STORE_KEY = "dh-heatmap-demo-v1";

function loadStore() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; }
  catch { return {}; }
}

function saveStore(patch) {
  localStorage.setItem(STORE_KEY, JSON.stringify({ ...loadStore(), ...patch }));
}

/* ---------- Config (modularity layer) ---------- */

const CONFIG = {
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

/* ---------- Theme (light/dark) ----------
 * Heat colors fade from the panel background so low-confidence cells recede:
 * dark mode ramps to blue, light mode ramps to deep green. */

const HEAT = {
  dark:  { low: [34, 39, 46],    high: [64, 140, 255] },
  light: { low: [246, 248, 250], high: [0, 68, 27] },
};

let theme = loadStore().theme || "dark";

function heatColor(t) {
  const { low, high } = HEAT[theme];
  const c = low.map((l, i) => Math.round(l + (high[i] - l) * t));
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}

function applyTheme(next, persist) {
  theme = next;
  document.body.classList.toggle("light", theme === "light");
  const btn = $("theme-toggle-btn");
  if (btn) btn.textContent = theme === "dark" ? "☀ Light" : "🌙 Dark";
  if (persist) saveStore({ theme });
}

/* ---------- Canonical schema (OMOP CDM) ----------
 * Three canonical tables at the size extremes the matcher must handle:
 * MEASUREMENT stretched to 45 columns with plausible OMOP-style extension
 * fields (real v5.4 stops at 23), OBSERVATION trimmed to a minimal 8, and a
 * 15-column VISIT_OCCURRENCE. */

const CANONICAL_TABLES = {
  MEASUREMENT: {
    desc: "Structured values from standardized examination or testing — lab tests, vital signs, etc. Extended profile (45 columns).",
    columns: [
      { name: "measurement_id", type: "bigint", desc: "Unique key for a measurement record.", samples: ["70211", "70212", "70213"] },
      { name: "person_id", type: "bigint", desc: "The person the measurement is recorded for.", samples: ["10046", "10117", "10188"] },
      { name: "measurement_concept_id", type: "integer", desc: "Standard concept for the measurement; primary field for analysis.", samples: ["3013682", "3004249", "3027018"] },
      { name: "measurement_date", type: "date", desc: "Date of the measurement.", samples: ["2131-05-12", "2131-05-12", "2131-05-13"] },
      { name: "measurement_datetime", type: "datetime", desc: "Date and time of the measurement.", samples: ["2131-05-12 14:05:00", "2131-05-12 20:00:00", "2131-05-13 02:10:00"] },
      { name: "measurement_time", type: "varchar(10)", desc: "Time of the measurement as sourced.", samples: ["14:05", "20:00", "02:10"] },
      { name: "measurement_type_concept_id", type: "integer", desc: "Provenance of the record (EHR order, lab feed…).", samples: ["32856", "32856", "32817"] },
      { name: "operator_concept_id", type: "integer", desc: "Operator applied to the value (=, <, >).", samples: ["4172703", "4172703", "4171756"] },
      { name: "value_as_number", type: "float", desc: "Numerical result of the measurement, if available.", samples: ["1.2", "7.4", "0.9"] },
      { name: "value_as_concept_id", type: "integer", desc: "Categorical result mapped to a standard 'Meas Value' concept.", samples: ["45878583", "0", "45884084"] },
      { name: "unit_concept_id", type: "integer", desc: "Standard Unit-domain concept for the source unit.", samples: ["8840", "8554", "8753"] },
      { name: "range_low", type: "float", desc: "Low end of the normal range, as provided by the source.", samples: ["0.5", "4.0", "0.6"] },
      { name: "range_high", type: "float", desc: "High end of the normal range, as provided by the source.", samples: ["1.4", "11.0", "1.3"] },
      { name: "provider_id", type: "bigint", desc: "Provider associated with the measurement.", samples: ["2214", "902", "1187"] },
      { name: "visit_occurrence_id", type: "bigint", desc: "The visit during which the measurement occurred.", samples: ["161773", "129635", "144319"] },
      { name: "visit_detail_id", type: "bigint", desc: "The visit-detail episode during which it occurred.", samples: ["88123", "84190", "90310"] },
      { name: "measurement_source_value", type: "varchar(50)", desc: "Verbatim source code/name for the measurement (e.g., a local lab code).", samples: ["50912", "51221", "50971"] },
      { name: "measurement_source_concept_id", type: "integer", desc: "Source code mapped to a (possibly non-standard) concept.", samples: ["45770407", "45771321", "45757366"] },
      { name: "unit_source_value", type: "varchar(50)", desc: "Verbatim source value for the unit.", samples: ["mg/dL", "%", "mEq/L"] },
      { name: "unit_source_concept_id", type: "integer", desc: "Source unit mapped to a concept.", samples: ["8840", "8554", "8753"] },
      { name: "value_source_value", type: "varchar(50)", desc: "Verbatim result value from the source data.", samples: ["1.2", "NEG", "7.4"] },
      { name: "measurement_event_id", type: "bigint", desc: "Event record the measurement relates to.", samples: ["0", "0", "0"] },
      { name: "meas_event_field_concept_id", type: "integer", desc: "Field concept of the related event record.", samples: ["0", "0", "0"] },
      { name: "specimen_id", type: "bigint", desc: "Specimen the measurement was performed on.", samples: ["50771", "51002", "50644"] },
      { name: "specimen_concept_id", type: "integer", desc: "Kind of specimen as a standard concept.", samples: ["4001225", "4046227", "4001225"] },
      { name: "specimen_source_value", type: "varchar(50)", desc: "Verbatim specimen description from the source.", samples: ["BLOOD", "URINE", "BLOOD"] },
      { name: "anatomic_site_concept_id", type: "integer", desc: "Anatomic site of specimen collection.", samples: ["4155691", "0", "4155691"] },
      { name: "anatomic_site_source_value", type: "varchar(50)", desc: "Verbatim anatomic site from the source.", samples: ["antecubital", "", "radial"] },
      { name: "collection_datetime", type: "datetime", desc: "When the specimen was collected.", samples: ["2131-05-12 13:48:00", "2131-05-12 19:36:00", "2131-05-13 01:55:00"] },
      { name: "result_datetime", type: "datetime", desc: "When the result was finalized by the lab.", samples: ["2131-05-12 15:12:00", "2131-05-12 21:20:00", "2131-05-13 03:40:00"] },
      { name: "lab_section", type: "varchar(50)", desc: "Performing lab section (chemistry, hematology…).", samples: ["CHEMISTRY", "HEMATOLOGY", "BLOOD GAS"] },
      { name: "lab_priority_source_value", type: "varchar(50)", desc: "STAT / routine priority as sourced.", samples: ["STAT", "ROUTINE", "STAT"] },
      { name: "ordering_provider_id", type: "bigint", desc: "Provider who ordered the measurement.", samples: ["2214", "902", "1187"] },
      { name: "performing_lab_id", type: "bigint", desc: "Lab that performed the measurement.", samples: ["12", "12", "7"] },
      { name: "performing_lab_source_value", type: "varchar(50)", desc: "Verbatim performing-lab name.", samples: ["CORE LAB", "CORE LAB", "POC"] },
      { name: "abnormal_flag_concept_id", type: "integer", desc: "Abnormal-result flag as a standard concept.", samples: ["4328749", "0", "4267416"] },
      { name: "abnormal_flag_source_value", type: "varchar(50)", desc: "Verbatim abnormal flag (H, L, abnormal…).", samples: ["abnormal", "", "abnormal"] },
      { name: "reference_range_source_value", type: "varchar(50)", desc: "Verbatim reference-range string.", samples: ["0.5-1.4", "4.0-11.0", "0.6-1.3"] },
      { name: "dilution_factor", type: "float", desc: "Dilution applied before analysis.", samples: ["1.0", "1.0", "2.0"] },
      { name: "method_concept_id", type: "integer", desc: "Measurement method as a standard concept.", samples: ["4239025", "0", "4239025"] },
      { name: "method_source_value", type: "varchar(50)", desc: "Verbatim measurement method.", samples: ["enzymatic", "", "ISE"] },
      { name: "status_concept_id", type: "integer", desc: "Result status (final, corrected…).", samples: ["4110161", "4110161", "4225553"] },
      { name: "status_source_value", type: "varchar(50)", desc: "Verbatim result status.", samples: ["final", "final", "corrected"] },
      { name: "review_datetime", type: "datetime", desc: "When the result was reviewed/verified.", samples: ["2131-05-12 16:00:00", "2131-05-12 22:00:00", "2131-05-13 05:15:00"] },
      { name: "delta_flag", type: "varchar(10)", desc: "Significant change vs. the prior result.", samples: ["Y", "", ""] },
    ],
  },
  PERSON: {
    desc: "Central identity management for all persons in the database — one record per patient with core demographics (18 columns).",
    columns: [
      { name: "person_id", type: "bigint", desc: "Unique identifier for each person.", samples: ["10046", "10117", "10188"] },
      { name: "gender_concept_id", type: "integer", desc: "Biological sex at birth as a standard concept id.", samples: ["8507", "8532", "8507"] },
      { name: "year_of_birth", type: "integer", desc: "Year of birth; used to compute age.", samples: ["2052", "2049", "2061"] },
      { name: "month_of_birth", type: "integer", desc: "Month of birth, when available.", samples: ["3", "11", "7"] },
      { name: "day_of_birth", type: "integer", desc: "Day of birth, when available.", samples: ["5", "22", "9"] },
      { name: "birth_datetime", type: "datetime", desc: "Full date and time of birth.", samples: ["2052-03-05 00:00:00", "2049-11-22 00:00:00", "2061-07-09 00:00:00"] },
      { name: "race_concept_id", type: "integer", desc: "Race of the person as a standard concept.", samples: ["8527", "8516", "8527"] },
      { name: "ethnicity_concept_id", type: "integer", desc: "OMB ethnicity: Hispanic vs. Not Hispanic only.", samples: ["38003564", "38003563", "38003564"] },
      { name: "location_id", type: "bigint", desc: "Home address location of the person.", samples: ["5211", "4188", "6032"] },
      { name: "provider_id", type: "bigint", desc: "Primary care provider.", samples: ["2214", "902", "1187"] },
      { name: "care_site_id", type: "bigint", desc: "Care site where the person gets care.", samples: ["402", "402", "417"] },
      { name: "person_source_value", type: "varchar(50)", desc: "Source identifier linking back to the person in the source data.", samples: ["10046", "10117", "10188"] },
      { name: "gender_source_value", type: "varchar(50)", desc: "Biological sex as it appears in the source; reference only.", samples: ["M", "F", "M"] },
      { name: "gender_source_concept_id", type: "integer", desc: "Source gender code mapped to a concept.", samples: ["0", "0", "0"] },
      { name: "race_source_value", type: "varchar(50)", desc: "Race as it appears in the source; reference only.", samples: ["WHITE", "BLACK/AFRICAN AMERICAN", "WHITE"] },
      { name: "race_source_concept_id", type: "integer", desc: "Source race code mapped to a concept.", samples: ["0", "0", "0"] },
      { name: "ethnicity_source_value", type: "varchar(50)", desc: "Ethnicity as it appears in the source; reference only.", samples: ["WHITE", "HISPANIC OR LATINO", "BLACK/AFRICAN AMERICAN"] },
      { name: "ethnicity_source_concept_id", type: "integer", desc: "Source ethnicity code mapped to a concept.", samples: ["0", "0", "0"] },
    ],
  },
  OBSERVATION: {
    desc: "Clinical facts about a person that don't fit other domains. Minimal profile (8 columns).",
    columns: [
      { name: "observation_id", type: "bigint", desc: "Unique key for an observation record.", samples: ["90311", "90312", "90313"] },
      { name: "person_id", type: "bigint", desc: "The person the observation is recorded for.", samples: ["10046", "10117", "10188"] },
      { name: "observation_concept_id", type: "integer", desc: "Standard concept for the observation; primary field for analysis.", samples: ["3027018", "4239408", "3025315"] },
      { name: "observation_datetime", type: "datetime", desc: "Date and time of the observation.", samples: ["2131-05-12 14:00:00", "2131-05-12 15:00:00", "2131-05-12 16:00:00"] },
      { name: "value_as_number", type: "float", desc: "Numerical result, if applicable.", samples: ["87.0", "18.0", "98.0"] },
      { name: "value_as_string", type: "varchar(60)", desc: "Categorical result, if applicable.", samples: ["brisk", "Oral", "CMV"] },
      { name: "unit_source_value", type: "varchar(50)", desc: "Verbatim source value for the unit.", samples: ["bpm", "insp/min", "%"] },
      { name: "observation_source_value", type: "varchar(50)", desc: "Verbatim source value for the observation.", samples: ["220045", "220210", "220277"] },
    ],
  },
  DRUG_EXPOSURE: {
    desc: "Records of exposure to a drug — prescriptions, over-the-counter medicines, vaccines. Extended pharmacy profile (30 columns).",
    columns: [
      { name: "drug_exposure_id", type: "bigint", desc: "Unique key for the drug record.", samples: ["81022", "81023", "81024"] },
      { name: "person_id", type: "bigint", desc: "The person the drug is recorded for.", samples: ["10046", "10117", "10188"] },
      { name: "drug_concept_id", type: "integer", desc: "Standard concept for the drug product; primary field for analysis.", samples: ["1734104", "40213154", "19078106"] },
      { name: "drug_exposure_start_date", type: "date", desc: "Start date of the drug record.", samples: ["2131-05-13", "2131-06-02", "2131-07-20"] },
      { name: "drug_exposure_start_datetime", type: "datetime", desc: "Start date and time.", samples: ["2131-05-13 08:00:00", "2131-06-02 12:00:00", "2131-07-20 09:30:00"] },
      { name: "drug_exposure_end_date", type: "date", desc: "Day the drug exposure ended.", samples: ["2131-05-19", "2131-06-09", "2131-07-24"] },
      { name: "drug_exposure_end_datetime", type: "datetime", desc: "End date and time.", samples: ["2131-05-19 20:00:00", "2131-06-09 08:00:00", "2131-07-24 21:00:00"] },
      { name: "verbatim_end_date", type: "date", desc: "Known end date as stated in the source.", samples: ["2131-05-19", "", "2131-07-24"] },
      { name: "drug_type_concept_id", type: "integer", desc: "Provenance: prescription written vs. dispensed vs. administered.", samples: ["32838", "32838", "32818"] },
      { name: "stop_reason", type: "varchar(20)", desc: "Reason the drug was stopped.", samples: ["", "course complete", "adverse event"] },
      { name: "refills", type: "integer", desc: "Number of refills after the initial prescription.", samples: ["0", "2", "0"] },
      { name: "quantity", type: "float", desc: "Quantity of drug prescribed or dispensed.", samples: ["30", "14", "60"] },
      { name: "days_supply", type: "integer", desc: "Days of supply the prescription covers.", samples: ["7", "14", "30"] },
      { name: "sig", type: "text", desc: "Directions ('signetur') on the prescription.", samples: ["1 tab PO BID", "10 mL IV q8h", "apply topically daily"] },
      { name: "route_concept_id", type: "integer", desc: "Route of administration as a standard concept.", samples: ["4132161", "4171047", "4263689"] },
      { name: "lot_number", type: "varchar(50)", desc: "Manufacturing lot of the product.", samples: ["A2231", "", "K0987"] },
      { name: "provider_id", type: "bigint", desc: "Prescribing provider.", samples: ["2214", "902", "1187"] },
      { name: "visit_occurrence_id", type: "bigint", desc: "The visit during which the drug was prescribed.", samples: ["161773", "129635", "144319"] },
      { name: "visit_detail_id", type: "bigint", desc: "The visit-detail episode of the exposure.", samples: ["88123", "84190", "90310"] },
      { name: "drug_source_value", type: "varchar(50)", desc: "Verbatim drug value from the source (e.g., NDC code or name).", samples: ["Vancomycin", "Metoprolol Tartrate", "Insulin Human Regular"] },
      { name: "drug_source_concept_id", type: "integer", desc: "Source drug code mapped to a concept.", samples: ["45076904", "45892419", "45774751"] },
      { name: "route_source_value", type: "varchar(50)", desc: "Verbatim route from the source data.", samples: ["IV", "PO", "SC"] },
      { name: "dose_unit_source_value", type: "varchar(50)", desc: "Verbatim dose unit from the source data.", samples: ["mg", "mg", "UNIT"] },
      { name: "frequency_source_value", type: "varchar(50)", desc: "Verbatim dosing frequency (BID, q8h…).", samples: ["BID", "q8h", "QD"] },
      { name: "prn_flag", type: "varchar(5)", desc: "Whether the order is as-needed (PRN).", samples: ["N", "Y", "N"] },
      { name: "strength_source_value", type: "varchar(50)", desc: "Verbatim product strength.", samples: ["500mg Vial", "25mg Tab", "100unit/mL"] },
      { name: "form_source_value", type: "varchar(50)", desc: "Verbatim dose form (tab, vial…).", samples: ["VIAL", "TAB", "SYR"] },
      { name: "order_datetime", type: "datetime", desc: "When the order was placed.", samples: ["2131-05-13 07:42:00", "2131-06-02 11:15:00", "2131-07-20 08:55:00"] },
      { name: "pharmacy_id", type: "bigint", desc: "Pharmacy that filled the order.", samples: ["31", "31", "12"] },
      { name: "dispense_datetime", type: "datetime", desc: "When the order was dispensed.", samples: ["2131-05-13 09:10:00", "2131-06-02 13:30:00", "2131-07-20 10:40:00"] },
    ],
  },
  VISIT_OCCURRENCE: {
    desc: "Events where persons engage with the healthcare system for a duration of time — often called encounters (15 columns).",
    columns: [
      { name: "visit_occurrence_id", type: "bigint", desc: "Unique id for the visit; links events across CDM tables.", samples: ["161773", "129635", "144319"] },
      { name: "person_id", type: "bigint", desc: "The person this visit belongs to.", samples: ["10046", "10117", "10188"] },
      { name: "visit_concept_id", type: "integer", desc: "Kind of visit (inpatient, outpatient…) as a standard Visit-domain concept.", samples: ["9201", "9203", "9201"] },
      { name: "visit_start_date", type: "date", desc: "Start date; for inpatient visits, the admission date.", samples: ["2131-05-12", "2131-06-01", "2131-07-19"] },
      { name: "visit_start_datetime", type: "datetime", desc: "Start date and time of the visit.", samples: ["2131-05-12 20:19:00", "2131-06-01 04:55:00", "2131-07-19 11:02:00"] },
      { name: "visit_end_date", type: "date", desc: "End date; for inpatient visits, the discharge date.", samples: ["2131-05-19", "2131-06-09", "2131-07-25"] },
      { name: "visit_end_datetime", type: "datetime", desc: "End date and time of the visit.", samples: ["2131-05-19 16:40:00", "2131-06-09 12:15:00", "2131-07-25 09:30:00"] },
      { name: "visit_type_concept_id", type: "integer", desc: "Provenance of the visit record (EHR, claims…).", samples: ["32817", "32817", "32817"] },
      { name: "care_site_id", type: "bigint", desc: "Care site where the visit took place.", samples: ["402", "402", "417"] },
      { name: "visit_source_value", type: "varchar(50)", desc: "Verbatim source value for the kind of visit (inpatient, emergency…).", samples: ["EMERGENCY", "ELECTIVE", "URGENT"] },
      { name: "visit_source_concept_id", type: "integer", desc: "Source visit kind mapped to a concept.", samples: ["0", "0", "0"] },
      { name: "admitted_from_concept_id", type: "integer", desc: "Where the patient was admitted from, as a standard concept.", samples: ["8870", "8536", "8870"] },
      { name: "admitted_from_source_value", type: "varchar(50)", desc: "Verbatim source value for where the patient was admitted from.", samples: ["EMERGENCY ROOM ADMIT", "PHYS REFERRAL/NORMAL DELI", "TRANSFER FROM HOSP/EXTRAM"] },
      { name: "discharge_to_concept_id", type: "integer", desc: "Where the patient was discharged to (home, long-term care…).", samples: ["8536", "8863", "8536"] },
      { name: "discharge_to_source_value", type: "varchar(50)", desc: "Verbatim source value for where the patient was discharged to.", samples: ["HOME", "SNF", "HOME HEALTH CARE"] },
    ],
  },
};

const CANONICAL_SCHEMA = Object.fromEntries(
  Object.entries(CANONICAL_TABLES).map(([t, def]) => [t, def.columns.map((c) => c.name)])
);

/* ---------- Novel (incoming) tables — MIMIC-III style ----------
 * Size extremes on the novel side too: LABEVENTS trimmed to 6 columns,
 * a denormalized 45-column vitals flowsheet, and a 16-column ADMISSIONS. */

const NOVEL_TABLES = {
  LABEVENTS: {
    desc: "Laboratory measurements sourced from the hospital lab feed (6 columns).",
    columns: [
      { name: "ITEMID", type: "INTEGER", desc: "Local lab item identifier from D_LABITEMS.", samples: ["50912", "51221", "50971"] },
      { name: "CHARTTIME", type: "TIMESTAMP", desc: "Time the lab event was charted.", samples: ["2131-05-12 14:05:00", "2131-05-12 20:00:00", "2131-05-13 02:10:00"] },
      { name: "VALUE", type: "VARCHAR", desc: "Result value as recorded, numeric or text.", samples: ["1.2", "NEG", "7.4"] },
      { name: "VALUENUM", type: "DOUBLE", desc: "Result value parsed to a number, when numeric.", samples: ["1.2", "", "7.4"] },
      { name: "VALUEUOM", type: "VARCHAR", desc: "Unit of measurement for the value.", samples: ["mg/dL", "", "mEq/L"] },
      { name: "FLAG", type: "VARCHAR", desc: "Marks results considered abnormal by the lab.", samples: ["abnormal", "", "abnormal"] },
    ],
  },
  CHARTEVENTS_WIDE: {
    desc: "Denormalized bedside flowsheet export — one column per charted vital or setting (45 columns).",
    columns: [
      { name: "SUBJECT_ID", type: "INTEGER", desc: "Unique identifier for an individual patient.", samples: ["10046", "10117", "10188"] },
      { name: "HADM_ID", type: "INTEGER", desc: "Hospital admission the observation belongs to.", samples: ["161773", "129635", "144319"] },
      { name: "ICUSTAY_ID", type: "INTEGER", desc: "ICU stay the observation belongs to.", samples: ["290505", "279554", "216859"] },
      { name: "CHARTTIME", type: "TIMESTAMP", desc: "Time the row of vitals was charted at the bedside.", samples: ["2131-05-12 14:00:00", "2131-05-12 15:00:00", "2131-05-12 16:00:00"] },
      { name: "STORETIME", type: "TIMESTAMP", desc: "Time the row was stored by the clinical system.", samples: ["2131-05-12 14:07:00", "2131-05-12 15:04:00", "2131-05-12 16:09:00"] },
      { name: "CGID", type: "INTEGER", desc: "Caregiver who charted the row.", samples: ["17525", "18280", "17525"] },
      { name: "HEART_RATE", type: "DOUBLE", desc: "Heart rate (bpm).", samples: ["87", "92", "84"] },
      { name: "SBP_ART", type: "DOUBLE", desc: "Systolic blood pressure, arterial line (mmHg).", samples: ["118", "104", "126"] },
      { name: "DBP_ART", type: "DOUBLE", desc: "Diastolic blood pressure, arterial line (mmHg).", samples: ["64", "58", "71"] },
      { name: "MAP_ART", type: "DOUBLE", desc: "Mean arterial pressure, arterial line (mmHg).", samples: ["82", "73", "89"] },
      { name: "SBP_NI", type: "DOUBLE", desc: "Systolic blood pressure, non-invasive cuff (mmHg).", samples: ["120", "106", "128"] },
      { name: "DBP_NI", type: "DOUBLE", desc: "Diastolic blood pressure, non-invasive cuff (mmHg).", samples: ["66", "60", "72"] },
      { name: "MAP_NI", type: "DOUBLE", desc: "Mean arterial pressure, non-invasive cuff (mmHg).", samples: ["84", "75", "91"] },
      { name: "RESP_RATE", type: "DOUBLE", desc: "Respiratory rate (insp/min).", samples: ["18", "22", "16"] },
      { name: "SPO2", type: "DOUBLE", desc: "Peripheral oxygen saturation (%).", samples: ["98", "94", "97"] },
      { name: "ETCO2", type: "DOUBLE", desc: "End-tidal CO2 (mmHg).", samples: ["36", "41", "34"] },
      { name: "TEMP_C", type: "DOUBLE", desc: "Body temperature (°C).", samples: ["37.1", "38.4", "36.8"] },
      { name: "TEMP_SITE", type: "VARCHAR", desc: "Temperature measurement site.", samples: ["Oral", "Axillary", "Core"] },
      { name: "CVP", type: "DOUBLE", desc: "Central venous pressure (mmHg).", samples: ["8", "11", "6"] },
      { name: "GCS_EYE", type: "INTEGER", desc: "Glasgow Coma Scale — eye opening (1-4).", samples: ["4", "3", "4"] },
      { name: "GCS_VERBAL", type: "INTEGER", desc: "Glasgow Coma Scale — verbal response (1-5).", samples: ["5", "4", "5"] },
      { name: "GCS_MOTOR", type: "INTEGER", desc: "Glasgow Coma Scale — motor response (1-6).", samples: ["6", "5", "6"] },
      { name: "GCS_TOTAL", type: "INTEGER", desc: "Glasgow Coma Scale — total score (3-15).", samples: ["15", "12", "15"] },
      { name: "PUPIL_LEFT", type: "VARCHAR", desc: "Left pupil response.", samples: ["brisk", "sluggish", "brisk"] },
      { name: "PUPIL_RIGHT", type: "VARCHAR", desc: "Right pupil response.", samples: ["brisk", "brisk", "brisk"] },
      { name: "FIO2", type: "DOUBLE", desc: "Fraction of inspired oxygen (%).", samples: ["40", "60", "35"] },
      { name: "PEEP", type: "DOUBLE", desc: "Positive end-expiratory pressure (cmH2O).", samples: ["5", "8", "5"] },
      { name: "TIDAL_VOLUME", type: "DOUBLE", desc: "Tidal volume delivered (mL).", samples: ["450", "420", "480"] },
      { name: "MINUTE_VENT", type: "DOUBLE", desc: "Minute ventilation (L/min).", samples: ["7.4", "8.9", "6.8"] },
      { name: "VENT_MODE", type: "VARCHAR", desc: "Ventilator mode.", samples: ["CMV", "PSV", "SIMV"] },
      { name: "O2_FLOW", type: "DOUBLE", desc: "Supplemental oxygen flow (L/min).", samples: ["2", "4", "0"] },
      { name: "O2_DEVICE", type: "VARCHAR", desc: "Oxygen delivery device.", samples: ["Nasal cannula", "Face mask", "None"] },
      { name: "GLUCOSE_FS", type: "DOUBLE", desc: "Fingerstick glucose (mg/dL).", samples: ["132", "88", "156"] },
      { name: "PAIN_SCORE", type: "INTEGER", desc: "Reported pain score (0-10).", samples: ["2", "5", "0"] },
      { name: "RASS_SCORE", type: "INTEGER", desc: "Richmond Agitation-Sedation Scale (-5 to +4).", samples: ["0", "-2", "0"] },
      { name: "CAM_ICU", type: "VARCHAR", desc: "CAM-ICU delirium assessment.", samples: ["negative", "positive", "negative"] },
      { name: "URINE_OUTPUT", type: "DOUBLE", desc: "Urine output over the interval (mL).", samples: ["120", "45", "200"] },
      { name: "WEIGHT_KG", type: "DOUBLE", desc: "Patient weight (kg).", samples: ["82.5", "63.0", "97.1"] },
      { name: "HEIGHT_CM", type: "DOUBLE", desc: "Patient height (cm).", samples: ["175", "162", "181"] },
      { name: "BSA", type: "DOUBLE", desc: "Body surface area (m²).", samples: ["1.98", "1.68", "2.17"] },
      { name: "IV_RATE_ML_HR", type: "DOUBLE", desc: "Primary IV infusion rate (mL/hr).", samples: ["75", "100", "50"] },
      { name: "ART_PH", type: "DOUBLE", desc: "Arterial blood gas — pH.", samples: ["7.38", "7.31", "7.42"] },
      { name: "ART_PO2", type: "DOUBLE", desc: "Arterial blood gas — PaO2 (mmHg).", samples: ["92", "71", "104"] },
      { name: "ART_PCO2", type: "DOUBLE", desc: "Arterial blood gas — PaCO2 (mmHg).", samples: ["41", "48", "38"] },
      { name: "LACTATE", type: "DOUBLE", desc: "Serum lactate (mmol/L).", samples: ["1.1", "3.4", "0.9"] },
    ],
  },
  PRESCRIPTIONS: {
    desc: "Medication orders from the pharmacy system, one row per prescribed drug (30 columns).",
    columns: [
      { name: "ROW_ID", type: "INTEGER", desc: "Surrogate row identifier from the source extract.", samples: ["100231", "100232", "100233"] },
      { name: "SUBJECT_ID", type: "INTEGER", desc: "Unique identifier for an individual patient.", samples: ["10046", "10117", "10188"] },
      { name: "HADM_ID", type: "INTEGER", desc: "Hospital admission the order belongs to.", samples: ["161773", "129635", "144319"] },
      { name: "ICUSTAY_ID", type: "INTEGER", desc: "ICU stay the order belongs to, when applicable.", samples: ["290505", "", "216859"] },
      { name: "STARTDATE", type: "TIMESTAMP", desc: "Date the prescription started.", samples: ["2131-05-13 00:00:00", "2131-06-02 00:00:00", "2131-07-20 00:00:00"] },
      { name: "ENDDATE", type: "TIMESTAMP", desc: "Date the prescription ended.", samples: ["2131-05-19 00:00:00", "2131-06-09 00:00:00", "2131-07-24 00:00:00"] },
      { name: "DRUG_TYPE", type: "VARCHAR", desc: "Type of the order (MAIN, BASE, ADDITIVE).", samples: ["MAIN", "MAIN", "ADDITIVE"] },
      { name: "DRUG", type: "VARCHAR", desc: "Drug name as prescribed.", samples: ["Vancomycin", "Metoprolol Tartrate", "Insulin Human Regular"] },
      { name: "DRUG_NAME_POE", type: "VARCHAR", desc: "Drug name from the provider order entry system.", samples: ["Vancomycin", "Metoprolol", "Insulin"] },
      { name: "DRUG_NAME_GENERIC", type: "VARCHAR", desc: "Generic drug name.", samples: ["Vancomycin HCl", "Metoprolol Tartrate", "Insulin Regular"] },
      { name: "FORMULARY_DRUG_CD", type: "VARCHAR", desc: "Hospital formulary code for the drug.", samples: ["VANC1F", "METO25", "INSR"] },
      { name: "GSN", type: "VARCHAR", desc: "Generic sequence number for the drug.", samples: ["010093", "006524", "004803"] },
      { name: "NDC", type: "VARCHAR", desc: "National drug code of the product.", samples: ["00409-6531-02", "55390-0468-10", "00002-8215-01"] },
      { name: "PROD_STRENGTH", type: "VARCHAR", desc: "Product strength as dispensed.", samples: ["500mg Vial", "25mg Tab", "100unit/mL"] },
      { name: "DOSE_VAL_RX", type: "VARCHAR", desc: "Prescribed dose value.", samples: ["1000", "25", "8"] },
      { name: "DOSE_UNIT_RX", type: "VARCHAR", desc: "Prescribed dose unit.", samples: ["mg", "mg", "UNIT"] },
      { name: "FORM_VAL_DISP", type: "VARCHAR", desc: "Amount of the formulation dispensed.", samples: ["2", "1", "0.08"] },
      { name: "FORM_UNIT_DISP", type: "VARCHAR", desc: "Unit of the dispensed formulation.", samples: ["VIAL", "TAB", "mL"] },
      { name: "ROUTE", type: "VARCHAR", desc: "Route of administration.", samples: ["IV", "PO", "SC"] },
      { name: "FREQUENCY", type: "VARCHAR", desc: "Dosing frequency.", samples: ["BID", "q8h", "QD"] },
      { name: "PRN_FLAG", type: "VARCHAR", desc: "Whether the order is as-needed (PRN).", samples: ["N", "Y", "N"] },
      { name: "DURATION", type: "DOUBLE", desc: "Planned duration of the course.", samples: ["7", "14", "30"] },
      { name: "DURATION_UNIT", type: "VARCHAR", desc: "Unit of the planned duration.", samples: ["days", "days", "days"] },
      { name: "ORDER_TIME", type: "TIMESTAMP", desc: "When the order was entered.", samples: ["2131-05-13 07:42:00", "2131-06-02 11:15:00", "2131-07-20 08:55:00"] },
      { name: "DISCONTINUE_TIME", type: "TIMESTAMP", desc: "When the order was discontinued.", samples: ["2131-05-19 20:00:00", "", "2131-07-24 21:00:00"] },
      { name: "PHARMACIST_ID", type: "INTEGER", desc: "Pharmacist who verified the order.", samples: ["7712", "7731", "7712"] },
      { name: "ORDER_PROVIDER_ID", type: "INTEGER", desc: "Provider who placed the order.", samples: ["2214", "902", "1187"] },
      { name: "TOTAL_DOSES", type: "DOUBLE", desc: "Total number of doses planned.", samples: ["14", "42", "30"] },
      { name: "REFILLS_ALLOWED", type: "INTEGER", desc: "Refills allowed on the prescription.", samples: ["0", "2", "0"] },
      { name: "INFUSION_RATE", type: "VARCHAR", desc: "Infusion rate for IV orders.", samples: ["100 mL/hr", "", ""] },
    ],
  },
  ADMISSIONS: {
    desc: "One row per hospital admission, with demographics captured at admit time (16 columns).",
    columns: [
      { name: "SUBJECT_ID", type: "INTEGER", desc: "Unique identifier for an individual patient.", samples: ["10046", "10117", "10188"] },
      { name: "HADM_ID", type: "INTEGER", desc: "Unique id for a single hospital admission.", samples: ["161773", "129635", "144319"] },
      { name: "ADMITTIME", type: "TIMESTAMP", desc: "Date and time the patient was admitted to the hospital.", samples: ["2131-05-12 20:19:00", "2131-06-01 04:55:00", "2131-07-19 11:02:00"] },
      { name: "DISCHTIME", type: "TIMESTAMP", desc: "Date and time the patient was discharged from the hospital.", samples: ["2131-05-19 16:40:00", "2131-06-09 12:15:00", "2131-07-25 09:30:00"] },
      { name: "DEATHTIME", type: "TIMESTAMP", desc: "Time of in-hospital death, when applicable.", samples: ["", "", "2131-07-25 09:30:00"] },
      { name: "ADMISSION_TYPE", type: "VARCHAR", desc: "Type of admission (EMERGENCY, ELECTIVE, URGENT, NEWBORN).", samples: ["EMERGENCY", "ELECTIVE", "URGENT"] },
      { name: "ADMISSION_LOCATION", type: "VARCHAR", desc: "Where the patient was admitted from.", samples: ["EMERGENCY ROOM ADMIT", "PHYS REFERRAL/NORMAL DELI", "TRANSFER FROM HOSP/EXTRAM"] },
      { name: "DISCHARGE_LOCATION", type: "VARCHAR", desc: "Where the patient was discharged to.", samples: ["HOME", "SNF", "HOME HEALTH CARE"] },
      { name: "INSURANCE", type: "VARCHAR", desc: "Patient demographic — insurance/payer.", samples: ["Medicare", "Private", "Medicaid"] },
      { name: "LANGUAGE", type: "VARCHAR", desc: "Patient demographic — language.", samples: ["ENGL", "SPAN", "ENGL"] },
      { name: "RELIGION", type: "VARCHAR", desc: "Patient demographic — religion.", samples: ["CATHOLIC", "NOT SPECIFIED", "PROTESTANT QUAKER"] },
      { name: "MARITAL_STATUS", type: "VARCHAR", desc: "Patient demographic — marital status.", samples: ["MARRIED", "SINGLE", "WIDOWED"] },
      { name: "ETHNICITY", type: "VARCHAR", desc: "Patient demographic — ethnicity.", samples: ["WHITE", "HISPANIC OR LATINO", "BLACK/AFRICAN AMERICAN"] },
      { name: "EDREGTIME", type: "TIMESTAMP", desc: "Time the patient was registered in the emergency department.", samples: ["2131-05-12 18:02:00", "", "2131-07-19 08:44:00"] },
      { name: "EDOUTTIME", type: "TIMESTAMP", desc: "Time the patient left the emergency department.", samples: ["2131-05-12 20:15:00", "", "2131-07-19 10:58:00"] },
      { name: "DIAGNOSIS", type: "VARCHAR", desc: "Free-text preliminary diagnosis at admission.", samples: ["SEPSIS", "CORONARY ARTERY DISEASE", "GI BLEED"] },
    ],
  },
};

/* ---------- Mock pairings (upstream matcher, scores 0-1) ----------
 * Each novel table pairs into exactly one canonical table, so a table pair
 * has one heatmap. rationale = hand-written explanation for the suggested
 * cell; altRationales cover the two runner-ups. */

const PAIRINGS = [
  { id: "c1", novel: { table: "CHARTEVENTS_WIDE", column: "SUBJECT_ID" },
    suggested: { table: "OBSERVATION", column: "person_id" }, score: 0.96,
    alternates: ["observation_id", "observation_source_value"],
    rationale: "SUBJECT_ID is the MIMIC patient identifier and person_id is OMOP's person key; integer id semantics and near-unique value profiles line up.",
    altRationales: {
      observation_id: "Also an integer key, but it identifies the observation row itself, not the patient.",
      observation_source_value: "Ids sometimes ride along as source strings, but this column holds the observation code, not a patient id.",
    } },
  { id: "l1", novel: { table: "LABEVENTS", column: "VALUENUM" },
    suggested: { table: "MEASUREMENT", column: "value_as_number" }, score: 0.94,
    alternates: ["value_source_value", "range_low"],
    rationale: "VALUENUM is the parsed numeric lab result and value_as_number is MEASUREMENT's numeric result field; DOUBLE→float is lossless and sampled distributions match.",
    altRationales: {
      value_source_value: "Holds the same result but as the verbatim string, not the parsed number.",
      range_low: "Numeric and lab-shaped, but it is the reference range bound, not the result.",
    } },
  { id: "a1", novel: { table: "ADMISSIONS", column: "ADMITTIME" },
    suggested: { table: "VISIT_OCCURRENCE", column: "visit_start_datetime" }, score: 0.93,
    alternates: ["visit_start_date", "visit_end_datetime"],
    rationale: "ADMITTIME is the hospital admission timestamp; visit_start_datetime is defined as the admission time for inpatient visits.",
    altRationales: {
      visit_start_date: "The same event at date precision — accepting it would drop the time component.",
      visit_end_datetime: "A timestamp with matching format, but it marks discharge, not admission.",
    } },
  { id: "a2", novel: { table: "ADMISSIONS", column: "DISCHTIME" },
    suggested: { table: "VISIT_OCCURRENCE", column: "visit_end_datetime" }, score: 0.92,
    alternates: ["visit_end_date", "visit_start_datetime"],
    rationale: "DISCHTIME is the discharge timestamp — the definition of visit_end_datetime for inpatient visits.",
    altRationales: {
      visit_end_date: "Same event at date precision; loses the time of day.",
      visit_start_datetime: "Format matches but it is the admission side of the visit.",
    } },
  { id: "l2", novel: { table: "LABEVENTS", column: "CHARTTIME" },
    suggested: { table: "MEASUREMENT", column: "measurement_datetime" }, score: 0.91,
    alternates: ["collection_datetime", "result_datetime"],
    rationale: "CHARTTIME records when the lab was charted, matching the measurement's event timestamp; TIMESTAMP→datetime is lossless. Mild ambiguity with collection vs. result time keeps it just below the top band.",
    altRationales: {
      collection_datetime: "In MIMIC, CHARTTIME often equals specimen collection time, so this is a close semantic rival.",
      result_datetime: "A lab timestamp too, but results finalize after charting — offsets in the samples show it.",
    } },
  { id: "c2", novel: { table: "CHARTEVENTS_WIDE", column: "CHARTTIME" },
    suggested: { table: "OBSERVATION", column: "observation_datetime" }, score: 0.88,
    alternates: ["observation_source_value", "value_as_string"],
    rationale: "CHARTTIME is the bedside charting timestamp and observation_datetime is the observation's event time; formats match exactly.",
    altRationales: {
      observation_source_value: "Only a weak lexical echo — it stores the observation's source code, not a time.",
      value_as_string: "Timestamps can serialize as text, but this column is for categorical results.",
    } },
  { id: "l4", novel: { table: "LABEVENTS", column: "VALUEUOM" },
    suggested: { table: "MEASUREMENT", column: "unit_source_value" }, score: 0.86,
    alternates: ["unit_concept_id", "unit_source_concept_id"],
    rationale: "VALUEUOM is the verbatim unit string and unit_source_value is the designated verbatim-unit column; sample units (mg/dL, mEq/L) appear in both.",
    altRationales: {
      unit_concept_id: "The right destination only after vocabulary mapping — it takes concept ids, not raw strings.",
      unit_source_concept_id: "Also unit-related, but expects a mapped source concept, not the raw text.",
    } },
  { id: "a3", novel: { table: "ADMISSIONS", column: "ADMISSION_LOCATION" },
    suggested: { table: "VISIT_OCCURRENCE", column: "admitted_from_source_value" }, score: 0.81,
    alternates: ["admitted_from_concept_id", "discharge_to_source_value"],
    rationale: "ADMISSION_LOCATION names where the patient came from (e.g. EMERGENCY ROOM ADMIT), which is exactly the verbatim admitted-from column.",
    altRationales: {
      admitted_from_concept_id: "Same concept but expects a mapped id; the raw string needs vocabulary work first.",
      discharge_to_source_value: "The mirror-image field — right shape, wrong end of the visit.",
    } },
  { id: "l3", novel: { table: "LABEVENTS", column: "VALUE" },
    suggested: { table: "MEASUREMENT", column: "value_source_value" }, score: 0.78,
    alternates: ["value_as_number", "value_as_concept_id"],
    rationale: "VALUE holds the verbatim result string (including non-numerics like NEG), which is what value_source_value preserves. Tempered because numeric rows duplicate VALUENUM.",
    altRationales: {
      value_as_number: "Works for the numeric subset only; text results like NEG would be dropped.",
      value_as_concept_id: "Categorical results could map here, but it needs concepts, not raw strings.",
    } },
  { id: "l6", novel: { table: "LABEVENTS", column: "FLAG" },
    suggested: { table: "MEASUREMENT", column: "abnormal_flag_source_value" }, score: 0.64,
    alternates: ["abnormal_flag_concept_id", "value_as_concept_id"],
    rationale: "FLAG marks abnormal results just like abnormal_flag_source_value, but MIMIC only ever populates the single value 'abnormal', so the value overlap is thin.",
    altRationales: {
      abnormal_flag_concept_id: "Same meaning as a mapped concept id; needs vocabulary mapping first.",
      value_as_concept_id: "A categorical result column, but the flag qualifies the result rather than being one.",
    } },
  { id: "a4", novel: { table: "ADMISSIONS", column: "ADMISSION_TYPE" },
    suggested: { table: "VISIT_OCCURRENCE", column: "visit_concept_id" }, score: 0.63,
    alternates: ["visit_source_value", "visit_type_concept_id"],
    rationale: "Admission type values (EMERGENCY, ELECTIVE…) describe the kind of visit, but visit_concept_id expects mapped concept ids, not raw strings — hence mid confidence.",
    altRationales: {
      visit_source_value: "The verbatim landing spot for the same strings; a strong rival if no mapping happens.",
      visit_type_concept_id: "Similar name, but this field records provenance (EHR vs. claims), not admission type.",
    } },
  { id: "l5", novel: { table: "LABEVENTS", column: "ITEMID" },
    suggested: { table: "MEASUREMENT", column: "measurement_source_value" }, score: 0.58,
    alternates: ["measurement_source_concept_id", "measurement_concept_id"],
    rationale: "ITEMID is a local lab code, plausibly the verbatim source identifier — but as a coded id it may belong in a source-concept column instead, so confidence is middling.",
    altRationales: {
      measurement_source_concept_id: "If ITEMID were mapped into the vocabulary, this is where it would land.",
      measurement_concept_id: "The standard concept field — reachable only after full vocabulary mapping.",
    } },
  { id: "c3", novel: { table: "CHARTEVENTS_WIDE", column: "HEART_RATE" },
    suggested: { table: "OBSERVATION", column: "value_as_number" }, score: 0.52,
    alternates: ["value_as_string", "observation_concept_id"],
    rationale: "Heart rate is a numeric vital that would land in value_as_number — but only after this wide flowsheet is unpivoted to one row per observation, which halves the confidence.",
    altRationales: {
      value_as_string: "Numeric vitals can serialize as text, but the numeric column is the better home.",
      observation_concept_id: "The vital's identity ('heart rate') belongs here as a concept, not its value.",
    } },
  { id: "c4", novel: { table: "CHARTEVENTS_WIDE", column: "GCS_TOTAL" },
    suggested: { table: "OBSERVATION", column: "value_as_string" }, score: 0.34,
    alternates: ["value_as_number", "observation_source_value"],
    rationale: "GCS_TOTAL is an integer score; value_as_string only fits if scores are kept as text. Weak type agreement and the wide-table shape keep this low.",
    altRationales: {
      value_as_number: "Type-wise the stronger home for an integer score — arguably should have been the suggestion.",
      observation_source_value: "Could hold the raw charted token, but it is meant for the observation's code.",
    } },
  { id: "a5", novel: { table: "ADMISSIONS", column: "INSURANCE" },
    suggested: { table: "VISIT_OCCURRENCE", column: "visit_source_value" }, score: 0.27,
    alternates: ["admitted_from_source_value", "visit_source_concept_id"],
    rationale: "Both are strings, but INSURANCE is payer data while visit_source_value describes the kind of visit; the lexical overlap is coincidental.",
    altRationales: {
      admitted_from_source_value: "Another verbatim visit field, equally unrelated to payer information.",
      visit_source_concept_id: "Name-similar only; a mapped concept id has no room for raw payer strings.",
    } },
  { id: "a6", novel: { table: "ADMISSIONS", column: "SUBJECT_ID" },
    suggested: { table: "PERSON", column: "person_id" }, score: 0.95,
    alternates: ["person_source_value", "location_id"],
    rationale: "SUBJECT_ID is the MIMIC patient identifier carried on every admission; person_id is OMOP's person key, with identical integer id profiles.",
    altRationales: {
      person_source_value: "Source ids often land here verbatim, but the keyed person_id is the primary home.",
      location_id: "An id column too, but it references the person's address, not the person.",
    } },
  { id: "a7", novel: { table: "ADMISSIONS", column: "ETHNICITY" },
    suggested: { table: "PERSON", column: "ethnicity_source_value" }, score: 0.83,
    alternates: ["ethnicity_concept_id", "race_source_value"],
    rationale: "ETHNICITY holds the verbatim demographic string (WHITE, HISPANIC OR LATINO…), matching the verbatim ethnicity column on PERSON.",
    altRationales: {
      ethnicity_concept_id: "The mapped destination — needs OMB Hispanic/Not-Hispanic vocabulary work first.",
      race_source_value: "MIMIC's ETHNICITY mixes race and ethnicity, so the race column is a genuine rival.",
    } },
  { id: "a8", novel: { table: "ADMISSIONS", column: "MARITAL_STATUS" },
    suggested: { table: "PERSON", column: "ethnicity_concept_id" }, score: 0.24,
    alternates: ["ethnicity_source_value", "race_concept_id"],
    rationale: "Marital status is not ethnicity — the matcher only latched onto the shared demographic context, so the suggestion is weak.",
    altRationales: {
      ethnicity_source_value: "Same weak demographic association, just the verbatim variant.",
      race_concept_id: "Another demographic concept column with no marital-status semantics.",
    } },
  { id: "a9", novel: { table: "ADMISSIONS", column: "LANGUAGE" },
    suggested: { table: "PERSON", column: "person_source_value" }, score: 0.31,
    alternates: ["gender_source_value", "race_source_value"],
    rationale: "LANGUAGE is a demographic string but OMOP PERSON has no language field; the matcher fell back to a generic source-value column.",
    altRationales: {
      gender_source_value: "A verbatim demographic column, but for sex — not language.",
      race_source_value: "Verbatim demographic again; language doesn't belong here either.",
    } },
];

/* ---------- Generated scores & rationales for non-pairing cells ----------
 * Deterministic (hashed) so every render and reload shows the same matrix. */

const TYPE_GROUPS = [
  ["INTEGER", "DOUBLE", "integer", "bigint", "float", "numeric"],
  ["TIMESTAMP", "datetime", "date"],
  ["VARCHAR", "STRING", "varchar", "text"],
];

const typeGroup = (t) => TYPE_GROUPS.findIndex((g) => g.some((x) => t.startsWith(x)));

const typesCompatible = (a, b) => {
  const ga = typeGroup(a), gb = typeGroup(b);
  return ga !== -1 && ga === gb;
};

const tokens = (name) =>
  name.toLowerCase().split(/[_\s]+/).filter((t) => t.length > 1);

const sharedTokens = (a, b) => {
  const tb = new Set(tokens(b));
  return tokens(a).filter((t) => tb.has(t) || [...tb].some((x) => x.includes(t) || t.includes(x)));
};

function hash(s) {
  let h = 2166136261;
  for (const c of s) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619) >>> 0; }
  return h;
}

const pairingFor = (novelTable, novelCol) =>
  PAIRINGS.find((p) => p.novel.table === novelTable && p.novel.column === novelCol);

const novelDef = (p) =>
  NOVEL_TABLES[p.novel.table].columns.find((c) => c.name === p.novel.column);

const canonDef = (table, col) =>
  CANONICAL_TABLES[table].columns.find((c) => c.name === col);

/* Score for any cell. Pairing rows: suggested and runner-up scores are
 * authored; the rest of the row stays visibly below them. */
function cellScore(novelTable, novelCol, canonTable, canonCol) {
  const p = pairingFor(novelTable, novelCol);
  if (p && p.suggested.table === canonTable) {
    if (canonCol === p.suggested.column) return p.score;
    const alt = p.alternates.indexOf(canonCol);
    if (alt === 0) return Math.round(p.score * 86) / 100;
    if (alt === 1) return Math.round(p.score * 74) / 100;
  }
  const nDef = NOVEL_TABLES[novelTable].columns.find((c) => c.name === novelCol);
  const cDef = canonDef(canonTable, canonCol);
  let s = 0.03 + (hash(`${novelTable}.${novelCol}|${canonTable}.${canonCol}`) % 1000) / 1000 * 0.18;
  if (typesCompatible(nDef.type, cDef.type)) s += 0.1;
  s += Math.min(2, sharedTokens(novelCol, canonCol).length) * 0.09;
  if (p && p.suggested.table === canonTable) s = Math.min(s, p.score * 0.6);
  return Math.round(Math.min(0.55, s) * 100) / 100;
}

function cellRationale(novelTable, novelCol, canonTable, canonCol, score) {
  const nDef = NOVEL_TABLES[novelTable].columns.find((c) => c.name === novelCol);
  const cDef = canonDef(canonTable, canonCol);
  const compat = typesCompatible(nDef.type, cDef.type);
  const shared = sharedTokens(novelCol, canonCol);
  const typeNote = compat
    ? `types are compatible (${nDef.type}↔${cDef.type})`
    : `types disagree (${nDef.type} vs. ${cDef.type})`;

  // Hand-written rationales win; generated pairings fall back to templates.
  const p = pairingFor(novelTable, novelCol);
  if (p && p.suggested.table === canonTable) {
    if (canonCol === p.suggested.column) {
      if (p.rationale) return p.rationale;
      return `The matcher's top pick for ${novelCol}: ${shared.length ? `names align on “${shared[0]}” and ` : ""}${typeNote}. The score reflects combined name, type, and value-profile agreement.`;
    }
    if (p.alternates.includes(canonCol)) {
      if (p.altRationales && p.altRationales[canonCol]) return p.altRationales[canonCol];
      return `Runner-up candidate for ${novelCol}: ${typeNote}, but the matcher's top pick fits the column's semantics better.`;
    }
  }
  if (score < 0.15) {
    return `No meaningful lexical or semantic signal between these columns, and ${typeNote}.`;
  }
  if (shared.length) {
    return `Partial name overlap on “${shared[0]}” and ${typeNote}. The matcher still ranks other candidates in this row well above it.`;
  }
  return `Weak signal: ${typeNote}, but the column meanings don't line up. Likely coincidental similarity.`;
}

/* ---------- 30×30 stress pair: PRESCRIPTIONS → DRUG_EXPOSURE ----------
 * Every incoming column is under review, so the pairings are generated from
 * this compact mapping spec (column, suggested target, score). Runner-ups
 * are auto-picked by the same name/type heuristics the matrix uses, and
 * rationales fall back to the generated text. */

function autoAlternates(novelTable, novelCol, canonTable, sugCol) {
  const nDef = NOVEL_TABLES[novelTable].columns.find((c) => c.name === novelCol);
  return CANONICAL_TABLES[canonTable].columns
    .filter((c) => c.name !== sugCol)
    .map((c) => ({
      name: c.name,
      s: (typesCompatible(nDef.type, c.type) ? 0.1 : 0)
        + sharedTokens(novelCol, c.name).length * 0.09
        + (hash(`${novelCol}|${c.name}`) % 100) / 1000,
    }))
    .sort((a, b) => b.s - a.s)
    .slice(0, 2)
    .map((c) => c.name);
}

const WIDE_SPEC = [
  ["ROW_ID", "drug_exposure_id", 0.55],
  ["SUBJECT_ID", "person_id", 0.96],
  ["HADM_ID", "visit_occurrence_id", 0.90],
  ["ICUSTAY_ID", "visit_detail_id", 0.82],
  ["STARTDATE", "drug_exposure_start_date", 0.93],
  ["ENDDATE", "drug_exposure_end_date", 0.92],
  ["DRUG_TYPE", "drug_type_concept_id", 0.48],
  ["DRUG", "drug_source_value", 0.88],
  ["DRUG_NAME_POE", "drug_source_value", 0.62],
  ["DRUG_NAME_GENERIC", "drug_source_value", 0.58],
  ["FORMULARY_DRUG_CD", "drug_source_concept_id", 0.61],
  ["GSN", "drug_source_concept_id", 0.57],
  ["NDC", "drug_source_concept_id", 0.74],
  ["PROD_STRENGTH", "strength_source_value", 0.79],
  ["DOSE_VAL_RX", "quantity", 0.66],
  ["DOSE_UNIT_RX", "dose_unit_source_value", 0.89],
  ["FORM_VAL_DISP", "form_source_value", 0.71],
  ["FORM_UNIT_DISP", "form_source_value", 0.44],
  ["ROUTE", "route_source_value", 0.91],
  ["FREQUENCY", "frequency_source_value", 0.87],
  ["PRN_FLAG", "prn_flag", 0.85],
  ["DURATION", "days_supply", 0.59],
  ["DURATION_UNIT", "days_supply", 0.31],
  ["ORDER_TIME", "order_datetime", 0.84],
  ["DISCONTINUE_TIME", "drug_exposure_end_datetime", 0.68],
  ["PHARMACIST_ID", "pharmacy_id", 0.52],
  ["ORDER_PROVIDER_ID", "provider_id", 0.78],
  ["TOTAL_DOSES", "quantity", 0.49],
  ["REFILLS_ALLOWED", "refills", 0.95],
  ["INFUSION_RATE", "sig", 0.28],
];

for (const [novelCol, sugCol, score] of WIDE_SPEC) {
  PAIRINGS.push({
    id: `d-${novelCol.toLowerCase()}`,
    novel: { table: "PRESCRIPTIONS", column: novelCol },
    suggested: { table: "DRUG_EXPOSURE", column: sugCol },
    score,
    alternates: autoAlternates("PRESCRIPTIONS", novelCol, "DRUG_EXPOSURE", sugCol),
  });
}

/* ---------- State ---------- */

const store = loadStore();

const state = {
  verdicts: store.graderVerdicts || {},       // pairingId -> { verdict, message, payload }
  finalDecisions: store.finalDecisions || {}, // admin decisions: lock pairings here
  drafts: {},                                 // pairingId -> popup form state
  activePair: null,                           // key of the displayed table pairing
  activeId: null,                             // pairing of the selected square
  cell: null,                                 // { novel, canon } selected heatmap square
  selected: new Set(),                        // pairing ids checked for bulk
};

/* Undo/redo history, driven from the queue-header buttons. Each action holds
 * per-pairing before/after verdicts. */
const history = { undo: [], redo: [] };

const modal = {
  open: false,
  mode: "single",  // "single" | "bulk"
  id: null,
  ids: [],
  chosenColumn: null,
};

function persistVerdicts() {
  saveStore({ graderVerdicts: state.verdicts });
}

/* ---------- Helpers ---------- */

const $ = (id) => document.getElementById(id);

const verdictOf = (key) => CONFIG.verdicts.find((v) => v.key === key);

const pairName = (p) => `${p.novel.table}.${p.novel.column}`;

const pct = (score) => `${Math.round(score * 100)}%`;


const isBulk = () => state.selected.size >= 2;

const isFinalized = (id) => !!state.finalDecisions[id];

/* Badge tint: lift low scores so the % stays legible on both themes. */
const badgeColor = (score) => heatColor(0.3 + 0.7 * score);

/* Table pairings: a novel table can pair into several canonical tables
 * (e.g. ADMISSIONS → VISIT_OCCURRENCE and ADMISSIONS → PERSON), so pairs
 * are keyed by both sides and sorted by average confidence. */
const pairKey = (novel, canon) => `${novel} → ${canon}`;

const tablePairings = (novel, canon) =>
  PAIRINGS.filter((p) => p.novel.table === novel && p.suggested.table === canon)
    .sort((a, b) => b.score - a.score);

const avgScore = (pairings) =>
  pairings.reduce((s, p) => s + p.score, 0) / pairings.length;

const tablePairs = () => {
  const pairs = [];
  for (const p of PAIRINGS) {
    const key = pairKey(p.novel.table, p.suggested.table);
    if (!pairs.some((t) => t.key === key)) {
      pairs.push({
        key,
        novel: p.novel.table,
        canon: p.suggested.table,
        pairings: tablePairings(p.novel.table, p.suggested.table),
      });
    }
  }
  return pairs.sort((a, b) => avgScore(b.pairings) - avgScore(a.pairings));
};

function activeTablePair() {
  if (!state.activePair) return null;
  return tablePairs().find((t) => t.key === state.activePair) || null;
}

/* Decided pairings drop out of the heatmap (their rows come back via undo). */
const visiblePairings = (tp) =>
  tp.pairings.filter((p) => !state.verdicts[p.id] && !isFinalized(p.id));

/* Where a decided pairing landed, if it maps anywhere. */
function decidedTarget(p) {
  const d = state.finalDecisions[p.id] || state.verdicts[p.id];
  if (!d) return null;
  if (d.verdict === "accept") return p.suggested.column;
  if (d.verdict === "reassign" && d.payload) return d.payload.column;
  return null;
}

/* A decided pairing's canonical column disappears too — unless a still-open
 * row in this heatmap suggests the same column. */
function hiddenCanonCols(tp, visibleRows) {
  const stillSuggested = new Set(visibleRows.map((p) => p.suggested.column));
  const hidden = new Set();
  for (const p of tp.pairings) {
    const target = decidedTarget(p);
    if (target && !stillSuggested.has(target)) hidden.add(target);
  }
  return hidden;
}

/* ---------- Sidebar rendering ---------- */

function renderQueue() {
  const list = $("queue-list");
  list.innerHTML = "";
  $("queue-title").textContent = "Table pairings";
  const pairs = tablePairs();
  $("queue-count").textContent = pairs.length;
  for (const tp of pairs) list.appendChild(tablePairRow(tp));

  const done = Object.keys(state.verdicts).length;
  renderProgress(done, PAIRINGS.length);
}

function tablePairRow(tp) {
  const li = document.createElement("li");
  li.className = "queue-item";
  if (tp.key === state.activePair) li.classList.add("active");
  const reviewed = tp.pairings.filter((p) => state.verdicts[p.id]).length;
  const finalized = tp.pairings.filter((p) => isFinalized(p.id)).length;
  if (reviewed === tp.pairings.length) li.classList.add("done");

  const info = document.createElement("div");
  info.className = "pair-info";
  info.innerHTML = `
    <div class="pair-name">${tp.novel} → ${tp.canon}</div>
    <div class="pair-target">${tp.pairings.length} column pairing${tp.pairings.length === 1 ? "" : "s"} · ${reviewed} reviewed${finalized ? ` · ${finalized} 🔒` : ""}</div>`;

  const meta = document.createElement("div");
  meta.className = "pair-meta";
  const c = badgeColor(avgScore(tp.pairings));
  meta.innerHTML = `<span class="pct-badge" style="color:${c};border-color:${c}" title="Average confidence">${pct(avgScore(tp.pairings))}</span>`;

  li.append(info, meta);
  li.addEventListener("click", () => selectTablePair(tp.key));
  return li;
}

/* Selecting a table pairing shows its heatmap without auto-opening any
 * column pairing. */
function selectTablePair(key) {
  state.activePair = key;
  state.cell = null;
  state.activeId = null;
  renderQueue();
  renderDetail();
}

function renderProgress(done, total) {
  const p = total ? Math.round((done / total) * 100) : 0;
  $("grader-progress").innerHTML = `
    <span>Reviewed ${done}/${total}</span>
    <div class="bar"><div class="bar-fill" style="width:${p}%"></div></div>`;
}

/* ---------- Bulk bar ---------- */

function syncBulkBar() {
  const bulk = isBulk();
  $("bulk-bar").classList.toggle("hidden", !bulk);
  if (bulk) {
    $("bulk-count").textContent = state.selected.size;
    $("bulk-continue-btn").textContent = `Continue with ${state.selected.size} pairings`;
  }
  $("bulk-hint").textContent = bulk ? `${state.selected.size} selected` : "";
}

/* ---------- Detail panel: heatmap ---------- */

function renderDetail() {
  const panel = $("detail-panel");
  const tp = activeTablePair();
  if (!tp) {
    panel.innerHTML = `<div class="empty-detail">Select a table pairing from the queue to review it.</div>`;
    delete panel.dataset.pair;
    return;
  }

  const prevWrap = $("hm-wrap");
  const keepScroll = prevWrap && panel.dataset.pair === tp.key
    ? { l: prevWrap.scrollLeft, t: prevWrap.scrollTop }
    : null;
  panel.dataset.pair = tp.key;

  panel.innerHTML = `
    <div class="detail-header">
      <div class="detail-title">Confidence map — <span class="mono">${tp.novel}</span> × <span class="mono">${tp.canon}</span></div>
      <div class="hm-legend">
        <span>0</span>
        <span class="bar" style="background:linear-gradient(to right, ${heatColor(0)}, ${heatColor(1)})"></span>
        <span>1</span>
      </div>
    </div>
    <div class="diagram-hint">${NOVEL_TABLES[tp.novel].desc} → ${CANONICAL_TABLES[tp.canon].desc}<br>
    Rows are the incoming columns still open for review (decided rows drop out; ↺ brings them back). Click a square to expand it; Continue (or Enter) opens the review popup — on a non-suggested square it preloads a Reassign. Check rows (or the top-left box) to bulk accept/reject.</div>
    <div id="hm-slot"></div>
    <div class="hm-card hidden" id="hm-card"></div>`;

  // Cap the scroll box at the space left under the header/hint so the sticky
  // axis labels always stay in view.
  const slot = $("hm-slot");
  const availH = panel.getBoundingClientRect().bottom - slot.getBoundingClientRect().top - 24;
  slot.outerHTML = heatmapHtml(tp, availH);

  // Re-renders of the same table pairing keep the grid's scroll position.
  const wrapEl = $("hm-wrap");
  if (wrapEl && keepScroll) {
    wrapEl.scrollLeft = keepScroll.l;
    wrapEl.scrollTop = keepScroll.t;
  }

  wireHeatmap(tp);
  renderCellCard(tp);
}

function heatmapHtml(tp, availH) {
  const rows = visiblePairings(tp);
  if (!rows.length) {
    return `<div class="hm-empty">Every incoming column in this table pairing has been decided. Undo (↺) brings rows back.</div>`;
  }
  const hidden = hiddenCanonCols(tp, rows);
  const canonCols = CANONICAL_TABLES[tp.canon].columns.filter((c) => !hidden.has(c.name));

  // Square cells: width fits the panel, height mirrors it, and squares never
  // shrink below MIN_CELL — wide tables scroll instead, with sticky labels.
  const MIN_CELL = 28;
  const panelW = $("detail-panel").clientWidth - 48;
  const labelW = 170;
  const cell = Math.max(MIN_CELL, Math.floor((panelW - labelW) / canonCols.length));

  let html = `<div class="hm-wrap" id="hm-wrap" style="max-height:${Math.max(200, availH)}px">
    <div class="hm-grid" style="grid-template-columns:${labelW}px repeat(${canonCols.length}, ${cell}px)">`;

  const anySelected = state.selected.size > 0;
  const allChecked = rows.length > 0 && rows.every((p) => state.selected.has(p.id));
  html += `<div class="hm-corner" title="${anySelected ? "Clear the selection" : "Select every incoming column in this table"}">
    <input type="checkbox" class="hm-check" id="hm-select-all" ${allChecked ? "checked" : ""}>
    <span>all</span>
  </div>`;
  for (const c of canonCols) {
    const sug = rows.some((p) => p.suggested.column === c.name);
    html += `<div class="hm-collabel ${sug ? "sug" : ""}" title="${c.name} (${c.type})">${c.name}</div>`;
  }

  for (const p of rows) {
    const n = novelDef(p);
    const rowCls = [
      "hm-rowlabel",
      p.id === state.activeId ? "active-row" : "",
    ].join(" ");
    html += `<div class="${rowCls}" style="height:${cell}px" title="${n.name} (${n.type})">
      <input type="checkbox" class="hm-check hm-row-check" data-pid="${p.id}"
        ${state.selected.has(p.id) ? "checked" : ""}>
      <span class="hm-rowname">${n.name}</span>
    </div>`;
    for (const c of canonCols) {
      const s = cellScore(tp.novel, n.name, tp.canon, c.name);
      const isSug = p.suggested.column === c.name;
      const isSel = state.cell && state.cell.novel === n.name && state.cell.canon === c.name;
      html += `<div class="hm-cell ${isSug ? "sug" : ""} ${isSel ? "sel" : ""}"
        style="background:${heatColor(s)};width:${cell}px;height:${cell}px"
        data-novel="${n.name}" data-canon="${c.name}"
        title="${n.name} → ${c.name}: ${pct(s)}"></div>`;
    }
  }

  html += `</div></div>`;
  return html;
}

function wireHeatmap(tp) {
  const wrap = $("hm-wrap");
  if (!wrap) return;
  wrap.querySelectorAll(".hm-cell").forEach((el) =>
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      selectCell(tp, el.dataset.novel, el.dataset.canon);
    })
  );

  wrap.querySelectorAll(".hm-row-check").forEach((cb) =>
    cb.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleSelect(cb.dataset.pid, cb.checked);
    })
  );

  const all = $("hm-select-all");
  if (all) {
    all.indeterminate = !all.checked && state.selected.size > 0;
    all.addEventListener("click", (e) => {
      e.stopPropagation();
      // Anything selected → the button clears everything; otherwise it
      // selects every visible row of this heatmap.
      if (state.selected.size) {
        state.selected.clear();
      } else {
        for (const p of visiblePairings(tp)) state.selected.add(p.id);
      }
      renderDetail();
      syncBulkBar();
    });
  }

  // Keep the floating card glued to its square while the grid scrolls.
  wrap.addEventListener("scroll", positionCellCard);
}

function selectCell(tp, novel, canon) {
  state.cell = { novel, canon };
  const rp = pairingFor(tp.novel, novel);
  state.activeId = rp ? rp.id : null;
  renderDetail();
}

/* Floating expansion card, anchored at the selected square. It lives at the
 * panel level so it is never clipped by the heatmap's scroll box. */
function renderCellCard(tp) {
  const card = $("hm-card");
  const wrap = $("hm-wrap");
  if (!card) return;
  if (!wrap || !state.cell) { card.classList.add("hidden"); return; }

  const cellEl = wrap.querySelector(
    `.hm-cell[data-novel="${CSS.escape(state.cell.novel)}"][data-canon="${CSS.escape(state.cell.canon)}"]`
  );
  if (!cellEl) { state.cell = null; card.classList.add("hidden"); return; }

  const nDef = NOVEL_TABLES[tp.novel].columns.find((c) => c.name === state.cell.novel);
  const cDef = canonDef(tp.canon, state.cell.canon);
  const score = cellScore(tp.novel, nDef.name, tp.canon, cDef.name);
  const rationale = cellRationale(tp.novel, nDef.name, tp.canon, cDef.name, score);
  const rp = pairingFor(tp.novel, nDef.name);
  const isSuggested = rp && rp.suggested.column === cDef.name;
  const actionable = rp && !isFinalized(rp.id);

  const samplesHtml = (samples) =>
    `<ul class="hm-samples">${samples.map((s) => `<li>${s === "" ? "&nbsp;" : s}</li>`).join("")}</ul>`;

  card.innerHTML = `
    <div class="hm-card-head">
      <span class="hm-score" style="color:${badgeColor(score)}">${pct(score)}</span>
      <div class="hm-card-chips">
        ${isSuggested ? '<span class="suggest-chip">★ suggested</span>' : ""}
        ${rp && !isSuggested && rp.alternates.includes(cDef.name) ? '<span class="suggest-chip alt">Suggested Match</span>' : ""}
      </div>
      <button class="hm-card-close" id="hm-card-close" title="Close">✕</button>
    </div>
    <div class="hm-card-cols">
      <div class="hm-card-col">
        <h4>Incoming — ${tp.novel}</h4>
        <div class="mini-col-name">${nDef.name}</div>
        <span class="mini-col-type">${nDef.type}</span>
        <div class="mini-col-desc">${nDef.desc}</div>
        ${samplesHtml(nDef.samples)}
      </div>
      <div class="hm-card-col">
        <h4>Canonical — ${tp.canon}</h4>
        <div class="mini-col-name">${cDef.name}</div>
        <span class="mini-col-type">${cDef.type}</span>
        <div class="mini-col-desc">${cDef.desc}</div>
        ${samplesHtml(cDef.samples)}
      </div>
    </div>
    <div class="hm-rationale">${rationale}</div>
    ${actionable ? `<button type="button" class="continue-btn" id="hm-continue">Continue${isSuggested ? "" : " — reassign here"}</button>` : ""}`;

  card.classList.remove("hidden");
  positionCellCard();

  $("hm-card-close").addEventListener("click", (e) => {
    e.stopPropagation();
    closeCellCard();
  });
  const cont = $("hm-continue");
  if (cont) cont.addEventListener("click", () => openFromCell());
}

/* Prefer opening right of and below the square; flip left/up when that would
 * push the card past the visible panel (so the square sits at the card's
 * bottom-right instead of its top-left). */
function positionCellCard() {
  const panel = $("detail-panel");
  const card = $("hm-card");
  const wrap = $("hm-wrap");
  if (!card || card.classList.contains("hidden") || !wrap || !state.cell) return;
  const cellEl = wrap.querySelector(
    `.hm-cell[data-novel="${CSS.escape(state.cell.novel)}"][data-canon="${CSS.escape(state.cell.canon)}"]`
  );
  if (!cellEl) return;

  const pRect = panel.getBoundingClientRect();
  const cRect = cellEl.getBoundingClientRect();
  const cw = card.offsetWidth, ch = card.offsetHeight;
  const cellLeft = cRect.left - pRect.left;
  const cellTop = cRect.top - pRect.top + panel.scrollTop;

  let left = cellLeft + cRect.width + 12;
  if (left + cw > panel.clientWidth - 8) left = cellLeft - cw - 12;
  left = Math.max(8, Math.min(left, panel.clientWidth - cw - 8));

  let top = cellTop - 10;
  if (cRect.top - pRect.top + ch - 10 > panel.clientHeight - 8) {
    top = cellTop + cRect.height + 10 - ch;   // flip up: square at bottom-right
  }
  top = Math.max(panel.scrollTop + 8,
    Math.min(top, panel.scrollTop + panel.clientHeight - ch - 8));

  card.style.left = `${left}px`;
  card.style.top = `${top}px`;
}

function closeCellCard() {
  state.cell = null;
  renderDetail();
}

/* Continue semantics: suggested square opens the popup normally; any other
 * square preloads Reassign to that column. */
function openFromCell() {
  const tp = activeTablePair();
  if (!tp || !state.cell) return;
  const rp = pairingFor(tp.novel, state.cell.novel);
  if (!rp || isFinalized(rp.id)) return;
  if (state.cell.canon !== rp.suggested.column) {
    openActionModal(rp.id, { reassignTo: state.cell.canon });
  } else {
    openActionModal(rp.id);
  }
}

window.addEventListener("resize", () => renderDetail());

/* ---------- Selection / navigation ---------- */

function toggleSelect(id, checked) {
  if (checked) state.selected.add(id);
  else state.selected.delete(id);
  renderDetail();
  syncBulkBar();
}

/* After a submit: stay on the current table pairing while it has open
 * pairings, otherwise move to the next one with work left. Never auto-open
 * a square. */
function autoAdvance() {
  state.cell = null;
  state.activeId = null;
  const open = (tp) => visiblePairings(tp).length > 0;
  const cur = activeTablePair();
  if (!cur || !open(cur)) {
    const next = tablePairs().find(open);
    if (next) state.activePair = next.key;
  }
  renderQueue();
  renderDetail();
  syncBulkBar();
}

/* ---------- Action popup: form state ---------- */

function defaultFormState() {
  return {
    verdict: "accept",
    message: "",
    reassignColumn: null,
    expandKind: "table",
    expandTableName: "",
    expandTargetTable: Object.keys(CANONICAL_SCHEMA)[0],
    expandReason: "",
    expandColumns: [{ name: "", type: CONFIG.postgresTypes[0] }],
  };
}

function verdictToFormState(v) {
  if (!v) return null;
  const s = defaultFormState();
  s.verdict = v.verdict;
  s.message = v.message || "";
  if (v.verdict === "reassign" && v.payload) {
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

function readFormState() {
  return {
    verdict: $("verdict-select").value,
    message: $("verdict-message").value,
    reassignColumn: modal.chosenColumn,
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
  modal.chosenColumn = s.reassignColumn;
  document.querySelector(`input[name="expand-kind"][value="${s.expandKind}"]`).checked = true;
  $("expand-table-name").value = s.expandTableName;
  $("expand-target-table").value = s.expandTargetTable;
  $("expand-reason").value = s.expandReason;
  renderExpandColumns(s.expandColumns);
}

function populateVerdictSelect(bulk) {
  const opts = bulk ? CONFIG.verdicts.filter((v) => v.bulk) : CONFIG.verdicts;
  $("verdict-select").innerHTML = opts
    .map((v) => `<option value="${v.key}">${v.label}</option>`)
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

/* ---------- Action popup: open / close / sections ---------- */

function openActionModal(id, preset) {
  if (isFinalized(id)) return;
  modal.open = true;
  modal.mode = "single";
  modal.id = id;
  modal.ids = [];

  state.activeId = id;

  const p = PAIRINGS.find((x) => x.id === id);
  $("action-title").textContent = pairName(p);
  populateVerdictSelect(false);
  if (preset && preset.reassignTo) {
    // Heatmap cell picked a non-suggested column: land straight on Reassign.
    applyFormState({ ...defaultFormState(), verdict: "reassign", reassignColumn: preset.reassignTo });
  } else {
    applyFormState(state.drafts[id] || verdictToFormState(state.verdicts[id]));
  }
  $("bulk-list-wrap").classList.add("hidden");

  $("action-modal").classList.remove("hidden");
  syncModalSections();
}

function openBulkModal() {
  if (!isBulk()) return;
  modal.open = true;
  modal.mode = "bulk";
  modal.id = null;
  modal.ids = [...state.selected].filter((id) => !isFinalized(id));
  modal.chosenColumn = null;

  $("action-title").textContent = `Bulk action — ${modal.ids.length} pairings`;
  populateVerdictSelect(true);
  $("verdict-select").value = "accept";
  $("bulk-text").textContent = `The decision applies to all ${modal.ids.length} selected pairings:`;
  $("bulk-list").innerHTML = modal.ids
    .map((id) => `<li>${pairName(PAIRINGS.find((p) => p.id === id))}</li>`)
    .join("");
  $("bulk-list-wrap").classList.remove("hidden");

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

  $("expand-form").classList.toggle("hidden", bulk || verdict !== "expand");
  const kind = document.querySelector('input[name="expand-kind"]:checked').value;
  $("expand-table-fields").classList.toggle("hidden", kind !== "table");
  $("expand-column-fields").classList.toggle("hidden", kind !== "column");

  const msg = $("verdict-message");
  msg.classList.toggle("hidden", bulk || verdict === "expand");
  msg.placeholder = verdict === "assignNone"
    ? "Reason (required)"
    : "Message (optional)";

  $("action-error").classList.add("hidden");
}

/* ---------- Action popup: reassign picker ----------
 * Full canonical table, ordered suggested → runner-ups → alphabetical.
 * Reassigns stay within the suggested table (spec). */

function reassignChips(p, colName) {
  if (colName === p.suggested.column) return ' <span class="suggest-chip">★ suggested</span>';
  if (p.alternates.includes(colName)) return ' <span class="suggest-chip alt">Suggested Match</span>';
  return "";
}

function reassignColumns(p) {
  const priority = (name) =>
    name === p.suggested.column ? 0
      : p.alternates.includes(name) ? 1 + p.alternates.indexOf(name)
      : 3;
  return [...CANONICAL_TABLES[p.suggested.table].columns].sort(
    (a, b) => priority(a.name) - priority(b.name) || a.name.localeCompare(b.name)
  );
}

function renderReassignArea() {
  const p = PAIRINGS.find((x) => x.id === modal.id);
  const area = $("reassign-area");
  if (!p) { area.innerHTML = ""; return; }
  const nDef = novelDef(p);
  const rows = reassignColumns(p).map((c) => {
    const isSuggested = c.name === p.suggested.column;
    const chosen = c.name === modal.chosenColumn;
    return `
      <tr class="canon-row ${isSuggested ? "suggested-row" : "pickable"} ${chosen ? "chosen" : ""}" data-col="${c.name}"
          title="${isSuggested ? "Current suggested match" : "Click to reassign to this column"}">
        <td class="canon-name">${c.name}${reassignChips(p, c.name)}${chosen ? ' <span class="chosen-chip">✓ new target</span>' : ""}</td>
        <td class="canon-type">${c.type}</td>
        <td class="canon-desc">${c.desc}</td>
      </tr>`;
  }).join("");

  area.innerHTML = `
    <div class="subform">
      <label class="field-label">Reassign within ${p.suggested.table}</label>
      <div class="reassign-novel">
        <span class="mini-col-name">${p.novel.table}.${p.novel.column}</span>
        <span class="mini-col-type">${nDef.type}</span>
        <div class="mini-col-desc">${nDef.desc}</div>
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
      renderReassignArea();
    })
  );
}

/* ---------- Action popup: submitting ---------- */

function showModalError(text) {
  const el = $("action-error");
  el.textContent = text;
  el.classList.remove("hidden");
}

function validateSingle(form) {
  if (form.verdict === "assignNone" && !form.message.trim()) {
    return "Assign None requires a reason.";
  }
  if (form.verdict === "reassign" && !form.reassignColumn) {
    return "Select a column to reassign to.";
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

function buildVerdict(form, p) {
  const v = { verdict: form.verdict, message: form.message.trim(), payload: null };
  if (form.verdict === "reassign") {
    v.payload = { table: p.suggested.table, column: form.reassignColumn };
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

function submitAction() {
  if (!modal.open) return;
  if (modal.mode === "bulk") { submitBulk(); return; }

  const form = readFormState();
  const err = validateSingle(form);
  if (err) { showModalError(err); return; }

  const id = modal.id;
  if (isFinalized(id)) {
    showModalError("This pairing was finalized by the admin while the popup was open.");
    return;
  }
  const p = PAIRINGS.find((x) => x.id === id);

  const next = buildVerdict(form, p);
  pushHistory([{ id, prev: state.verdicts[id] ? { ...state.verdicts[id] } : null, next }]);
  state.verdicts[id] = next;
  delete state.drafts[id];
  persistVerdicts();

  closeActionModal(false);
  autoAdvance();
}

function submitBulk() {
  const verdict = $("verdict-select").value;
  const ids = modal.ids;

  const next = { verdict, message: "", payload: null };
  pushHistory(ids.map((id) => ({
    id,
    prev: state.verdicts[id] ? { ...state.verdicts[id] } : null,
    next,
  })));
  for (const id of ids) {
    state.verdicts[id] = next;
    delete state.drafts[id];
  }
  state.selected.clear();
  persistVerdicts();

  closeActionModal(false);
  autoAdvance();
}

/* ---------- Undo / redo (queue-header buttons) ---------- */

function pushHistory(entries) {
  history.undo.push({ entries });
  history.redo.length = 0;
  syncHistoryButtons();
}

function applyHistory(action, dir) {
  for (const en of action.entries) {
    const v = dir === "undo" ? en.prev : en.next;
    if (v) state.verdicts[en.id] = v;
    else delete state.verdicts[en.id];
  }
  persistVerdicts();
  // Jump to the affected table pairing so the restored rows are visible.
  const p = PAIRINGS.find((x) => x.id === action.entries[0].id);
  if (p) state.activePair = pairKey(p.novel.table, p.suggested.table);
  state.cell = null;
  state.activeId = null;
  renderQueue();
  renderDetail();
  syncBulkBar();
  syncHistoryButtons();
}

function undoLast() {
  const a = history.undo.pop();
  if (!a) return;
  history.redo.push(a);
  applyHistory(a, "undo");
}

function redoLast() {
  const a = history.redo.pop();
  if (!a) return;
  history.undo.push(a);
  applyHistory(a, "redo");
}

function syncHistoryButtons() {
  $("undo-btn").disabled = !history.undo.length;
  $("redo-btn").disabled = !history.redo.length;
}

/* ---------- Keyboard shortcuts ----------
 * Enter opens the popup for the selected square's pairing (or the bulk
 * popup) and submits it once open; a non-suggested square preloads Reassign,
 * mirroring the card's Continue. ArrowDown inside the popup expands the
 * verdict dropdown (native picker handles navigation + Enter-select).
 * Message boxes keep Enter-for-newline. */

function otherModalOpen() {
  return !$("schedule-modal").classList.contains("hidden");
}

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    if (modal.open) {
      e.preventDefault();
      closeActionModal(true);
    } else if (state.cell && !otherModalOpen()) {
      closeCellCard();
    }
    return;
  }
  if (e.key === "ArrowDown" && modal.open) {
    const tag = e.target.tagName;
    if (tag === "TEXTAREA" || tag === "INPUT") return;    // caret movement
    const sel = $("verdict-select");
    sel.focus();
    if (sel.showPicker) {
      e.preventDefault();
      try { sel.showPicker(); } catch { /* already open or not allowed */ }
    }
    return;
  }
  if (e.key !== "Enter") return;

  if (modal.open) {
    if (e.target.tagName === "TEXTAREA") return;          // newline
    if (e.target.id === "action-cancel") return;          // keyboard cancel
    e.preventDefault();
    submitAction();
    return;
  }

  if (otherModalOpen()) return;
  const tag = e.target.tagName;
  if (["INPUT", "TEXTAREA", "SELECT", "BUTTON", "A"].includes(tag)) return;

  if (isBulk()) { openBulkModal(); return; }
  if (state.cell) openFromCell();
});

/* Clicking anywhere outside the expansion card (and off the grid squares)
 * closes it, matching the ✕ and Escape. */
document.addEventListener("click", (e) => {
  if (modal.open || !state.cell) return;
  if (e.target.closest("#hm-card") || e.target.closest(".hm-cell")) return;
  closeCellCard();
});

/* ---------- Cross-page sync + demo reset ---------- */

// If the admin page (in another tab) finalizes decisions or flips the theme,
// update live.
window.addEventListener("storage", (e) => {
  if (e.key !== STORE_KEY) return;
  const s = loadStore();
  state.finalDecisions = s.finalDecisions || {};
  state.selected = new Set([...state.selected].filter((id) => !isFinalized(id)));
  if (s.theme && s.theme !== theme) applyTheme(s.theme, false);
  if (modal.open && modal.mode === "single" && isFinalized(modal.id)) {
    closeActionModal(false);
  }
  renderQueue();
  renderDetail();
  syncBulkBar();
});

function resetDemo() {
  if (!window.confirm("Reset the demo? All grader verdicts, admin decisions, schedules, and the theme are cleared.")) return;
  localStorage.removeItem(STORE_KEY);
  window.location.reload();
}

/* ---------- Wiring ---------- */

function init() {
  applyTheme(theme, false);
  populateExpandTargetTables();

  $("verdict-select").addEventListener("change", syncModalSections);

  document.querySelectorAll('input[name="expand-kind"]').forEach((r) =>
    r.addEventListener("change", syncModalSections)
  );

  $("add-column-btn").addEventListener("click", () =>
    $("expand-columns").appendChild(makeExpandColumnRow())
  );

  $("action-submit").addEventListener("click", submitAction);
  $("action-cancel").addEventListener("click", () => closeActionModal(true));
  $("bulk-continue-btn").addEventListener("click", openBulkModal);

  $("undo-btn").addEventListener("click", undoLast);
  $("redo-btn").addEventListener("click", redoLast);
  $("theme-toggle-btn").addEventListener("click", () => {
    applyTheme(theme === "dark" ? "light" : "dark", true);
    renderQueue();
    renderDetail();
  });

  $("reset-demo-btn").addEventListener("click", resetDemo);

  // Open on the first table pairing with work left (verdicts may have been
  // restored from a previous demo session). No square is auto-opened.
  const firstOpen = tablePairs().find((tp) => visiblePairings(tp).length > 0);
  state.activePair = (firstOpen || tablePairs()[0]).key;
  renderQueue();
  renderDetail();
  syncBulkBar();
  syncHistoryButtons();
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
});

$("schedule-skip").addEventListener("click", () => {
  scheduleState.free = new Set(scheduleState.snapshot);
  scheduleState.snapshot = null;
  $("schedule-modal").classList.add("hidden");
});

// Start-of-week prompt: appears on load until the grader saves a schedule.
if (!scheduleState.submitted) openScheduleModal(true);
