import { Router } from "express";
import { z } from "zod";
import { PoolClient } from "pg";
import { env } from "../config";
import { query, withTransaction } from "../db/pool";
import { signStaffToken } from "../lib/tokens";
import { AuthedRequest, requireStaffAuth } from "../middleware/auth";
import { getGhlPointsTotal } from "../integrations/ghl";
import { drainOutboxOnce } from "../worker/outbox";

export const staffRouter = Router();

const pinSchema = z.object({
  pin: z.string().min(4).max(12),
});

const validateSchema = z.object({
  token: z.string().uuid(),
});

const deactivateSchema = z.object({
  token: z.string().uuid().optional(),
  memberId: z.string().uuid().optional(),
}).refine((v) => Boolean(v.token || v.memberId), {
  message: "token or memberId required",
});

type ValidateOk = {
  approved: true;
  tokenKind: "rotating" | "permanent";
  member: { id: string; name: string; pointsTotal: number };
};

type ValidateFail = {
  approved: false;
  reason:
    | "expired_used_or_unknown"
    | "already_checked_in_today"
    | "card_deactivated"
    | "member_missing";
  error: string;
};

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
    console.warn("scan_attempts log failed", err);
  }
}

async function awardPointAndOutbox(
  client: PoolClient,
  memberId: string,
  dedupeKey: string,
  extraPayload: Record<string, unknown>,
  /** When set, raise local points to at least this GHL total before +1. */
  ghlPointsFloor: number | null = null
): Promise<{ id: string; name: string; pointsTotal: number; ghlContactId: string }> {
  if (ghlPointsFloor != null && ghlPointsFloor >= 0) {
    await client.query(
      `UPDATE members
       SET points_total = GREATEST(points_total, $2),
           updated_at = NOW()
       WHERE id = $1`,
      [memberId, ghlPointsFloor]
    );
  }

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
  if (!member) {
    throw new Error("MEMBER_MISSING");
  }

  await client.query(
    `INSERT INTO outbox_tasks (type, payload, dedupe_key, status)
     VALUES ('award_ghl_point', $1::jsonb, $2, 'pending')
     ON CONFLICT (dedupe_key) DO NOTHING`,
    [
      JSON.stringify({
        memberId: member.id,
        ghlContactId: member.ghl_contact_id,
        pointsTotal: member.points_total,
        ...extraPayload,
      }),
      dedupeKey,
    ]
  );

  return {
    id: member.id,
    name: member.name,
    pointsTotal: member.points_total,
    ghlContactId: member.ghl_contact_id,
  };
}

async function readGhlPointsFloor(ghlContactId: string): Promise<number | null> {
  try {
    return await getGhlPointsTotal(ghlContactId);
  } catch (err) {
    console.warn("[validate] could not read GHL points; continuing with local total", err);
    return null;
  }
}

/** Existing app QR: single-use, 15-minute TTL. Unchanged CAS semantics. */
async function tryValidateRotating(
  client: PoolClient,
  token: string,
  ghlPointsFloor: number | null
): Promise<ValidateOk | null> {
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
    [token]
  );

  if (rows.length === 0) return null;

  const { member_id: memberId, token_id: tokenId } = rows[0];
  const member = await awardPointAndOutbox(
    client,
    memberId,
    `award_ghl_point:${tokenId}`,
    { checkinTokenId: tokenId, tokenKind: "rotating" },
    ghlPointsFloor
  );

  return {
    approved: true,
    tokenKind: "rotating",
    member: {
      id: member.id,
      name: member.name,
      pointsTotal: member.pointsTotal,
    },
  };
}

/**
 * Permanent test cards: reusable until deactivated.
 * Daily limit via unique (member_id, checkin_date) in daily_checkins.
 */
async function tryValidatePermanent(
  client: PoolClient,
  token: string,
  ghlPointsFloor: number | null
): Promise<ValidateOk | ValidateFail | null> {
  const { rows: tokenRows } = await client.query<{
    id: string;
    member_id: string;
    active: boolean;
  }>(
    `SELECT id, member_id, active
     FROM permanent_checkin_tokens
     WHERE token = $1::uuid
     FOR UPDATE`,
    [token]
  );

  if (tokenRows.length === 0) return null;

  const permanent = tokenRows[0];
  if (!permanent.active) {
    return {
      approved: false,
      reason: "card_deactivated",
      error: "This card has been deactivated",
    };
  }

  const { rows: dateRows } = await client.query<{ d: string }>(
    `SELECT (NOW() AT TIME ZONE $1)::date::text AS d`,
    [env.CHECKIN_CALENDAR_TZ]
  );
  const checkinDate = dateRows[0].d;

  const { rows: dailyRows } = await client.query<{ id: string }>(
    `INSERT INTO daily_checkins (member_id, checkin_date, permanent_token_id)
     VALUES ($1, $2::date, $3)
     ON CONFLICT (member_id, checkin_date) DO NOTHING
     RETURNING id`,
    [permanent.member_id, checkinDate, permanent.id]
  );

  if (dailyRows.length === 0) {
    return {
      approved: false,
      reason: "already_checked_in_today",
      error: "Already checked in today — try again tomorrow",
    };
  }

  const dailyId = dailyRows[0].id;

  try {
    const member = await awardPointAndOutbox(
      client,
      permanent.member_id,
      `award_ghl_point:permanent:${permanent.id}:${checkinDate}`,
      {
        permanentTokenId: permanent.id,
        dailyCheckinId: dailyId,
        checkinDate,
        tokenKind: "permanent",
      },
      ghlPointsFloor
    );

    return {
      approved: true,
      tokenKind: "permanent",
      member: {
        id: member.id,
        name: member.name,
        pointsTotal: member.pointsTotal,
      },
    };
  } catch (err) {
    if (err instanceof Error && err.message === "MEMBER_MISSING") {
      return {
        approved: false,
        reason: "member_missing",
        error: "Member record missing for this card",
      };
    }
    throw err;
  }
}

async function previewGhlPointsFloor(token: string): Promise<number | null> {
  const { rows } = await query<{ ghl_contact_id: string }>(
    `SELECT m.ghl_contact_id
     FROM permanent_checkin_tokens p
     INNER JOIN members m ON m.id = p.member_id
     WHERE p.token = $1::uuid
     UNION ALL
     SELECT m.ghl_contact_id
     FROM checkin_tokens c
     INNER JOIN members m ON m.id = c.member_id
     WHERE c.token = $1::uuid
       AND c.status = 'unused'
       AND c.created_at > NOW() - INTERVAL '15 minutes'
     LIMIT 1`,
    [token]
  );
  if (!rows[0]?.ghl_contact_id) return null;
  return readGhlPointsFloor(rows[0].ghl_contact_id);
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
 * Validates either rotating app QR or permanent test card — same scan flow.
 * Rotating path is tried first (unchanged CAS); permanent is fallback.
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
      const ghlPointsFloor = await previewGhlPointsFloor(parsed.data.token);

      const result = await withTransaction(async (client) => {
        const rotating = await tryValidateRotating(
          client,
          parsed.data.token,
          ghlPointsFloor
        );
        if (rotating) return rotating;

        const permanent = await tryValidatePermanent(
          client,
          parsed.data.token,
          ghlPointsFloor
        );
        if (permanent) return permanent;

        return {
          approved: false as const,
          reason: "expired_used_or_unknown" as const,
          error: "Not valid — expired, already used, or unknown",
        };
      });

      if (!result.approved) {
        await logScanAttempt("rejected", result.reason, parsed.data.token);
        const status = 409;
        res.status(status).json({
          approved: false,
          error: result.error,
          code: result.reason,
        });
        return;
      }

      await logScanAttempt("approved", result.tokenKind, parsed.data.token);

      void drainOutboxOnce().catch((err) =>
        console.error("[outbox] post-validate drain failed", err)
      );

      res.json({
        approved: true,
        tokenKind: result.tokenKind,
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

/** Deactivate a permanent test card (by token UUID or member id). */
staffRouter.post(
  "/permanent-tokens/deactivate",
  requireStaffAuth,
  async (req: AuthedRequest, res) => {
    const parsed = deactivateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Provide token or memberId" });
      return;
    }

    const { rows } = await query<{
      id: string;
      token: string;
      member_id: string;
      label: string | null;
    }>(
      parsed.data.token
        ? `UPDATE permanent_checkin_tokens
           SET active = FALSE, deactivated_at = NOW()
           WHERE token = $1::uuid AND active = TRUE
           RETURNING id, token::text AS token, member_id, label`
        : `UPDATE permanent_checkin_tokens
           SET active = FALSE, deactivated_at = NOW()
           WHERE member_id = $1::uuid AND active = TRUE
           RETURNING id, token::text AS token, member_id, label`,
      [parsed.data.token ?? parsed.data.memberId]
    );

    if (rows.length === 0) {
      res.status(404).json({ error: "No active permanent token found" });
      return;
    }

    res.json({ ok: true, deactivated: rows[0] });
  }
);
