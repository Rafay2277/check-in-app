"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const pool_1 = require("./pool");
async function migrate() {
    const migrationsDir = path_1.default.resolve(__dirname, "../../migrations");
    const files = fs_1.default
        .readdirSync(migrationsDir)
        .filter((f) => f.endsWith(".sql"))
        .sort();
    await pool_1.pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
    for (const file of files) {
        const { rows } = await pool_1.pool.query("SELECT filename FROM schema_migrations WHERE filename = $1", [file]);
        if (rows.length > 0) {
            console.log(`skip  ${file}`);
            continue;
        }
        const sql = fs_1.default.readFileSync(path_1.default.join(migrationsDir, file), "utf8");
        const client = await pool_1.pool.connect();
        try {
            await client.query("BEGIN");
            await client.query(sql);
            await client.query("INSERT INTO schema_migrations (filename) VALUES ($1)", [file]);
            await client.query("COMMIT");
            console.log(`apply ${file}`);
        }
        catch (err) {
            await client.query("ROLLBACK");
            throw err;
        }
        finally {
            client.release();
        }
    }
    await pool_1.pool.end();
    console.log("Migrations complete.");
}
migrate().catch((err) => {
    console.error("Migration failed:", err);
    process.exit(1);
});
//# sourceMappingURL=migrate.js.map