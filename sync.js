(function () {
  const SYNC_SETTINGS_KEY = "leaflock-team-sync-v1";
  const USER_KEY = "leaflock-user-name";
  const POLL_MS = 2000;

  let pollTimer = null;
  let pushing = false;
  let lastRemoteAt = 0;
  let serverSync = false;
  let serverConfig = null;
  let onRemoteHandler = null;
  let eventSource = null;
  let pullInFlight = null;

  function loadSettings() {
    try {
      return JSON.parse(localStorage.getItem(SYNC_SETTINGS_KEY) || "{}");
    } catch (_) {
      return {};
    }
  }

  function saveSettings(s) {
    localStorage.setItem(SYNC_SETTINGS_KEY, JSON.stringify(s));
  }

  function currentUser() {
    return localStorage.getItem(USER_KEY) || "Team member";
  }

  function setCurrentUser(name) {
    localStorage.setItem(USER_KEY, name.trim());
  }

  function usesServer() {
    return serverSync;
  }

  function isEnabled() {
    if (serverSync) return true;
    const s = loadSettings();
    return Boolean(s.enabled && s.binId && s.masterKey);
  }

  function markRemoteTs(savedAt) {
    if (!savedAt) return;
    const ts = new Date(savedAt).getTime();
    if (Number.isFinite(ts)) lastRemoteAt = ts;
  }

  async function detectServer() {
    try {
      const res = await fetch("/api/config", { credentials: "include" });
      if (!res.ok) return null;
      serverConfig = await res.json();
      serverSync = Boolean(serverConfig.serverSync);
      if (serverSync) {
        saveSettings({ enabled: true, serverManaged: true });
      }
      return serverConfig;
    } catch (_) {
      return null;
    }
  }

  async function fetchRemote() {
    if (serverSync) {
      const res = await fetch("/api/sync", { credentials: "include" });
      if (res.status === 401) {
        location.href = "/login.html";
        throw new Error("Not signed in");
      }
      if (!res.ok) throw new Error(`Sync read failed (${res.status})`);
      return res.json();
    }

    const s = loadSettings();
    if (!s.binId || !s.masterKey) throw new Error("Sync not configured");
    const res = await fetch(`https://api.jsonbin.io/v3/b/${s.binId}/latest`, {
      headers: { "X-Master-Key": s.masterKey }
    });
    if (!res.ok) throw new Error(`Sync read failed (${res.status})`);
    const json = await res.json();
    return json.record || json;
  }

  async function pushRemote(payload) {
    if (serverSync) {
      pushing = true;
      try {
        const res = await fetch("/api/sync", {
          method: "PUT",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        if (res.status === 401) {
          location.href = "/login.html";
          return null;
        }
        if (!res.ok) throw new Error(`Sync write failed (${res.status})`);
        const data = await res.json().catch(() => ({}));
        markRemoteTs(data.savedAt || payload.savedAt);
        return data;
      } finally {
        pushing = false;
      }
    }

    const s = loadSettings();
    if (!s.binId || !s.masterKey) return null;
    pushing = true;
    try {
      const res = await fetch(`https://api.jsonbin.io/v3/b/${s.binId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "X-Master-Key": s.masterKey
        },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error(`Sync write failed (${res.status})`);
      markRemoteTs(payload.savedAt || new Date().toISOString());
      return { ok: true };
    } finally {
      pushing = false;
    }
  }

  async function pullNow(force = false) {
    if (!isEnabled() || !onRemoteHandler) return;
    if (pullInFlight) return pullInFlight;
    pullInFlight = (async () => {
      if (pushing && !force) return;
      try {
        const remote = await fetchRemote();
        if (!remote?.savedAt) return;
        const remoteTs = new Date(remote.savedAt).getTime();
        if (force || remoteTs > lastRemoteAt) {
          markRemoteTs(remote.savedAt);
          onRemoteHandler(remote, true, true);
        }
      } catch (_) {
      } finally {
        pullInFlight = null;
      }
    })();
    return pullInFlight;
  }

  function stopPolling() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = null;
  }

  function disconnectLive() {
    if (eventSource) {
      eventSource.close();
      eventSource = null;
    }
  }

  function connectLive() {
    disconnectLive();
    if (!serverSync) return;
    try {
      eventSource = new EventSource("/api/sync/events");
      eventSource.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          if (data.type === "update") {
            if (data.savedAt) markRemoteTs(data.savedAt);
            pullNow(true);
          }
        } catch (_) {}
      };
      eventSource.onerror = () => {
        disconnectLive();
        setTimeout(connectLive, 4000);
      };
    } catch (_) {}
  }

  function startPolling(onRemote) {
    stopPolling();
    onRemoteHandler = onRemote;
    if (!isEnabled()) return;
    connectLive();
    pollTimer = setInterval(() => pullNow(false), POLL_MS);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") pullNow(true);
    });
  }

  window.CRM_SYNC = {
    loadSettings,
    saveSettings,
    currentUser,
    setCurrentUser,
    isEnabled,
    usesServer,
    detectServer,
    getServerConfig: () => serverConfig,
    fetchRemote,
    pushRemote,
    pullNow,
    startPolling,
    stopPolling,
    connectLive,
    markPushed(savedAt) {
      markRemoteTs(savedAt || new Date().toISOString());
    }
  };
})();