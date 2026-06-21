const express = require("express");
const path = require("path");
const cookieParser = require("cookie-parser");
const store = require("./server/store");
const auth = require("./server/auth");
const email = require("./server/email");
const notifications = require("./server/notifications");

const app = express();
const port = process.env.PORT || 3000;
const root = __dirname;

app.use(express.json({ limit: "2mb" }));
app.use(cookieParser());

const PUBLIC = new Set([
  "/login.html",
  "/login.css",
  "/sw.js",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/apple-touch-icon.png",
  "/manifest.json"
]);

app.use((req, res, next) => {
  if (req.path.startsWith("/api/auth/")) return next();
  if (req.path === "/api/config") return next();
  if (PUBLIC.has(req.path)) return next();
  if (req.path.startsWith("/api/")) return auth.requireAuth(req, res, next);
  if (/\.(js|css|png|json|webp|ico|svg|woff2?)$/i.test(req.path)) {
    return auth.requireAuthPage(req, res, next);
  }
  if (req.path === "/" || req.path === "/index.html") {
    return auth.requireAuthPage(req, res, next);
  }
  next();
});

app.use(express.static(root, { index: false, extensions: ["html"] }));

app.get("/api/config", (req, res) => {
  const session = auth.readSession(req);
  res.json({
    serverSync: store.isConfigured(),
    syncBackend: store.info(),
    emailEnabled: email.isConfigured(),
    appUrl: email.APP_URL,
    authenticated: Boolean(session)
  });
});

app.post("/api/auth/login", (req, res) => {
  const { password, userName } = req.body || {};
  const session = auth.login(password, userName);
  if (!session) {
    return res.status(401).json({ error: "Wrong team password" });
  }
  auth.createSession(res, session.user);
  res.json({ ok: true, user: session.user });
});

app.post("/api/auth/logout", (req, res) => {
  auth.clearSession(res);
  res.json({ ok: true });
});

app.get("/api/auth/me", (req, res) => {
  const session = auth.readSession(req);
  if (!session) return res.status(401).json({ error: "Unauthorized" });
  res.json({ user: session.user });
});

app.get("/api/sync", async (req, res) => {
  try {
    if (!store.isConfigured()) {
      return res.status(503).json({ error: "Team sync not configured on server" });
    }
    const record = await store.fetchRecord();
    res.json(record || { pharmacies: [], tasks: [], teamConfig: {} });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put("/api/sync", async (req, res) => {
  try {
    if (!store.isConfigured()) {
      return res.status(503).json({ error: "Team sync not configured on server" });
    }
    const payload = req.body;
    if (!payload || typeof payload !== "object") {
      return res.status(400).json({ error: "Invalid payload" });
    }

    payload.savedAt = new Date().toISOString();
    payload.updatedBy = req.crmUser || payload.updatedBy || "Team member";
    notifications.ensureMeta(payload);

    const prev = await store.fetchRecord();
    await notifications.diffAndNotify(prev, payload, payload.updatedBy);
    await store.pushRecord(payload);

    res.json({ ok: true, ...store.info() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/login.html", (_req, res) => {
  res.sendFile(path.join(root, "login.html"));
});

app.get("*", auth.requireAuthPage, (_req, res) => {
  res.sendFile(path.join(root, "index.html"));
});

async function bootstrap() {
  const info = store.info();
  if (info.backend) {
    console.log(`Team sync: ${info.backend}`, info);
  } else {
    console.warn("No sync backend — set GITHUB_TOKEN on Render (recommended) or JSONBIN_MASTER_KEY");
  }

  setInterval(async () => {
    if (!store.isConfigured() || !email.isConfigured()) return;
    try {
      const record = await store.fetchRecord();
      if (!record) return;
      const touched = await notifications.runFollowUps(record);
      const sent = touched.filter((r) => r?.sent).length;
      if (sent > 0) {
        await store.pushRecord(record);
        console.log(`Follow-up emails sent: ${sent}`);
      }
    } catch (e) {
      console.warn("Follow-up job:", e.message);
    }
  }, 60 * 60 * 1000);

  app.listen(port, "0.0.0.0", () => {
    console.log(`LeafLock Sales CRM on port ${port}`);
  });
}

bootstrap();