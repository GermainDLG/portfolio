/* ===== Concordia — Admin flow (Heatmap) =====
 * Based on popup-action, with the match-decision detail display replaced by
 * a BDIViz-style confidence heatmap (see the grader flow for the display
 * contract). Admin-specific behavior is unchanged: grader verdicts &
 * reasoning render BELOW the heatmap (anti-anchoring), the finalize popup
 * carries the under-review warning, the warn modal guards under-reviewed
 * finalizations, and the Schema Expansions tab keeps its own controls.
 */

/* ---------- Demo store (shared with grader via localStorage) ---------- */

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

/* ---------- Theme (light/dark) ----------
 * Dark mode ramps to blue, light mode ramps to deep green. */

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
 * Same three canonical tables as the grader page: MEASUREMENT stretched to
 * 45 columns with plausible OMOP-style extension fields, OBSERVATION trimmed
 * to 8, and a 15-column VISIT_OCCURRENCE. */

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

/* ---------- Novel (incoming) tables — MIMIC-III style ---------- */

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

/* ---------- Graders ---------- */

const REMOVED_GRADERS = [];

let GRADERS = [
  { id: "g1",  name: "Priya Raman",  email: "priya@quicksilverlabs.ai",  reviewed: 15, total: 15 },
  { id: "g2",  name: "Marcus Webb",  email: "marcus@quicksilverlabs.ai", reviewed: 14, total: 15 },
  { id: "g3",  name: "Sofía Duarte", email: "sofia@quicksilverlabs.ai",  reviewed: 15, total: 15 },
  { id: "g4",  name: "Tom Askew",    email: "tom@quicksilverlabs.ai",    reviewed: 14, total: 15 },
  { id: "you", name: "You",          email: "davis@quicksilverlabs.ai",  reviewed: 0,  total: 15 },
];

/* ---------- Match decisions: the same 15 pairings the graders see ----------
 * votes: graderId -> { verdict, reason, payload? }. "you" votes are injected
 * live from the demo store. c4 has two mock votes, so it stays under-reviewed
 * until You weigh in. */

const MATCHES = [
  { id: "c1", novel: { table: "CHARTEVENTS_WIDE", column: "SUBJECT_ID" },
    suggested: { table: "OBSERVATION", column: "person_id" }, score: 0.96,
    alternates: ["observation_id", "observation_source_value"],
    rationale: "SUBJECT_ID is the MIMIC patient identifier and person_id is OMOP's person key; integer id semantics and near-unique value profiles line up.",
    altRationales: {
      observation_id: "Also an integer key, but it identifies the observation row itself, not the patient.",
      observation_source_value: "Ids sometimes ride along as source strings, but this column holds the observation code, not a patient id.",
    },
    votes: {
      g1: { verdict: "accept", reason: "SUBJECT_ID is the patient key; person_id is its OMOP home." },
      g2: { verdict: "accept", reason: "Direct key mapping — INTEGER→bigint widens safely." },
      g3: { verdict: "accept", reason: "Match." },
      g4: { verdict: "accept", reason: "Match." },
    } },
  { id: "l1", novel: { table: "LABEVENTS", column: "VALUENUM" },
    suggested: { table: "MEASUREMENT", column: "value_as_number" }, score: 0.94,
    alternates: ["value_source_value", "range_low"],
    rationale: "VALUENUM is the parsed numeric lab result and value_as_number is MEASUREMENT's numeric result field; DOUBLE→float is lossless and sampled distributions match.",
    altRationales: {
      value_source_value: "Holds the same result but as the verbatim string, not the parsed number.",
      range_low: "Numeric and lab-shaped, but it is the reference range bound, not the result.",
    },
    votes: {
      g1: { verdict: "accept", reason: "Numeric lab result maps to value_as_number." },
      g2: { verdict: "accept", reason: "Match." },
      g3: { verdict: "accept", reason: "Match." },
      g4: { verdict: "accept", reason: "Match." },
    } },
  { id: "a1", novel: { table: "ADMISSIONS", column: "ADMITTIME" },
    suggested: { table: "VISIT_OCCURRENCE", column: "visit_start_datetime" }, score: 0.93,
    alternates: ["visit_start_date", "visit_end_datetime"],
    rationale: "ADMITTIME is the hospital admission timestamp; visit_start_datetime is defined as the admission time for inpatient visits.",
    altRationales: {
      visit_start_date: "The same event at date precision — accepting it would drop the time component.",
      visit_end_datetime: "A timestamp with matching format, but it marks discharge, not admission.",
    },
    votes: {
      g1: { verdict: "accept", reason: "Admission time is the visit start for inpatient encounters." },
      g2: { verdict: "accept", reason: "Straightforward." },
      g3: { verdict: "accept", reason: "TIMESTAMP→datetime is fine." },
      g4: { verdict: "accept", reason: "Match." },
    } },
  { id: "a2", novel: { table: "ADMISSIONS", column: "DISCHTIME" },
    suggested: { table: "VISIT_OCCURRENCE", column: "visit_end_datetime" }, score: 0.92,
    alternates: ["visit_end_date", "visit_start_datetime"],
    rationale: "DISCHTIME is the discharge timestamp — the definition of visit_end_datetime for inpatient visits.",
    altRationales: {
      visit_end_date: "Same event at date precision; loses the time of day.",
      visit_start_datetime: "Format matches but it is the admission side of the visit.",
    },
    votes: {
      g1: { verdict: "accept", reason: "Discharge time is the visit end." },
      g2: { verdict: "accept", reason: "Mirror of ADMITTIME." },
      g3: { verdict: "accept", reason: "Match." },
      g4: { verdict: "accept", reason: "Match." },
    } },
  { id: "l2", novel: { table: "LABEVENTS", column: "CHARTTIME" },
    suggested: { table: "MEASUREMENT", column: "measurement_datetime" }, score: 0.91,
    alternates: ["collection_datetime", "result_datetime"],
    rationale: "CHARTTIME records when the lab was charted, matching the measurement's event timestamp; TIMESTAMP→datetime is lossless. Mild ambiguity with collection vs. result time keeps it just below the top band.",
    altRationales: {
      collection_datetime: "In MIMIC, CHARTTIME often equals specimen collection time, so this is a close semantic rival.",
      result_datetime: "A lab timestamp too, but results finalize after charting — offsets in the samples show it.",
    },
    votes: {
      g1: { verdict: "accept", reason: "Chart time is when the measurement happened." },
      g2: { verdict: "accept", reason: "Match." },
      g3: { verdict: "accept", reason: "Match." },
      g4: { verdict: "reassign", reason: "LABEVENTS CHARTTIME is specimen collection time, not the generic event time — collection_datetime is the tighter fit.",
            payload: { table: "MEASUREMENT", column: "collection_datetime" } },
    } },
  { id: "c2", novel: { table: "CHARTEVENTS_WIDE", column: "CHARTTIME" },
    suggested: { table: "OBSERVATION", column: "observation_datetime" }, score: 0.88,
    alternates: ["observation_source_value", "value_as_string"],
    rationale: "CHARTTIME is the bedside charting timestamp and observation_datetime is the observation's event time; formats match exactly.",
    altRationales: {
      observation_source_value: "Only a weak lexical echo — it stores the observation's source code, not a time.",
      value_as_string: "Timestamps can serialize as text, but this column is for categorical results.",
    },
    votes: {
      g1: { verdict: "accept", reason: "Bedside charting time is the observation time." },
      g2: { verdict: "accept", reason: "Match." },
      g3: { verdict: "accept", reason: "Match." },
      g4: { verdict: "accept", reason: "Match." },
    } },
  { id: "l4", novel: { table: "LABEVENTS", column: "VALUEUOM" },
    suggested: { table: "MEASUREMENT", column: "unit_source_value" }, score: 0.86,
    alternates: ["unit_concept_id", "unit_source_concept_id"],
    rationale: "VALUEUOM is the verbatim unit string and unit_source_value is the designated verbatim-unit column; sample units (mg/dL, mEq/L) appear in both.",
    altRationales: {
      unit_concept_id: "The right destination only after vocabulary mapping — it takes concept ids, not raw strings.",
      unit_source_concept_id: "Also unit-related, but expects a mapped source concept, not the raw text.",
    },
    votes: {
      g1: { verdict: "accept", reason: "Verbatim units belong in unit_source_value." },
      g2: { verdict: "accept", reason: "unit_concept_id derives from it in ETL." },
      g3: { verdict: "accept", reason: "Match." },
      g4: { verdict: "accept", reason: "Match." },
    } },
  { id: "a3", novel: { table: "ADMISSIONS", column: "ADMISSION_LOCATION" },
    suggested: { table: "VISIT_OCCURRENCE", column: "admitted_from_source_value" }, score: 0.81,
    alternates: ["admitted_from_concept_id", "discharge_to_source_value"],
    rationale: "ADMISSION_LOCATION names where the patient came from (e.g. EMERGENCY ROOM ADMIT), which is exactly the verbatim admitted-from column.",
    altRationales: {
      admitted_from_concept_id: "Same concept but expects a mapped id; the raw string needs vocabulary work first.",
      discharge_to_source_value: "The mirror-image field — right shape, wrong end of the visit.",
    },
    votes: {
      g1: { verdict: "accept", reason: "Verbatim admit source is exactly this column." },
      g2: { verdict: "accept", reason: "Match." },
      g3: { verdict: "accept", reason: "Match." },
      g4: { verdict: "accept", reason: "Match." },
    } },
  { id: "l3", novel: { table: "LABEVENTS", column: "VALUE" },
    suggested: { table: "MEASUREMENT", column: "value_source_value" }, score: 0.78,
    alternates: ["value_as_number", "value_as_concept_id"],
    rationale: "VALUE holds the verbatim result string (including non-numerics like NEG), which is what value_source_value preserves. Tempered because numeric rows duplicate VALUENUM.",
    altRationales: {
      value_as_number: "Works for the numeric subset only; text results like NEG would be dropped.",
      value_as_concept_id: "Categorical results could map here, but it needs concepts, not raw strings.",
    },
    votes: {
      g1: { verdict: "accept", reason: "Verbatim result belongs in value_source_value." },
      g2: { verdict: "reject", reason: "VALUE duplicates VALUENUM for numeric rows; keep it only for non-numeric results, which this mapping doesn't distinguish." },
      g3: { verdict: "accept", reason: "Match." },
      g4: { verdict: "accept", reason: "Match." },
    } },
  { id: "l6", novel: { table: "LABEVENTS", column: "FLAG" },
    suggested: { table: "MEASUREMENT", column: "abnormal_flag_source_value" }, score: 0.64,
    alternates: ["abnormal_flag_concept_id", "value_as_concept_id"],
    rationale: "FLAG marks abnormal results just like abnormal_flag_source_value, but MIMIC only ever populates the single value 'abnormal', so the value overlap is thin.",
    altRationales: {
      abnormal_flag_concept_id: "Same meaning as a mapped concept id; needs vocabulary mapping first.",
      value_as_concept_id: "A categorical result column, but the flag qualifies the result rather than being one.",
    },
    votes: {
      g1: { verdict: "accept", reason: "Abnormal flag maps to the flag source column." },
      g2: { verdict: "accept", reason: "Match." },
      g3: { verdict: "reject", reason: "FLAG only ever holds 'abnormal' — too sparse to be worth mapping." },
      g4: { verdict: "accept", reason: "Match." },
    } },
  { id: "a4", novel: { table: "ADMISSIONS", column: "ADMISSION_TYPE" },
    suggested: { table: "VISIT_OCCURRENCE", column: "visit_concept_id" }, score: 0.63,
    alternates: ["visit_source_value", "visit_type_concept_id"],
    rationale: "Admission type values (EMERGENCY, ELECTIVE…) describe the kind of visit, but visit_concept_id expects mapped concept ids, not raw strings — hence mid confidence.",
    altRationales: {
      visit_source_value: "The verbatim landing spot for the same strings; a strong rival if no mapping happens.",
      visit_type_concept_id: "Similar name, but this field records provenance (EHR vs. claims), not admission type.",
    },
    votes: {
      g1: { verdict: "accept", reason: "EMERGENCY/ELECTIVE/URGENT map cleanly through the Visit vocabulary." },
      g2: { verdict: "reject", reason: "Raw strings aren't concept ids — the verbatim value belongs in visit_source_value." },
      g3: { verdict: "accept", reason: "Accept with concept mapping in the ETL." },
      g4: { verdict: "reject", reason: "VARCHAR→integer concept id is not a direct column match." },
    } },
  { id: "l5", novel: { table: "LABEVENTS", column: "ITEMID" },
    suggested: { table: "MEASUREMENT", column: "measurement_source_value" }, score: 0.58,
    alternates: ["measurement_source_concept_id", "measurement_concept_id"],
    rationale: "ITEMID is a local lab code, plausibly the verbatim source identifier — but as a coded id it may belong in a source-concept column instead, so confidence is middling.",
    altRationales: {
      measurement_source_concept_id: "If ITEMID were mapped into the vocabulary, this is where it would land.",
      measurement_concept_id: "The standard concept field — reachable only after full vocabulary mapping.",
    },
    votes: {
      g1: { verdict: "accept", reason: "Local lab code is the source value." },
      g2: { verdict: "reassign", reason: "ITEMID is a coded identifier — the source-concept column is the better home once mapped.",
            payload: { table: "MEASUREMENT", column: "measurement_source_concept_id" } },
      g3: { verdict: "accept", reason: "Match." },
      g4: { verdict: "accept", reason: "Match." },
    } },
  { id: "c3", novel: { table: "CHARTEVENTS_WIDE", column: "HEART_RATE" },
    suggested: { table: "OBSERVATION", column: "value_as_number" }, score: 0.52,
    alternates: ["value_as_string", "observation_concept_id"],
    rationale: "Heart rate is a numeric vital that would land in value_as_number — but only after this wide flowsheet is unpivoted to one row per observation, which halves the confidence.",
    altRationales: {
      value_as_string: "Numeric vitals can serialize as text, but the numeric column is the better home.",
      observation_concept_id: "The vital's identity ('heart rate') belongs here as a concept, not its value.",
    },
    votes: {
      g1: { verdict: "reject", reason: "Wide flowsheet columns need unpivoting to OBSERVATION rows before any column-level map." },
      g2: { verdict: "accept", reason: "Post-unpivot, numeric vitals land in value_as_number — accept as the target." },
      g3: { verdict: "reject", reason: "Shape mismatch, not a column match." },
      g4: { verdict: "assignNone", reason: "No direct home while the table stays wide." },
    } },
  { id: "c4", novel: { table: "CHARTEVENTS_WIDE", column: "GCS_TOTAL" },
    suggested: { table: "OBSERVATION", column: "value_as_string" }, score: 0.34,
    alternates: ["value_as_number", "observation_source_value"],
    rationale: "GCS_TOTAL is an integer score; value_as_string only fits if scores are kept as text. Weak type agreement and the wide-table shape keep this low.",
    altRationales: {
      value_as_number: "Type-wise the stronger home for an integer score — arguably should have been the suggestion.",
      observation_source_value: "Could hold the raw charted token, but it is meant for the observation's code.",
    },
    votes: {
      g1: { verdict: "reject", reason: "GCS total is numeric — value_as_string is the wrong column, and the wide shape needs unpivoting anyway." },
      g3: { verdict: "reject", reason: "Not a string value." },
    } },
  { id: "a5", novel: { table: "ADMISSIONS", column: "INSURANCE" },
    suggested: { table: "VISIT_OCCURRENCE", column: "visit_source_value" }, score: 0.27,
    alternates: ["admitted_from_source_value", "visit_source_concept_id"],
    rationale: "Both are strings, but INSURANCE is payer data while visit_source_value describes the kind of visit; the lexical overlap is coincidental.",
    altRationales: {
      admitted_from_source_value: "Another verbatim visit field, equally unrelated to payer information.",
      visit_source_concept_id: "Name-similar only; a mapped concept id has no room for raw payer strings.",
    },
    votes: {
      g1: { verdict: "assignNone", reason: "Insurance is payer data; nothing on the visit fits." },
      g2: { verdict: "expand", reason: "OMOP models payers on PAYER_PLAN_PERIOD, which isn't in this canonical set — keep the raw payer as a source column until it exists.",
            payload: { kind: "column", table: "VISIT_OCCURRENCE", columns: [{ name: "insurance_source_value", type: "text" }] } },
      g3: { verdict: "expand", reason: "Same — park the payer string on the visit until a payer table lands.",
            payload: { kind: "column", table: "VISIT_OCCURRENCE", columns: [{ name: "insurance_source_value", type: "text" }] } },
      g4: { verdict: "reject", reason: "visit_source_value is for visit kind, not payer." },
    } },
  { id: "a6", novel: { table: "ADMISSIONS", column: "SUBJECT_ID" },
    suggested: { table: "PERSON", column: "person_id" }, score: 0.95,
    alternates: ["person_source_value", "location_id"],
    rationale: "SUBJECT_ID is the MIMIC patient identifier carried on every admission; person_id is OMOP's person key, with identical integer id profiles.",
    altRationales: {
      person_source_value: "Source ids often land here verbatim, but the keyed person_id is the primary home.",
      location_id: "An id column too, but it references the person's address, not the person.",
    },
    votes: {
      g1: { verdict: "accept", reason: "Patient key maps to person_id." },
      g2: { verdict: "accept", reason: "Match." },
      g3: { verdict: "accept", reason: "Match." },
      g4: { verdict: "accept", reason: "Match." },
    } },
  { id: "a7", novel: { table: "ADMISSIONS", column: "ETHNICITY" },
    suggested: { table: "PERSON", column: "ethnicity_source_value" }, score: 0.83,
    alternates: ["ethnicity_concept_id", "race_source_value"],
    rationale: "ETHNICITY holds the verbatim demographic string (WHITE, HISPANIC OR LATINO…), matching the verbatim ethnicity column on PERSON.",
    altRationales: {
      ethnicity_concept_id: "The mapped destination — needs OMB Hispanic/Not-Hispanic vocabulary work first.",
      race_source_value: "MIMIC's ETHNICITY mixes race and ethnicity, so the race column is a genuine rival.",
    },
    votes: {
      g1: { verdict: "accept", reason: "Verbatim demographic string lands in the source-value column." },
      g2: { verdict: "accept", reason: "Match; concept ids derive in ETL." },
      g3: { verdict: "accept", reason: "Match." },
      g4: { verdict: "reassign", reason: "MIMIC's ETHNICITY values are mostly race categories — race_source_value is the truer home.",
            payload: { table: "PERSON", column: "race_source_value" } },
    } },
  { id: "a8", novel: { table: "ADMISSIONS", column: "MARITAL_STATUS" },
    suggested: { table: "PERSON", column: "ethnicity_concept_id" }, score: 0.24,
    alternates: ["ethnicity_source_value", "race_concept_id"],
    rationale: "Marital status is not ethnicity — the matcher only latched onto the shared demographic context, so the suggestion is weak.",
    altRationales: {
      ethnicity_source_value: "Same weak demographic association, just the verbatim variant.",
      race_concept_id: "Another demographic concept column with no marital-status semantics.",
    },
    votes: {
      g1: { verdict: "reject", reason: "Marital status is not ethnicity — bad suggestion." },
      g2: { verdict: "expand", reason: "OMOP PERSON has no marital-status field; keep the raw value as a source column.",
            payload: { kind: "column", table: "PERSON", columns: [{ name: "marital_status_source_value", type: "text" }] } },
      g3: { verdict: "expand", reason: "Same — a marital_status_source_value column on PERSON.",
            payload: { kind: "column", table: "PERSON", columns: [{ name: "marital_status_source_value", type: "text" }] } },
      g4: { verdict: "reject", reason: "Not a match." },
    } },
  { id: "a9", novel: { table: "ADMISSIONS", column: "LANGUAGE" },
    suggested: { table: "PERSON", column: "person_source_value" }, score: 0.31,
    alternates: ["gender_source_value", "race_source_value"],
    rationale: "LANGUAGE is a demographic string but OMOP PERSON has no language field; the matcher fell back to a generic source-value column.",
    altRationales: {
      gender_source_value: "A verbatim demographic column, but for sex — not language.",
      race_source_value: "Verbatim demographic again; language doesn't belong here either.",
    },
    votes: {
      g1: { verdict: "assignNone", reason: "PERSON has no language field; no direct home for this column." },
      g2: { verdict: "reject", reason: "person_source_value is the patient identifier, not a language." },
      g3: { verdict: "reject", reason: "Not a match." },
      g4: { verdict: "reject", reason: "Not a match." },
    } },
];

/* ---------- Schema expansion requests ---------- */

const BASE_EXPANSIONS = [
  { id: "e1", requestedBy: "g2", pairing: "ADMISSIONS.INSURANCE",
    kind: "column", table: "VISIT_OCCURRENCE",
    columns: [{ name: "insurance_source_value", type: "text" }],
    reason: "OMOP models payers on PAYER_PLAN_PERIOD, which isn't in this canonical set — keep the raw payer as a source column until it exists.",
    signature: "column:VISIT_OCCURRENCE:insurance_source_value" },
  { id: "e2", requestedBy: "g3", pairing: "ADMISSIONS.INSURANCE",
    kind: "column", table: "VISIT_OCCURRENCE",
    columns: [{ name: "insurance_source_value", type: "text" }],
    reason: "Same — park the payer string on the visit until a payer table lands.",
    signature: "column:VISIT_OCCURRENCE:insurance_source_value" },
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
  { id: "e4", requestedBy: "g2", pairing: "ADMISSIONS.MARITAL_STATUS",
    kind: "column", table: "PERSON",
    columns: [{ name: "marital_status_source_value", type: "text" }],
    reason: "OMOP PERSON has no marital-status field; keep the raw value as a source column.",
    signature: "column:PERSON:marital_status_source_value" },
  { id: "e5", requestedBy: "g3", pairing: "ADMISSIONS.MARITAL_STATUS",
    kind: "column", table: "PERSON",
    columns: [{ name: "marital_status_source_value", type: "text" }],
    reason: "Same — a marital_status_source_value column on PERSON.",
    signature: "column:PERSON:marital_status_source_value" },
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

/* ---------- Generated scores & rationales for non-pairing cells ---------- */

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
  MATCHES.find((m) => m.novel.table === novelTable && m.novel.column === novelCol);

const novelDef = (m) =>
  NOVEL_TABLES[m.novel.table].columns.find((c) => c.name === m.novel.column);

const canonDef = (table, col) =>
  CANONICAL_TABLES[table].columns.find((c) => c.name === col);

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
 * are auto-picked by the same name/type heuristics the matrix uses, votes
 * are rule-based on the score band, and rationales fall back to the
 * generated text. */

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

function autoVotes(score) {
  if (score >= 0.8) return {
    g1: { verdict: "accept", reason: "Clear match." },
    g2: { verdict: "accept", reason: "Match." },
    g3: { verdict: "accept", reason: "Match." },
    g4: { verdict: "accept", reason: "Agree with the matcher." },
  };
  if (score >= 0.55) return {
    g1: { verdict: "accept", reason: "Fits after ETL normalization." },
    g2: { verdict: "accept", reason: "Match." },
    g3: { verdict: "accept", reason: "Match." },
    g4: { verdict: "reject", reason: "Semantics look close but the value profiles diverge." },
  };
  if (score >= 0.4) return {
    g1: { verdict: "accept", reason: "Plausible with mapping work." },
    g2: { verdict: "reject", reason: "Name similarity only; wrong destination." },
    g3: { verdict: "accept", reason: "Acceptable as the source-value landing spot." },
    g4: { verdict: "reject", reason: "Not a direct column match." },
  };
  return {
    g1: { verdict: "reject", reason: "No semantic fit." },
    g2: { verdict: "reject", reason: "Coincidental similarity." },
    g3: { verdict: "assignNone", reason: "No suitable destination in this table; needs discussion." },
    g4: { verdict: "reject", reason: "Not a match." },
  };
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
  MATCHES.push({
    id: `d-${novelCol.toLowerCase()}`,
    novel: { table: "PRESCRIPTIONS", column: novelCol },
    suggested: { table: "DRUG_EXPOSURE", column: sugCol },
    score,
    alternates: autoAlternates("PRESCRIPTIONS", novelCol, "DRUG_EXPOSURE", sugCol),
    votes: autoVotes(score),
  });
}

// Roster totals follow the full queue (c4 keeps its 2-vote under-review gap).
for (const g of GRADERS) {
  g.total = MATCHES.length;
  if (g.id !== "you") g.reviewed = MATCHES.filter((m) => m.votes[g.id]).length;
}

/* ---------- State ---------- */

const initialStore = loadStore();

const state = {
  tab: "matches",
  finalDecisions: initialStore.finalDecisions || {},
  expansionDecisions: initialStore.expansionDecisions || {},
  drafts: {},
  activePair: null,           // key of the displayed table pairing (matches tab)
  activeId: null,             // pairing of the selected square / active expansion group
  cell: null,                 // { novel, canon } selected heatmap square
  selected: new Set(),        // pairing ids checked for bulk
  locked: !!initialStore.locked,
};

/* Undo/redo history, driven from the buttons next to the tabs. Each action
 * holds per-item before/after decisions on the named store. */
const history = { undo: [], redo: [] };

const modal = {
  open: false,
  mode: "single",
  id: null,
  ids: [],
  chosenColumn: null,
};

const persistDecisions = () =>
  saveStore({ finalDecisions: state.finalDecisions, expansionDecisions: state.expansionDecisions, locked: state.locked });

/* ---------- Helpers ---------- */

const $ = (id) => document.getElementById(id);

const verdictOf = (key) => CONFIG.finalVerdicts.find((v) => v.key === key);

const pairName = (m) => `${m.novel.table}.${m.novel.column}`;

const pct = (score) => `${Math.round(score * 100)}%`;

const findGrader = (id) =>
  GRADERS.find((g) => g.id === id) || REMOVED_GRADERS.find((g) => g.id === id);


const isBulk = () => state.tab === "matches" && state.selected.size >= 2;

const voteCount = (m) => Object.keys(m.votes).length;

const isUnderReviewed = (m) => voteCount(m) < CONFIG.minReviews;

const canDecide = (id) => !(state.locked && state.finalDecisions[id]);

const badgeColor = (score) => heatColor(0.3 + 0.7 * score);

/* Table pairings: a novel table can pair into several canonical tables
 * (e.g. ADMISSIONS → VISIT_OCCURRENCE and ADMISSIONS → PERSON), so pairs
 * are keyed by both sides and sorted by average confidence. */
const pairKey = (novel, canon) => `${novel} → ${canon}`;

const tablePairings = (novel, canon) =>
  MATCHES.filter((m) => m.novel.table === novel && m.suggested.table === canon)
    .sort((a, b) => b.score - a.score);

const avgScore = (pairings) =>
  pairings.reduce((s, m) => s + m.score, 0) / pairings.length;

const tablePairs = () => {
  const pairs = [];
  for (const m of MATCHES) {
    const key = pairKey(m.novel.table, m.suggested.table);
    if (!pairs.some((t) => t.key === key)) {
      pairs.push({
        key,
        novel: m.novel.table,
        canon: m.suggested.table,
        pairings: tablePairings(m.novel.table, m.suggested.table),
      });
    }
  }
  return pairs.sort((a, b) => avgScore(b.pairings) - avgScore(a.pairings));
};

function activeTablePair() {
  if (state.tab !== "matches" || !state.activePair) return null;
  return tablePairs().find((t) => t.key === state.activePair) || null;
}

/* Decided pairings drop out of the heatmap (their rows come back via undo). */
const visiblePairings = (tp) =>
  tp.pairings.filter((m) => !state.finalDecisions[m.id]);

/* Where a decided pairing landed, if it maps anywhere. */
function decidedTarget(m) {
  const d = state.finalDecisions[m.id];
  if (!d) return null;
  if (d.verdict === "accept") return m.suggested.column;
  if (d.verdict === "reassign" && d.payload) return d.payload.column;
  return null;
}

/* A decided pairing's canonical column disappears too — unless a still-open
 * row in this heatmap suggests the same column. */
function hiddenCanonCols(tp, visibleRows) {
  const stillSuggested = new Set(visibleRows.map((m) => m.suggested.column));
  const hidden = new Set();
  for (const m of tp.pairings) {
    const target = decidedTarget(m);
    if (target && !stillSuggested.has(target)) hidden.add(target);
  }
  return hidden;
}

/* Schema-expansion requests grouped by signature: duplicates render once,
 * with every requester listed. */
function expansionGroups() {
  const groups = [];
  for (const e of EXPANSIONS) {
    let g = groups.find((x) => x.signature === e.signature);
    if (!g) {
      g = { signature: e.signature, kind: e.kind, table: e.table, columns: e.columns, requests: [] };
      groups.push(g);
    }
    g.requests.push(e);
  }
  return groups;
}

const groupDecision = (g) => state.expansionDecisions[g.requests[0].id];

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

/* ---------- Queue rendering ---------- */

function renderQueue() {
  const list = $("queue-list");
  list.innerHTML = "";

  if (state.tab === "expansions") {
    for (const g of expansionGroups()) list.appendChild(expansionRow(g));
  } else {
    for (const tp of tablePairs()) list.appendChild(tablePairRow(tp));
  }

  $("matches-count").textContent =
    MATCHES.filter((m) => !state.finalDecisions[m.id]).length;
  $("expansions-count").textContent =
    expansionGroups().filter((g) => !groupDecision(g)).length;
}

function tablePairRow(tp) {
  const li = document.createElement("li");
  li.className = "queue-item";
  if (tp.key === state.activePair) li.classList.add("active");
  const decided = tp.pairings.filter((m) => state.finalDecisions[m.id]).length;
  const under = tp.pairings.filter((m) => isUnderReviewed(m)).length;
  if (decided === tp.pairings.length) li.classList.add("done");

  const info = document.createElement("div");
  info.className = "pair-info";
  const underFlag = under
    ? ` <span class="under-flag">⚠ ${under} under-reviewed</span>`
    : "";
  info.innerHTML = `
    <div class="pair-name">${tp.novel} → ${tp.canon}</div>
    <div class="pair-target">${tp.pairings.length} column pairing${tp.pairings.length === 1 ? "" : "s"} · ${decided} finalized${underFlag}</div>`;

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
  syncActionBox();
}

function expansionRow(g) {
  const li = document.createElement("li");
  li.className = "queue-item";
  if (g.signature === state.activeId) li.classList.add("active");
  const decision = groupDecision(g);
  if (decision) li.classList.add(decision.decision === "approved" ? "done" : "rejected");

  const names = g.requests.map((e) => {
    const grader = findGrader(e.requestedBy);
    return grader ? grader.name.split(" ")[0] : "removed";
  });

  const info = document.createElement("div");
  info.className = "pair-info";
  info.innerHTML = `
    <div class="pair-name">${g.kind === "table" ? g.table : `${g.table}.${g.columns[0].name}`}</div>
    <div class="pair-target">by ${names.join(", ")}${g.requests.length > 1 ? ` (${g.requests.length} requests)` : ""}</div>`;

  const meta = document.createElement("div");
  meta.className = "pair-meta";
  meta.innerHTML = `<span class="kind-chip">${g.kind === "table" ? "New table" : "New column"}</span>`;
  if (decision) meta.innerHTML += `<span class="status-chip">${decision.decision}</span>`;

  li.append(info, meta);
  li.addEventListener("click", () => selectItem(g.signature));
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

  // Votes render LAST, below the heatmap, so the admin reads the evidence
  // before the graders' arguments. They follow the selected square.
  const m = state.activeId ? MATCHES.find((x) => x.id === state.activeId) : null;
  const showReasoning = m && m.novel.table === tp.novel;

  panel.innerHTML = `
    <div class="detail-header">
      <div class="detail-title">Confidence map — <span class="mono">${tp.novel}</span> × <span class="mono">${tp.canon}</span></div>
      <div class="detail-header-right">
        ${showReasoning ? '<button class="jump-btn" id="jump-reasoning-btn">↓ Jump to Reasoning</button>' : ""}
        <div class="hm-legend">
          <span>0</span>
          <span class="bar" style="background:linear-gradient(to right, ${heatColor(0)}, ${heatColor(1)})"></span>
          <span>1</span>
        </div>
      </div>
    </div>
    <div class="diagram-hint">${NOVEL_TABLES[tp.novel].desc} → ${CANONICAL_TABLES[tp.canon].desc}<br>
    Rows are the incoming columns still open for review (decided rows drop out; ↺ brings them back). Click a square to expand it; Continue (or Enter) opens the finalize popup — on a non-suggested square it preloads a Reassign. Check rows (or the top-left box) to bulk accept/reject.</div>
    <div id="hm-slot"></div>
    ${showReasoning
      ? `<div class="section diagram-reasoning" id="reasoning-section">
           <h2>Grader verdicts &amp; reasoning — <span class="mono">${pairName(m)}</span></h2>
           ${voteCardsHtml(m)}
           <button class="meet-btn" id="meet-btn" title="Overlay all graders' availability to find a meeting time">📅 Meet</button>
         </div>`
      : `<div class="diagram-hint">Click a square to see its grader verdicts &amp; reasoning below the map.</div>`}
    <div class="hm-card hidden" id="hm-card"></div>`;

  // Cap the scroll box at the space left under the header/hint so the sticky
  // axis labels always stay in view (the reasoning section scrolls in below).
  const slot = $("hm-slot");
  const availH = panel.getBoundingClientRect().bottom - slot.getBoundingClientRect().top - 24;
  slot.outerHTML = heatmapHtml(tp, availH);

  // Re-renders of the same table pairing keep the grid's scroll position.
  const wrapEl = $("hm-wrap");
  if (wrapEl && keepScroll) {
    wrapEl.scrollLeft = keepScroll.l;
    wrapEl.scrollTop = keepScroll.t;
  }

  if (showReasoning) {
    $("meet-btn").addEventListener("click", () => openMeetModal(m));
    $("jump-reasoning-btn").addEventListener("click", () =>
      $("reasoning-section").scrollIntoView({ behavior: "smooth", block: "start" })
    );
  }

  wireHeatmap(tp);
  renderCellCard(tp);
}

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

function renderExpansionDetail(panel) {
  const g = expansionGroups().find((x) => x.signature === state.activeId);
  if (!g) { panel.innerHTML = ""; return; }
  const decision = groupDecision(g);

  const decisionNote = decision
    ? `<div class="finalized-note ${decision.decision === "rejected" ? "rejected" : ""}">
         ${decision.decision === "approved" ? "Approved" : "Rejected"}${decision.message ? ` — “${decision.message}”` : ""}
       </div>`
    : "";

  const requesterNames = g.requests
    .map((e) => { const gr = findGrader(e.requestedBy); return gr ? gr.name : "removed grader"; })
    .join(", ");
  const pairings = [...new Set(g.requests.map((e) => e.pairing))].join(", ");

  const reasonCards = g.requests.map((e) => {
    const gr = findGrader(e.requestedBy);
    return `
      <div class="vote-card">
        <div class="vote-card-header">
          <span class="vote-grader">${gr ? gr.name : "Removed grader"}</span>
        </div>
        <div class="vote-reason">${e.reason}</div>
      </div>`;
  }).join("");

  panel.innerHTML = `
    ${decisionNote}
    <div class="detail-header">
      <div class="detail-title">${g.kind === "table" ? g.table : `${g.table}.${g.columns[0].name}`}</div>
      <span class="kind-chip">${g.kind === "table" ? "New table" : "New column"}</span>
    </div>

    <div class="expansion-spec">
      <div class="spec-kind">${g.kind === "table" ? "Proposed new table" : `Proposed new column on ${g.table}`}</div>
      <div class="spec-name">${g.table}</div>
      <table class="sample-table">
        <tr><th>Column</th><th>Type</th></tr>
        ${g.columns.map((c) => `<tr><td>${c.name}</td><td>${c.type}</td></tr>`).join("")}
      </table>
    </div>

    <div class="section">
      <h2>Request details</h2>
      <ul class="kv-list">
        <li><span class="k">Requested by</span><span class="v">${requesterNames}</span></li>
        <li><span class="k">For pairing${pairings.includes(",") ? "s" : ""}</span><span class="v">${pairings}</span></li>
      </ul>
    </div>

    <div class="section">
      <h2>Reason${g.requests.length > 1 ? "s" : ""}</h2>
      ${reasonCards}
    </div>`;
}

/* ---------- Heatmap ---------- */

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
  const allChecked = rows.length > 0 && rows.every((m) => state.selected.has(m.id));
  html += `<div class="hm-corner" title="${anySelected ? "Clear the selection" : "Select every incoming column in this table"}">
    <input type="checkbox" class="hm-check" id="hm-select-all" ${allChecked ? "checked" : ""}>
    <span>all</span>
  </div>`;
  for (const c of canonCols) {
    const sug = rows.some((m) => m.suggested.column === c.name);
    html += `<div class="hm-collabel ${sug ? "sug" : ""}" title="${c.name} (${c.type})">${c.name}</div>`;
  }

  for (const m of rows) {
    const n = novelDef(m);
    const rowCls = [
      "hm-rowlabel",
      m.id === state.activeId ? "active-row" : "",
    ].join(" ");
    const under = isUnderReviewed(m) ? " ⚠" : "";
    html += `<div class="${rowCls}" style="height:${cell}px" title="${n.name} (${n.type})${under ? " — under-reviewed" : ""}">
      <input type="checkbox" class="hm-check hm-row-check" data-pid="${m.id}"
        ${state.selected.has(m.id) ? "checked" : ""}>
      <span class="hm-rowname">${n.name}${under}</span>
    </div>`;
    for (const c of canonCols) {
      const s = cellScore(tp.novel, n.name, tp.canon, c.name);
      const isSug = m.suggested.column === c.name;
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
        for (const m of visiblePairings(tp)) state.selected.add(m.id);
      }
      renderDetail();
      syncActionBox();
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
  const actionable = rp && canDecide(rp.id);

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

function openFromCell() {
  const tp = activeTablePair();
  if (!tp || !state.cell) return;
  const rp = pairingFor(tp.novel, state.cell.novel);
  if (!rp || !canDecide(rp.id)) return;
  if (state.cell.canon !== rp.suggested.column) {
    openActionModal(rp.id, { reassignTo: state.cell.canon });
  } else {
    openActionModal(rp.id);
  }
}

window.addEventListener("resize", () => renderDetail());

/* ---------- Action box: bulk bar (matches) + expansion controls ---------- */

function syncActionBox() {
  const onMatches = state.tab === "matches";
  const bulk = isBulk();

  $("action-box").classList.toggle("hidden", onMatches && !bulk);
  $("match-controls").classList.toggle("hidden", !onMatches);
  $("expansion-controls").classList.toggle("hidden", onMatches);

  if (onMatches) {
    if (bulk) {
      $("bulk-count").textContent = state.selected.size;
      $("bulk-continue-btn").textContent = `Continue with ${state.selected.size} pairings`;
    }
  } else {
    const g = expansionGroups().find((x) => x.signature === state.activeId);
    const decidedLocked = state.locked && g && !!groupDecision(g);
    $("locked-note").classList.toggle("hidden", !decidedLocked);
    $("approve-expansion-btn").disabled = !g || decidedLocked;
    $("reject-expansion-btn").disabled = !g || decidedLocked;
  }
}

/* ---------- Selection / navigation ---------- */

/* Expansion-queue selection (matches use selectTablePair). */
function selectItem(id) {
  state.activeId = id;
  renderQueue();
  renderDetail();
  syncActionBox();
}

function toggleSelect(id, checked) {
  if (checked) state.selected.add(id);
  else state.selected.delete(id);
  renderDetail();
  syncActionBox();
}

function switchTab(tab) {
  state.tab = tab;
  state.activeId = null;
  state.activePair = null;
  state.cell = null;
  state.selected.clear();
  document.querySelectorAll(".tab").forEach((t) =>
    t.classList.toggle("active", t.dataset.tab === tab)
  );
  if (tab === "matches") {
    const firstOpen = tablePairs().find((tp) => visiblePairings(tp).length > 0);
    state.activePair = (firstOpen || tablePairs()[0]).key;
  } else {
    const first = expansionGroups().find((g) => !groupDecision(g));
    state.activeId = first ? first.signature : null;
  }
  renderQueue();
  renderDetail();
  syncActionBox();
}

/* After a finalize: stay on the current table pairing while it has open
 * pairings, otherwise move to the next one with work left. Never auto-open
 * a square. */
function autoAdvanceMatches() {
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

function openActionModal(id, preset) {
  const m = MATCHES.find((x) => x.id === id);
  if (!m || !canDecide(id)) return;
  modal.open = true;
  modal.mode = "single";
  modal.id = id;
  modal.ids = [];
  state.activeId = id;

  $("action-title").textContent = `Finalize ${pairName(m)}`;
  populateVerdictSelect(false);
  if (preset && preset.reassignTo) {
    applyFormState({ ...defaultFormState(), verdict: "reassign", reassignColumn: preset.reassignTo });
  } else {
    applyFormState(state.drafts[id] || decisionToFormState(state.finalDecisions[id]));
  }
  $("bulk-list-wrap").classList.add("hidden");

  const warn = $("modal-under-review");
  warn.textContent = `⚠ This pairing has only ${voteCount(m)} of ${CONFIG.minReviews} required grader reviews.`;
  warn.classList.toggle("hidden", !isUnderReviewed(m));

  $("action-modal").classList.remove("hidden");
  syncModalSections();
}

function openBulkModal() {
  if (!isBulk()) return;
  modal.open = true;
  modal.mode = "bulk";
  modal.id = null;
  modal.ids = [...state.selected].filter((id) => canDecide(id));
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

/* ---------- Finalize popup: reassign picker ---------- */

function reassignChips(m, colName) {
  if (colName === m.suggested.column) return ' <span class="suggest-chip">★ suggested</span>';
  if (m.alternates.includes(colName)) return ' <span class="suggest-chip alt">Suggested Match</span>';
  return "";
}

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
  const nDef = novelDef(m);
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
    const next = { verdict, message, payload };
    pushHistory([{
      store: "final", id: m.id,
      prev: state.finalDecisions[m.id] ? { ...state.finalDecisions[m.id] } : null,
      next,
    }]);
    state.finalDecisions[m.id] = next;
    delete state.drafts[m.id];
    persistDecisions();
    closeActionModal(false);
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

  const next = { verdict, message: "", payload: null };
  pushHistory(ids.map((id) => ({
    store: "final", id,
    prev: state.finalDecisions[id] ? { ...state.finalDecisions[id] } : null,
    next,
  })));
  for (const id of ids) {
    state.finalDecisions[id] = next;
    delete state.drafts[id];
  }
  state.selected.clear();
  persistDecisions();

  closeActionModal(false);
  autoAdvanceMatches();
}

/* ---------- Expansion decisions ---------- */

function decideExpansion(decision) {
  const g = expansionGroups().find((x) => x.signature === state.activeId);
  if (!g) return;
  const message = $("expansion-message").value.trim();

  // The decision covers every request in the deduped group.
  const next = { decision, message };
  pushHistory(g.requests.map((x) => ({
    store: "expansion", id: x.id,
    prev: state.expansionDecisions[x.id] ? { ...state.expansionDecisions[x.id] } : null,
    next,
  })));
  for (const x of g.requests) {
    state.expansionDecisions[x.id] = next;
  }
  persistDecisions();
  $("expansion-message").value = "";

  const nextGroup = expansionGroups().find((x) => !groupDecision(x));
  state.activeId = nextGroup ? nextGroup.signature : g.signature;
  renderQueue();
  renderDetail();
  syncActionBox();
}

/* ---------- Undo / redo (buttons next to the tabs) ---------- */

function pushHistory(entries) {
  history.undo.push({ entries });
  history.redo.length = 0;
  syncHistoryButtons();
}

function applyHistory(action, dir) {
  for (const en of action.entries) {
    const store = en.store === "expansion" ? state.expansionDecisions : state.finalDecisions;
    const v = dir === "undo" ? en.prev : en.next;
    if (v) store[en.id] = v;
    else delete store[en.id];
  }
  persistDecisions();
  // Surface the affected item: jump to its table pairing / expansion group.
  const first = action.entries[0];
  state.cell = null;
  if (first.store === "expansion") {
    const e = EXPANSIONS.find((x) => x.id === first.id);
    if (state.tab === "expansions" && e) state.activeId = e.signature;
  } else {
    const m = MATCHES.find((x) => x.id === first.id);
    if (state.tab === "matches" && m) {
      state.activePair = pairKey(m.novel.table, m.suggested.table);
      state.activeId = null;
    }
  }
  renderQueue();
  renderDetail();
  syncActionBox();
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
  $("undo-btn").disabled = state.locked || !history.undo.length;
  $("redo-btn").disabled = state.locked || !history.redo.length;
}

/* ---------- Lock decisions ---------- */

function lockDecisions() {
  state.locked = true;
  state.selected.clear();
  history.undo.length = 0;
  history.redo.length = 0;
  syncHistoryButtons();
  persistDecisions();
  if (modal.open) closeActionModal(false);
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

/* ---------- Keyboard shortcuts ---------- */

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
    } else if (state.cell && state.tab === "matches" && !otherModalOpen()) {
      closeCellCard();
    }
    return;
  }
  if (e.key === "ArrowDown" && modal.open && !warnOpen) {
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

  if (isBulk()) { openBulkModal(); return; }
  if (state.cell) openFromCell();
});

/* Clicking anywhere outside the expansion card (and off the grid squares)
 * closes it, matching the ✕ and Escape. */
document.addEventListener("click", (e) => {
  if (modal.open || !state.cell || state.tab !== "matches") return;
  if (!$("warn-modal").classList.contains("hidden")) return;
  if (e.target.closest("#hm-card") || e.target.closest(".hm-cell")) return;
  closeCellCard();
});

/* ---------- Cross-page sync + demo reset ---------- */

// The grader page (in another tab) saves verdicts/schedule/theme live; refresh.
window.addEventListener("storage", (e) => {
  if (e.key !== STORE_KEY) return;
  const s = loadStore();
  if (s.theme && s.theme !== theme) applyTheme(s.theme, false);
  injectYouVotes();
  rebuildExpansions();
  renderQueue();
  renderDetail();
  syncActionBox();
});

function resetDemo() {
  if (!window.confirm("Reset the demo? All grader verdicts, admin decisions, schedules, and the theme are cleared.")) return;
  localStorage.removeItem(STORE_KEY);
  window.location.reload();
}

/* ---------- Wiring ---------- */

function init() {
  applyTheme(theme, false);
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

  $("undo-btn").addEventListener("click", undoLast);
  $("redo-btn").addEventListener("click", redoLast);
  $("theme-toggle-btn").addEventListener("click", () => {
    applyTheme(theme === "dark" ? "light" : "dark", true);
    renderQueue();
    renderDetail();
  });

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

  $("reset-demo-btn").addEventListener("click", resetDemo);

  if (state.locked) {
    const btn = $("lock-decisions-btn");
    btn.textContent = "🔒 Decisions Locked";
    btn.disabled = true;
  }

  // Open on the match-decisions tab with the first table pairing that still
  // has undecided pairings. No square is auto-opened.
  const firstOpen = tablePairs().find((tp) => visiblePairings(tp).length > 0);
  state.activePair = (firstOpen || tablePairs()[0]).key;
  renderQueue();
  renderDetail();
  syncActionBox();
  syncHistoryButtons();
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
