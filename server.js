/**
 * Hostinger entry file (repo root).
 *
 * Hostinger sometimes runs the entry file without preserving build output in the
 * expected place. We therefore:
 *  1) prefer committed ./dist
 *  2) search common alternate paths
 *  3) build on the fly if still missing
 */
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

function exists(p) {
  try {
    return fs.existsSync(p);
  } catch {
    return false;
  }
}

function listDir(dir) {
  try {
    return fs.readdirSync(dir).join(", ");
  } catch (err) {
    return `(unreadable: ${err instanceof Error ? err.message : String(err)})`;
  }
}

function findDistIndex() {
  const candidates = [
    path.join(__dirname, "dist", "index.js"),
    path.join(process.cwd(), "dist", "index.js"),
    path.join(__dirname, "apps", "api", "dist", "index.js"),
    path.join(process.cwd(), "apps", "api", "dist", "index.js"),
  ];
  for (const p of candidates) {
    if (exists(p)) return p;
  }
  return null;
}

function runBuild() {
  console.log("[server] Building (npm run build)…");
  console.log("[server] cwd=%s __dirname=%s", process.cwd(), __dirname);
  console.log("[server] root listing: %s", listDir(__dirname));

  const result = spawnSync("npm", ["run", "build"], {
    cwd: __dirname,
    stdio: "inherit",
    env: process.env,
    shell: true,
    timeout: 180_000,
  });
  return result.status === 0;
}

let distIndex = findDistIndex();

if (!distIndex) {
  console.warn("[server] dist/index.js not found — attempting build…");
  if (!runBuild()) {
    console.error("[server] Build failed.");
  }
  distIndex = findDistIndex();
}

if (!distIndex) {
  console.error("[server] Still missing dist/index.js after build.");
  console.error("[server] cwd=%s __dirname=%s", process.cwd(), __dirname);
  console.error("[server] root listing: %s", listDir(__dirname));
  process.exit(1);
}

const distDir = path.dirname(distIndex);
const migrateJs = path.join(distDir, "db", "migrate.js");

if (exists(migrateJs) && process.env.SKIP_MIGRATE_ON_START !== "true") {
  console.log("[server] Running migrations…");
  const result = spawnSync(process.execPath, [migrateJs], {
    stdio: "inherit",
    env: process.env,
    timeout: 60_000,
  });
  if (result.status !== 0) {
    console.error(
      "[server] Migrate failed (continuing — schema may already exist):",
      result.error ?? `exit ${result.status}`
    );
  } else {
    console.log("[server] Migrations OK");
  }
}

console.log("[server] Starting API from %s (PORT=%s)", distIndex, process.env.PORT || "3000");
require(distIndex);
