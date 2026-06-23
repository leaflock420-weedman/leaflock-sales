const crypto = require("crypto");

const SESSION_COOKIE = "crm_session";
const SESSION_DAYS = 14;

function passwordSuffix() {
  const suffix = process.env.CRM_PASSWORD_SUFFIX || process.env.CRM_TEAM_PASSWORD || "LeafLock2026";
  if (suffix === "LeafLockSales2026") return "LeafLock2026";
  return suffix;
}

function formatUserName(userName) {
  return String(userName || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join("");
}

function defaultPasswordForUser(userName) {
  const formatted = formatUserName(userName);
  if (!formatted) return null;
  return `${formatted}${passwordSuffix()}`;
}

function parseUserPasswordOverrides() {
  const raw = process.env.CRM_USER_PASSWORDS || "";
  const map = new Map();
  raw.split(",").forEach((pair) => {
    const idx = pair.indexOf(":");
    if (idx < 1) return;
    const key = pair.slice(0, idx).trim().toLowerCase();
    const val = pair.slice(idx + 1).trim();
    if (key && val) map.set(key, val);
  });
  return map;
}

function passwordOverrides() {
  if (!parseUserPasswordOverrides._cache) {
    parseUserPasswordOverrides._cache = parseUserPasswordOverrides();
  }
  return parseUserPasswordOverrides._cache;
}

function expectedPassword(userName) {
  const user = String(userName || "").trim();
  if (!user) return null;
  const override = passwordOverrides().get(user.toLowerCase());
  if (override) return override;
  return defaultPasswordForUser(user);
}

function safeEqual(a, b) {
  if (!a || !b) return false;
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

function sessionSecret() {
  return process.env.SESSION_SECRET || process.env.CRM_PASSWORD_SUFFIX || "leaflock-crm-session-dev";
}

function signToken(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", sessionSecret()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

function verifyToken(token) {
  if (!token || !token.includes(".")) return null;
  const [body, sig] = token.split(".");
  const expected = crypto.createHmac("sha256", sessionSecret()).update(body).digest("base64url");
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
    return null;
  }
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (!payload.exp || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

function createSession(res, userName = "Team member") {
  const exp = Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000;
  const token = signToken({ user: userName, exp });
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_DAYS * 24 * 60 * 60 * 1000,
    path: "/"
  });
}

function clearSession(res) {
  res.clearCookie(SESSION_COOKIE, { path: "/" });
}

function readSession(req) {
  return verifyToken(req.cookies?.[SESSION_COOKIE]);
}

function login(password, userName) {
  const user = formatUserName(userName) || (userName || "").trim();
  const expected = expectedPassword(user);
  if (!user || !password || !expected) return false;
  if (!safeEqual(password, expected)) return false;
  return { user };
}

function passwordHint() {
  return {
    pattern: "YourName + LeafLock2026",
    example: "SarahLeafLock2026",
    suffix: passwordSuffix()
  };
}

function requireAuth(req, res, next) {
  const session = readSession(req);
  if (!session) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  req.crmUser = session.user;
  next();
}

function requireAuthPage(req, res, next) {
  if (readSession(req)) return next();
  return res.redirect("/login.html");
}

module.exports = {
  SESSION_COOKIE,
  createSession,
  clearSession,
  readSession,
  login,
  passwordHint,
  defaultPasswordForUser,
  requireAuth,
  requireAuthPage
};