const jsonbin = require("./jsonbin");
const github = require("./github-store");

function backend() {
  if (github.isConfigured()) return "github";
  if (jsonbin.isConfigured()) return "jsonbin";
  return null;
}

function isConfigured() {
  return Boolean(backend());
}

async function fetchRecord() {
  const b = backend();
  if (b === "github") return github.fetchRecord();
  if (b === "jsonbin") return jsonbin.fetchRecord();
  return null;
}

async function pushRecord(payload) {
  const b = backend();
  if (b === "github") return github.pushRecord(payload);
  if (b === "jsonbin") return jsonbin.pushRecord(payload);
  throw new Error("No sync backend configured");
}

function info() {
  const b = backend();
  if (b === "github") return { backend: "github", repo: github.repo(), path: github.path() };
  if (b === "jsonbin") return { backend: "jsonbin", binId: jsonbin.binId() };
  return { backend: null };
}

module.exports = { isConfigured, fetchRecord, pushRecord, info, backend };