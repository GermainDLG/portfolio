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

const CANONICAL_SCHEMA = {
  customers: ["customer_id", "full_name", "email", "phone", "created_at", "region"],
  orders: ["order_id", "customer_id", "order_date", "status", "total_amount", "currency"],
  products: ["product_id", "sku", "product_name", "category", "unit_price"],
  shipments: ["shipment_id", "order_id", "carrier", "shipped_at", "delivered_at"],
  payments: ["payment_id", "order_id", "method", "amount", "paid_at"],
};

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
  { id: "m1", novel: { table: "cust_master", column: "cust_email", type: "varchar(120)", samples: ["ana@corp.io", "bo@mail.com"] },
    suggested: { table: "customers", column: "email", type: "text", desc: "Primary contact email for the customer." },
    confidence: "high",
    votes: {
      g1: { verdict: "accept", reason: "Exact semantic match, values are all emails." },
      g2: { verdict: "accept", reason: "Format and naming both align." },
      g3: { verdict: "accept", reason: "Clear match." },
      g4: { verdict: "accept", reason: "Agree with the matcher." },
    } },
  { id: "m2", novel: { table: "ord_hdr", column: "ord_ttl_amt", type: "decimal(12,2)", samples: ["129.99", "84.50"] },
    suggested: { table: "orders", column: "total_amount", type: "numeric", desc: "Grand total for the order, tax included." },
    confidence: "high",
    votes: {
      g1: { verdict: "accept", reason: "Totals line up with order records." },
      g2: { verdict: "accept", reason: "Straightforward." },
      g3: { verdict: "accept", reason: "Decimal→numeric is fine." },
      g4: { verdict: "accept", reason: "Match." },
    } },
  { id: "m3", novel: { table: "ord_hdr", column: "ord_stat_cd", type: "char(2)", samples: ["SH", "PD", "CX"] },
    suggested: { table: "orders", column: "status", type: "text", desc: "Order lifecycle status." },
    confidence: "med",
    votes: {
      g1: { verdict: "accept", reason: "Codes map to our status vocabulary." },
      g2: { verdict: "reject", reason: "Two-letter codes need a translation step first; raw values don't match canonical statuses." },
      g3: { verdict: "accept", reason: "Accept with ETL decode downstream." },
      g4: { verdict: "reject", reason: "SH/PD/CX aren't valid canonical statuses." },
    } },
  { id: "m4", novel: { table: "cust_master", column: "loyalty_tier", type: "varchar(16)", samples: ["gold", "silver", "bronze"] },
    suggested: { table: "customers", column: "region", type: "text", desc: "Sales region assignment." },
    confidence: "low",
    votes: {
      g1: { verdict: "reject", reason: "Loyalty tier is not a region — bad suggestion." },
      g2: { verdict: "expand", reason: "We have no home for loyalty data; propose a new column.",
            payload: { kind: "column", table: "customers", columns: [{ name: "loyalty_tier", type: "text" }] } },
      g3: { verdict: "expand", reason: "Same — customers table needs a loyalty_tier column.",
            payload: { kind: "column", table: "customers", columns: [{ name: "loyalty_tier", type: "text" }] } },
      g4: { verdict: "reject", reason: "Not a match." },
    } },
  { id: "m5", novel: { table: "ship_log", column: "carrier_scan_ts", type: "timestamp", samples: ["2026-07-01 08:12:44"] },
    suggested: { table: "shipments", column: "shipped_at", type: "timestamptz", desc: "Timestamp the parcel left the warehouse." },
    confidence: "low",
    votes: {
      g1: { verdict: "reassign", reason: "This is the carrier's scan, not our warehouse departure — belongs on delivered_at pipeline.",
            payload: { table: "shipments", column: "delivered_at" } },
      g3: { verdict: "accept", reason: "First scan ≈ shipped time, close enough." },
    } },
  { id: "m6", novel: { table: "cust_master", column: "cust_geo", type: "varchar(80)", samples: ["NA-WEST", "EU-CENTRAL"] },
    suggested: { table: "customers", column: "region", type: "text", desc: "Sales region assignment." },
    confidence: "med",
    votes: {
      g1: { verdict: "accept", reason: "Geo codes are our region codes." },
      g2: { verdict: "accept", reason: "Matches region vocabulary." },
      g3: { verdict: "assignNone", reason: "These look like warehouse zones, not sales regions — no canonical home." },
      g4: { verdict: "accept", reason: "Region match." },
    } },
];

/* ---------- Mock schema expansion requests ----------
 * signature identifies duplicates: approving one approves all with the same signature. */

const EXPANSIONS = [
  { id: "e1", requestedBy: "g2", pairing: "cust_master.loyalty_tier",
    kind: "column", table: "customers",
    columns: [{ name: "loyalty_tier", type: "text" }],
    reason: "We have no home for loyalty data; propose a new column.",
    signature: "column:customers:loyalty_tier" },
  { id: "e2", requestedBy: "g3", pairing: "cust_master.loyalty_tier",
    kind: "column", table: "customers",
    columns: [{ name: "loyalty_tier", type: "text" }],
    reason: "Same — customers table needs a loyalty_tier column.",
    signature: "column:customers:loyalty_tier" },
  { id: "e3", requestedBy: "g1", pairing: "prod_cat.hazmat_flg",
    kind: "column", table: "products",
    columns: [{ name: "hazmat_flag", type: "boolean" }],
    reason: "Hazmat handling flag is regulatory data we must keep; products table should carry it.",
    signature: "column:products:hazmat_flag" },
  { id: "e4", requestedBy: "g4", pairing: "ship_log.*",
    kind: "table", table: "carrier_events",
    columns: [
      { name: "event_id", type: "uuid" },
      { name: "shipment_id", type: "bigint" },
      { name: "event_type", type: "text" },
      { name: "scanned_at", type: "timestamptz" },
    ],
    reason: "Carrier scan events are a repeating series per shipment — they don't fit a single column on shipments.",
    signature: "table:carrier_events" },
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
    meta.innerHTML += `<span class="status-chip">${verdictOf(decision.verdict).label}</span>`;
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
        <h3>Incoming (novel)</h3>
        <div class="card-name">${m.novel.table}.${m.novel.column}</div>
        <span class="card-type">${m.novel.type}</span>
        <div class="card-desc">From this week's dataset.</div>
      </div>
      <div class="match-arrow">→</div>
      <div class="match-card">
        <h3>Suggested canonical</h3>
        <div class="card-name">${m.suggested.table}.${m.suggested.column}</div>
        <span class="card-type">${m.suggested.type}</span>
        <div class="card-desc">${m.suggested.desc}</div>
      </div>
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
    </div>`;

  $("jump-reasoning-btn").addEventListener("click", () =>
    $("reasoning-section").scrollIntoView({ behavior: "smooth", block: "start" })
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
    btn.disabled = !bulk && (!m || !!state.finalDecisions[state.activeId]);
    $("action-error").classList.add("hidden");
  } else {
    $("under-review-warning").classList.add("hidden");
    const e = EXPANSIONS.find((x) => x.id === state.activeId);
    const decided = !e || !!state.expansionDecisions[e.id];
    $("approve-expansion-btn").disabled = decided;
    $("reject-expansion-btn").disabled = decided;
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
    state.lastAction = { type: "single", id: m.id };
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
    state.lastAction = { type: "bulk", ids: [...ids] };
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
  const group = decision === "approved"
    ? EXPANSIONS.filter((x) => x.signature === e.signature && !state.expansionDecisions[x.id])
    : [e];

  state.lastAction = { type: "expansion", ids: group.map((x) => x.id) };
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
    delete state.finalDecisions[a.id];
    state.activeId = a.id;
  } else if (a.type === "bulk") {
    for (const id of a.ids) delete state.finalDecisions[id];
  } else if (a.type === "expansion") {
    for (const id of a.ids) delete state.expansionDecisions[id];
    state.activeId = a.ids[0];
  }
  state.lastAction = null;
  $("undo-toast").classList.add("hidden");
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
