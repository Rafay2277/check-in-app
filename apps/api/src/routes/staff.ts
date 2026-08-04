import { Router } from "express";
import { z } from "zod";
import { env } from "../config";
import { query, withTransaction } from "../db/pool";
import { signStaffToken } from "../lib/tokens";
import { AuthedRequest, requireStaffAuth } from "../middleware/auth";
import { drainOutboxOnce } from "../worker/outbox";

export const staffRouter = Router();

const pinSchema = z.object({
  pin: z.string().min(4).max(12),
});

const validateSchema = z.object({
  token: z.string().uuid(),
});

async function logScanAttempt(
  result: "approved" | "rejected",
  reason: string | null,
  token: string | null
): Promise<void> {
  try {
    await query(
      `INSERT INTO scan_attempts (result, reason, token) VALUES ($1, $2, $3)`,
      [result, reason, token]
    );
  } catch (err) {
    // Analytics logging must never break check-in
    console.warn("scan_attempts log failed", err);
  }
}

staffRouter.post("/session", (req, res) => {
  const parsed = pinSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "PIN required" });
    return;
  }

  if (parsed.data.pin !== env.STAFF_PIN) {
    res.status(401).json({ error: "Incorrect PIN" });
    return;
  }

  const staffToken = signStaffToken();
  res.json({
    staffToken,
    expiresIn: env.STAFF_SESSION_TTL_SECONDS,
  });
});

/**
 * Atomic CAS validation — sole gatekeeper against duplicate scans.
 * Outbox row for GHL point award is written in the same transaction.
 */
staffRouter.post(
  "/validate",
  requireStaffAuth,
  async (req: AuthedRequest, res) => {
    const parsed = validateSchema.safeParse(req.body);
    if (!parsed.success) {
      await logScanAttempt("rejected", "invalid_token_format", null);
      res.status(400).json({
        approved: false,
        error: "Invalid token format",
      });
      return;
    }

    try {
      const result = await withTransaction(async (client) => {
        // Critical constraint: single atomic compare-and-swap
        const { rows } = await client.query<{
          member_id: string;
          token_id: string;
        }>(
          `UPDATE checkin_tokens
           SET status = 'used', used_at = NOW()
           WHERE token = $1::uuid
             AND status = 'unused'
             AND created_at > NOW() - INTERVAL '15 minutes'
           RETURNING member_id, id AS token_id`,
          [parsed.data.token]
        );

        if (rows.length === 0) {
          return { approved: false as const };
        }

        const { member_id: memberId, token_id: tokenId } = rows[0];

        // DB is source of truth for points — atomic increment here
        const { rows: memberRows } = await client.query<{
          id: string;
          name: string;
          points_total: number;
          ghl_contact_id: string;
        }>(
          `UPDATE members
           SET points_total = points_total + 1,
               updated_at = NOW()
           WHERE id = $1
           RETURNING id, name, points_total, ghl_contact_id`,
          [memberId]
        );

        const member = memberRows[0];

        // Durable outbox in same transaction (dedupe by checkin token id)
        await client.query(
          `INSERT INTO outbox_tasks (type, payload, dedupe_key, status)
           VALUES (
             'award_ghl_point',
             $1::jsonb,
             $2,
             'pending'
           )
           ON CONFLICT (dedupe_key) DO NOTHING`,
          [
            JSON.stringify({
              memberId: member.id,
              ghlContactId: member.ghl_contact_id,
              pointsTotal: member.points_total,
              checkinTokenId: tokenId,
            }),
            `award_ghl_point:${tokenId}`,
          ]
        );

        return {
          approved: true as const,
          member: {
            id: member.id,
            name: member.name,
            pointsTotal: member.points_total,
          },
        };
      });

      if (!result.approved) {
        await logScanAttempt(
          "rejected",
          "expired_used_or_unknown",
          parsed.data.token
        );
        res.status(409).json({
          approved: false,
          error: "Not valid — expired, already used, or unknown",
        });
        return;
      }

      await logScanAttempt("approved", null, parsed.data.token);

      // Push GHL sync immediately (Hostinger may sleep idle processes)
      void drainOutboxOnce().catch((err) =>
        console.error("[outbox] post-validate drain failed", err)
      );

      res.json({
        approved: true,
        member: result.member,
        message: "Approved — apply Loyalty Comp on Square register",
      });
    } catch (err) {
      console.error("staff/validate failed", err);
      res.status(500).json({
        approved: false,
        error: "Validation failed",
      });
    }
  }
);
