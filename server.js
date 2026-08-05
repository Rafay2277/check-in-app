/**
 * Hostinger entry file (repo root).
 * Starts the Express API quickly; migrations run in a child process and
 * must not block / crash the HTTP server if the schema is already applied.
 */
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const distIndex = path.join(__dirname, "apps", "api", "dist", "index.js");
const migrateJs = path.join(__dirname, "apps", "api", "dist", "db", "migrate.js");

if (!fs.existsSync(distIndex)) {
  console.error(
    "[server] Missing apps/api/dist/index.js — build did not produce output. Check build logs."
  );
  process.exit(1);
}

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

console.log("[server] Starting API on PORT=%s", process.env.PORT || "3000");
require(distIndex);
