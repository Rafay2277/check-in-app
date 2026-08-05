/**
 * After `tsc`, flatten build output for Hostinger:
 *   dist/index.js          ← API entry
 *   dist/db/migrate.js
 *   dist/scanner/*         ← staff UI static files
 */
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const apiDist = path.join(root, "apps", "api", "dist");
const scannerSrc = path.join(root, "apps", "scanner");
const outDist = path.join(root, "dist");

function exists(p) {
  try {
    fs.accessSync(p);
    return true;
  } catch {
    return false;
  }
}

if (!exists(path.join(apiDist, "index.js"))) {
  console.error("[prepare-hostinger] Missing apps/api/dist/index.js — tsc failed?");
  process.exit(1);
}

fs.rmSync(outDist, { recursive: true, force: true });
fs.cpSync(apiDist, outDist, { recursive: true });
fs.cpSync(scannerSrc, path.join(outDist, "scanner"), { recursive: true });

console.log("[prepare-hostinger] Ready:");
console.log("  ", path.join(outDist, "index.js"));
console.log("  ", path.join(outDist, "scanner", "index.html"));
