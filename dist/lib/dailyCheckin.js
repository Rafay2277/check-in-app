"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.memberCheckedInToday = memberCheckedInToday;
exports.tryRecordDailyCheckin = tryRecordDailyCheckin;
const config_1 = require("../config");
const dates_1 = require("./dates");
const pool_1 = require("../db/pool");
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
//# sourceMappingURL=dailyCheckin.js.map