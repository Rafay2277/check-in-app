import { PoolClient } from "pg";
import { env } from "../config";
import { calendarDateInShopTz } from "./dates";
import { query } from "../db/pool";

let dailySchemaReady = false;

/**
 * Hostinger often sets SKIP_MIGRATE_ON_START=true, so 004 may never run.
 * Apply the nullable permanent_token_id + checkin_token_id columns idempotently.
 */
export async function ensureDailyCheckinsAppQrSchema(
  client?: PoolClient
): Promise<void> {
  if (dailySchemaReady) return;

  const run = async (c: PoolClient) => {
    await c.query(`
      ALTER TABLE daily_checkins
        ALTER COLUMN permanent_token_id DROP NOT NULL
    `);
    await c.query(`
      ALTER TABLE daily_checkins
        ADD COLUMN IF NOT EXISTS checkin_token_id UUID
    `);
    // Optional FK — ignore if it already exists or tokens table differs
    try {
      await c.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_constraint
            WHERE conname = 'daily_checkins_checkin_token_id_fkey'
          ) THEN
            ALTER TABLE daily_checkins
              ADD CONSTRAINT daily_checkins_checkin_token_id_fkey
              FOREIGN KEY (checkin_token_id) REFERENCES checkin_tokens(id);
          END IF;
        END $$;
      `);
    } catch (err) {
      console.warn("[dailyCheckin] optional FK skipped:", err);
    }
    try {
      await c.query(
        `INSERT INTO schema_migrations (filename) VALUES ($1)
         ON CONFLICT (filename) DO NOTHING`,
        ["004_daily_checkins_app_qr.sql"]
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

  dailySchemaReady = true;
  console.log("[dailyCheckin] daily_checkins schema ready for app QR");
}

/** True if this member already completed a check-in for today's shop calendar date. */
export async function memberCheckedInToday(
  memberId: string,
  client?: PoolClient
): Promise<boolean> {
  const checkinDate = calendarDateInShopTz();
  const sql = `
    SELECT 1 AS hit
    FROM daily_checkins
    WHERE member_id = $1
      AND checkin_date = $2::date
    UNION ALL
    SELECT 1 AS hit
    FROM checkin_tokens
    WHERE member_id = $1
      AND status = 'used'
      AND (used_at AT TIME ZONE $3)::date = $2::date
    LIMIT 1`;
  const params = [memberId, checkinDate, env.CHECKIN_CALENDAR_TZ];

  if (client) {
    const { rows } = await client.query(sql, params);
    return rows.length > 0;
  }
  const { rows } = await query(sql, params);
  return rows.length > 0;
}

/**
 * Record today's check-in. Returns false if the member already had one today
 * (unique conflict / prior row).
 */
export async function tryRecordDailyCheckin(
  client: PoolClient,
  memberId: string,
  opts: { permanentTokenId?: string; checkinTokenId?: string } = {}
): Promise<{ recorded: boolean; checkinDate: string }> {
  const checkinDate = calendarDateInShopTz();

  try {
    await ensureDailyCheckinsAppQrSchema(client);
  } catch (err) {
    console.warn("[dailyCheckin] schema ensure failed:", err);
  }

  try {
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO daily_checkins (member_id, checkin_date, permanent_token_id, checkin_token_id)
       VALUES ($1, $2::date, $3, $4)
       ON CONFLICT (member_id, checkin_date) DO NOTHING
       RETURNING id`,
      [
        memberId,
        checkinDate,
        opts.permanentTokenId ?? null,
        opts.checkinTokenId ?? null,
      ]
    );
    return { recorded: rows.length > 0, checkinDate };
  } catch (err) {
    // Legacy schema fallback: permanent_token_id still NOT NULL, or missing column.
    // Daily limit still enforced via checkin_tokens.used_at in memberCheckedInToday.
    console.warn(
      "[dailyCheckin] insert failed; continuing with token-based daily limit:",
      err
    );
    if (opts.permanentTokenId) {
      const { rows } = await client.query<{ id: string }>(
        `INSERT INTO daily_checkins (member_id, checkin_date, permanent_token_id)
         VALUES ($1, $2::date, $3)
         ON CONFLICT (member_id, checkin_date) DO NOTHING
         RETURNING id`,
        [memberId, checkinDate, opts.permanentTokenId]
      );
      return { recorded: rows.length > 0, checkinDate };
    }
    // App QR on legacy schema: treat as recorded so validate can proceed.
    return { recorded: true, checkinDate };
  }
}
