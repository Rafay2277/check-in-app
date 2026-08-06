import fs from "fs";
import path from "path";
import dotenv from "dotenv";

/**
 * Hostinger Git deploys wipe hbuilds/versions/... on each release, and their
 * Environment Variables UI often does not persist DATABASE_URL / DB_*.
 * Load .env from stable paths outside the version folder first.
 */
export function loadEnvFiles(): string[] {
  const loaded: string[] = [];
  const tried = new Set<string>();

  const candidates = [
    process.env.ENV_FILE,
    // Stable Hostinger path (survives redeploy): domain/private/checkin.env
    path.resolve(process.cwd(), "../../../../private/checkin.env"),
    path.resolve(process.cwd(), "../../../private/checkin.env"),
    path.resolve(process.cwd(), "../../private/checkin.env"),
    path.resolve(__dirname, "../../../../../../private/checkin.env"),
    path.resolve(__dirname, "../../../../../private/checkin.env"),
    // Domain-root .env (also outside versioned build)
    path.resolve(process.cwd(), "../../../../.env"),
    path.resolve(process.cwd(), "../../../.env"),
    // Local monorepo / default
    path.resolve(process.cwd(), "../../.env"),
    path.resolve(process.cwd(), ".env"),
    path.resolve(__dirname, "../../../.env"),
  ].filter((p): p is string => Boolean(p));

  for (const file of candidates) {
    const abs = path.resolve(file);
    if (tried.has(abs)) continue;
    tried.add(abs);
    if (!fs.existsSync(abs)) continue;
    const result = dotenv.config({ path: abs, override: false });
    if (!result.error) {
      loaded.push(abs);
    }
  }

  // cwd default as last resort
  dotenv.config({ override: false });

  if (loaded.length > 0) {
    console.log(`[env] loaded file(s): ${loaded.join(" | ")}`);
  } else {
    console.warn(
      "[env] no checkin.env/.env file found — relying on process environment only"
    );
  }

  return loaded;
}
