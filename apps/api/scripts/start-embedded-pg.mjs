/**
 * User-space Postgres (no Docker/Homebrew/sudo required).
 * Keeps the process alive so the API can connect.
 */
import path from "path";
import { fileURLToPath } from "url";
import EmbeddedPostgres from "embedded-postgres";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const databaseDir = path.resolve(__dirname, "../../.data/pg");

const pg = new EmbeddedPostgres({
  databaseDir,
  user: "checkin",
  password: "checkin",
  port: 5432,
  persistent: true,
  onLog: (msg) => process.stdout.write(`[pg] ${msg}`),
  onError: (msg) => process.stderr.write(`[pg:err] ${msg}`),
});

async function main() {
  console.log(`[pg] databaseDir=${databaseDir}`);
  console.log("[pg] initialise()…");
  await pg.initialise();
  console.log("[pg] start()…");
  await pg.start();
  console.log("[pg] ensure database 'checkin'…");
  try {
    await pg.createDatabase("checkin");
    console.log("[pg] created database checkin");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`[pg] createDatabase note: ${msg}`);
  }

  const client = pg.getPgClient();
  await client.connect();
  const { rows } = await client.query(
    "SELECT current_database() AS db, current_user AS usr, version() AS version"
  );
  console.log("[pg] connected:", rows[0]);
  await client.end();

  console.log("[pg] listening on postgres://checkin:checkin@127.0.0.1:5432/checkin");
  console.log("[pg] ready — leave this process running");
}

main().catch((err) => {
  console.error("[pg] failed:", err);
  process.exit(1);
});
