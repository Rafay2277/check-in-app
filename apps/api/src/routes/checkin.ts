import { Router } from "express";
import { query } from "../db/pool";
import { AuthedRequest, requireMemberAuth } from "../middleware/auth";
import { env } from "../config";
import { calendarDateInShopTz } from "../lib/dates";
import { memberCheckedInToday } from "../lib/dailyCheckin";

export const checkinRouter = Router();

checkinRouter.use(requireMemberAuth);

checkinRouter.get("/me", async (req: AuthedRequest, res) => {
  const { rows } = await query<{
    id: string;
    name: string;
    phone_number: string;
    points_total: number;
  }>(
    `SELECT id, name, phone_number, points_total FROM members WHERE id = $1`,
    [req.memberId]
  );

  const member = rows[0];
  if (!member) {
    res.status(404).json({ error: "Member not found" });
    return;
  }

  const checkedInToday = await memberCheckedInToday(member.id);

  res.json({
    id: member.id,
    name: member.name,
    phoneNumber: member.phone_number,
    pointsTotal: member.points_total,
    checkedInToday,
    checkinDate: calendarDateInShopTz(),
  });
});

/**
 * Member confirms check-in → mint a single-use QR token (15 min TTL).
 * Blocked if they already checked in today (shop timezone).
 */
checkinRouter.post("/token", async (req: AuthedRequest, res) => {
  if (!req.memberId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  if (await memberCheckedInToday(req.memberId)) {
    res.status(409).json({
      error:
        "You have already checked in today. Please visit again tomorrow.",
      code: "ALREADY_CHECKED_IN_TODAY",
      checkinDate: calendarDateInShopTz(),
    });
    return;
  }

  // Expire any older unused tokens for this member (housekeeping; CAS still gates redeem)
  await query(
    `UPDATE checkin_tokens
     SET status = 'expired'
     WHERE member_id = $1
       AND status = 'unused'
       AND created_at <= NOW() - INTERVAL '15 minutes'`,
    [req.memberId]
  );

  const { rows } = await query<{
    token: string;
    created_at: Date;
  }>(
    `INSERT INTO checkin_tokens (member_id, status)
     VALUES ($1, 'unused')
     RETURNING token::text AS token, created_at`,
    [req.memberId]
  );

  const row = rows[0];
  const expiresAt = new Date(row.created_at.getTime() + 15 * 60 * 1000);

  res.status(201).json({
    token: row.token,
    createdAt: row.created_at.toISOString(),
    expiresAt: expiresAt.toISOString(),
    expiresInSeconds: 15 * 60,
    // Payload encoded in QR is the raw token UUID only
    qrPayload: row.token,
  });
});

checkinRouter.get("/token/active", async (req: AuthedRequest, res) => {
  const { rows } = await query<{
    token: string;
    created_at: Date;
    status: string;
  }>(
    `SELECT token::text AS token, created_at, status::text AS status
     FROM checkin_tokens
     WHERE member_id = $1
       AND status = 'unused'
       AND created_at > NOW() - INTERVAL '15 minutes'
     ORDER BY created_at DESC
     LIMIT 1`,
    [req.memberId]
  );

  if (!rows[0]) {
    res.json({ active: false });
    return;
  }

  const row = rows[0];
  const expiresAt = new Date(row.created_at.getTime() + 15 * 60 * 1000);
  res.json({
    active: true,
    token: row.token,
    createdAt: row.created_at.toISOString(),
    expiresAt: expiresAt.toISOString(),
    expiresInSeconds: Math.max(
      0,
      Math.floor((expiresAt.getTime() - Date.now()) / 1000)
    ),
    qrPayload: row.token,
    publicBaseUrl: env.PUBLIC_BASE_URL,
  });
});

/**
 * Member polls while showing QR — returns unused | used | expired.
 * Scoped to the signed-in member so tokens cannot be probed across accounts.
 */
checkinRouter.get("/token/:token/status", async (req: AuthedRequest, res) => {
  const token = String(req.params.token || "").trim();
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      token
    )
  ) {
    res.status(400).json({ error: "Invalid token" });
    return;
  }

  const { rows } = await query<{
    status: string;
    created_at: Date;
    used_at: Date | null;
    points_total: number;
  }>(
    `SELECT ct.status::text AS status,
            ct.created_at,
            ct.used_at,
            m.points_total
     FROM checkin_tokens ct
     INNER JOIN members m ON m.id = ct.member_id
     WHERE ct.token = $1::uuid
       AND ct.member_id = $2
     LIMIT 1`,
    [token, req.memberId]
  );

  if (!rows[0]) {
    res.status(404).json({ error: "Token not found", status: "unknown" });
    return;
  }

  const row = rows[0];
  let status = row.status;
  const expiresAt = new Date(row.created_at.getTime() + 15 * 60 * 1000);
  if (status === "unused" && expiresAt.getTime() <= Date.now()) {
    status = "expired";
  }

  res.json({
    status,
    usedAt: row.used_at ? row.used_at.toISOString() : null,
    expiresAt: expiresAt.toISOString(),
    pointsTotal: row.points_total,
  });
});
