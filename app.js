(function () {
 const cfg = window.CRM_CONFIG;
 const stageNames = cfg.pipelineStages.map((s) => s.name);
 const stageColors = Object.fromEntries(cfg.pipelineStages.map((s) => [s.name, s.color]));

 let pharmacies = [];
 let tasks = [];
 let teamConfig = { members: [...cfg.defaultTeamMembers], assignees: [...cfg.assignees] };
 let taskFilter = "mine";
 let activeView = "pipeline";
 let filters = { state: "", type: "", relevance: "", stage: "", status: "", assignee: "", search: "" };
 let dragId = null;
 const sync = window.CRM_SYNC;

 const $ = (sel, root = document) => root.querySelector(sel);
 const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

 function toast(msg) {
 const el = $("#toast");
 el.textContent = msg;
 el.classList.add("show");
 clearTimeout(toast._t);
 toast._t = setTimeout(() => el.classList.remove("show"), 2200);
 }

 function assigneeList() {
 return teamConfig.assignees?.length ? teamConfig.assignees : cfg.assignees;
 }

 function buildPayload() {
 return {
 pharmacies,
 tasks,
 teamConfig,
 savedAt: new Date().toISOString(),
 updatedBy: sync?.currentUser?.() || "Team member"
 };
 }

 function applyRemoteState(remote, silent = false) {
 if (!remote) return;
 if (Array.isArray(remote.pharmacies) && remote.pharmacies.length) pharmacies = remote.pharmacies;
 if (Array.isArray(remote.tasks)) tasks = remote.tasks;
 if (remote.teamConfig) teamConfig = { ...teamConfig, ...remote.teamConfig };
 localStorage.setItem(cfg.storageKey, JSON.stringify(buildPayload()));
 refreshAssigneeFilters();
 renderActiveView();
 updateSyncStatus(remote.updatedBy ? `Team live | ${remote.updatedBy}` : "Team live");
 if (!silent) toast("Team data updated");
 }

 function save(pushRemote = true) {
 const payload = buildPayload();
 localStorage.setItem(cfg.storageKey, JSON.stringify(payload));
 updateSidebarStats();
 if (pushRemote && sync?.isEnabled?.()) {
 sync.pushRemote(payload)
 .then(() => {
 sync.markPushed();
 updateSyncStatus(`Team live | ${payload.updatedBy}`);
 })
 .catch(() => {
 updateSyncStatus("Sync error", true);
 toast("Saved locally - cloud sync failed");
 });
 } else {
 updateSyncStatus(sync?.isEnabled?.() ? "Saved locally" : "Local only");
 }
 }

 function load() {
 const raw = localStorage.getItem(cfg.storageKey);
 if (raw) {
 try {
 const parsed = JSON.parse(raw);
 if (Array.isArray(parsed.pharmacies) && parsed.pharmacies.length) {
 pharmacies = parsed.pharmacies;
 tasks = Array.isArray(parsed.tasks) ? parsed.tasks : [];
 if (parsed.teamConfig) teamConfig = { ...teamConfig, ...parsed.teamConfig };
 return;
 }
 } catch (_) {}
 }
 pharmacies = JSON.parse(JSON.stringify(window.SEED_PHARMACIES || []));
 tasks = [];
 save(false);
 }

 function updateSyncStatus(text, isError = false) {
 const el = $("#sync-status");
 if (!el) return;
 el.textContent = text;
 el.classList.toggle("sync-error", isError);
 el.classList.toggle("sync-live", text.includes("Synced") || text.includes("Team live"));
 }

 function refreshAssigneeFilters() {
 const list = assigneeList();
 const current = $("#filter-assignee")?.value || "";
 if ($("#filter-assignee")) {
 $("#filter-assignee").innerHTML = `<option value="">All assignees</option>${list.map((s) => `<option>${escapeHtml(s)}</option>`).join("")}`;
 $("#filter-assignee").value = list.includes(current) ? current : "";
 }
 }

 function nextTaskId() {
 const nums = tasks.map((t) => Number(String(t.id).replace(/\D/g, "")) || 0);
 return `task-${Math.max(0, ...nums) + 1}`;
 }

 function addTask({ pharmacyId, title, assignee, dueDate }) {
 const p = pharmacies.find((x) => x.id === pharmacyId);
 tasks.unshift({
 id: nextTaskId(),
 pharmacyId: pharmacyId || "",
 pharmacyName: p?.name || "",
 title: title || "Follow up",
 assignee: assignee || "Unassigned",
 dueDate: dueDate || today(),
 status: "open",
 createdBy: sync?.currentUser?.() || "Team member",
 createdAt: today()
 });
 save();
 renderActiveView();
 toast("Task added");
 }

 function completeTask(id) {
 const t = tasks.find((x) => x.id === id);
 if (!t) return;
 t.status = "done";
 t.completedAt = today();
 t.completedBy = sync?.currentUser?.() || "Team member";
 save();
 renderActiveView();
 }

 function deleteTask(id) {
 tasks = tasks.filter((t) => t.id !== id);
 save();
 renderActiveView();
 }

 function autoAssignDeals() {
 const members = teamConfig.members.filter((m) => m && m !== "Unassigned");
 if (!members.length) {
 alert("Add team member names in Settings -> Team roster first.");
 return;
 }
 const open = pharmacies.filter((p) => p.status === "Open" && (!p.assignee || p.assignee === "Unassigned"));
 if (!open.length) {
 toast("No unassigned open deals");
 return;
 }
 open.sort((a, b) => (b.relevance === "High") - (a.relevance === "High"));
 open.forEach((p, i) => {
 p.assignee = members[i % members.length];
 p.lastActivity = today();
 });
 save();
 renderActiveView();
 toast(`Auto-assigned ${open.length} deals to ${members.join(", ")}`);
 }

 function quickAssignDeal(id, assignee) {
 const p = pharmacies.find((x) => x.id === id);
 if (!p) return;
 p.assignee = assignee;
 p.lastActivity = today();
 save();
 renderActiveView();
 toast(`Assigned to ${assignee}`);
 }

 function normalizeStage(stage) {
 return stageNames.includes(stage) ? stage : "Appointment";
 }

 function filteredPharmacies() {
 const q = filters.search.trim().toLowerCase();
 return pharmacies.filter((p) => {
 if (filters.state && p.state !== filters.state) return false;
 if (filters.type && (p.accountType || p.type) !== filters.type) return false;
 if (filters.relevance && p.relevance !== filters.relevance) return false;
 if (filters.stage && normalizeStage(p.stage) !== filters.stage) return false;
 if (filters.status && p.status !== filters.status) return false;
 if (filters.assignee) {
 const a = p.assignee || "Unassigned";
 if (filters.assignee === "Unassigned" ? a !== "Unassigned" && a !== "" : a !== filters.assignee) return false;
 }
 if (!q) return true;
 const hay = [p.name, p.address, p.phone, p.email, p.state, p.postcode, p.type, p.notes, p.contactName, p.city]
 .join(" ")
 .toLowerCase();
 return hay.includes(q);
 });
 }

 function formatMoney(n) {
 return new Intl.NumberFormat("en-AU", { style: "currency", currency: cfg.currency, maximumFractionDigits: 0 }).format(Number(n) || 0);
 }

 function saleValue(p) {
 if (p.potentialSale === false) return 0;
 return Number(p.value) || 0;
 }

 function tierMeta(tierKey) {
 return cfg.orderTiers[tierKey] || cfg.orderTiers[500];
 }

 function tierLabel(p) {
 if (p.potentialSale === false) return "No forecast";
 if (p.orderTier === "custom") return `Custom ${formatMoney(p.value)}`;
 const t = tierMeta(p.orderTier);
 return t ? `${t.units.toLocaleString()} units ${formatMoney(t.total)}` : formatMoney(p.value);
 }

 function applyTier(record, tierKey, customTotal) {
 if (tierKey === "custom") {
 record.orderTier = "custom";
 record.value = Math.max(0, Number(customTotal) || 0);
 record.potentialSale = record.value > 0;
 return record;
 }
 const t = tierMeta(Number(tierKey));
 if (!t) return record;
 record.orderTier = Number(tierKey);
 record.units = t.units;
 record.unitPrice = t.unitPrice;
 record.subtotal = t.subtotal;
 record.shipping = t.shipping;
 record.tax = Math.round((t.subtotal + t.shipping) * cfg.gstRate);
 record.value = t.total;
 record.potentialSale = true;
 return record;
 }

 function revenueStats(list) {
 const active = list.filter((p) => p.potentialSale !== false && saleValue(p) > 0);
 const open = active.filter((p) => p.status === "Open");
 const won = active.filter((p) => p.status === "Won");
 const totalPotential = active.reduce((s, p) => s + saleValue(p), 0);
 const openPotential = open.reduce((s, p) => s + saleValue(p), 0);
 const wonRevenue = won.reduce((s, p) => s + saleValue(p), 0);
 const tiers = { 500: { count: 0, sum: 0 }, 1000: { count: 0, sum: 0 }, 2000: { count: 0, sum: 0 }, custom: { count: 0, sum: 0 } };
 active.forEach((p) => {
 const key = p.orderTier === "custom" ? "custom" : (cfg.orderTiers[p.orderTier] ? p.orderTier : 500);
 tiers[key].count += 1;
 tiers[key].sum += saleValue(p);
 });
 const progress = totalPotential ? Math.min(100, (wonRevenue / totalPotential) * 100) : 0;
 return { active: active.length, open: open.length, won: won.length, totalPotential, openPotential, wonRevenue, tiers, progress };
 }

 function priorityClass(p) {
 return p === "High" ? "pill-high" : p === "Low" ? "pill-low" : "pill-medium";
 }

 function initials(name) {
 const parts = String(name || "?").trim().split(/\s+/).filter(Boolean);
 return ((parts[0]?.[0] || "") + (parts[1]?.[0] || parts[0]?.[1] || "")).toUpperCase().slice(0, 2);
 }

 function nextId() {
 const nums = pharmacies.map((p) => Number(String(p.id).replace(/\D/g, "")) || 0);
 return `pharm-${Math.max(0, ...nums) + 1}`;
 }

 function metrics(list) {
 const open = list.filter((p) => p.status === "Open");
 const won = list.filter((p) => p.status === "Won");
 const high = list.filter((p) => p.relevance === "High" || p.priority === "High");
 const rev = revenueStats(list);
 return { total: list.length, open: open.length, won: won.length, high: high.length, pipelineValue: rev.openPotential };
 }

 function updateSidebarStats() {
 const m = metrics(pharmacies);
 const all = revenueStats(pharmacies);
 $("#stat-total").textContent = m.total;
 $("#stat-open").textContent = m.open;
 $("#stat-won").textContent = m.won;
 $("#stat-value").textContent = formatMoney(all.totalPotential);
 }

 function renderRevenueHero(list) {
 const all = revenueStats(pharmacies);
 const view = revenueStats(list);
 const t = all.tiers;
 $("#revenue-hero").innerHTML = `
 <div class="revenue-hero-top">
 <div>
 <h2>Potential revenue engine</h2>
 <p class="tagline">Every store is pre-loaded with a realistic order forecast - like <strong>Easy Kind</strong> growing from 500 units to 2,000. Top compounding &amp; popular pharmacies get the scale tier. Edit or remove any amount when you close a real deal.</p>
 </div>
 <div class="revenue-big">
 <span>Total addressable pipeline</span>
 <strong>${formatMoney(all.totalPotential)}</strong>
 </div>
 </div>
 <div class="revenue-progress">
 <div class="revenue-progress-label"><span>Won so far | ${formatMoney(all.wonRevenue)}</span><span>${all.progress.toFixed(1)}% of potential captured</span></div>
 <div class="revenue-bar"><div class="revenue-bar-fill" style="width:${all.progress}%"></div></div>
 </div>
 <div class="revenue-tiers">
 <article class="tier-stat"><span>Starter 500 units</span><strong>${formatMoney(t[500].sum)}</strong><small>${t[500].count} stores @ $825</small></article>
 <article class="tier-stat"><span>Growth 1,000 units</span><strong>${formatMoney(t[1000].sum)}</strong><small>${t[1000].count} stores @ $1,595</small></article>
 <article class="tier-stat tier-2000"><span>Scale 2,000 units</span><strong>${formatMoney(t[2000].sum)}</strong><small>${t[2000].count} elite stores @ $3,025</small></article>
 <article class="tier-stat"><span>In current view</span><strong>${formatMoney(view.openPotential)}</strong><small>${view.open} open deals visible</small></article>
 </div>
 `;
 }

 function renderMetrics(list) {
 const m = metrics(list);
 const rev = revenueStats(list);
 $("#metrics").innerHTML = `
 <article class="metric-card"><span>Stores in view</span><strong>${m.total}</strong></article>
 <article class="metric-card"><span>Open potential</span><strong>${formatMoney(rev.openPotential)}</strong></article>
 <article class="metric-card"><span>Won revenue</span><strong>${formatMoney(rev.wonRevenue)}</strong></article>
 <article class="metric-card"><span>High priority</span><strong>${m.high}</strong></article>
 <article class="metric-card"><span>Avg deal size</span><strong>${formatMoney(rev.active ? rev.openPotential / Math.max(rev.open, 1) : 0)}</strong></article>
 `;
 }

 function moveToStage(id, stage) {
 const item = pharmacies.find((p) => p.id === id);
 if (!item) return;
 item.stage = stage;
 item.lastActivity = today();
 if (stage === "Won") {
 item.status = "Won";
 item.closeDate = today();
 } else if (stage === "Lost") {
 item.status = "Lost";
 item.closeDate = today();
 } else if (item.status === "Won" || item.status === "Lost") {
 item.status = "Open";
 item.closeDate = "";
 item.lossReason = "";
 }
 save();
 renderActiveView();
 toast(`Moved to ${stage}`);
 }

 function dealCard(p) {
 const assignOpts = assigneeList().map((a) => `<option value="${escapeHtml(a)}" ${a === (p.assignee || "Unassigned") ? "selected" : ""}>${escapeHtml(a)}</option>`).join("");
 return `
 <article class="deal-card" draggable="true" data-id="${p.id}">
 <h4>${escapeHtml(p.name)}</h4>
 <div class="deal-meta">
 <span class="pill ${priorityClass(p.priority)}">${escapeHtml(p.priority || "Medium")}</span>
 ${p.state ? `<span class="pill pill-state">${escapeHtml(p.state)}</span>` : ""}
 <span>${escapeHtml(p.accountType || p.type || "")}</span>
 </div>
 <div class="deal-meta" style="margin-top:8px;">
 ${p.potentialSale !== false && saleValue(p) > 0 ? `<span class="pill pill-tier ${p.orderTier === 2000 ? "tier-2000" : ""}">${escapeHtml(tierLabel(p))}</span>` : ""}
 </div>
 <div class="deal-foot">
 <select class="quick-assign" data-id="${p.id}" onclick="event.stopPropagation()" aria-label="Assign staff">${assignOpts}</select>
 ${saleValue(p) > 0 ? `<span class="deal-value">${formatMoney(saleValue(p))}</span>` : "<span>-</span>"}
 </div>
 </article>
 `;
 }

 function bindDealCards(root) {
 $$(".deal-card", root).forEach((card) => {
 card.addEventListener("dragstart", (e) => {
 dragId = card.dataset.id;
 card.classList.add("dragging");
 e.dataTransfer.effectAllowed = "move";
 });
 card.addEventListener("dragend", () => {
 card.classList.remove("dragging");
 dragId = null;
 $$(".column-body").forEach((b) => b.classList.remove("drag-over"));
 });
 card.addEventListener("click", () => openDrawer(card.dataset.id));
 });
 }

 function renderPipeline() {
 const list = filteredPharmacies().filter((p) => p.status !== "Lost" || filters.stage === "Lost");
 renderRevenueHero(list);
 renderMetrics(list);
 const board = $("#pipeline-board");
 board.innerHTML = cfg.pipelineStages
 .map((stage) => {
 const cards = list.filter((p) => normalizeStage(p.stage) === stage.name);
 const value = cards.reduce((s, p) => s + (Number(p.value) || 0), 0);
 return `
 <section class="pipeline-column" data-stage="${stage.name}">
 <header class="column-header">
 <div class="column-title"><span class="stage-dot" style="background:${stage.color}"></span>${stage.name}</div>
 <div style="text-align:right">
 <span class="column-count">${cards.length}</span>
 ${value ? `<div style="font-size:11px;color:var(--muted);margin-top:4px;">${formatMoney(value)}</div>` : ""}
 </div>
 </header>
 <div class="column-body" data-drop-stage="${stage.name}">
 ${cards.map(dealCard).join("") || `<div class="empty-state" style="padding:20px;font-size:12px;">Drop deals here</div>`}
 </div>
 </section>
 `;
 })
 .join("");

 bindDealCards(board);

 $$(".quick-assign", board).forEach((sel) => {
 sel.addEventListener("change", (e) => {
 e.stopPropagation();
 quickAssignDeal(sel.dataset.id, sel.value);
 });
 });

 $$(".column-body", board).forEach((body) => {
 body.addEventListener("dragover", (e) => {
 e.preventDefault();
 body.classList.add("drag-over");
 });
 body.addEventListener("dragleave", () => body.classList.remove("drag-over"));
 body.addEventListener("drop", (e) => {
 e.preventDefault();
 body.classList.remove("drag-over");
 if (dragId) moveToStage(dragId, body.dataset.dropStage);
 });
 });
 }

 function storeCard(p) {
 const stage = normalizeStage(p.stage);
 const nextStages = cfg.pipelineStages
 .filter((s) => s.name !== stage && s.name !== "Lost")
 .slice(0, 3)
 .map((s) => s.name);
 return `
 <article class="store-card" data-id="${p.id}">
 <div class="store-head">
 <div class="avatar">${initials(p.name)}</div>
 <div>
 <h3>${escapeHtml(p.name)}</h3>
 <div class="sub">${escapeHtml(p.address || "No address yet")}</div>
 </div>
 </div>
 <div class="deal-meta" style="margin-bottom:10px;">
 <span class="pill pill-stage" style="border-left:4px solid ${stageColors[stage] || "#999"}">${escapeHtml(stage)}</span>
 <span class="pill ${priorityClass(p.priority)}">${escapeHtml(p.relevance || p.priority || "Medium")}</span>
 ${p.state ? `<span class="pill pill-state">${escapeHtml(p.state)}</span>` : ""}
 </div>
 <div class="store-info">
 ${p.phone ? `<div>Tel: ${escapeHtml(p.phone)}</div>` : ""}
 ${p.email ? `<div>Email: ${escapeHtml(p.email)}</div>` : ""}
 <div>Type: ${escapeHtml(p.accountType || p.type || "Independent")}</div>
 ${saleValue(p) > 0 ? `<div>$ <span class="pill-revenue">${formatMoney(saleValue(p))}</span> ${escapeHtml(tierLabel(p))}</div>` : ""}
 </div>
 <div class="store-actions">
 ${nextStages.map((s) => `<button type="button" class="quick-stage" data-id="${p.id}" data-stage="${s}">-> ${s}</button>`).join("")}
 </div>
 </article>
 `;
 }

 function renderStores() {
 const list = filteredPharmacies();
 renderRevenueHero(list);
 renderMetrics(list);
 const grid = $("#stores-grid");
 grid.innerHTML = list.length
 ? list.map(storeCard).join("")
 : `<div class="empty-state full">No stores match your filters.</div>`;

 $$(".store-card", grid).forEach((card) => {
 card.addEventListener("click", (e) => {
 if (e.target.closest(".quick-stage")) return;
 openDrawer(card.dataset.id);
 });
 });
 $$(".quick-stage", grid).forEach((btn) => {
 btn.addEventListener("click", (e) => {
 e.stopPropagation();
 moveToStage(btn.dataset.id, btn.dataset.stage);
 });
 });
 }

 function contactCard(p) {
 const contact = p.contactName || (p.email ? p.email.split("@")[0] : "Contact");
 return `
 <article class="contact-card" data-id="${p.id}">
 <div class="contact-head">
 <div class="avatar contact">${initials(contact)}</div>
 <div>
 <h3>${escapeHtml(contact)}</h3>
 <div class="sub">${escapeHtml(p.contactTitle || "Pharmacist")} ${escapeHtml(p.contactType || "Prospect")}</div>
 </div>
 </div>
 <div class="sub" style="margin-bottom:10px;font-weight:700;color:var(--moss);">${escapeHtml(p.name)}</div>
 <div class="store-info">
 ${p.email ? `<div>Email: ${escapeHtml(p.email)}</div>` : ""}
 ${p.phone ? `<div>Tel: ${escapeHtml(p.phone)}</div>` : ""}
 ${p.state ? `<div>Loc: ${escapeHtml(p.state)} ${escapeHtml(p.postcode || "")}</div>` : ""}
 </div>
 <div class="deal-meta" style="margin-top:12px;">
 <span class="pill pill-stage">${escapeHtml(normalizeStage(p.stage))}</span>
 <span class="pill ${priorityClass(p.priority)}">${escapeHtml(p.priority || "Medium")}</span>
 </div>
 </article>
 `;
 }

 function renderContacts() {
 const list = filteredPharmacies();
 renderRevenueHero(list);
 renderMetrics(list);
 const grid = $("#contacts-grid");
 grid.innerHTML = list.length
 ? list.map(contactCard).join("")
 : `<div class="empty-state full">No contacts match your filters.</div>`;
 $$(".contact-card", grid).forEach((card) => {
 card.addEventListener("click", () => openDrawer(card.dataset.id));
 });
 }

 function renderTasks() {
 const me = sync?.currentUser?.() || "Team member";
 const list = tasks.filter((t) => {
 if (taskFilter === "mine") return t.assignee === me || t.createdBy === me;
 if (taskFilter === "open") return t.status !== "done";
 if (taskFilter === "done") return t.status === "done";
 return true;
 });

 $("#tasks-toolbar").innerHTML = `
 <div class="tasks-toolbar-inner">
 <div>
 <h2 style="margin:0;font-size:18px;">Team tasks</h2>
 <p style="margin:4px 0 0;color:var(--muted);font-size:13px;">Assign follow-ups to staff. Everyone sees the same list when team sync is on.</p>
 </div>
 <div class="tasks-actions">
 <select id="task-filter" class="filter-chip">
 <option value="open" ${taskFilter === "open" ? "selected" : ""}>Open tasks</option>
 <option value="mine" ${taskFilter === "mine" ? "selected" : ""}>Assigned to me</option>
 <option value="all" ${taskFilter === "all" ? "selected" : ""}>All tasks</option>
 <option value="done" ${taskFilter === "done" ? "selected" : ""}>Completed</option>
 </select>
 <button type="button" class="btn btn-primary btn-small" id="btn-new-task">+ New task</button>
 </div>
 </div>`;

 const grid = $("#tasks-grid");
 grid.innerHTML = list.length
 ? list.map((t) => `
 <article class="task-card ${t.status === "done" ? "done" : ""}" data-id="${t.id}">
 <div class="task-top">
 <span class="pill ${t.status === "done" ? "" : "pill-high"}">${t.status === "done" ? "Done" : "Open"}</span>
 <small>Due ${escapeHtml(t.dueDate || "-")}</small>
 </div>
 <h3>${escapeHtml(t.title)}</h3>
 <p class="sub">${escapeHtml(t.pharmacyName || "General")}</p>
 <div class="deal-meta" style="margin-top:10px;">
 <span class="pill pill-state">-> ${escapeHtml(t.assignee || "Unassigned")}</span>
 <span class="pill">by ${escapeHtml(t.createdBy || "")}</span>
 </div>
 <div class="store-actions" style="margin-top:12px;">
 ${t.status !== "done" ? `<button type="button" class="btn btn-secondary btn-small task-done" data-id="${t.id}">Mark done</button>` : ""}
 ${t.pharmacyId ? `<button type="button" class="btn btn-ghost btn-small task-open-store" data-id="${t.pharmacyId}">Open store</button>` : ""}
 <button type="button" class="btn btn-ghost btn-small task-delete" data-id="${t.id}">Delete</button>
 </div>
 </article>`).join("")
 : `<div class="empty-state full">No tasks here. Open a store and use <strong>Quick task for staff</strong>, or click <strong>+ New task</strong>.</div>`;

 $("#task-filter").onchange = (e) => { taskFilter = e.target.value; renderTasks(); };
 $("#btn-new-task").onclick = () => {
 const title = prompt("Task description:");
 if (!title?.trim()) return;
 const assignee = prompt(`Assign to (${teamConfig.members.join(", ")}):`, teamConfig.members[0] || "Lewis");
 addTask({ title: title.trim(), assignee: assignee?.trim() || "Unassigned" });
 };
 $$(".task-done", grid).forEach((b) => b.onclick = () => completeTask(b.dataset.id));
 $$(".task-delete", grid).forEach((b) => b.onclick = () => { if (confirm("Delete this task?")) deleteTask(b.dataset.id); });
 $$(".task-open-store", grid).forEach((b) => b.onclick = () => openDrawer(b.dataset.id));
 }

 function formatMemberEmails() {
 const map = teamConfig.memberEmails || {};
 return teamConfig.members.map((m) => `${m}: ${map[m] || ""}`).join("\n");
 }

 function parseMemberEmails(text) {
 const map = {};
 text.split("\n").forEach((line) => {
 const idx = line.indexOf(":");
 if (idx < 1) return;
 const name = line.slice(0, idx).trim();
 const email = line.slice(idx + 1).trim();
 if (name && email) map[name] = email;
 });
 return map;
 }

 function renderSettings() {
 const syncSettings = sync?.loadSettings?.() || {};
 const userName = sync?.currentUser?.() || "";
 const serverMode = sync?.usesServer?.();
 const serverCfg = sync?.getServerConfig?.() || {};
 const syncBlock = serverMode
 ? `<article class="settings-card settings-wide">
 <h3>Team sync</h3>
 <p style="color:var(--muted);font-size:13px;line-height:1.6;margin:0;">Cloud sync is managed on the server (${serverCfg.syncBackend?.backend || "github"}). Everyone signed in shares the same live pipeline.</p>
 <p style="margin:12px 0 0;font-size:13px;">Email alerts: <strong>${serverCfg.emailEnabled ? "On" : "Off"}</strong> (from info@leaflock.com.au)</p>
 <p style="margin:8px 0 0;font-size:12px;color:var(--muted);">JSONBin not needed — team data syncs via GitHub automatically.</p>
 <button class="btn btn-ghost btn-small" id="btn-logout" type="button" style="margin-top:14px;">Sign out</button>
 </article>`
 : `<article class="settings-card settings-wide">
 <h3>Team sync (multiple users)</h3>
 <p style="color:var(--muted);font-size:13px;line-height:1.6;margin:0 0 12px;">
 Share one live CRM. Create a free bin at <strong>jsonbin.io</strong>, paste Bin ID and Master Key below.
 </p>
 <label class="field"><span>Your name (shown on edits)</span><input id="set-user-name" value="${attr(userName)}" placeholder="e.g. Lewis"></label>
 <label class="field" style="margin-top:10px;"><span>JSONBin Bin ID</span><input id="set-bin-id" value="${attr(syncSettings.binId || "")}" placeholder="e.g. 65f1a2b3c4d5e6f7g8h9i0j"></label>
 <label class="field" style="margin-top:10px;"><span>JSONBin Master Key</span><input id="set-master-key" type="password" value="${attr(syncSettings.masterKey || "")}" placeholder="$2a$10$..."></label>
 <label class="sale-toggle" style="margin-top:10px;"><input type="checkbox" id="set-sync-enabled" ${syncSettings.enabled ? "checked" : ""}> Enable team sync</label>
 <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px;">
 <button class="btn btn-primary btn-small" id="btn-save-sync" type="button">Save sync settings</button>
 <button class="btn btn-secondary btn-small" id="btn-pull-sync" type="button">Pull latest now</button>
 </div>
 </article>`;

 $("#settings-content").innerHTML = `
 <div class="settings-grid">
 ${syncBlock}
 <article class="settings-card">
 <h3>Team roster</h3>
 <p style="color:var(--muted);font-size:13px;line-height:1.6;margin:0 0 10px;">One name per line - used for assignees and auto-assign.</p>
 <textarea id="set-team-members" rows="5">${escapeHtml(teamConfig.members.join("\n"))}</textarea>
 <button class="btn btn-secondary btn-small" id="btn-save-team" type="button" style="margin-top:10px;">Save roster</button>
 <button class="btn btn-ghost btn-small" id="btn-auto-assign" type="button" style="margin-top:10px;">Auto-assign open deals</button>
 </article>
 <article class="settings-card settings-wide">
 <h3>Staff emails (for task &amp; follow-up alerts)</h3>
 <p style="color:var(--muted);font-size:13px;line-height:1.6;margin:0 0 10px;">One per line: <code>Name: email@leaflock.com.au</code> — matches roster names exactly.</p>
 <textarea id="set-member-emails" rows="5" placeholder="Lewis: lewis@leaflock.com.au">${escapeHtml(formatMemberEmails())}</textarea>
 <button class="btn btn-secondary btn-small" id="btn-save-emails" type="button" style="margin-top:10px;">Save emails</button>
 </article>
 <article class="settings-card">
 <h3>Pipeline stages</h3>
 <div class="stage-list">${cfg.pipelineStages.map((s) => `<span style="border-color:${s.color}55;background:${s.color}18;color:${s.color}">${s.name}</span>`).join("")}</div>
 </article>
 <article class="settings-card">
 <h3>Your data</h3>
 <p style="color:var(--muted);font-size:13px;line-height:1.6;margin:0 0 14px;">
 <strong>${pharmacies.length}</strong> pharmacies <strong>${tasks.length}</strong> tasks. Saves automatically${sync?.isEnabled?.() ? " and syncs to your team." : " on this device."}
 </p>
 <div style="display:flex;gap:8px;flex-wrap:wrap;">
 <button class="btn btn-secondary btn-small" id="btn-export" type="button">Backup JSON</button>
 <label class="btn btn-ghost btn-small" style="display:inline-flex;align-items:center;cursor:pointer;">Restore JSON<input id="import-file" type="file" accept="application/json,.json" hidden></label>
 <button class="btn btn-ghost btn-small" id="btn-reset" type="button">Reload 646 stores</button>
 </div>
 </article>
 <article class="settings-card">
 <h3>Order tiers (pre-loaded on every store)</h3>
 <ul style="margin:0;padding-left:18px;color:var(--muted);line-height:1.8;font-size:13px;">
 <li><strong>500 units</strong> - $1.45 x 500 = $725 + $25 ship + GST = <strong>$825</strong></li>
 <li><strong>1,000 units</strong> - $1.40 x 1,000 = $1,400 + $50 ship + GST = <strong>$1,595</strong></li>
 <li><strong>2,000 units</strong> - $1.35 x 2,000 = $2,700 + $50 ship + GST = <strong>$3,025</strong> (Easy Kind growth path)</li>
 </ul>
 <p style="color:var(--muted);font-size:12px;margin:12px 0 0;">~20% of elite compounding &amp; popular chains get the $3,025 tier. Click any store to change tier, set a custom $, or remove the forecast.</p>
 </article>
 </div>`;
 $("#btn-logout")?.addEventListener("click", async () => {
 await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
 location.href = "/login.html";
 });

 $("#btn-save-emails")?.addEventListener("click", () => {
 teamConfig.memberEmails = parseMemberEmails($("#set-member-emails").value);
 save();
 toast("Staff emails saved");
 });

 if ($("#btn-save-sync")) $("#btn-save-sync").onclick = () => {
 const members = teamConfig.members;
 sync.saveSettings({
 enabled: $("#set-sync-enabled").checked,
 binId: $("#set-bin-id").value.trim(),
 masterKey: $("#set-master-key").value.trim()
 });
 sync.setCurrentUser($("#set-user-name").value.trim() || "Team member");
 toast("Sync settings saved");
 if (sync.isEnabled()) {
 sync.startPolling(applyRemoteState);
 save();
 updateSyncStatus("Team live");
 } else {
 sync.stopPolling();
 updateSyncStatus("Local only");
 }
 };
 if ($("#btn-pull-sync")) $("#btn-pull-sync").onclick = async () => {
 if (!sync.isEnabled()) return toast("Enable team sync first");
 try {
 const remote = await sync.fetchRemote();
 applyRemoteState(remote);
 } catch (e) {
 toast("Could not pull team data");
 }
 };
 $("#btn-save-team").onclick = () => {
 const members = $("#set-team-members").value.split("\n").map((s) => s.trim()).filter(Boolean);
 teamConfig.members = members.length ? members : [...cfg.defaultTeamMembers];
 teamConfig.assignees = ["Unassigned", ...teamConfig.members, "Sales Team"];
 save();
 refreshAssigneeFilters();
 toast("Team roster saved");
 };
 $("#btn-auto-assign").onclick = autoAssignDeals;
 $("#btn-export").onclick = exportData;
 $("#import-file").onchange = importData;
 $("#btn-reset").onclick = () => {
 if (confirm("Reload all 646 pharmacies from seed data? Your current changes will be lost.")) {
 localStorage.removeItem(cfg.storageKey);
 load();
 renderActiveView();
 toast("Reloaded seed data");
 }
 };
 }

 function renderActiveView() {
 updateSidebarStats();
 $$(".view").forEach((v) => v.classList.toggle("active", v.id === `view-${activeView}`));
 $$(".nav button").forEach((b) => b.classList.toggle("active", b.dataset.view === activeView));
 const titles = { pipeline: "Sales Pipeline", stores: "Pharmacy Stores", contacts: "Contacts", tasks: "Team Tasks", settings: "Settings" };
 $("#page-title").textContent = titles[activeView] || "CRM";
 $("#revenue-hero").style.display = (activeView === "settings" || activeView === "tasks") ? "none" : "block";
 if (activeView === "pipeline") renderPipeline();
 if (activeView === "stores") renderStores();
 if (activeView === "contacts") renderContacts();
 if (activeView === "tasks") renderTasks();
 if (activeView === "settings") {
 renderRevenueHero(pharmacies);
 renderSettings();
 }
 }

 function withoutAll(arr) {
 return arr.filter((v) => v !== "All");
 }

 function options(arr, selected = "") {
 return arr.map((v) => `<option value="${escapeHtml(v)}" ${v === selected ? "selected" : ""}>${escapeHtml(v)}</option>`).join("");
 }

 function openDrawer(id, isNew = false) {
 const p = isNew
 ? blankRecord()
 : pharmacies.find((x) => x.id === id);

 if (!p) return;

 $("#drawer-title").textContent = isNew ? "Add new store" : p.name;
 $("#drawer-sub").textContent = isNew
 ? "Create a new pharmacy in your pipeline"
 : [p.address, p.state, p.postcode].filter(Boolean).join(" ") || "No location set";

 $("#drawer-body").innerHTML = `
 <form id="deal-form" class="form-grid">
 <label class="field full"><span>Store name *</span><input name="name" required value="${attr(p.name)}"></label>
 <label class="field full"><span>Address</span><input name="address" value="${attr(p.address)}"></label>
 <label class="field"><span>Phone</span><input name="phone" value="${attr(p.phone)}"></label>
 <label class="field"><span>Email</span><input name="email" type="email" value="${attr(p.email)}"></label>
 <label class="field"><span>Website</span><input name="website" placeholder="URL or Yes" value="${attr(p.website || (p.hasWebsite ? "Yes" : ""))}"></label>
 <label class="field"><span>State</span><select name="state"><option value=""></option>${options(cfg.australianStates, p.state)}</select></label>
 <label class="field"><span>Postcode</span><input name="postcode" value="${attr(p.postcode)}"></label>
 <label class="field"><span>Store type</span><select name="accountType">${options(cfg.pharmacyTypes, p.accountType || p.type)}</select></label>
 <label class="field"><span>Priority</span><select name="relevance"><option>High</option><option>Medium</option><option>Low</option></select></label>
 <label class="field"><span>Pipeline stage</span><select name="stage">${options(stageNames, normalizeStage(p.stage))}</select></label>
 <label class="field"><span>Status</span><select name="status">${options(withoutAll(cfg.dealStatuses), p.status || "Open")}</select></label>
 <label class="field"><span>Assignee</span><select name="assignee">${options(assigneeList(), p.assignee || "Unassigned")}</select></label>

 <div class="field full task-inline-box">
 <span>Quick task for staff</span>
 <div class="task-inline-row">
 <input id="quick-task-title" placeholder="e.g. Call about humidity packs" />
 <select id="quick-task-assignee">${options(assigneeList().filter((a) => a !== "Unassigned"), p.assignee && p.assignee !== "Unassigned" ? p.assignee : teamConfig.members[0] || "Lewis")}</select>
 <button type="button" class="btn btn-secondary btn-small" id="btn-quick-task">Add task</button>
 </div>
 </div>

 <div class="potential-sale-box">
 <h3>Potential order &amp; revenue</h3>
 <label class="sale-toggle"><input type="checkbox" name="potentialSale" ${p.potentialSale !== false ? "checked" : ""}> Include in revenue forecast</label>
 <label class="field"><span>Order tier</span>
 <select name="orderTier" id="order-tier-select">
 <option value="500" ${p.orderTier == 500 ? "selected" : ""}>Starter - 500 units ($825)</option>
 <option value="1000" ${p.orderTier == 1000 ? "selected" : ""}>Growth - 1,000 units ($1,595)</option>
 <option value="2000" ${p.orderTier == 2000 ? "selected" : ""}>Scale - 2,000 units ($3,025) Easy Kind path</option>
 <option value="custom" ${p.orderTier === "custom" ? "selected" : ""}>Custom amount (you set the $)</option>
 </select>
 </label>
 <label class="field" id="custom-total-wrap" style="${p.orderTier === "custom" ? "" : "display:none"}"><span>Custom deal total (inc. ship + GST)</span><input name="customTotal" type="number" min="0" step="1" value="${p.orderTier === "custom" ? Number(p.value) || 0 : 0}"></label>
 <div id="tier-preview" class="tier-preview"></div>
 <button type="button" class="btn btn-ghost btn-small" id="btn-clear-sale">Remove potential sale</button>
 </div>
 <label class="field"><span>Lead source</span><select name="source">${options(withoutAll(cfg.leadSources), p.source || "Outbound")}</select></label>
 <label class="field"><span>Contact name</span><input name="contactName" value="${attr(p.contactName)}"></label>
 <label class="field"><span>Contact title</span><input name="contactTitle" value="${attr(p.contactTitle || "Pharmacist")}"></label>
 <label class="field full"><span>Notes</span><textarea name="notes" rows="3">${escapeHtml(p.notes || "")}</textarea></label>
 <label class="field full"><span>Why this store matters</span><textarea name="description" rows="2">${escapeHtml(p.description || p.whyRelevant || "")}</textarea></label>
 <div class="drawer-actions full">
 ${!isNew ? `<button type="button" class="btn btn-ghost" id="btn-delete">Delete store</button>` : "<span></span>"}
 <div style="display:flex;gap:8px;">
 <button type="button" class="btn btn-secondary" id="btn-cancel">Cancel</button>
 <button type="submit" class="btn btn-primary">${isNew ? "Add store" : "Save"}</button>
 </div>
 </div>
 </form>`;

 const form = $("#deal-form");
 form.relevance.value = p.relevance || "Medium";

 function updateTierPreview() {
 const tier = form.orderTier.value;
 const enabled = form.potentialSale.checked;
 $("#custom-total-wrap").style.display = tier === "custom" ? "" : "none";
 const preview = $("#tier-preview");
 if (!enabled) {
 preview.innerHTML = `<span>Excluded from revenue forecast</span><strong>$0</strong>`;
 return;
 }
 if (tier === "custom") {
 const v = Number(form.customTotal?.value) || 0;
 preview.innerHTML = `<span>Your custom deal - edit anytime once they're onboard</span><strong>${formatMoney(v)}</strong>`;
 return;
 }
 const t = tierMeta(Number(tier));
 preview.innerHTML = `
 <span>${escapeHtml(t.note)}</span>
 <strong>${formatMoney(t.total)}</strong>
 <div>${t.units.toLocaleString()} units x $${t.unitPrice.toFixed(2)} = ${formatMoney(t.subtotal)} + ${formatMoney(t.shipping)} shipping + GST</div>`;
 }

 form.orderTier.addEventListener("change", updateTierPreview);
 form.potentialSale.addEventListener("change", updateTierPreview);
 if (form.customTotal) form.customTotal.addEventListener("input", updateTierPreview);
 $("#btn-clear-sale").onclick = () => {
 form.potentialSale.checked = false;
 updateTierPreview();
 toast("Potential sale removed - save to confirm");
 };
 updateTierPreview();

 $("#btn-cancel").onclick = closeDrawer;
 if (!isNew) $("#btn-delete").onclick = () => deletePharmacy(id);
 $("#btn-quick-task")?.addEventListener("click", () => {
 const title = $("#quick-task-title")?.value?.trim();
 if (!title) return toast("Enter a task description");
 addTask({
 pharmacyId: id,
 title,
 assignee: $("#quick-task-assignee")?.value || "Unassigned"
 });
 $("#quick-task-title").value = "";
 });

 form.onsubmit = (e) => {
 e.preventDefault();
 const fd = new FormData(form);
 const data = Object.fromEntries(fd.entries());
 const website = data.website.trim();
 const record = {
 ...p,
 name: data.name.trim(),
 address: data.address.trim(),
 phone: data.phone.trim(),
 email: data.email.trim(),
 website,
 state: data.state,
 postcode: data.postcode.trim(),
 type: data.accountType,
 accountType: data.accountType,
 relevance: data.relevance,
 priority: data.relevance === "High" ? "High" : data.relevance === "Low" ? "Low" : "Medium",
 stage: data.stage,
 status: data.status,
 assignee: data.assignee,
 source: data.source,
 contactName: data.contactName.trim(),
 contactTitle: data.contactTitle.trim(),
 contactType: p.contactType || "Prospect",
 hasWebsite: website.toLowerCase() === "yes" || /^https?:\/\//i.test(website),
 description: data.description.trim(),
 whyRelevant: data.description.trim(),
 notes: data.notes.trim(),
 lastActivity: today(),
 potentialSale: data.potentialSale === "on"
 };

 if (record.potentialSale) {
 applyTier(record, data.orderTier, data.customTotal);
 } else {
 record.value = 0;
 record.potentialSale = false;
 }

 if (record.status === "Won") { record.stage = "Won"; record.closeDate = record.closeDate || today(); }
 if (record.status === "Lost") { record.stage = "Lost"; record.closeDate = record.closeDate || today(); }

 if (isNew) {
 record.id = nextId();
 record.createdAt = today();
 record.country = "Australia";
 if (record.potentialSale && !record.value) applyTier(record, 500);
 pharmacies.unshift(record);
 toast("Store added");
 } else {
 const idx = pharmacies.findIndex((x) => x.id === id);
 if (idx >= 0) pharmacies[idx] = record;
 toast("Saved");
 }
 save();
 closeDrawer();
 renderActiveView();
 };

 $("#drawer-backdrop").classList.add("open");
 $("#drawer").classList.add("open");
 }

 function blankRecord() {
 const r = {
 id: "", name: "", address: "", phone: "", email: "", website: "", hasWebsite: false,
 state: "", postcode: "", city: "", country: "Australia", type: "Independent", accountType: "Independent",
 relevance: "Medium", whyRelevant: "", description: "", stage: "Appointment", status: "Open",
 priority: "Medium", source: "Outbound", assignee: "Unassigned", closeDate: "", lossReason: "",
 notes: "", linkedin: "", contactName: "", contactTitle: "Pharmacist", contactType: "Prospect",
 lastActivity: today(), createdAt: today(), potentialSale: true, orderTier: 500
 };
 return applyTier(r, 500);
 }

 function closeDrawer() {
 $("#drawer-backdrop").classList.remove("open");
 $("#drawer").classList.remove("open");
 }

 function deletePharmacy(id) {
 if (!confirm("Remove this store from the CRM?")) return;
 pharmacies = pharmacies.filter((p) => p.id !== id);
 save();
 closeDrawer();
 renderActiveView();
 toast("Store removed");
 }

 function exportData() {
 const blob = new Blob([JSON.stringify(buildPayload(), null, 2)], { type: "application/json" });
 const a = document.createElement("a");
 a.href = URL.createObjectURL(blob);
 a.download = `leaflock-crm-backup-${today()}.json`;
 a.click();
 URL.revokeObjectURL(a.href);
 toast("Backup saved");
 }

 function importData(e) {
 const file = e.target.files?.[0];
 if (!file) return;
 const reader = new FileReader();
 reader.onload = () => {
 try {
 const data = JSON.parse(reader.result);
 if (!Array.isArray(data.pharmacies)) throw new Error("bad");
 pharmacies = data.pharmacies;
 tasks = Array.isArray(data.tasks) ? data.tasks : [];
 if (data.teamConfig) teamConfig = { ...teamConfig, ...data.teamConfig };
 save();
 renderActiveView();
 toast(`Restored ${pharmacies.length} stores`);
 } catch (_) {
 alert("That file didn't work. Use a LeafLock CRM backup JSON.");
 }
 };
 reader.readAsText(file);
 e.target.value = "";
 }

 function today() {
 return new Date().toISOString().slice(0, 10);
 }

 function escapeHtml(s) {
 return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
 }

 function attr(s) {
 return escapeHtml(s).replace(/"/g, "&quot;");
 }

 function openSidebar() {
 $("#sidebar").classList.add("open");
 $("#sidebar-backdrop").classList.add("open");
 $("#sidebar-backdrop").setAttribute("aria-hidden", "false");
 $("#menu-toggle")?.setAttribute("aria-expanded", "true");
 }

 function closeSidebar() {
 $("#sidebar").classList.remove("open");
 $("#sidebar-backdrop").classList.remove("open");
 $("#sidebar-backdrop").setAttribute("aria-hidden", "true");
 $("#menu-toggle")?.setAttribute("aria-expanded", "false");
 }

 function bindInstallPwa() {
 const btn = $("#btn-install");
 if (!btn) return;
 let deferredPrompt = null;

 window.addEventListener("beforeinstallprompt", (e) => {
 e.preventDefault();
 deferredPrompt = e;
 btn.hidden = false;
 });

 btn.addEventListener("click", async () => {
 if (!deferredPrompt) {
 toast("Use browser menu -> Install app, or Add to Home Screen on mobile");
 return;
 }
 deferredPrompt.prompt();
 await deferredPrompt.userChoice;
 deferredPrompt = null;
 btn.hidden = true;
 });

 window.addEventListener("appinstalled", () => {
 btn.hidden = true;
 toast("LeafLock Sales installed");
 });
 }

 function bindUi() {
 $$(".nav button").forEach((btn) => {
 btn.addEventListener("click", () => {
 activeView = btn.dataset.view;
 renderActiveView();
 closeSidebar();
 });
 });

 $("#menu-toggle")?.addEventListener("click", openSidebar);
 $("#sidebar-close")?.addEventListener("click", closeSidebar);
 $("#sidebar-backdrop")?.addEventListener("click", closeSidebar);
 bindInstallPwa();

 $("#search-input").addEventListener("input", (e) => {
 filters.search = e.target.value;
 renderActiveView();
 });

 ["filter-state", "filter-type", "filter-relevance", "filter-stage", "filter-status", "filter-assignee"].forEach((id) => {
 $("#" + id).addEventListener("change", (e) => {
 filters[id.replace("filter-", "")] = e.target.value;
 renderActiveView();
 });
 });

 $("#btn-add").addEventListener("click", () => openDrawer(null, true));
 $("#btn-clear-filters").addEventListener("click", () => {
 filters = { state: "", type: "", relevance: "", stage: "", status: "", assignee: "", search: "" };
 $("#search-input").value = "";
 ["filter-state", "filter-type", "filter-relevance", "filter-stage", "filter-status", "filter-assignee"].forEach((id) => {
 $("#" + id).value = "";
 });
 renderActiveView();
 });

 $("#drawer-close").addEventListener("click", closeDrawer);
 $("#drawer-backdrop").addEventListener("click", closeDrawer);
 document.addEventListener("keydown", (e) => {
 if (e.key === "Escape") {
 closeDrawer();
 closeSidebar();
 }
 });

 $("#filter-state").innerHTML = `<option value="">All states</option>${cfg.australianStates.map((s) => `<option>${s}</option>`).join("")}`;
 $("#filter-type").innerHTML = `<option value="">All types</option>${cfg.pharmacyTypes.map((s) => `<option>${s}</option>`).join("")}`;
 $("#filter-stage").innerHTML = `<option value="">All stages</option>${stageNames.map((s) => `<option>${s}</option>`).join("")}`;
 $("#filter-status").innerHTML = `<option value="">All statuses</option>${withoutAll(cfg.dealStatuses).map((s) => `<option>${s}</option>`).join("")}`;
 refreshAssigneeFilters();
 }

 function promptUserName() {
 if (sync?.currentUser?.() && sync.currentUser() !== "Team member") return;
 const name = prompt("Your name (for team edits & task assignment):", sync?.currentUser?.() || "");
 if (name?.trim()) sync.setCurrentUser(name.trim());
 }

 async function initSync() {
 await sync?.detectServer?.();
 if (!sync?.isEnabled?.()) {
 updateSyncStatus("Local only");
 return;
 }
 try {
 const remote = await sync.fetchRemote();
 if (remote?.pharmacies?.length) {
 applyRemoteState(remote, true);
 sync.markPushed();
 } else if (remote?.teamConfig) {
 applyRemoteState(remote, true);
 sync.markPushed();
 }
 sync.startPolling(applyRemoteState);
 updateSyncStatus(sync?.usesServer?.() ? "Team live (cloud)" : "Team live");
 } catch (_) {
 updateSyncStatus("Sync offline", true);
 }
 }

 async function init() {
 if (!window.SEED_PHARMACIES?.length) {
 document.body.innerHTML = `<div style="padding:40px;font-family:Segoe UI,sans-serif;"><h1>Missing data file</h1><p>Keep <strong>seed.js</strong> in the same folder as this HTML file.</p></div>`;
 return;
 }
 load();
 bindUi();
 renderActiveView();
 await initSync();
 if (!sync?.usesServer?.()) promptUserName();
 }

 document.addEventListener("DOMContentLoaded", () => { init(); });
})();