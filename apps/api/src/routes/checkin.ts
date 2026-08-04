import { Router } from "express";
import { query } from "../db/pool";
import { AuthedRequest, requireMemberAuth } from "../middleware/auth";
import { env } from "../config";

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

  res.json({
    id: member.id,
    name: member.name,
    phoneNumber: member.phone_number,
    pointsTotal: member.points_total,
  });
});

/**
 * Member confirms check-in → mint a single-use QR token (15 min TTL).
 */
checkinRouter.post("/token", async (req: AuthedRequest, res) => {
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
