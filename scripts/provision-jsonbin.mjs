/**
 * Run once with JSONBIN_MASTER_KEY in env (from jsonbin.io -> API Keys):
 *   set JSONBIN_MASTER_KEY=your-key
 *   node scripts/provision-jsonbin.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const key = process.env.JSONBIN_MASTER_KEY?.trim();
if (!key) {
  console.error("Set JSONBIN_MASTER_KEY from https://jsonbin.io/app/api-keys");
  process.exit(1);
}

const initial = {
  pharmacies: [],
  tasks: [],
  teamConfig: {
    members: ["Lewis", "Sarah", "James"],
    memberEmails: {
      Lewis: "info@leaflock.com.au"
    }
  },
  meta: { emailLog: {} }
};

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

const json = await res.json();
if (!res.ok) {
  console.error(json.message || json);
  process.exit(1);
}

const id = json.metadata?.id;
console.log("Bin created:", id);
console.log("Add to Render env: JSONBIN_BIN_ID=" + id);
console.log("Add to Render env: JSONBIN_MASTER_KEY=" + key);