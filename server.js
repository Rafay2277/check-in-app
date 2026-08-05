/**
 * Hostinger entry file (repo root).
 * Prefers flattened ./dist from prepare-hostinger; falls back to apps/api/dist.
 */
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

function pick(...candidates) {
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

const distIndex = pick(
  path.join(__dirname, "dist", "index.js"),
  path.join(__dirname, "apps", "api", "dist", "index.js")
);

if (!distIndex) {
  console.error(
    "[server] Missing dist/index.js — build did not produce output. Check build logs."
  );
  process.exit(1);
}

const distDir = path.dirname(distIndex);
const migrateJs = path.join(distDir, "db", "migrate.js");

if (fs.existsSync(migrateJs) && process.env.SKIP_MIGRATE_ON_START !== "true") {
  console.log("[server] Running migrations…");
  const result = spawnSync(process.execPath, [migrateJs], {
    stdio: "inherit",
    env: process.env,
    timeout: 60_000,
  });
  if (result.status !== 0) {
    console.error(
      "[server] Migrate failed (continuing startup — schema may already exist):",
      result.error ?? `exit ${result.status}`
    );
  } else {
    console.log("[server] Migrations OK");
  }
}

console.log("[server] Starting API from %s (PORT=%s)", distIndex, process.env.PORT || "3000");
require(distIndex);
