const FROM = process.env.CRM_EMAIL_FROM?.trim() || "LeafLock Sales <info@leaflock.com.au>";
const APP_URL = process.env.APP_URL?.trim() || "https://sales.leaflock.com.au";

function resendKey() {
  return process.env.RESEND_API_KEY?.trim() || "";
}

function managerEmail() {
  return process.env.CRM_MANAGER_EMAIL?.trim() || "info@leaflock.com.au";
}

async function sendEmail({ to, subject, text, html }) {
  const apiKey = resendKey();
  if (!apiKey) {
    return { sent: false, reason: "RESEND_API_KEY not configured" };
  }
  if (!to) {
    return { sent: false, reason: "No recipient" };
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: FROM,
      to: Array.isArray(to) ? to : [to],
      subject,
      text,
      html: html || undefined
    })
  });

  if (!res.ok) {
    const body = await res.text();
    return { sent: false, reason: `Resend ${res.status}: ${body}` };
  }

  return { sent: true };
}

function memberEmail(teamConfig, name) {
  if (!name || name === "Unassigned") return "";
  const map = teamConfig?.memberEmails || {};
  return map[name] || map[name?.trim?.()] || "";
}

function emailFooter() {
  return `\n\n—\nLeafLock Sales CRM\n${APP_URL}`;
}

function htmlWrap(title, bodyHtml) {
  return `<!DOCTYPE html><html><body style="font-family:Inter,Arial,sans-serif;color:#17201a;line-height:1.5">
  <div style="max-width:560px;margin:0 auto;padding:24px">
    <p style="color:#1f5f39;font-weight:700;margin:0 0 8px">LeafLock Sales</p>
    <h2 style="margin:0 0 16px;font-size:20px">${title}</h2>
    ${bodyHtml}
    <p style="color:#5b655f;font-size:13px;margin-top:24px"><a href="${APP_URL}">Open CRM</a></p>
  </div></body></html>`;
}

module.exports = {
  sendEmail,
  memberEmail,
  managerEmail,
  emailFooter,
  htmlWrap,
  FROM,
  APP_URL,
  isConfigured: () => Boolean(resendKey())
};