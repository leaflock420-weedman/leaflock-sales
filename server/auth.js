const crypto = require("crypto");

const SESSION_COOKIE = "crm_session";
const SESSION_DAYS = 14;

function teamPassword() {
  return process.env.CRM_TEAM_PASSWORD || "LeafLockSales2026";
}

function sessionSecret() {
  return process.env.SESSION_SECRET || process.env.CRM_TEAM_PASSWORD || "leaflock-crm-session-dev";
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
  const expected = teamPassword();
  if (!password || password !== expected) return false;
  return { user: (userName || "Team member").trim() || "Team member" };
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
  requireAuth,
  requireAuthPage,
  teamPassword
};