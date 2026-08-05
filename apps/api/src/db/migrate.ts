import fs from "fs";
import path from "path";
import { pool } from "./pool";

function resolveMigrationsDir(): string {
  const candidates = [
    path.resolve(__dirname, "migrations"), // dist/db → wrong
    path.resolve(__dirname, "../migrations"), // dist/migrations (Hostinger prepare)
    path.resolve(__dirname, "../../migrations"), // apps/api/migrations (source layout)
    path.resolve(__dirname, "../../apps/api/migrations"), // root dist → apps/api/migrations
    path.resolve(process.cwd(), "apps/api/migrations"),
    path.resolve(process.cwd(), "migrations"),
    path.resolve(process.cwd(), "dist/migrations"),
  ];

  for (const dir of candidates) {
    try {
      if (fs.existsSync(dir) && fs.readdirSync(dir).some((f) => f.endsWith(".sql"))) {
        return dir;
      }
    } catch {
      // try next
    }
  }

  throw new Error(
    `Migrations folder not found. Looked in:\n${candidates.join("\n")}`
  );
}

async function migrate(): Promise<void> {
  const migrationsDir = resolveMigrationsDir();
  console.log(`[migrate] using ${migrationsDir}`);

  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  for (const file of files) {
    const { rows } = await pool.query<{ filename: string }>(
      "SELECT filename FROM schema_migrations WHERE filename = $1",
      [file]
    );
    if (rows.length > 0) {
      console.log(`skip  ${file}`);
      continue;
    }

    const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query(
        "INSERT INTO schema_migrations (filename) VALUES ($1)",
        [file]
      );
      await client.query("COMMIT");
      console.log(`apply ${file}`);
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  await pool.end();
  console.log("Migrations complete.");
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
