/**
 * Verifies permanent token + daily limit against live Supabase.
 * Does not mint production member cards.
 *
 * Usage:
 *   DATABASE_URL='postgresql://...' node scripts/verify-permanent-daily-limit.js
 */
const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");

const TZ = process.env.CHECKIN_CALENDAR_TZ || "America/Los_Angeles";

function resolveDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const user = process.env.DB_USER;
  const password = process.env.DB_PASSWORD ?? "";
  const host = process.env.DB_HOST;
  const port = process.env.DB_PORT || "5432";
  const name = process.env.DB_NAME || "postgres";
  if (user && host) {
    return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${name}`;
  }
  // Require DATABASE_URL or DB_* — do not hardcode production secrets in scripts
  throw new Error(
    "Set DATABASE_URL or DB_USER/DB_PASSWORD/DB_HOST (and optionally DB_PORT/DB_NAME)"
  );
}

async function applyMigration003(pool) {
  const sqlPath = path.join(
    __dirname,
    "..",
    "apps",
    "api",
    "migrations",
    "003_permanent_checkin_tokens.sql"
  );
  const sql = fs.readFileSync(sqlPath, "utf8");
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  const { rows } = await pool.query(
    `SELECT 1 FROM schema_migrations WHERE filename = $1`,
    ["003_permanent_checkin_tokens.sql"]
  );
  if (rows.length) {
    console.log("migration 003 already applied");
    return;
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(sql);
    await client.query(
      `INSERT INTO schema_migrations (filename) VALUES ($1)`,
      ["003_permanent_checkin_tokens.sql"]
    );
    await client.query("COMMIT");
    console.log("applied 003_permanent_checkin_tokens.sql");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function validatePermanent(client, token) {
  const { rows: tokenRows } = await client.query(
    `SELECT id, member_id, active FROM permanent_checkin_tokens WHERE token = $1::uuid FOR UPDATE`,
    [token]
  );
  if (!tokenRows[0]) return { approved: false, reason: "unknown" };
  if (!tokenRows[0].active) return { approved: false, reason: "deactivated" };

  const { rows: dateRows } = await client.query(
    `SELECT (NOW() AT TIME ZONE $1)::date::text AS d`,
    [TZ]
  );
  const checkinDate = dateRows[0].d;

  const { rows: dailyRows } = await client.query(
    `INSERT INTO daily_checkins (member_id, checkin_date, permanent_token_id)
     VALUES ($1, $2::date, $3)
     ON CONFLICT (member_id, checkin_date) DO NOTHING
     RETURNING id`,
    [tokenRows[0].member_id, checkinDate, tokenRows[0].id]
  );
  if (!dailyRows[0]) {
    return { approved: false, reason: "already_checked_in_today", checkinDate };
  }

  const { rows: memberRows } = await client.query(
    `UPDATE members SET points_total = points_total + 1, updated_at = NOW()
     WHERE id = $1 RETURNING name, points_total`,
    [tokenRows[0].member_id]
  );

  return {
    approved: true,
    reason: "ok",
    checkinDate,
    points: memberRows[0].points_total,
    name: memberRows[0].name,
  };
}

async function main() {
  const pool = new Pool({
    connectionString: resolveDatabaseUrl(),
    ssl: { rejectUnauthorized: false },
  });

  const results = [];
  let memberId;
  let token;

  try {
    await applyMigration003(pool);

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const { rows: members } = await client.query(
        `INSERT INTO members (name, phone_number, ghl_contact_id, points_total)
         VALUES ($1, $2, $3, 0)
         RETURNING id`,
        [
          "VERIFY Permanent Daily Limit",
          `+1999${Date.now().toString().slice(-7)}`,
          `verify_ghl_${Date.now()}`,
        ]
      );
      memberId = members[0].id;

      const { rows: tokens } = await client.query(
        `INSERT INTO permanent_checkin_tokens (member_id, label, active)
         VALUES ($1, $2, TRUE)
         RETURNING token::text AS token, id`,
        [memberId, "verify-script"]
      );
      token = tokens[0].token;

      // 1) First scan today → approve
      const first = await validatePermanent(client, token);
      results.push({ step: "1_first_scan_today", ...first });

      // 2) Second scan same day → reject
      const second = await validatePermanent(client, token);
      results.push({ step: "2_second_scan_same_day", ...second });

      // 3) Move today's daily_checkin to yesterday → next calendar day allows scan
      await client.query(
        `UPDATE daily_checkins
         SET checkin_date = ((NOW() AT TIME ZONE $1)::date - INTERVAL '1 day')::date
         WHERE member_id = $2`,
        [TZ, memberId]
      );
      const third = await validatePermanent(client, token);
      results.push({ step: "3_scan_after_day_rollover", ...third });

      // 4) Deactivate card → reject
      await client.query(
        `UPDATE permanent_checkin_tokens SET active = FALSE, deactivated_at = NOW() WHERE member_id = $1`,
        [memberId]
      );
      const fourth = await validatePermanent(client, token);
      results.push({ step: "4_scan_after_deactivate", ...fourth });

      // Cleanup test rows
      await client.query(`DELETE FROM members WHERE id = $1`, [memberId]);
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }

    console.log("\n=== Permanent token daily-limit verification ===");
    console.log(`Timezone: ${TZ}`);
    for (const r of results) {
      console.log(JSON.stringify(r));
    }

    const pass =
      results[0]?.approved === true &&
      results[1]?.approved === false &&
      results[1]?.reason === "already_checked_in_today" &&
      results[2]?.approved === true &&
      results[3]?.approved === false &&
      results[3]?.reason === "deactivated";

    console.log(pass ? "\nPASS: daily limit + deactivate behave as required" : "\nFAIL");
    process.exit(pass ? 0 : 1);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
