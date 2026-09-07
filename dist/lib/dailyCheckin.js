"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensureDailyCheckinsAppQrSchema = ensureDailyCheckinsAppQrSchema;
exports.memberCheckedInToday = memberCheckedInToday;
exports.tryRecordDailyCheckin = tryRecordDailyCheckin;
const config_1 = require("../config");
const dates_1 = require("./dates");
const pool_1 = require("../db/pool");
let dailySchemaReady = false;
/**
 * Hostinger often sets SKIP_MIGRATE_ON_START=true, so 004 may never run.
 * Apply the nullable permanent_token_id + checkin_token_id columns idempotently.
 */
async function ensureDailyCheckinsAppQrSchema(client) {
    if (dailySchemaReady)
        return;
    const run = async (c) => {
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
        }
        catch (err) {
            console.warn("[dailyCheckin] optional FK skipped:", err);
        }
        try {
            await c.query(`INSERT INTO schema_migrations (filename) VALUES ($1)
         ON CONFLICT (filename) DO NOTHING`, ["004_daily_checkins_app_qr.sql"]);
        }
        catch {
            // schema_migrations may not exist in odd setups
        }
    };
    if (client) {
        await run(client);
    }
    else {
        const { pool } = await Promise.resolve().then(() => __importStar(require("../db/pool")));
        const c = await pool.connect();
        try {
            await run(c);
        }
        finally {
            c.release();
        }
    }
    dailySchemaReady = true;
    console.log("[dailyCheckin] daily_checkins schema ready for app QR");
}
/** True if this member already completed a check-in for today's shop calendar date. */
async function memberCheckedInToday(memberId, client) {
    const checkinDate = (0, dates_1.calendarDateInShopTz)();
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
    const params = [memberId, checkinDate, config_1.env.CHECKIN_CALENDAR_TZ];
    if (client) {
        const { rows } = await client.query(sql, params);
        return rows.length > 0;
    }
    const { rows } = await (0, pool_1.query)(sql, params);
    return rows.length > 0;
}
/**
 * Record today's check-in. Returns false if the member already had one today
 * (unique conflict / prior row).
 */
async function tryRecordDailyCheckin(client, memberId, opts = {}) {
    const checkinDate = (0, dates_1.calendarDateInShopTz)();
    try {
        await ensureDailyCheckinsAppQrSchema(client);
    }
    catch (err) {
        console.warn("[dailyCheckin] schema ensure failed:", err);
    }
    try {
        const { rows } = await client.query(`INSERT INTO daily_checkins (member_id, checkin_date, permanent_token_id, checkin_token_id)
       VALUES ($1, $2::date, $3, $4)
       ON CONFLICT (member_id, checkin_date) DO NOTHING
       RETURNING id`, [
            memberId,
            checkinDate,
            opts.permanentTokenId ?? null,
            opts.checkinTokenId ?? null,
        ]);
        return { recorded: rows.length > 0, checkinDate };
    }
    catch (err) {
        // Legacy schema fallback: permanent_token_id still NOT NULL, or missing column.
        // Daily limit still enforced via checkin_tokens.used_at in memberCheckedInToday.
        console.warn("[dailyCheckin] insert failed; continuing with token-based daily limit:", err);
        if (opts.permanentTokenId) {
            const { rows } = await client.query(`INSERT INTO daily_checkins (member_id, checkin_date, permanent_token_id)
         VALUES ($1, $2::date, $3)
         ON CONFLICT (member_id, checkin_date) DO NOTHING
         RETURNING id`, [memberId, checkinDate, opts.permanentTokenId]);
            return { recorded: rows.length > 0, checkinDate };
        }
        // App QR on legacy schema: treat as recorded so validate can proceed.
        return { recorded: true, checkinDate };
    }
}
//# sourceMappingURL=dailyCheckin.js.map