const fs = require("fs");
const path = require("path");

const BIN_FILE = path.join(__dirname, "..", ".jsonbin-id");

function masterKey() {
  return process.env.JSONBIN_MASTER_KEY?.trim() || "";
}

function binId() {
  return process.env.JSONBIN_BIN_ID?.trim() || (fs.existsSync(BIN_FILE) ? fs.readFileSync(BIN_FILE, "utf8").trim() : "");
}

function saveBinId(id) {
  fs.writeFileSync(BIN_FILE, id, "utf8");
  process.env.JSONBIN_BIN_ID = id;
}

async function createBin(initial) {
  const key = masterKey();
  if (!key) throw new Error("JSONBIN_MASTER_KEY not set");

  const res = await fetch("https://api.jsonbin.io/v3/b", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Master-Key": key,
      "X-Bin-Name": "leaflock-sales-crm",
      "X-Bin-Private": "true"
    },
    body: JSON.stringify(initial)
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`JSONBin create failed (${res.status}): ${err}`);
  }

  const json = await res.json();
  const id = json.metadata?.id;
  if (!id) throw new Error("JSONBin create returned no bin id");
  saveBinId(id);
  return id;
}

async function ensureBin(initial) {
  if (binId()) return binId();
  return createBin(initial);
}

async function fetchRecord() {
  const id = binId();
  const key = masterKey();
  if (!id || !key) return null;

  const res = await fetch(`https://api.jsonbin.io/v3/b/${id}/latest`, {
    headers: { "X-Master-Key": key }
  });

  if (res.status === 404) return null;
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`JSONBin read failed (${res.status}): ${err}`);
  }

  const json = await res.json();
  return json.record || json;
}

async function pushRecord(payload) {
  const id = await ensureBin(payload);
  const key = masterKey();
  const res = await fetch(`https://api.jsonbin.io/v3/b/${id}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "X-Master-Key": key
    },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`JSONBin write failed (${res.status}): ${err}`);
  }

  return { binId: id, ok: true };
}

function isConfigured() {
  return Boolean(masterKey());
}

module.exports = {
  binId,
  masterKey,
  createBin,
  ensureBin,
  fetchRecord,
  pushRecord,
  isConfigured,
  saveBinId
};