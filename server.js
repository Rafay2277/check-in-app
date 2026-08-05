/**
 * Hostinger entry file (repo root).
 * Runs DB migrations, then starts the Express API + /scanner.
 */
const { spawnSync } = require("child_process");
const path = require("path");

const migrateJs = path.join(__dirname, "apps", "api", "dist", "db", "migrate.js");
const result = spawnSync(process.execPath, [migrateJs], {
  stdio: "inherit",
  env: process.env,
});

if (result.status !== 0) {
  console.error("[server] migrate failed", result.error ?? `exit ${result.status}`);
  process.exit(result.status ?? 1);
}

require(path.join(__dirname, "apps", "api", "dist", "index.js"));
