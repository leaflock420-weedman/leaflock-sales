(function () {
  const SYNC_SETTINGS_KEY = "leaflock-team-sync-v1";
  const USER_KEY = "leaflock-user-name";

  let pollTimer = null;
  let pushing = false;
  let lastRemoteAt = 0;

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

  function isEnabled() {
    const s = loadSettings();
    return Boolean(s.enabled && s.binId && s.masterKey);
  }

  async function fetchRemote() {
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
    const s = loadSettings();
    if (!s.binId || !s.masterKey) return;
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
      lastRemoteAt = Date.now();
      return true;
    } finally {
      pushing = false;
    }
  }

  function stopPolling() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = null;
  }

  function startPolling(onRemote) {
    stopPolling();
    if (!isEnabled()) return;
    pollTimer = setInterval(async () => {
      if (pushing) return;
      try {
        const remote = await fetchRemote();
        if (!remote?.savedAt) return;
        const remoteTs = new Date(remote.savedAt).getTime();
        if (remoteTs > lastRemoteAt) {
          lastRemoteAt = remoteTs;
          onRemote(remote, true);
        }
      } catch (_) {}
    }, 8000);
  }

  window.CRM_SYNC = {
    loadSettings,
    saveSettings,
    currentUser,
    setCurrentUser,
    isEnabled,
    fetchRemote,
    pushRemote,
    startPolling,
    stopPolling,
    markPushed() {
      lastRemoteAt = Date.now();
    }
  };
})();