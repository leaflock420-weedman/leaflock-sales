const REPO = process.env.GITHUB_REPO || "leaflock420-weedman/leaflock-sales";
const PATH = process.env.GITHUB_DATA_PATH || "data/crm-live.json";

function token() {
  return process.env.GITHUB_TOKEN?.trim() || "";
}

function api(path, options = {}) {
  const t = token();
  if (!t) throw new Error("GITHUB_TOKEN not set");
  return fetch(`https://api.github.com${path}`, {
    ...options,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${t}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
}

async function fetchRecord() {
  const res = await api(`/repos/${REPO}/contents/${PATH}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub read failed (${res.status})`);
  const json = await res.json();
  const raw = Buffer.from(json.content, "base64").toString("utf8");
  return JSON.parse(raw);
}

async function pushRecord(payload) {
  let sha;
  const existing = await api(`/repos/${REPO}/contents/${PATH}`);
  if (existing.ok) {
    const meta = await existing.json();
    sha = meta.sha;
  }

  const content = Buffer.from(JSON.stringify(payload, null, 2)).toString("base64");
  const body = {
    message: `CRM sync ${payload.updatedBy || "team"} @ ${payload.savedAt || new Date().toISOString()}`,
    content,
    sha
  };

  const res = await api(`/repos/${REPO}/contents/${PATH}`, {
    method: "PUT",
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`GitHub write failed (${res.status}): ${err}`);
  }

  return { ok: true };
}

function isConfigured() {
  return Boolean(token());
}

module.exports = {
  fetchRecord,
  pushRecord,
  isConfigured,
  repo: () => REPO,
  path: () => PATH
};