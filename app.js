(function () {
 const cfg = window.CRM_CONFIG;
 const stageNames = cfg.pipelineStages.map((s) => s.name);
 const stageColors = Object.fromEntries(cfg.pipelineStages.map((s) => [s.name, s.color]));

 let pharmacies = [];
 let tasks = [];
 let teamConfig = {
 members: [...cfg.defaultTeamMembers],
 assignees: [...cfg.assignees],
 managers: [...(cfg.defaultManagers || [])],
 commissionRate: cfg.staffCommissionRate ?? 0.2
 };
 let taskFilter = "mine";
 let pipelineMode = "board";
 let staffPipelineScope = "my-work";
 let dealDrawerTab = "activity";
 let activeView = "pipeline";
 let filters = { state: "", type: "", relevance: "", stage: "", status: "", assignee: "", search: "" };
 let dragId = null;
 const taskAlertSeen = new Set();
 const liveTaskPulse = new Set();
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

 function staffName() {
 return (sync?.currentUser?.() || localStorage.getItem("leaflock-user-name") || "").trim();
 }

 function samePerson(a, b) {
 if (!a || !b) return false;
 return a.trim().toLowerCase() === b.trim().toLowerCase();
 }

 function markTasksSeen(list) {
 (list || []).forEach((t) => { if (t?.id) taskAlertSeen.add(t.id); });
 }

 function detectIncomingTasks(prevTasks, nextTasks) {
 const me = staffName();
 if (!me) return [];
 const prevMap = new Map((prevTasks || []).map((t) => [t.id, t]));
 const incoming = [];
 for (const task of nextTasks || []) {
 if (task.status === "done") continue;
 if (!samePerson(task.assignee, me)) continue;
 const old = prevMap.get(task.id);
 if (!old || !samePerson(old.assignee, me)) incoming.push(task);
 }
 return incoming;
 }

 function myOpenTasks() {
 const me = staffName();
 return tasks.filter((t) => t.status !== "done" && samePerson(t.assignee, me));
 }

 function openTasksForDeal(pharmacyId) {
 if (!pharmacyId) return [];
 const me = staffName();
 return tasks.filter((t) => {
 if (t.status === "done" || t.pharmacyId !== pharmacyId) return false;
 if (isManager()) return true;
 return samePerson(t.assignee, me) || samePerson(t.createdBy, me);
 });
 }

 function pulseLiveTasks(taskIds) {
 taskIds.forEach((id) => liveTaskPulse.add(id));
 setTimeout(() => taskIds.forEach((id) => liveTaskPulse.delete(id)), 10000);
 }

 function dealTaskStrip(p) {
 const open = openTasksForDeal(p.id);
 if (!open.length) return "";
 return `<div class="deal-task-strip">${open.slice(0, 2).map((t) => `
 <span class="deal-task-chip ${liveTaskPulse.has(t.id) ? "task-live-pulse" : ""}" title="${escapeHtml(t.title)}">
 <span class="deal-task-icon">☑</span>${escapeHtml(t.assignee)}: ${escapeHtml(t.title.length > 28 ? `${t.title.slice(0, 28)}…` : t.title)}
 </span>`).join("")}${open.length > 2 ? `<span class="deal-task-more">+${open.length - 2} more</span>` : ""}</div>`;
 }

 function showTaskAlert(task, actor = "Your manager") {
 const backdrop = $("#task-alert-backdrop");
 const modal = $("#task-alert");
 if (!backdrop || !modal) {
 toast(`New task from ${actor}: ${task.title}`);
 return;
 }
 $("#task-alert-eyebrow").textContent = `${actor} assigned you a task`;
 $("#task-alert-title").textContent = task.title;
 $("#task-alert-meta").innerHTML = [
 task.pharmacyName ? `<strong>Store:</strong> ${escapeHtml(task.pharmacyName)}` : "",
 task.dueDate ? `<strong>Due:</strong> ${escapeHtml(task.dueDate)}` : ""
 ].filter(Boolean).join("<br>") || "Open Tasks to mark it done when finished.";
 backdrop.hidden = false;
 backdrop.setAttribute("aria-hidden", "false");
 modal.hidden = false;
 const dismiss = () => {
 backdrop.hidden = true;
 backdrop.setAttribute("aria-hidden", "true");
 modal.hidden = true;
 };
 $("#task-alert-dismiss").onclick = dismiss;
 backdrop.onclick = dismiss;
 $("#task-alert-view").onclick = () => {
 dismiss();
 activeView = "tasks";
 if (staffViewActive()) taskFilter = "mine";
 renderActiveView();
 closeSidebar();
 };
 updateTaskBadge(true);
 toast(`New task: ${task.title}`);
 }

 function adminManagers() {
 return cfg.defaultManagers || ["Lewis", "Brittany"];
 }

 function sanitizeTeamConfig() {
 const allowed = adminManagers();
 const current = teamConfig.managers?.length ? teamConfig.managers : allowed;
 teamConfig.managers = current.filter((m) =>
 allowed.some((a) => samePerson(a, m))
 );
 if (!teamConfig.managers.length) teamConfig.managers = [...allowed];
 }

 function isManager() {
 const me = staffName();
 if (!me || me === "Team member") return false;
 sanitizeTeamConfig();
 return teamConfig.managers.some((m) => samePerson(m, me));
 }

 function commissionRate() {
 const r = Number(teamConfig.commissionRate);
 return Number.isFinite(r) && r > 0 && r < 1 ? r : cfg.staffCommissionRate ?? 0.2;
 }

 function staffCut(amount) {
 return Math.round((Number(amount) || 0) * commissionRate());
 }

 function staffCommissionStats(list) {
 const rev = revenueStats(list);
 const rate = commissionRate();
 return {
 rate,
 openCut: staffCut(rev.openPotential),
 wonCut: staffCut(rev.wonRevenue),
 totalCut: staffCut(rev.openPotential + rev.wonRevenue),
 openDeals: rev.open,
 wonDeals: rev.won,
 activeDeals: rev.active,
 openRevenue: rev.openPotential,
 wonRevenue: rev.wonRevenue
 };
 }

 function formatStaffMoney(amount) {
 return formatMoney(staffCut(amount));
 }

 function showAdminRevenueUi() {
 return isManager();
 }

 function staffViewActive() {
 const me = staffName();
 if (!me || me === "Team member") return false;
 return !isManager();
 }

 function isStaffMember() {
 return staffViewActive();
 }

 function applyMyDealsFilter() {
 if (!isStaffMember()) return;
 filters.assignee = "";
 const sel = $("#filter-assignee");
 if (sel) sel.value = "";
 taskFilter = "mine";
 staffPipelineScope = "my-work";
 }

 function hasMyOpenTask(pharmacyId) {
 const me = staffName();
 if (!pharmacyId || !me) return false;
 return tasks.some((t) => t.pharmacyId === pharmacyId && t.status !== "done" && samePerson(t.assignee, me));
 }

 function isAssignedToMe(p) {
 return samePerson(p.assignee, staffName());
 }

 function inStaffPipeline(p) {
 if (!isStaffMember()) return true;
 if (staffPipelineScope === "mine") return isAssignedToMe(p);
 return isAssignedToMe(p) || hasMyOpenTask(p.id);
 }

 function staffPipelineDeals() {
 return filteredPharmacies("pipeline");
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

 function applyRemoteState(remote, silent = false, notify = true) {
 if (!remote) return;
 const prevTasks = [...tasks];
 const actor = remote.updatedBy || "Your manager";
 let newForMe = 0;
 if (Array.isArray(remote.pharmacies) && remote.pharmacies.length) pharmacies = remote.pharmacies;
 if (Array.isArray(remote.tasks)) {
 tasks = remote.tasks;
 if (notify) {
 const incoming = detectIncomingTasks(prevTasks, remote.tasks).filter((t) => !taskAlertSeen.has(t.id));
 newForMe = incoming.length;
 incoming.forEach((t) => {
 taskAlertSeen.add(t.id);
 showTaskAlert(t, actor);
 if (t.pharmacyId) pulseLiveTasks([t.id]);
 });
 }
 }
 if (remote.teamConfig) teamConfig = { ...teamConfig, ...remote.teamConfig };
 sanitizeTeamConfig();
 maybeEnsureReminders();
 localStorage.setItem(cfg.storageKey, JSON.stringify(buildPayload()));
 refreshAssigneeFilters();
 applyMyDealsFilter();
 updateStaffUi();
 updateTaskBadge(newForMe > 0);
 renderActiveView();
 const liveLabel = remote.updatedBy ? `Live · ${remote.updatedBy}` : "Live sync";
 updateSyncStatus(liveLabel);
 const statusEl = $("#sync-status");
 statusEl?.classList.add("sync-pulse");
 clearTimeout(applyRemoteState._pulse);
 applyRemoteState._pulse = setTimeout(() => statusEl?.classList.remove("sync-pulse"), 1200);
 if (!silent && newForMe > 0) toast("New task on your pipeline");
 }

 function save(pushRemote = true) {
 const payload = buildPayload();
 localStorage.setItem(cfg.storageKey, JSON.stringify(payload));
 updateSidebarStats();
 if (pushRemote && sync?.isEnabled?.()) {
 sync.pushRemote(payload)
 .then((data) => {
 sync.markPushed(data?.savedAt || payload.savedAt);
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
 sanitizeTeamConfig();
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
 el.classList.toggle("sync-live", text.includes("Synced") || text.includes("Team live") || text.includes("Live"));
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

 function resolveAssignee(name) {
 const raw = (name || "").trim();
 if (!raw) return "Unassigned";
 const hit = teamConfig.members.find((m) => samePerson(m, raw));
 return hit || raw;
 }

 function addTask({ pharmacyId, title, assignee, dueDate, reminderKey, reminderType }) {
 const p = pharmacies.find((x) => x.id === pharmacyId);
 const resolvedAssignee = resolveAssignee(assignee);
 const task = {
 id: nextTaskId(),
 pharmacyId: pharmacyId || "",
 pharmacyName: p?.name || "",
 title: title || "Follow up",
 assignee: resolvedAssignee,
 dueDate: dueDate || today(),
 status: "open",
 createdBy: sync?.currentUser?.() || "Team member",
 createdAt: today(),
 reminderKey: reminderKey || "",
 reminderType: reminderType || ""
 };
 tasks.unshift(task);
 taskAlertSeen.add(task.id);
 if (task.pharmacyId) pulseLiveTasks([task.id]);
 save();
 updateTaskBadge();
 renderActiveView();
 toast(resolvedAssignee === staffName() ? "Task added" : `Task live for ${resolvedAssignee} — shows on pipeline`);
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

 function openTaskModal(pharmacyId = "") {
 const p = pharmacyId ? pharmacies.find((x) => x.id === pharmacyId) : null;
 const members = teamConfig.members.filter((m) => m && m !== "Unassigned");
 const defaultAssignee = isManager()
 ? (members.find((m) => !samePerson(m, staffName())) || members[0] || "Unassigned")
 : staffName();
 const assigneeOpts = members.map((m) => `<option value="${escapeHtml(m)}" ${samePerson(m, defaultAssignee) ? "selected" : ""}>${escapeHtml(m)}</option>`).join("");
 const storeOpts = `<option value="">General (no store)</option>${pharmacies.slice(0, 200).map((ph) => `<option value="${escapeHtml(ph.id)}" ${ph.id === pharmacyId ? "selected" : ""}>${escapeHtml(ph.name)}</option>`).join("")}`;

 $("#drawer-title").textContent = isManager() ? "Assign task to staff" : "Add task";
 $("#drawer-sub").textContent = isManager()
 ? "Sarah and the team get a popup as soon as this syncs"
 : "Track your own follow-up";
 $("#drawer-body").innerHTML = `
 <form id="task-form" class="form-grid">
 <label class="field full"><span>What needs doing? *</span><input id="task-title" required placeholder="e.g. Call about humidity packs"></label>
 <label class="field"><span>Assign to *</span><select id="task-assignee" ${isManager() ? "" : "disabled"}>${assigneeOpts}</select></label>
 <label class="field"><span>Due date</span><input id="task-due" type="date" value="${today()}"></label>
 <label class="field full"><span>Linked store (optional)</span><select id="task-store">${storeOpts}</select></label>
 <div class="drawer-actions full">
 <button type="button" class="btn btn-ghost" id="task-form-cancel">Cancel</button>
 <button type="submit" class="btn btn-primary">${isManager() ? "Assign task" : "Save task"}</button>
 </div>
 </form>`;
 openDrawerPanel();

 $("#task-form-cancel").onclick = closeDrawer;
 $("#task-form").onsubmit = (e) => {
 e.preventDefault();
 const title = $("#task-title").value.trim();
 if (!title) return toast("Enter a task description");
 const assignee = isManager() ? $("#task-assignee").value : staffName();
 const storeId = $("#task-store").value;
 addTask({
 title,
 assignee,
 pharmacyId: storeId,
 dueDate: $("#task-due").value || today()
 });
 closeDrawer();
 if (isManager()) activeView = "tasks";
 renderActiveView();
 };
 }

 function openDrawerPanel() {
 $("#drawer").classList.add("open");
 $("#drawer-backdrop").classList.add("open");
 }

 function updateTaskBadge(pulse = false) {
 const badge = $("#nav-task-badge");
 if (!badge) return;
 const count = myOpenTasks().length;
 if (count > 0) {
 badge.textContent = String(count);
 badge.hidden = false;
 badge.classList.toggle("pulse", pulse);
 if (pulse) setTimeout(() => badge.classList.remove("pulse"), 2600);
 } else {
 badge.hidden = true;
 badge.classList.remove("pulse");
 }
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
 managerAssignDeal(id, assignee, false);
 }

 function normalizeStage(stage) {
 return stageNames.includes(stage) ? stage : "Appointment";
 }

 function filteredPharmacies(viewContext) {
 const view = viewContext || activeView;
 const staffBrowseAll = isStaffMember() && (view === "stores" || view === "contacts");
 const q = filters.search.trim().toLowerCase();
 return pharmacies.filter((p) => {
 if (filters.state && p.state !== filters.state) return false;
 if (filters.type && (p.accountType || p.type) !== filters.type) return false;
 if (filters.relevance && p.relevance !== filters.relevance) return false;
 if (filters.stage && normalizeStage(p.stage) !== filters.stage) return false;
 if (filters.status && p.status !== filters.status) return false;
 if (filters.assignee && !staffBrowseAll) {
 const a = p.assignee || "Unassigned";
 if (filters.assignee === "Unassigned" ? a !== "Unassigned" && a !== "" : !samePerson(a, filters.assignee)) return false;
 }
 if (isStaffMember() && view === "pipeline" && !inStaffPipeline(p)) return false;
 const skipSearchOnStaffPipeline = staffViewActive() && view === "pipeline";
 if (!q || skipSearchOnStaffPipeline) return true;
 return pharmacySearchHaystack(p).includes(q);
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

 function addWeeks(dateStr, weeks) {
 const d = new Date(dateStr || today());
 d.setDate(d.getDate() + weeks * 7);
 return d.toISOString().slice(0, 10);
 }

 function orderUnitsForDeal(p) {
 if (p.lastOrderUnits) return Number(p.lastOrderUnits) || 0;
 if (p.units) return Number(p.units) || 0;
 if (p.orderTier === "custom") return 0;
 return tierMeta(p.orderTier)?.units || 500;
 }

 function inReorderProgram(p) {
 if (p.reorderProgram === true) return true;
 if (p.reorderProgram === false) return false;
 const rate = cfg.reorderProgram?.reorderRate ?? 0.35;
 const hash = [...String(p.id || p.name || "")].reduce((s, c) => s + c.charCodeAt(0), 0);
 return (hash % 100) < Math.round(rate * 100);
 }

 function hasOpenReminder(key) {
 return tasks.some((t) => t.reminderKey === key && t.status !== "done");
 }

 function recordWinOrder(p) {
 const cycleWeeks = cfg.reorderProgram?.cycleWeeks || 6;
 p.lastOrderDate = today();
 p.lastOrderUnits = orderUnitsForDeal(p);
 p.nextReorderDate = addWeeks(today(), cycleWeeks);
 if (p.reorderProgram == null) p.reorderProgram = inReorderProgram(p);
 }

 function ensureReorderReminders() {
 const prog = cfg.reorderProgram || {};
 const targetUnits = prog.targetUnits || 1500;
 const cycleWeeks = prog.cycleWeeks || 6;
 const relWeeks = prog.relationshipIntervalWeeks || 3;
 const todayStr = today();
 let added = 0;

 pharmacies.filter((p) => p.status === "Won" && p.assignee && p.assignee !== "Unassigned").forEach((p) => {
 if (!p.lastOrderDate && p.closeDate) p.lastOrderDate = p.closeDate;
 if (p.reorderProgram == null) p.reorderProgram = inReorderProgram(p);
 if (!p.reorderProgram) return;

 const assignee = resolveAssignee(p.assignee);
 const units = Number(p.lastOrderUnits) || orderUnitsForDeal(p);

 if (units > 0 && units < targetUnits) {
 const key = `short-order-${p.id}`;
 if (!hasOpenReminder(key)) {
 tasks.unshift({
 id: nextTaskId(),
 pharmacyId: p.id,
 pharmacyName: p.name,
 title: `Follow up: ${p.name} ordered only ${units.toLocaleString()} units — upsell to ${targetUnits.toLocaleString()}`,
 assignee,
 dueDate: todayStr,
 status: "open",
 reminderKey: key,
 reminderType: "reorder-short",
 createdBy: "CRM",
 createdAt: todayStr
 });
 added += 1;
 }
 }

 const nextReorder = p.nextReorderDate || addWeeks(p.lastOrderDate || p.closeDate || todayStr, cycleWeeks);
 if (nextReorder <= addWeeks(todayStr, 7)) {
 const key = `reorder-due-${p.id}-${nextReorder}`;
 if (!hasOpenReminder(key)) {
 tasks.unshift({
 id: nextTaskId(),
 pharmacyId: p.id,
 pharmacyName: p.name,
 title: `Reorder due: ${p.name} — expect ~${targetUnits.toLocaleString()} units (${cycleWeeks}-week cycle)`,
 assignee,
 dueDate: nextReorder,
 status: "open",
 reminderKey: key,
 reminderType: "reorder-due",
 createdBy: "CRM",
 createdAt: todayStr
 });
 added += 1;
 }
 }

 const lastOrder = p.lastOrderDate || p.closeDate;
 if (lastOrder) {
 const days = daysSince(lastOrder);
 const relIntervalDays = relWeeks * 7;
 const cycleDays = cycleWeeks * 7;
 if (days >= relIntervalDays && days < cycleDays) {
 const relTemplates = [
 `Social: plan cross-post with ${p.name}`,
 `Relationship: check-in call with ${p.name}`,
 `Follow up: keep ${p.name} warm between reorders`
 ];
 const slot = Math.floor(days / relIntervalDays);
 const key = `relationship-${p.id}-${slot}`;
 if (!hasOpenReminder(key)) {
 tasks.unshift({
 id: nextTaskId(),
 pharmacyId: p.id,
 pharmacyName: p.name,
 title: relTemplates[slot % relTemplates.length],
 assignee,
 dueDate: todayStr,
 status: "open",
 reminderKey: key,
 reminderType: "relationship",
 createdBy: "CRM",
 createdAt: todayStr
 });
 added += 1;
 }
 }
 }
 });

 return added;
 }

 function maybeEnsureReminders() {
 if ((teamConfig.lastReminderScan || "") === today()) return;
 if (!isManager()) return;
 ensureReorderReminders();
 teamConfig.lastReminderScan = today();
 save();
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
 const list = isStaffMember() ? staffPipelineDeals() : pharmacies;
 const m = metrics(list);
 const rev = revenueStats(list);
 $("#stat-total").textContent = m.total;
 $("#stat-open").textContent = m.open;
 $("#stat-won").textContent = m.won;
 $("#stat-value").textContent = staffViewActive()
 ? formatMoney(staffCut(rev.openPotential))
 : formatMoney(rev.totalPotential);
 }

 function renderViewHero(list) {
 if (staffViewActive()) renderStaffEarningsHero(list);
 else renderRevenueHero(list);
 }

 function renderStaffEarningsHero(list) {
 const c = staffCommissionStats(list);
 const me = staffName();
 const rate = Math.round(c.rate * 100);
 const progress = c.totalCut ? Math.min(100, (c.wonCut / c.totalCut) * 100) : 0;
 $("#revenue-hero").innerHTML = `
 <div class="revenue-hero-top staff-earnings-top">
 <div>
 <h2>${escapeHtml(me)}'s commission</h2>
 <p class="tagline">Search any chemist in the header (e.g. <strong>Chempro</strong>) and tap <strong>Add to my pipeline</strong>. You only see <strong>your ${rate}% cut</strong> on your deals.</p>
 </div>
 <div class="revenue-big staff-cut-big">
 <span>Your total commission potential</span>
 <strong>${formatMoney(c.totalCut)}</strong>
 <small>${c.openDeals} open + ${c.wonDeals} won deals</small>
 </div>
 </div>
 <div class="revenue-progress">
 <div class="revenue-progress-label"><span>Commission earned</span><span>${formatMoney(c.wonCut)} won</span></div>
 <div class="revenue-bar"><div class="revenue-bar-fill staff-bar-fill" style="width:${progress}%"></div></div>
 </div>
 <div class="revenue-tiers staff-earnings-tiers">
 <article class="tier-stat staff-tier-highlight"><span>Open deals — your cut</span><strong>${formatMoney(c.openCut)}</strong><small>${c.openDeals} deals @ ${rate}%</small></article>
 <article class="tier-stat"><span>Won — your cut</span><strong>${formatMoney(c.wonCut)}</strong><small>${c.wonDeals} closed deals</small></article>
 <article class="tier-stat"><span>Per-deal examples</span><strong>${formatMoney(825 * c.rate)} – ${formatMoney(3025 * c.rate)}</strong><small>Starter to Scale @ ${rate}%</small></article>
 <article class="tier-stat"><span>Reorder reminders</span><strong>${tasks.filter((t) => t.reminderType && samePerson(t.assignee, me) && t.status !== "done").length}</strong><small>Follow-ups in Activities</small></article>
 </div>
 `;
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
 if (staffViewActive()) {
 $("#metrics").innerHTML = "";
 return;
 }
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

 function stageMeta(stageName) {
 return cfg.pipelineStages.find((s) => s.name === stageName) || cfg.pipelineStages[0];
 }

 function stageProbability(stageName) {
 return stageMeta(stageName).probability ?? 50;
 }

 function daysSince(dateStr) {
 if (!dateStr) return 0;
 const d = new Date(dateStr);
 const now = new Date();
 return Math.max(0, Math.floor((now - d) / (24 * 60 * 60 * 1000)));
 }

 function daysInStage(p) {
 return daysSince(p.stageChangedAt || p.lastActivity || p.createdAt);
 }

 function dealActivities(p) {
 if (!Array.isArray(p.activities)) p.activities = [];
 return p.activities;
 }

 function nextActivityId(p) {
 const acts = dealActivities(p);
 const nums = acts.map((a) => Number(String(a.id).replace(/\D/g, "")) || 0);
 return `act-${Math.max(0, ...nums) + 1}`;
 }

 function logActivity(pharmacyId, type, note, extra = {}) {
 const p = pharmacies.find((x) => x.id === pharmacyId);
 if (!p) return;
 const act = {
 id: nextActivityId(p),
 type,
 note: (note || "").trim(),
 createdAt: new Date().toISOString(),
 createdBy: staffName() || "Team member",
 ...extra
 };
 dealActivities(p).unshift(act);
 p.lastActivity = today();
 return act;
 }

 function weightedPipeline(list) {
 return list.filter((p) => p.status === "Open").reduce((sum, p) => {
 const val = saleValue(p);
 return sum + val * (stageProbability(normalizeStage(p.stage)) / 100);
 }, 0);
 }

 function activityIcon(type) {
 const map = { call: "📞", email: "✉", meeting: "📅", note: "📝", task: "☑", stage: "→" };
 return map[type] || "•";
 }

 function pharmacySearchHaystack(p) {
 return [p.name, p.address, p.phone, p.email, p.state, p.postcode, p.type, p.accountType, p.notes, p.contactName, p.city, p.assignee]
 .join(" ")
 .toLowerCase();
 }

 function staffReps() {
 return teamConfig.members.filter((m) => !adminManagers().some((a) => samePerson(a, m)));
 }

 function globalSearchMatches(query, limit = 15) {
 const q = query.trim().toLowerCase();
 if (q.length < 2) return [];
 return pharmacies.filter((p) => pharmacySearchHaystack(p).includes(q)).slice(0, limit);
 }

 function hideSearchResults() {
 const box = $("#search-results");
 const input = $("#search-input");
 if (box) box.hidden = true;
 if (input) input.setAttribute("aria-expanded", "false");
 }

 function addToMyPipeline(id, openAfter = true) {
 const p = pharmacies.find((x) => x.id === id);
 const me = staffName();
 if (!p || !me) return;
 p.assignee = resolveAssignee(me);
 if (p.status === "Lost") {
 p.status = "Open";
 p.stage = "Appointment";
 p.closeDate = "";
 p.lossReason = "";
 }
 if (!p.stage || p.stage === "Lost") p.stage = "Appointment";
 if (p.status !== "Open" && p.status !== "Won") p.status = "Open";
 p.stageChangedAt = p.stageChangedAt || today();
 p.lastActivity = today();
 logActivity(id, "note", `${me} added this store to their pipeline`);
 save();
 hideSearchResults();
 $("#search-input").value = "";
 filters.search = "";
 activeView = "pipeline";
 renderActiveView();
 toast(`${p.name} is on your pipeline now`);
 if (openAfter) openDrawer(id);
 }

 function claimDeal(id) {
 addToMyPipeline(id, true);
 }

 function managerAssignDeal(id, assignee, silent = false) {
 const p = pharmacies.find((x) => x.id === id);
 if (!p || !assignee || assignee === "Unassigned") return;
 const who = staffName() || "Manager";
 p.assignee = resolveAssignee(assignee);
 p.lastActivity = today();
 logActivity(id, "note", `${who} assigned this deal to ${p.assignee}`);
 save();
 renderSearchResults();
 renderActiveView();
 if (!silent) toast(`${p.name} → ${p.assignee}`);
 }

 function renderSearchResults() {
 const box = $("#search-results");
 const input = $("#search-input");
 if (!box || !input) return;
 const q = filters.search.trim();
 if (q.length < 2) {
 hideSearchResults();
 return;
 }
 const matches = globalSearchMatches(q);
 const staff = staffViewActive();
 const rate = Math.round(commissionRate() * 100);
 if (!matches.length) {
 box.innerHTML = `<div class="search-results-empty">No chemists matching “${escapeHtml(q)}” — try suburb or chain name</div>`;
 box.hidden = false;
 input.setAttribute("aria-expanded", "true");
 return;
 }
 const repOptions = staffReps().map((m) => `<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`).join("");
 box.innerHTML = matches.map((p) => {
 const val = saleValue(p);
 const cut = staffCut(val);
 const mine = isAssignedToMe(p);
 const valueLabel = staff ? `Your ${rate}%: ${formatMoney(cut)}` : formatMoney(val);
 let actions = "";
 if (staff) {
 actions = mine
 ? `<span class="search-result-tag in-pipeline">On your pipeline</span>`
 : `<button type="button" class="btn btn-primary btn-small" data-add-pipeline="${p.id}">Add to my pipeline</button>`;
 } else if (isManager()) {
 actions = `
 <select class="search-assign-select" data-assign-id="${p.id}" aria-label="Assign ${escapeHtml(p.name)}">
 <option value="">Assign to…</option>
 ${repOptions}
 </select>
 <button type="button" class="btn btn-ghost btn-small" data-open-deal="${p.id}">Open</button>`;
 }
 return `<div class="search-result-row" role="option" data-id="${p.id}">
 <div class="search-result-main">
 <strong>${escapeHtml(p.name)}</strong>
 <span>${escapeHtml([p.address, p.state, p.postcode].filter(Boolean).join(" · ") || "Australia")}</span>
 <span class="search-result-meta">${escapeHtml(normalizeStage(p.stage))} · ${escapeHtml(p.assignee || "Unassigned")}</span>
 </div>
 <div class="search-result-side">
 <span class="search-result-value">${valueLabel}</span>
 ${actions}
 </div>
 </div>`;
 }).join("");
 box.hidden = false;
 input.setAttribute("aria-expanded", "true");
 $$("[data-add-pipeline]", box).forEach((btn) => {
 btn.onclick = (e) => { e.stopPropagation(); addToMyPipeline(btn.dataset.addPipeline); };
 });
 $$("[data-open-deal]", box).forEach((btn) => {
 btn.onclick = (e) => { e.stopPropagation(); hideSearchResults(); openDrawer(btn.dataset.openDeal); };
 });
 $$(".search-assign-select", box).forEach((sel) => {
 sel.onchange = () => {
 if (!sel.value) return;
 managerAssignDeal(sel.dataset.assignId, sel.value);
 sel.value = "";
 };
 if (sel.dataset.assignId) {
 const p = pharmacies.find((x) => x.id === sel.dataset.assignId);
 if (p?.assignee && p.assignee !== "Unassigned") {
 const hit = [...sel.options].find((o) => samePerson(o.value, p.assignee));
 if (hit) sel.value = hit.value;
 }
 }
 });
 }

 function renderTeamWorkload() {
 if (!isManager()) return "";
 const reps = staffReps();
 if (!reps.length) return "";
 const chips = reps.map((name) => {
 const deals = pharmacies.filter((p) => samePerson(p.assignee, name) && p.status !== "Lost");
 const open = deals.filter((p) => p.status === "Open");
 const rev = revenueStats(deals);
 const openRev = revenueStats(open);
 const cut = staffCut(openRev.openPotential + rev.wonRevenue);
 const active = filters.assignee && samePerson(filters.assignee, name);
 return `<button type="button" class="team-workload-chip ${active ? "active" : ""}" data-team-filter="${escapeHtml(name)}">
 <strong>${escapeHtml(name)}</strong>
 <span>${open.length} open · ${deals.length} total</span>
 <span class="team-workload-money">${formatMoney(openRev.openPotential)} pipeline · ${formatMoney(cut)} comms</span>
 </button>`;
 }).join("");
 return `<div class="team-workload-bar" aria-label="Team workload">
 <span class="team-workload-label">Assign &amp; workload</span>
 <div class="team-workload-chips">${chips}
 <button type="button" class="team-workload-chip team-workload-clear ${!filters.assignee ? "active" : ""}" data-team-filter="">All team</button>
 </div></div>`;
 }

 function bindTeamWorkload(root) {
 if (!root) return;
 $$("[data-team-filter]", root).forEach((btn) => {
 btn.onclick = () => {
 filters.assignee = btn.dataset.teamFilter || "";
 const sel = $("#filter-assignee");
 if (sel) sel.value = filters.assignee;
 activeView = "pipeline";
 renderActiveView();
 };
 });
 }

 function moveToStage(id, stage, silentToast = false) {
 const item = pharmacies.find((p) => p.id === id);
 if (!item) return;
 const oldStage = normalizeStage(item.stage);
 if (oldStage === stage) return;
 item.stage = stage;
 item.stageChangedAt = today();
 item.lastActivity = today();
 if (stage === "Won") {
 item.status = "Won";
 item.closeDate = today();
 recordWinOrder(item);
 } else if (stage === "Lost") {
 item.status = "Lost";
 item.closeDate = today();
 } else if (item.status === "Won" || item.status === "Lost") {
 item.status = "Open";
 item.closeDate = "";
 item.lossReason = "";
 }
 logActivity(id, "stage", `Moved from ${oldStage} to ${stage}`, { fromStage: oldStage, toStage: stage });
 save();
 renderActiveView();
 if (!silentToast) toast(`Moved to ${stage}`);
 }

 function dealCard(p) {
 const stage = stageMeta(normalizeStage(p.stage));
 const assignOpts = assigneeList().map((a) => `<option value="${escapeHtml(a)}" ${a === (p.assignee || "Unassigned") ? "selected" : ""}>${escapeHtml(a)}</option>`).join("");
 const val = saleValue(p);
 const cut = val > 0 ? staffCut(val) : 0;
 const rate = Math.round(commissionRate() * 100);
 const days = daysInStage(p);
 const daysCls = days >= 14 ? "deal-days stale" : "deal-days";
 const assignUi = isManager()
 ? `<select class="quick-assign" data-id="${p.id}" onclick="event.stopPropagation()" aria-label="Assign owner">${assignOpts}</select>`
 : `<span class="deal-assignee-you">${escapeHtml(p.assignee || "You")}</span>`;
 const valueUi = val > 0
 ? (staffViewActive()
 ? `<span class="deal-value staff-deal-cut">Your ${rate}%: <strong>${formatMoney(cut)}</strong></span>`
 : `<span class="deal-value">${formatMoney(val)}</span>`)
 : '<span class="deal-value">—</span>';
 const contact = p.contactName ? `<span class="deal-person">${escapeHtml(p.contactName)}</span>` : "";
 const org = [p.accountType || p.type, p.state].filter(Boolean).join(" · ");
 const quickWon = isManager() && p.status === "Open"
 ? `<div class="deal-card-actions"><button type="button" class="deal-quick-btn won" data-won="${p.id}" title="Won" onclick="event.stopPropagation()">✓</button><button type="button" class="deal-quick-btn lost" data-lost="${p.id}" title="Lost" onclick="event.stopPropagation()">✕</button></div>`
 : "";
 return `
 <article class="deal-card" draggable="true" data-id="${p.id}" style="--deal-accent:${stage.color}">
 ${quickWon}
 <div class="deal-card-top">
 <h4>${escapeHtml(p.name)}</h4>
 <span class="${daysCls}">${days}d</span>
 </div>
 ${org ? `<div class="deal-org">${escapeHtml(org)}</div>` : ""}
 ${contact}
 <div class="deal-meta" style="margin-top:6px;">
 <span class="pill ${priorityClass(p.priority)}">${escapeHtml(p.priority || "Medium")}</span>
 ${hasMyOpenTask(p.id) && !isAssignedToMe(p) ? `<span class="pill pill-task-deal">Task for you</span>` : ""}
 ${isAssignedToMe(p) && isStaffMember() ? `<span class="pill pill-mine-deal">Your deal</span>` : ""}
 </div>
 ${dealTaskStrip(p)}
 <div class="deal-foot">
 ${assignUi}
 ${valueUi}
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

 function renderPipelineToolbar(list) {
 const rev = revenueStats(list);
 const weighted = weightedPipeline(list);
 const el = $("#pipeline-toolbar");
 if (!el) return;
 const statsHtml = staffViewActive()
 ? `
 <div class="pipeline-stat"><span>Your deals</span><strong>${rev.active}</strong></div>
 <div class="pipeline-stat"><span>Your activities</span><strong>${myOpenTasks().length}</strong></div>`
 : `
 <div class="pipeline-stat"><span>Deals in view</span><strong>${rev.active}</strong></div>
 <div class="pipeline-stat"><span>Total value</span><strong class="pd-green">${formatMoney(rev.openPotential)}</strong></div>
 <div class="pipeline-stat"><span>Weighted forecast</span><strong>${formatMoney(weighted)}</strong></div>
 <div class="pipeline-stat"><span>Open activities</span><strong>${tasks.filter((t) => t.status !== "done").length}</strong></div>`;
 el.innerHTML = `
 <div class="pipeline-toolbar-stats">
 ${statsHtml}
 </div>
 ${isStaffMember() ? `<select id="staff-pipeline-scope" class="filter-chip" aria-label="Pipeline scope">
 <option value="my-work" ${staffPipelineScope === "my-work" ? "selected" : ""}>My work (deals + tasks)</option>
 <option value="mine" ${staffPipelineScope === "mine" ? "selected" : ""}>My deals only</option>
 </select>` : ""}
 <div class="pipeline-view-toggle" role="group" aria-label="Pipeline view">
 <button type="button" class="${pipelineMode === "board" ? "active" : ""}" data-pmode="board">Board</button>
 <button type="button" class="${pipelineMode === "list" ? "active" : ""}" data-pmode="list">List</button>
 </div>`;
 $$("[data-pmode]", el).forEach((btn) => {
 btn.onclick = () => { pipelineMode = btn.dataset.pmode; renderPipeline(); };
 });
 $("#staff-pipeline-scope")?.addEventListener("change", (e) => {
 staffPipelineScope = e.target.value;
 renderPipeline();
 });
 }

 function renderPipelineList(list) {
 const el = $("#pipeline-list");
 const board = $("#pipeline-board");
 if (!el) return;
 const rows = list
 .filter((p) => p.status !== "Lost" || filters.stage === "Lost")
 .sort((a, b) => saleValue(b) - saleValue(a));
 const valueHeader = staffViewActive() ? `Your ${Math.round(commissionRate() * 100)}%` : "Value";
 el.innerHTML = rows.length ? `
 <table>
 <thead><tr><th>Deal</th><th>Organization</th><th>Stage</th><th>Owner</th><th>Tasks</th><th>${valueHeader}</th><th>Days</th></tr></thead>
 <tbody>${rows.map((p) => {
 const st = stageMeta(normalizeStage(p.stage));
 const val = saleValue(p);
 const displayVal = staffViewActive() ? staffCut(val) : val;
 return `<tr data-id="${p.id}">
 <td><span class="list-deal">${escapeHtml(p.name)}</span>${p.contactName ? `<br><small style="color:var(--muted)">${escapeHtml(p.contactName)}</small>` : ""}</td>
 <td>${escapeHtml(p.accountType || p.type || "—")} ${p.state ? `· ${escapeHtml(p.state)}` : ""}</td>
 <td><span class="list-stage-pill"><span class="stage-dot" style="background:${st.color}"></span>${escapeHtml(st.name)}</span></td>
 <td>${escapeHtml(p.assignee || "—")}</td>
 <td>${openTasksForDeal(p.id).length ? openTasksForDeal(p.id).map((t) => `<span class="deal-task-chip">${escapeHtml(t.assignee)}</span>`).join(" ") : "—"}</td>
 <td class="list-value">${displayVal ? formatMoney(displayVal) : "—"}</td>
 <td>${daysInStage(p)}d</td>
 </tr>`;
 }).join("")}</tbody>
 </table>` : `<div class="empty-state full">No deals match your filters</div>`;
 $$("tbody tr", el).forEach((row) => row.onclick = () => openDrawer(row.dataset.id));
 el.hidden = pipelineMode !== "list";
 if (board) board.hidden = pipelineMode !== "board";
 }

 function renderPipeline() {
 const list = (isManager() ? filteredPharmacies("pipeline") : staffPipelineDeals())
 .filter((p) => p.status !== "Lost" || filters.stage === "Lost");
 const workloadHost = $("#team-workload");
 if (workloadHost) {
 workloadHost.innerHTML = renderTeamWorkload();
 bindTeamWorkload(workloadHost);
 }
 renderViewHero(list);
 renderMetrics(list);
 renderPipelineToolbar(list);
 renderPipelineList(list);
 const board = $("#pipeline-board");
 board.innerHTML = cfg.pipelineStages
 .filter((s) => s.name !== "Lost" || filters.stage === "Lost")
 .map((stage) => {
 const cards = list.filter((p) => normalizeStage(p.stage) === stage.name);
 const value = cards.reduce((s, p) => s + saleValue(p), 0);
 const displayValue = staffViewActive() ? staffCut(value) : value;
 const prob = stage.probability ?? 0;
 return `
 <section class="pipeline-column" data-stage="${stage.name}" style="--stage-color:${stage.color}">
 <header class="column-header">
 <div class="column-title">
 <span><span class="stage-dot" style="background:${stage.color}"></span>${stage.name}</span>
 <span class="stage-prob">${prob}% likelihood</span>
 </div>
 <div class="column-sum">
 <strong>${formatMoney(displayValue)}</strong>
 <small><span class="column-count">${cards.length}</span> deals${staffViewActive() ? ` · your ${Math.round(commissionRate() * 100)}%` : ""}</small>
 </div>
 </header>
 <div class="column-body" data-drop-stage="${stage.name}">
 ${cards.map(dealCard).join("") || ""}
 </div>
 ${isManager() ? `<button type="button" class="column-add-deal" data-add-stage="${stage.name}">+ Add deal</button>` : ""}
 </section>
 `;
 })
 .join("");

 bindDealCards(board);
 $$("[data-won]", board).forEach((b) => b.onclick = () => moveToStage(b.dataset.won, "Won"));
 $$("[data-lost]", board).forEach((b) => b.onclick = () => moveToStage(b.dataset.lost, "Lost"));
 $$("[data-add-stage]", board).forEach((b) => b.onclick = () => {
 const rec = blankRecord();
 rec.stage = b.dataset.addStage;
 openDrawer(null, true, rec);
 });

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
 const canAct = isManager() || isAssignedToMe(p) || hasMyOpenTask(p.id);
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
 ${saleValue(p) > 0 ? `<div>$ <span class="pill-revenue">${staffViewActive() ? formatMoney(staffCut(saleValue(p))) : formatMoney(saleValue(p))}</span> ${staffViewActive() ? `your ${Math.round(commissionRate() * 100)}%` : escapeHtml(tierLabel(p))}</div>` : ""}
 </div>
 <div class="store-actions">
 ${staffViewActive() && !isAssignedToMe(p)
 ? `<button type="button" class="btn btn-primary btn-small store-add-pipeline" data-id="${p.id}">Add to my pipeline</button>`
 : ""}
 ${canAct
 ? nextStages.map((s) => `<button type="button" class="quick-stage" data-id="${p.id}" data-stage="${s}">-> ${s}</button>`).join("")
 : (staffViewActive() ? "" : `<span style="font-size:11px;color:var(--muted);font-weight:700;">Open store to assign or log a call</span>`)}
 ${hasMyOpenTask(p.id) && !isAssignedToMe(p) ? `<span class="pill pill-task-deal" style="margin-left:6px;">Task waiting</span>` : ""}
 </div>
 </article>
 `;
 }

 function renderStores() {
 const list = filteredPharmacies("stores");
 const browseBanner = isStaffMember()
 ? `<div class="staff-browse-banner">
 <strong>Browse all ${pharmacies.length} stores</strong> — use the search bar (e.g. “Chempro”) to find any chemist, then <strong>Add to my pipeline</strong>. You only see <strong>your ${Math.round(commissionRate() * 100)}% cut</strong> on your deals.
 </div>`
 : "";
 if (!staffViewActive()) {
 renderViewHero(list);
 renderMetrics(list);
 }
 const grid = $("#stores-grid");
 grid.innerHTML = browseBanner + (list.length
 ? list.map(storeCard).join("")
 : `<div class="empty-state full">No stores match your search. Try a suburb, chain name, or state.</div>`);

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
 $$(".store-add-pipeline", grid).forEach((btn) => {
 btn.addEventListener("click", (e) => {
 e.stopPropagation();
 addToMyPipeline(btn.dataset.id, true);
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
 const list = filteredPharmacies("contacts");
 if (!staffViewActive()) {
 renderViewHero(list);
 renderMetrics(list);
 }
 const grid = $("#contacts-grid");
 grid.innerHTML = list.length
 ? list.map(contactCard).join("")
 : `<div class="empty-state full">No contacts match your filters.</div>`;
 $$(".contact-card", grid).forEach((card) => {
 card.addEventListener("click", () => openDrawer(card.dataset.id));
 });
 }

 function renderTasks() {
 const me = staffName() || "Team member";
 const staffTasks = staffViewActive();
 const list = tasks.filter((t) => {
 if (taskFilter === "mine") return samePerson(t.assignee, me) || samePerson(t.createdBy, me);
 if (taskFilter === "open") return t.status !== "done";
 if (taskFilter === "done") return t.status === "done";
 return true;
 });

 const filterUi = staffTasks
 ? `<span class="pill pill-state">Assigned to ${escapeHtml(me)}</span>`
 : `<select id="task-filter" class="filter-chip">
 <option value="open" ${taskFilter === "open" ? "selected" : ""}>Open tasks</option>
 <option value="mine" ${taskFilter === "mine" ? "selected" : ""}>Assigned to me</option>
 <option value="all" ${taskFilter === "all" ? "selected" : ""}>All tasks</option>
 <option value="done" ${taskFilter === "done" ? "selected" : ""}>Completed</option>
 </select>`;

 $("#tasks-toolbar").innerHTML = `
 <div class="tasks-toolbar-inner">
 <div>
 <h2 style="margin:0;font-size:18px;">${staffTasks ? "My tasks" : "Team tasks"}</h2>
 <p style="margin:4px 0 0;color:var(--muted);font-size:13px;">${staffTasks
 ? "Your tasks — reorder reminders (6-week cycle), upsell follow-ups, and relationship check-ins appear here automatically."
 : "Assign follow-ups to staff. The deal shows on their pipeline instantly."}</p>
 </div>
 <div class="tasks-actions">
 ${filterUi}
 ${isManager() ? `<button type="button" class="btn btn-primary btn-small" id="btn-new-task">+ Assign task</button>` : `<button type="button" class="btn btn-secondary btn-small" id="btn-new-task">+ Add my task</button>`}
 </div>
 </div>`;

 const grid = $("#tasks-grid");
 grid.innerHTML = list.length
 ? list.map((t) => `
 <article class="task-card ${t.status === "done" ? "done" : ""}" data-id="${t.id}">
 <div class="task-top">
 <span class="pill ${t.status === "done" ? "" : "pill-high"}">${t.status === "done" ? "Done" : "Open"}</span>
 ${t.reminderType === "reorder-due" ? `<span class="pill pill-reorder">Reorder</span>` : ""}
 ${t.reminderType === "reorder-short" ? `<span class="pill pill-reorder-short">Upsell</span>` : ""}
 ${t.reminderType === "relationship" ? `<span class="pill pill-relationship">Relationship</span>` : ""}
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

 $("#task-filter")?.addEventListener("change", (e) => { taskFilter = e.target.value; renderTasks(); });
 $("#btn-new-task").onclick = () => openTaskModal();
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
 if (staffViewActive()) {
 const rate = Math.round(commissionRate() * 100);
 const mine = staffPipelineDeals();
 const rev = revenueStats(mine);
 $("#settings-content").innerHTML = `
 <div class="settings-grid">
 <article class="settings-card settings-wide staff-settings-hero">
 <h3>Your earnings dashboard</h3>
 <p style="color:var(--muted);font-size:14px;line-height:1.6;margin:0 0 14px;">You earn <strong>${rate}%</strong> on every deal you close. Push your assigned stores through the pipeline — your cut updates live as deals move forward.</p>
 <div class="staff-settings-stats">
 <div><span>Open deals</span><strong>${rev.open}</strong></div>
 <div class="staff-settings-cut"><span>Your cut — open (${rate}%)</span><strong>${formatMoney(staffCut(rev.openPotential))}</strong></div>
 <div class="staff-settings-cut"><span>Your cut — won</span><strong>${formatMoney(staffCut(rev.wonRevenue))}</strong></div>
 <div><span>Total commission</span><strong>${formatMoney(staffCut(rev.openPotential + rev.wonRevenue))}</strong></div>
 </div>
 <button class="btn btn-ghost btn-small" id="btn-logout" type="button" style="margin-top:14px;">Sign out</button>
 </article>
 <article class="settings-card">
 <h3>Deal tiers (what you earn)</h3>
 <ul style="margin:0;padding-left:18px;color:var(--muted);line-height:1.8;font-size:13px;">
 <li><strong>Starter</strong> $825 → your cut <strong>${formatMoney(825 * commissionRate())}</strong></li>
 <li><strong>Growth</strong> $1,595 → your cut <strong>${formatMoney(1595 * commissionRate())}</strong></li>
 <li><strong>Scale</strong> $3,025 → your cut <strong>${formatMoney(3025 * commissionRate())}</strong></li>
 </ul>
 </article>
 </div>`;
 $("#btn-logout")?.addEventListener("click", async () => {
 await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
 location.href = "/login.html";
 });
 return;
 }
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
 <article class="settings-card settings-wide">
 <h3>Login passwords</h3>
 <p style="color:var(--muted);font-size:13px;line-height:1.6;margin:0 0 10px;">Each person uses <strong>Name + LeafLock2026</strong> (name must match roster).</p>
 <ul style="margin:0;padding-left:18px;color:var(--muted);line-height:1.9;font-size:13px;">
 ${teamConfig.members.map((m) => {
 const n = m.trim().split(/\s+/).map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join("");
 return `<li><strong>${escapeHtml(m)}</strong> → <code>${escapeHtml(n)}LeafLock2026</code></li>`;
 }).join("")}
 </ul>
 </article>
 <article class="settings-card">
 <h3>Team roster</h3>
 <p style="color:var(--muted);font-size:13px;line-height:1.6;margin:0 0 10px;">One name per line — must match login names exactly.</p>
 <textarea id="set-team-members" rows="5">${escapeHtml(teamConfig.members.join("\n"))}</textarea>
 <button class="btn btn-secondary btn-small" id="btn-save-team" type="button" style="margin-top:10px;">Save roster</button>
 <button class="btn btn-ghost btn-small" id="btn-auto-assign" type="button" style="margin-top:10px;">Auto-assign open deals</button>
 </article>
 <article class="settings-card settings-wide">
 <h3>Staff commission &amp; managers</h3>
 <p style="color:var(--muted);font-size:13px;line-height:1.6;margin:0 0 10px;">Reps see <strong>only their deals</strong> and <strong>their % cut</strong> on every card. Managers (below) see the full pipeline.</p>
 <label class="field"><span>Commission rate (decimal, e.g. 0.2 = 20%)</span><input id="set-commission-rate" type="number" min="0.01" max="0.99" step="0.01" value="${teamConfig.commissionRate ?? cfg.staffCommissionRate ?? 0.2}"></label>
 <label class="field" style="margin-top:10px;"><span>Manager names (one per line — see all deals)</span><textarea id="set-managers" rows="3">${escapeHtml((teamConfig.managers || cfg.defaultManagers || []).join("\n"))}</textarea></label>
 <button class="btn btn-secondary btn-small" id="btn-save-commission" type="button" style="margin-top:10px;">Save commission settings</button>
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
 applyMyDealsFilter();
 toast("Team roster saved");
 };
 $("#btn-save-commission")?.addEventListener("click", () => {
 const rate = Number($("#set-commission-rate").value);
 teamConfig.commissionRate = Number.isFinite(rate) && rate > 0 && rate < 1 ? rate : cfg.staffCommissionRate ?? 0.2;
 teamConfig.managers = $("#set-managers").value.split("\n").map((s) => s.trim()).filter(Boolean);
 sanitizeTeamConfig();
 save();
 applyMyDealsFilter();
 renderActiveView();
 toast("Commission settings saved");
 });
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
 const titles = staffViewActive()
 ? { pipeline: "My deals", stores: "My organizations", contacts: "My people", tasks: "My activities", settings: "Settings" }
 : { pipeline: "Deals", stores: "Organizations", contacts: "People", tasks: "Activities", settings: "Settings" };
 $("#page-title").textContent = titles[activeView] || "CRM";
 const showAdminHero = !staffViewActive() && activeView !== "settings" && activeView !== "tasks";
 const showStaffHero = staffViewActive() && activeView === "pipeline";
 $("#revenue-hero").style.display = (showAdminHero || showStaffHero) ? "block" : "none";
 const metricsEl = $("#metrics");
 if (metricsEl) {
 metricsEl.style.display = staffViewActive()
 ? "none"
 : (activeView === "settings" || activeView === "tasks" ? "none" : "");
 }
 updateStaffUi();
 if (activeView === "pipeline") renderPipeline();
 if (activeView === "stores") renderStores();
 if (activeView === "contacts") renderContacts();
 if (activeView === "tasks") renderTasks();
 if (activeView === "settings") {
 if (!staffViewActive()) renderRevenueHero(pharmacies);
 renderSettings();
 }
 }

 function withoutAll(arr) {
 return arr.filter((v) => v !== "All");
 }

 function options(arr, selected = "") {
 return arr.map((v) => `<option value="${escapeHtml(v)}" ${v === selected ? "selected" : ""}>${escapeHtml(v)}</option>`).join("");
 }

 function openDrawer(id, isNew = false, preset = null) {
 const p = isNew
 ? (preset || blankRecord())
 : pharmacies.find((x) => x.id === id);
 if (!p) return;

 $("#drawer-title").textContent = isNew ? "New deal" : p.name;
 $("#drawer-sub").textContent = isNew
 ? "Add a pharmacy to your pipeline"
 : [p.contactName, p.address, p.state].filter(Boolean).join(" · ") || "No contact set";

 if (isNew) {
 dealDrawerTab = "details";
 renderDealDrawerTab(p, "details", id, true);
 } else {
 renderDealDrawerTab(p, dealDrawerTab, id, false);
 }
 $("#drawer-backdrop").classList.add("open");
 $("#drawer").classList.add("open");
 }

 function renderDealDrawerTab(p, tab, id, isNew) {
 const banner = $("#drawer-deal-banner");
 const tabs = $("#drawer-tabs");
 if (isNew) {
 banner.hidden = true;
 tabs.hidden = true;
 return renderDealDetailsForm(p, id, isNew);
 }
 banner.hidden = false;
 tabs.hidden = false;
 const val = saleValue(p);
 const stage = normalizeStage(p.stage);
 const bannerValue = staffViewActive() && val
 ? `${formatMoney(staffCut(val))} <small>your ${Math.round(commissionRate() * 100)}%</small>`
 : (val ? formatMoney(val) : "No value");
 banner.innerHTML = `
 <div>
 <div class="deal-banner-value">${bannerValue}</div>
 <div class="deal-banner-meta">${escapeHtml(p.assignee || "Unassigned")} · ${escapeHtml(stage)} · ${daysInStage(p)} days in stage</div>
 <div class="deal-stage-pills">${cfg.pipelineStages.filter((s) => s.name !== "Lost").map((s) =>
 `<button type="button" class="deal-stage-pill ${s.name === stage ? "active" : ""}" data-stage-pick="${s.name}" style="${s.name === stage ? `background:${s.color};border-color:${s.color}` : ""}">${s.name}</button>`
 ).join("")}</div>
 </div>
 <div class="deal-banner-actions">
 ${isStaffMember() && !isAssignedToMe(p) ? `<button type="button" class="btn btn-primary btn-small" id="deal-claim">Add to my pipeline</button>` : ""}
 ${isManager() && p.status === "Open" ? `<button type="button" class="btn btn-small btn-won" id="deal-mark-won">Won</button><button type="button" class="btn btn-small btn-lost" id="deal-mark-lost">Lost</button>` : ""}
 </div>`;
 $$("[data-stage-pick]", banner).forEach((btn) => btn.onclick = () => { moveToStage(id, btn.dataset.stagePick); openDrawer(id); });
 $("#deal-claim")?.addEventListener("click", () => claimDeal(id));
 $("#deal-mark-won")?.addEventListener("click", () => moveToStage(id, "Won"));
 $("#deal-mark-lost")?.addEventListener("click", () => moveToStage(id, "Lost"));

 tabs.innerHTML = [
 { id: "activity", label: "Activity" },
 { id: "notes", label: "Notes" },
 { id: "details", label: "Deal info" }
 ].map((t) => `<button type="button" class="${tab === t.id ? "active" : ""}" data-deal-tab="${t.id}">${t.label}</button>`).join("");
 $$("[data-deal-tab]", tabs).forEach((btn) => btn.onclick = () => {
 dealDrawerTab = btn.dataset.dealTab;
 renderDealDrawerTab(p, dealDrawerTab, id, false);
 });

 if (tab === "notes") return renderDealNotes(p, id);
 if (tab === "details") return renderDealDetailsForm(p, id, false);
 return renderDealActivity(p, id);
 }

 function renderDealActivity(p, id) {
 const acts = [...dealActivities(p), ...tasks.filter((t) => t.pharmacyId === id).map((t) => ({
 id: t.id, type: "task", note: t.title, createdAt: t.createdAt || today(), createdBy: t.createdBy || "", status: t.status, dueDate: t.dueDate
 }))].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));

 $("#drawer-body").innerHTML = `
 <div class="activity-compose">
 ${(cfg.activityTypes || []).map((a) => `<button type="button" class="activity-type-btn" data-act-type="${a.id}">${activityIcon(a.id)} ${a.label}</button>`).join("")}
 </div>
 <div class="activity-input-row" id="activity-input-row" hidden>
 <input id="activity-note-input" placeholder="What happened? e.g. Left voicemail with pharmacist" />
 <button type="button" class="btn btn-primary btn-small" id="activity-save">Log</button>
 </div>
 <div class="activity-timeline">
 ${acts.length ? acts.map((a) => `
 <article class="activity-item">
 <div class="activity-icon ${escapeHtml(a.type)}">${activityIcon(a.type)}</div>
 <div class="activity-body">
 <strong>${escapeHtml(a.type === "stage" ? `Stage → ${a.toStage || ""}` : (cfg.activityTypes?.find((x) => x.id === a.type)?.label || a.type))}</strong>
 <p>${escapeHtml(a.note || "")}${a.type === "task" ? (a.status === "done" ? " (done)" : ` — due ${a.dueDate || ""}`) : ""}</p>
 <div class="activity-meta">${escapeHtml(a.createdBy || "")} · ${escapeHtml(String(a.createdAt).slice(0, 16).replace("T", " "))}</div>
 </div>
 </article>`).join("") : `<div class="empty-state" style="padding:24px;">No activity yet — log a call, email, or note above</div>`}
 </div>`;

 let pendingType = "note";
 $$("[data-act-type]", $("#drawer-body")).forEach((btn) => btn.onclick = () => {
 pendingType = btn.dataset.actType;
 $("#activity-input-row").hidden = false;
 $("#activity-note-input")?.focus();
 });
 $("#activity-save")?.addEventListener("click", () => {
 const note = $("#activity-note-input")?.value?.trim();
 if (!note) return toast("Enter activity details");
 logActivity(id, pendingType, note);
 save();
 $("#activity-note-input").value = "";
 $("#activity-input-row").hidden = true;
 renderDealActivity(p, id);
 toast("Activity logged");
 });
 }

 function renderDealNotes(p, id) {
 $("#drawer-body").innerHTML = `
 <form id="notes-form">
 <label class="field full"><span>Deal notes</span><textarea id="deal-notes-area" rows="8" placeholder="Conversation history, objections, next steps...">${escapeHtml(p.notes || "")}</textarea></label>
 <label class="field full"><span>Why this deal matters</span><textarea id="deal-why-area" rows="3">${escapeHtml(p.description || p.whyRelevant || "")}</textarea></label>
 <button type="submit" class="btn btn-primary btn-small">Save notes</button>
 </form>`;
 $("#notes-form").onsubmit = (e) => {
 e.preventDefault();
 p.notes = $("#deal-notes-area").value.trim();
 p.description = p.whyRelevant = $("#deal-why-area").value.trim();
 p.lastActivity = today();
 logActivity(id, "note", "Updated deal notes");
 save();
 toast("Notes saved");
 };
 }

 function renderDealDetailsForm(p, id, isNew) {
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
 preview.innerHTML = staffViewActive()
 ? `<span>Your commission on this deal</span><strong>${formatMoney(staffCut(v))}</strong>`
 : `<span>Your custom deal - edit anytime once they're onboard</span><strong>${formatMoney(v)}</strong>`;
 return;
 }
 const t = tierMeta(Number(tier));
 preview.innerHTML = staffViewActive()
 ? `<span>Your ${Math.round(commissionRate() * 100)}% on ${t.label}</span><strong>${formatMoney(staffCut(t.total))}</strong>`
 : `
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
 const assignee = $("#quick-task-assignee")?.value || "Unassigned";
 addTask({ pharmacyId: id, title, assignee });
 logActivity(id, "task", `Task created: ${title}`, { assignee });
 save();
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
 }

 function blankRecord() {
 const r = {
 id: "", name: "", address: "", phone: "", email: "", website: "", hasWebsite: false,
 state: "", postcode: "", city: "", country: "Australia", type: "Independent", accountType: "Independent",
 relevance: "Medium", whyRelevant: "", description: "", stage: "Appointment", status: "Open",
 priority: "Medium", source: "Outbound", assignee: "Unassigned", closeDate: "", lossReason: "",
 notes: "", linkedin: "", contactName: "", contactTitle: "Pharmacist", contactType: "Prospect",
 lastActivity: today(), createdAt: today(), stageChangedAt: today(), activities: [],
 potentialSale: true, orderTier: 500
 };
 return applyTier(r, 500);
 }

 function closeDrawer() {
 $("#drawer-backdrop").classList.remove("open");
 $("#drawer").classList.remove("open");
 $("#drawer-deal-banner").hidden = true;
 $("#drawer-tabs").hidden = true;
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
 renderSearchResults();
 renderActiveView();
 });
 $("#search-input").addEventListener("focus", () => {
 if (filters.search.trim().length >= 2) renderSearchResults();
 });
 document.addEventListener("click", (e) => {
 if (!e.target.closest("#search-box-wrap")) hideSearchResults();
 });
 $("#search-input").addEventListener("keydown", (e) => {
 if (e.key === "Escape") hideSearchResults();
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
 hideSearchResults();
 ["filter-state", "filter-type", "filter-relevance", "filter-stage", "filter-status", "filter-assignee"].forEach((id) => {
 $("#" + id).value = "";
 });
 applyMyDealsFilter();
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
 if (remote?.pharmacies?.length || remote?.tasks?.length || remote?.teamConfig) {
 applyRemoteState(remote, true, false);
 markTasksSeen(tasks);
 sync.markPushed();
 }
 sync.startPolling((remote) => applyRemoteState(remote, true, true));
 updateSyncStatus(sync?.usesServer?.() ? "Team live (cloud)" : "Team live");
 } catch (_) {
 updateSyncStatus("Sync offline", true);
 }
 }

 async function syncAuthUser() {
 try {
 const res = await fetch("/api/auth/me", { credentials: "include" });
 if (!res.ok) return;
 const data = await res.json();
 if (data?.user) {
 sync?.setCurrentUser?.(data.user);
 localStorage.setItem("leaflock-user-name", data.user);
 }
 } catch (_) {}
 }

 async function init() {
 if (!window.SEED_PHARMACIES?.length) {
 document.body.innerHTML = `<div style="padding:40px;font-family:Segoe UI,sans-serif;"><h1>Missing data file</h1><p>Keep <strong>seed.js</strong> in the same folder as this HTML file.</p></div>`;
 return;
 }
 load();
 await syncAuthUser();
 sanitizeTeamConfig();
 markTasksSeen(tasks);
 maybeEnsureReminders();
 if (isManager()) taskFilter = "open";
 bindUi();
 applyMyDealsFilter();
 updateStaffUi();
 renderActiveView();
 await initSync();
 applyMyDealsFilter();
 updateStaffUi();
 updateTaskBadge();
 renderActiveView();
 if (!sync?.usesServer?.()) promptUserName();
 applyMyDealsFilter();
 updateStaffUi();
 renderActiveView();
 }

 function updateStaffUi() {
 const active = isStaffMember();
 document.body.classList.toggle("staff-mode", active);
 updateTaskBadge();
 const assigneeFilter = $("#filter-assignee");
 const hideAssigneeOnPipeline = active && activeView === "pipeline";
 if (assigneeFilter) {
 assigneeFilter.closest(".filter-chip")?.classList.toggle("hidden-staff-filter", hideAssigneeOnPipeline);
 assigneeFilter.disabled = hideAssigneeOnPipeline;
 }
 $("#btn-add")?.classList.toggle("hidden-staff-only", active);
 const pipelineLabel = $("#stat-pipeline-label");
 if (pipelineLabel) pipelineLabel.textContent = active ? "Your cut" : "Pipeline";
 const statTotal = $("#stat-total");
 if (statTotal?.parentElement) {
 statTotal.parentElement.innerHTML = `${active ? "Your deals" : "Total stores"}<strong id="stat-total">${statTotal.textContent}</strong>`;
 }
 const eyebrow = $(".site-header .eyebrow");
 if (eyebrow) {
 eyebrow.dataset.staffSuffix = active ? ` · My work + ${Math.round(commissionRate() * 100)}% cut` : "";
 }
 }

 document.addEventListener("DOMContentLoaded", () => { init(); });
})();