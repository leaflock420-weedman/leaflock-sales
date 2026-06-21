const { sendEmail, memberEmail, managerEmail, emailFooter, htmlWrap } = require("./email");

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function daysBetween(a, b) {
  const da = new Date(a);
  const db = new Date(b);
  return Math.floor((db - da) / (24 * 60 * 60 * 1000));
}

function ensureMeta(payload) {
  if (!payload.meta) payload.meta = {};
  if (!payload.meta.emailLog) payload.meta.emailLog = {};
  return payload.meta.emailLog;
}

function alreadySent(log, key, day = todayStr()) {
  return log[key] === day;
}

function markSent(log, key, day = todayStr()) {
  log[key] = day;
}

async function notifyTaskAssigned(teamConfig, task, actor) {
  const to = memberEmail(teamConfig, task.assignee);
  if (!to) return { sent: false, reason: "No email for assignee" };

  const subject = `Task assigned: ${task.title}`;
  const text = [
    `Hi ${task.assignee},`,
    "",
    `${actor} assigned you a task:`,
    task.title,
    task.pharmacyName ? `Store: ${task.pharmacyName}` : null,
    task.dueDate ? `Due: ${task.dueDate}` : null,
    "",
    "Open the CRM to mark it done when finished."
  ].filter(Boolean).join("\n") + emailFooter();

  return sendEmail({
    to,
    subject,
    text,
    html: htmlWrap(subject, `<p>Hi <strong>${task.assignee}</strong>,</p>
      <p>${actor} assigned you:</p>
      <p><strong>${task.title}</strong></p>
      ${task.pharmacyName ? `<p>Store: ${task.pharmacyName}</p>` : ""}
      ${task.dueDate ? `<p>Due: ${task.dueDate}</p>` : ""}`)
  });
}

async function notifyDealAssigned(teamConfig, deal, actor) {
  const to = memberEmail(teamConfig, deal.assignee);
  if (!to) return { sent: false, reason: "No email for assignee" };

  const subject = `Deal assigned: ${deal.name}`;
  const text = [
    `Hi ${deal.assignee},`,
    "",
    `${actor} assigned you the pharmacy deal:`,
    deal.name,
    deal.stage ? `Stage: ${deal.stage}` : null,
    deal.address ? `Address: ${deal.address}` : null,
    "",
    "Follow up in the CRM pipeline."
  ].filter(Boolean).join("\n") + emailFooter();

  return sendEmail({ to, subject, text });
}

async function notifyStageChange(teamConfig, deal, oldStage, actor) {
  const to = memberEmail(teamConfig, deal.assignee);
  const recipients = [...new Set([to, managerEmail()].filter(Boolean))];
  if (!recipients.length) return { sent: false, reason: "No recipients" };

  const subject = `Stage update: ${deal.name} -> ${deal.stage}`;
  const text = [
    `Deal moved from ${oldStage} to ${deal.stage}.`,
    "",
    `Store: ${deal.name}`,
    `Assignee: ${deal.assignee || "Unassigned"}`,
    `Updated by: ${actor}`,
    "",
    "Check the pipeline for next steps."
  ].join("\n") + emailFooter();

  return sendEmail({ to: recipients, subject, text });
}

async function notifyDealWon(teamConfig, deal, actor) {
  const to = managerEmail();
  const assignee = memberEmail(teamConfig, deal.assignee);
  const recipients = [...new Set([to, assignee].filter(Boolean))];

  const subject = `Won: ${deal.name}`;
  const text = [
    `Great news — deal marked Won.`,
    "",
    `Store: ${deal.name}`,
    `Assignee: ${deal.assignee || "Unassigned"}`,
    `Updated by: ${actor}`
  ].join("\n") + emailFooter();

  return sendEmail({ to: recipients, subject, text });
}

function diffAndNotify(prev, next, actor = "Team member") {
  const results = [];
  const teamConfig = next.teamConfig || {};
  const prevTasks = new Map((prev?.tasks || []).map((t) => [t.id, t]));
  const prevDeals = new Map((prev?.pharmacies || []).map((p) => [p.id, p]));

  for (const task of next.tasks || []) {
    const old = prevTasks.get(task.id);
    if (!old) {
      results.push(notifyTaskAssigned(teamConfig, task, actor));
    } else if (old.assignee !== task.assignee && task.assignee && task.assignee !== "Unassigned") {
      results.push(notifyTaskAssigned(teamConfig, task, actor));
    }
  }

  for (const deal of next.pharmacies || []) {
    const old = prevDeals.get(deal.id);
    if (!old) continue;

    if (old.assignee !== deal.assignee && deal.assignee && deal.assignee !== "Unassigned") {
      results.push(notifyDealAssigned(teamConfig, deal, actor));
    }

    if (old.stage !== deal.stage) {
      results.push(notifyStageChange(teamConfig, deal, old.stage, actor));
      if (deal.stage === "Won") {
        results.push(notifyDealWon(teamConfig, deal, actor));
      }
    }
  }

  return Promise.allSettled(results);
}

async function runFollowUps(payload) {
  if (!payload) return [];
  const teamConfig = payload.teamConfig || {};
  const log = ensureMeta(payload);
  const today = todayStr();
  const results = [];

  for (const task of payload.tasks || []) {
    if (task.status === "done" || !task.dueDate) continue;
    const dueKey = `task-due-${task.id}`;
    const overKey = `task-over-${task.id}`;
    const to = memberEmail(teamConfig, task.assignee);
    if (!to) continue;

    const overdue = task.dueDate < today;
    const dueToday = task.dueDate === today;

    if (dueToday && !alreadySent(log, dueKey, today)) {
      const subject = `Due today: ${task.title}`;
      const text = `Reminder — task due today:\n${task.title}\n${task.pharmacyName || ""}` + emailFooter();
      const r = await sendEmail({ to, subject, text });
      if (r.sent) markSent(log, dueKey, today);
      results.push(r);
    }

    if (overdue && !alreadySent(log, overKey, today)) {
      const subject = `Overdue: ${task.title}`;
      const text = `Follow-up needed — overdue since ${task.dueDate}:\n${task.title}\n${task.pharmacyName || ""}` + emailFooter();
      const r = await sendEmail({ to, subject, text });
      if (r.sent) markSent(log, overKey, today);
      results.push(r);
    }
  }

  for (const deal of payload.pharmacies || []) {
    if (deal.status !== "Open") continue;
    const staleKey = `stale-${deal.id}`;
    const last = deal.lastActivity || deal.createdAt;
    if (!last || daysBetween(last, today) < 7) continue;
    if (alreadySent(log, staleKey, today)) continue;

    const to = memberEmail(teamConfig, deal.assignee) || managerEmail();
    if (!to) continue;

    const subject = `No activity 7+ days: ${deal.name}`;
    const text = [
      `This open deal has had no updates since ${last}:`,
      deal.name,
      `Stage: ${deal.stage}`,
      `Assignee: ${deal.assignee || "Unassigned"}`,
      "",
      "Schedule a follow-up call or email."
    ].join("\n") + emailFooter();

    const r = await sendEmail({ to, subject, text });
    if (r.sent) markSent(log, staleKey, today);
    results.push(r);
  }

  return results;
}

module.exports = {
  diffAndNotify,
  runFollowUps,
  ensureMeta
};