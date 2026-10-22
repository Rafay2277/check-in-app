import { PoolClient } from "pg";

let memberNumberSchemaReady = false;

/**
 * Hostinger often sets SKIP_MIGRATE_ON_START=true, so 006 may never run.
 * Add members.member_number idempotently at runtime.
 */
export async function ensureMemberNumberSchema(
  client?: PoolClient
): Promise<void> {
  if (memberNumberSchemaReady) return;

  const run = async (c: PoolClient) => {
    await c.query(`
      ALTER TABLE members
        ADD COLUMN IF NOT EXISTS member_number TEXT;
    `);
    try {
      await c.query(
        `INSERT INTO schema_migrations (filename) VALUES ($1)
         ON CONFLICT (filename) DO NOTHING`,
        ["006_member_number.sql"]
      );
    } catch {
      // schema_migrations may not exist in odd setups
    }
  };

  if (client) {
    await run(client);
  } else {
    const { pool } = await import("../db/pool");
    const c = await pool.connect();
    try {
      await run(c);
    } finally {
      c.release();
    }
  }

  memberNumberSchemaReady = true;
  console.log("[memberNumber] members.member_number schema ready");
}
