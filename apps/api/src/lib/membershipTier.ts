import { PoolClient } from "pg";

let membershipTierSchemaReady = false;

/**
 * Hostinger often sets SKIP_MIGRATE_ON_START=true, so 005 may never run.
 * Create membership_tier enum + column idempotently at runtime.
 */
export async function ensureMembershipTierSchema(
  client?: PoolClient
): Promise<void> {
  if (membershipTierSchemaReady) return;

  const run = async (c: PoolClient) => {
    await c.query(`
      DO $$ BEGIN
        CREATE TYPE membership_tier AS ENUM ('premium', 'standard');
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `);
    await c.query(`
      ALTER TABLE members
        ADD COLUMN IF NOT EXISTS membership_tier membership_tier NOT NULL DEFAULT 'standard';
    `);
    try {
      await c.query(
        `INSERT INTO schema_migrations (filename) VALUES ($1)
         ON CONFLICT (filename) DO NOTHING`,
        ["005_membership_tier.sql"]
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

  membershipTierSchemaReady = true;
  console.log("[membershipTier] members.membership_tier schema ready");
}
