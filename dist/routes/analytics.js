"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyticsRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const pool_1 = require("../db/pool");
const auth_1 = require("../middleware/auth");
exports.analyticsRouter = (0, express_1.Router)();
exports.analyticsRouter.use(auth_1.requireStaffAuth);
function startOfLocalDay(d = new Date()) {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
}
function startOfWeek(d = new Date()) {
    const x = startOfLocalDay(d);
    const day = x.getDay();
    const diff = day === 0 ? 6 : day - 1;
    x.setDate(x.getDate() - diff);
    return x;
}
function startOfMonth(d = new Date()) {
    const x = startOfLocalDay(d);
    x.setDate(1);
    return x;
}
const rangeSchema = zod_1.z.object({
    from: zod_1.z.string().min(1).optional(),
    to: zod_1.z.string().min(1).optional(),
    /** Which bucket's detailed rows to return: today | week | month | range */
    detail: zod_1.z.enum(["today", "week", "month", "range"]).optional().default("range"),
});
function parseBoundary(value, endOfDay) {
    if (!value)
        return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        const [y, m, d] = value.split("-").map(Number);
        if (endOfDay)
            return new Date(y, m - 1, d, 23, 59, 59, 999);
        return new Date(y, m - 1, d, 0, 0, 0, 0);
    }
    const dt = new Date(value);
    return Number.isNaN(dt.getTime()) ? null : dt;
}
exports.analyticsRouter.get("/summary", async (req, res) => {
    const parsed = rangeSchema.safeParse(req.query);
    if (!parsed.success) {
        res.status(400).json({ error: "Invalid from/to" });
        return;
    }
    const now = new Date();
    const todayStart = startOfLocalDay(now);
    const weekStart = startOfWeek(now);
    const monthStart = startOfMonth(now);
    const customFrom = parseBoundary(parsed.data.from, false) ?? todayStart;
    const customTo = parseBoundary(parsed.data.to, true) ?? now;
    if (customFrom > customTo) {
        res.status(400).json({ error: "from must be before to" });
        return;
    }
    try {
        const countUsed = async (from, to) => {
            const { rows } = await (0, pool_1.query)(`SELECT COUNT(*)::text AS count
         FROM checkin_tokens
         WHERE status = 'used'
           AND used_at >= $1
           AND used_at < $2`, [from, to]);
            return Number(rows[0]?.count ?? 0);
        };
        const countRejected = async (from, to) => {
            const { rows } = await (0, pool_1.query)(`SELECT COUNT(*)::text AS count
         FROM scan_attempts
         WHERE result = 'rejected'
           AND created_at >= $1
           AND created_at < $2`, [from, to]);
            return Number(rows[0]?.count ?? 0);
        };
        const listCheckins = async (from, to) => {
            const { rows } = await (0, pool_1.query)(`SELECT
           ct.id AS token_id,
           ct.used_at,
           m.id AS member_id,
           m.name,
           m.phone_number,
           m.points_total,
           m.ghl_contact_id
         FROM checkin_tokens ct
         INNER JOIN members m ON m.id = ct.member_id
         WHERE ct.status = 'used'
           AND ct.used_at >= $1
           AND ct.used_at < $2
         ORDER BY ct.used_at DESC
         LIMIT 250`, [from, to]);
            return rows.map((r) => ({
                id: r.token_id,
                memberId: r.member_id,
                name: r.name,
                phoneNumber: r.phone_number,
                pointsTotal: r.points_total,
                ghlContactId: r.ghl_contact_id,
                checkedInAt: r.used_at.toISOString(),
            }));
        };
        const toExclusive = new Date(now.getTime() + 1);
        const rangeToExclusive = new Date(customTo.getTime() + 1);
        const detail = parsed.data.detail ?? "range";
        const detailFrom = detail === "today"
            ? todayStart
            : detail === "week"
                ? weekStart
                : detail === "month"
                    ? monthStart
                    : customFrom;
        const detailTo = detail === "range" ? rangeToExclusive : toExclusive;
        const [today, week, month, rangeApproved, todayRejected, weekRejected, monthRejected, rangeRejected, dailyRows, checkins,] = await Promise.all([
            countUsed(todayStart, toExclusive),
            countUsed(weekStart, toExclusive),
            countUsed(monthStart, toExclusive),
            countUsed(customFrom, rangeToExclusive),
            countRejected(todayStart, toExclusive),
            countRejected(weekStart, toExclusive),
            countRejected(monthStart, toExclusive),
            countRejected(customFrom, rangeToExclusive),
            (0, pool_1.query)(`SELECT to_char(date_trunc('day', used_at), 'YYYY-MM-DD') AS day,
                COUNT(*)::text AS count
         FROM checkin_tokens
         WHERE status = 'used'
           AND used_at >= $1
           AND used_at < $2
         GROUP BY 1
         ORDER BY 1 ASC`, [customFrom, rangeToExclusive]),
            listCheckins(detailFrom, detailTo),
        ]);
        res.json({
            timezoneHint: Intl.DateTimeFormat().resolvedOptions().timeZone,
            today: { approved: today, rejected: todayRejected },
            week: { approved: week, rejected: weekRejected },
            month: { approved: month, rejected: monthRejected },
            range: {
                from: customFrom.toISOString(),
                to: customTo.toISOString(),
                approved: rangeApproved,
                rejected: rangeRejected,
            },
            daily: dailyRows.rows.map((r) => ({
                day: r.day,
                count: Number(r.count),
            })),
            detail,
            detailFrom: detailFrom.toISOString(),
            detailTo: new Date(detailTo.getTime() - 1).toISOString(),
            checkins,
        });
    }
    catch (err) {
        console.error("analytics/summary failed", err);
        res.status(500).json({ error: "Could not load analytics" });
    }
});
//# sourceMappingURL=analytics.js.map