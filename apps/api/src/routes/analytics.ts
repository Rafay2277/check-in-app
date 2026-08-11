import { Router } from "express";
import { z } from "zod";
import { query } from "../db/pool";
import { requireStaffAuth, AuthedRequest } from "../middleware/auth";

export const analyticsRouter = Router();

analyticsRouter.use(requireStaffAuth);

function startOfLocalDay(d = new Date()): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function startOfWeek(d = new Date()): Date {
  const x = startOfLocalDay(d);
  const day = x.getDay();
  const diff = day === 0 ? 6 : day - 1;
  x.setDate(x.getDate() - diff);
  return x;
}

function startOfMonth(d = new Date()): Date {
  const x = startOfLocalDay(d);
  x.setDate(1);
  return x;
}

const rangeSchema = z.object({
  from: z.string().min(1).optional(),
  to: z.string().min(1).optional(),
  /** Which bucket's detailed rows to return: today | week | month | range */
  detail: z.enum(["today", "week", "month", "range"]).optional().default("range"),
});

function parseBoundary(value: string | undefined, endOfDay: boolean): Date | null {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split("-").map(Number);
    if (endOfDay) return new Date(y, m - 1, d, 23, 59, 59, 999);
    return new Date(y, m - 1, d, 0, 0, 0, 0);
  }
  const dt = new Date(value);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

analyticsRouter.get("/summary", async (req: AuthedRequest, res) => {
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
    /** Approved = rotating used tokens + permanent daily_checkins */
    const countApproved = async (from: Date, to: Date) => {
      const { rows } = await query<{ count: string }>(
        `SELECT (
           (SELECT COUNT(*)::int
            FROM checkin_tokens
            WHERE status = 'used'
              AND used_at >= $1
              AND used_at < $2)
           +
           (SELECT COUNT(*)::int
            FROM daily_checkins
            WHERE created_at >= $1
              AND created_at < $2)
         )::text AS count`,
        [from, to]
      );
      return Number(rows[0]?.count ?? 0);
    };

    const countRejected = async (from: Date, to: Date) => {
      const { rows } = await query<{ count: string }>(
        `SELECT COUNT(*)::text AS count
         FROM scan_attempts
         WHERE result = 'rejected'
           AND created_at >= $1
           AND created_at < $2`,
        [from, to]
      );
      return Number(rows[0]?.count ?? 0);
    };

    const listCheckins = async (from: Date, to: Date) => {
      const { rows } = await query<{
        event_id: string;
        checked_in_at: Date;
        member_id: string;
        name: string;
        phone_number: string;
        points_total: number;
        ghl_contact_id: string;
        token_kind: string;
      }>(
        `SELECT * FROM (
           SELECT
             ct.id::text AS event_id,
             ct.used_at AS checked_in_at,
             m.id AS member_id,
             m.name,
             m.phone_number,
             m.points_total,
             m.ghl_contact_id,
             'rotating'::text AS token_kind
           FROM checkin_tokens ct
           INNER JOIN members m ON m.id = ct.member_id
           WHERE ct.status = 'used'
             AND ct.used_at >= $1
             AND ct.used_at < $2

           UNION ALL

           SELECT
             dc.id::text AS event_id,
             dc.created_at AS checked_in_at,
             m.id AS member_id,
             m.name,
             m.phone_number,
             m.points_total,
             m.ghl_contact_id,
             'permanent'::text AS token_kind
           FROM daily_checkins dc
           INNER JOIN members m ON m.id = dc.member_id
           WHERE dc.created_at >= $1
             AND dc.created_at < $2
         ) events
         ORDER BY checked_in_at DESC
         LIMIT 250`,
        [from, to]
      );

      return rows.map((r) => ({
        id: r.event_id,
        memberId: r.member_id,
        name: r.name,
        phoneNumber: r.phone_number,
        pointsTotal: r.points_total,
        ghlContactId: r.ghl_contact_id,
        checkedInAt: r.checked_in_at.toISOString(),
        tokenKind: r.token_kind,
      }));
    };

    const toExclusive = new Date(now.getTime() + 1);
    const rangeToExclusive = new Date(customTo.getTime() + 1);

    const detail = parsed.data.detail ?? "range";
    const detailFrom =
      detail === "today"
        ? todayStart
        : detail === "week"
          ? weekStart
          : detail === "month"
            ? monthStart
            : customFrom;
    const detailTo =
      detail === "range" ? rangeToExclusive : toExclusive;

    const [
      today,
      week,
      month,
      rangeApproved,
      todayRejected,
      weekRejected,
      monthRejected,
      rangeRejected,
      dailyRows,
      checkins,
    ] = await Promise.all([
      countApproved(todayStart, toExclusive),
      countApproved(weekStart, toExclusive),
      countApproved(monthStart, toExclusive),
      countApproved(customFrom, rangeToExclusive),
      countRejected(todayStart, toExclusive),
      countRejected(weekStart, toExclusive),
      countRejected(monthStart, toExclusive),
      countRejected(customFrom, rangeToExclusive),
      query<{ day: string; count: string }>(
        `SELECT day, SUM(cnt)::text AS count FROM (
           SELECT to_char(date_trunc('day', used_at), 'YYYY-MM-DD') AS day,
                  COUNT(*)::int AS cnt
           FROM checkin_tokens
           WHERE status = 'used'
             AND used_at >= $1
             AND used_at < $2
           GROUP BY 1
           UNION ALL
           SELECT to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS day,
                  COUNT(*)::int AS cnt
           FROM daily_checkins
           WHERE created_at >= $1
             AND created_at < $2
           GROUP BY 1
         ) x
         GROUP BY day
         ORDER BY day ASC`,
        [customFrom, rangeToExclusive]
      ),
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
  } catch (err) {
    console.error("analytics/summary failed", err);
    res.status(500).json({ error: "Could not load analytics" });
  }
});
