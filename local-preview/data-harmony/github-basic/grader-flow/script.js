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

/* ---------- Canonical schema (reassign targets / expansion targets) ---------- */

const CANONICAL_SCHEMA = {
  customers: ["customer_id", "full_name", "email", "phone", "created_at", "region"],
  orders: ["order_id", "customer_id", "order_date", "status", "total_amount", "currency"],
  products: ["product_id", "sku", "product_name", "category", "unit_price"],
  shipments: ["shipment_id", "order_id", "carrier", "shipped_at", "delivered_at"],
  payments: ["payment_id", "order_id", "method", "amount", "paid_at"],
};

/* ---------- Mock pairings (upstream service suggestions) ---------- */

const PAIRINGS = [
  { id: "p1",  novel: { table: "cust_master", column: "cust_email", type: "varchar(120)", samples: ["ana@corp.io", "bo@mail.com", "cy@corp.io"] },
    suggested: { table: "customers", column: "email", type: "text", desc: "Primary contact email for the customer." },
    confidence: "high" },
  { id: "p2",  novel: { table: "cust_master", column: "cust_nm", type: "varchar(200)", samples: ["Ana Ortiz", "Bo Chen", "Cy Adams"] },
    suggested: { table: "customers", column: "full_name", type: "text", desc: "Customer display name, first + last." },
    confidence: "high" },
  { id: "p3",  novel: { table: "ord_hdr", column: "ord_ttl_amt", type: "decimal(12,2)", samples: ["129.99", "84.50", "1020.00"] },
    suggested: { table: "orders", column: "total_amount", type: "numeric", desc: "Grand total for the order, tax included." },
    confidence: "high" },
  { id: "p4",  novel: { table: "ord_hdr", column: "ord_dt", type: "date", samples: ["2026-06-29", "2026-06-30", "2026-07-01"] },
    suggested: { table: "orders", column: "order_date", type: "date", desc: "Date the order was placed." },
    confidence: "high" },
  { id: "p5",  novel: { table: "cust_master", column: "cust_ph", type: "varchar(32)", samples: ["+1-555-0134", "+1-555-0177", "+44 20 7946 0958"] },
    suggested: { table: "customers", column: "phone", type: "text", desc: "Customer phone in E.164 or freeform." },
    confidence: "high" },
  { id: "p6",  novel: { table: "prod_cat", column: "item_sku", type: "varchar(64)", samples: ["SKU-77812", "SKU-10293", "SKU-55830"] },
    suggested: { table: "products", column: "sku", type: "text", desc: "Stock keeping unit, unique per product." },
    confidence: "med" },
  { id: "p7",  novel: { table: "ord_hdr", column: "ord_stat_cd", type: "char(2)", samples: ["SH", "PD", "CX"] },
    suggested: { table: "orders", column: "status", type: "text", desc: "Order lifecycle status (placed, shipped, cancelled...)." },
    confidence: "med" },
  { id: "p8",  novel: { table: "pay_ledger", column: "pay_mthd", type: "varchar(20)", samples: ["card", "ach", "wire"] },
    suggested: { table: "payments", column: "method", type: "text", desc: "Payment instrument used." },
    confidence: "med" },
  { id: "p9",  novel: { table: "cust_master", column: "cust_geo", type: "varchar(80)", samples: ["NA-WEST", "EU-CENTRAL", "APAC-S"] },
    suggested: { table: "customers", column: "region", type: "text", desc: "Sales region assignment." },
    confidence: "med" },
  { id: "p10", novel: { table: "ship_log", column: "carrier_scan_ts", type: "timestamp", samples: ["2026-07-01 08:12:44", "2026-07-01 09:03:10"] },
    suggested: { table: "shipments", column: "shipped_at", type: "timestamptz", desc: "Timestamp the parcel left the warehouse." },
    confidence: "low" },
  { id: "p11", novel: { table: "cust_master", column: "loyalty_tier", type: "varchar(16)", samples: ["gold", "silver", "bronze"] },
    suggested: { table: "customers", column: "region", type: "text", desc: "Sales region assignment." },
    confidence: "low" },
  { id: "p12", novel: { table: "prod_cat", column: "hazmat_flg", type: "boolean", samples: ["false", "false", "true"] },
    suggested: { table: "products", column: "category", type: "text", desc: "Product merchandising category." },
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
      <span class="conf-badge ${conf.cssClass}">${conf.label} confidence</span>
    </div>

    <div class="match-flow">
      <div class="match-card">
        <h3>Incoming (novel)</h3>
        <div class="card-name">${p.novel.table}.${p.novel.column}</div>
        <span class="card-type">${p.novel.type}</span>
        <div class="card-desc">From this week's dataset.</div>
      </div>
      <div class="match-arrow">→</div>
      <div class="match-card">
        <h3>Suggested canonical</h3>
        <div class="card-name">${p.suggested.table}.${p.suggested.column}</div>
        <span class="card-type">${p.suggested.type}</span>
        <div class="card-desc">${p.suggested.desc}</div>
      </div>
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
