"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const pool_1 = require("../db/pool");
const phone_1 = require("../lib/phone");
const tokens_1 = require("../lib/tokens");
const config_1 = require("../config");
const ghl_1 = require("../integrations/ghl");
const twilio_1 = require("../integrations/twilio");
exports.authRouter = (0, express_1.Router)();
const startSchema = zod_1.z.object({
    name: zod_1.z.string().trim().min(1).max(120),
    phone: zod_1.z.string().trim().min(7).max(32),
});
const verifySchema = zod_1.z.object({
    phone: zod_1.z.string().trim().min(7).max(32),
    code: zod_1.z.string().trim().regex(/^\d{6}$/),
});
const refreshSchema = zod_1.z.object({
    refreshToken: zod_1.z.string().min(20),
});
const OTP_TTL_MS = 10 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_ATTEMPTS = 5;
exports.authRouter.post("/start", async (req, res) => {
    const parsed = startSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: "Invalid name or phone" });
        return;
    }
    const phone = (0, phone_1.normalizePhone)(parsed.data.phone);
    if (!phone) {
        res.status(400).json({ error: "Invalid phone number" });
        return;
    }
    const contact = await (0, ghl_1.findGhlContactByPhone)(phone);
    if (!contact) {
        res.status(404).json({
            error: "We couldn't find your account — please check with staff",
            code: "CONTACT_NOT_FOUND",
        });
        return;
    }
    // V1 demo path: no Twilio — GHL match is enough to issue a session
    if (config_1.env.SKIP_SMS_OTP) {
        try {
            const session = await (0, pool_1.withTransaction)(async (client) => {
                const member = await upsertMember(client, {
                    name: parsed.data.name,
                    phone,
                    ghlContactId: contact.id,
                });
                const tokens = await issueSession(client, member.id);
                return { member, ...tokens };
            });
            res.json({
                ok: true,
                skippedOtp: true,
                phone,
                accessToken: session.accessToken,
                refreshToken: session.refreshToken,
                expiresIn: session.expiresIn,
                member: {
                    id: session.member.id,
                    name: session.member.name,
                    phoneNumber: session.member.phone_number,
                    pointsTotal: session.member.points_total,
                },
            });
        }
        catch (err) {
            console.error("auth/start (skip OTP) failed", err);
            res.status(500).json({ error: "Login failed" });
        }
        return;
    }
    const { rows: recent } = await (0, pool_1.query)(`SELECT id, resend_available_at
     FROM otp_challenges
     WHERE phone_number = $1
       AND consumed_at IS NULL
       AND expires_at > NOW()
     ORDER BY created_at DESC
     LIMIT 1`, [phone]);
    if (recent[0] && recent[0].resend_available_at > new Date()) {
        const waitSec = Math.ceil((recent[0].resend_available_at.getTime() - Date.now()) / 1000);
        res.status(429).json({
            error: "Please wait before requesting another code",
            retryAfterSeconds: waitSec,
        });
        return;
    }
    const code = (0, tokens_1.generateOtpCode)();
    const codeHash = await (0, tokens_1.hashOtpCode)(code);
    const expiresAt = new Date(Date.now() + OTP_TTL_MS);
    const resendAvailableAt = new Date(Date.now() + RESEND_COOLDOWN_MS);
    await (0, pool_1.query)(`INSERT INTO otp_challenges
      (phone_number, name, ghl_contact_id, code_hash, max_attempts, expires_at, resend_available_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`, [
        phone,
        parsed.data.name,
        contact.id,
        codeHash,
        MAX_ATTEMPTS,
        expiresAt,
        resendAvailableAt,
    ]);
    await (0, twilio_1.sendSmsOtp)(phone, code);
    res.json({
        ok: true,
        skippedOtp: false,
        phone,
        expiresInSeconds: OTP_TTL_MS / 1000,
        resendAvailableInSeconds: RESEND_COOLDOWN_MS / 1000,
    });
});
exports.authRouter.post("/verify", async (req, res) => {
    const parsed = verifySchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: "Invalid phone or code" });
        return;
    }
    const phone = (0, phone_1.normalizePhone)(parsed.data.phone);
    if (!phone) {
        res.status(400).json({ error: "Invalid phone number" });
        return;
    }
    try {
        const session = await (0, pool_1.withTransaction)(async (client) => {
            const { rows } = await client.query(`SELECT id, name, ghl_contact_id, code_hash, attempts, max_attempts, expires_at
         FROM otp_challenges
         WHERE phone_number = $1
           AND consumed_at IS NULL
         ORDER BY created_at DESC
         LIMIT 1
         FOR UPDATE`, [phone]);
            const challenge = rows[0];
            if (!challenge) {
                return { kind: "invalid" };
            }
            if (challenge.expires_at <= new Date()) {
                return { kind: "expired" };
            }
            if (challenge.attempts >= challenge.max_attempts) {
                return { kind: "locked" };
            }
            const ok = await (0, tokens_1.verifyOtpCode)(parsed.data.code, challenge.code_hash);
            if (!ok) {
                await client.query(`UPDATE otp_challenges SET attempts = attempts + 1 WHERE id = $1`, [challenge.id]);
                const remaining = challenge.max_attempts - challenge.attempts - 1;
                return { kind: "bad_code", remaining };
            }
            await client.query(`UPDATE otp_challenges SET consumed_at = NOW() WHERE id = $1`, [challenge.id]);
            const member = await upsertMember(client, {
                name: challenge.name,
                phone,
                ghlContactId: challenge.ghl_contact_id,
            });
            const tokens = await issueSession(client, member.id);
            return {
                kind: "ok",
                member,
                ...tokens,
            };
        });
        if (session.kind === "invalid" || session.kind === "expired") {
            res.status(400).json({ error: "Code expired or not found. Request a new one." });
            return;
        }
        if (session.kind === "locked") {
            res.status(429).json({
                error: "Too many attempts. Request a new code.",
                code: "OTP_LOCKED",
            });
            return;
        }
        if (session.kind === "bad_code") {
            res.status(400).json({
                error: "Incorrect code",
                attemptsRemaining: session.remaining,
            });
            return;
        }
        res.json({
            accessToken: session.accessToken,
            refreshToken: session.refreshToken,
            expiresIn: session.expiresIn,
            member: {
                id: session.member.id,
                name: session.member.name,
                phoneNumber: session.member.phone_number,
                pointsTotal: session.member.points_total,
            },
        });
    }
    catch (err) {
        console.error("auth/verify failed", err);
        res.status(500).json({ error: "Verification failed" });
    }
});
exports.authRouter.post("/refresh", async (req, res) => {
    const parsed = refreshSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: "Invalid refresh token" });
        return;
    }
    const presentedHash = (0, tokens_1.hashOpaqueToken)(parsed.data.refreshToken);
    try {
        const result = await (0, pool_1.withTransaction)(async (client) => {
            const { rows } = await client.query(`SELECT id, member_id, expires_at, revoked_at
         FROM refresh_tokens
         WHERE token_hash = $1
         FOR UPDATE`, [presentedHash]);
            const existing = rows[0];
            if (!existing) {
                return { kind: "invalid" };
            }
            // Reuse of a revoked/rotated token → possible theft; invalidate member chain
            if (existing.revoked_at) {
                await client.query(`UPDATE refresh_tokens
           SET revoked_at = COALESCE(revoked_at, NOW())
           WHERE member_id = $1 AND revoked_at IS NULL`, [existing.member_id]);
                return { kind: "reuse" };
            }
            if (existing.expires_at <= new Date()) {
                await client.query(`UPDATE refresh_tokens SET revoked_at = NOW() WHERE id = $1`, [existing.id]);
                return { kind: "expired" };
            }
            const tokens = await rotateRefreshToken(client, existing.id, existing.member_id);
            return { kind: "ok", ...tokens };
        });
        if (result.kind !== "ok") {
            res.status(401).json({ error: "Invalid or expired refresh token" });
            return;
        }
        res.json({
            accessToken: result.accessToken,
            refreshToken: result.refreshToken,
            expiresIn: result.expiresIn,
        });
    }
    catch (err) {
        console.error("auth/refresh failed", err);
        res.status(500).json({ error: "Refresh failed" });
    }
});
async function upsertMember(client, input) {
    const { rows } = await client.query(`INSERT INTO members (name, phone_number, ghl_contact_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (phone_number) DO UPDATE
       SET name = EXCLUDED.name,
           ghl_contact_id = EXCLUDED.ghl_contact_id,
           updated_at = NOW()
     RETURNING id, name, phone_number, points_total`, [input.name, input.phone, input.ghlContactId]);
    return rows[0];
}
async function issueSession(client, memberId) {
    const rawRefresh = (0, tokens_1.generateOpaqueToken)();
    const tokenHash = (0, tokens_1.hashOpaqueToken)(rawRefresh);
    const expiresAt = (0, tokens_1.refreshExpiryDate)();
    await client.query(`INSERT INTO refresh_tokens (member_id, token_hash, expires_at)
     VALUES ($1, $2, $3)`, [memberId, tokenHash, expiresAt]);
    return {
        accessToken: (0, tokens_1.signAccessToken)(memberId),
        refreshToken: rawRefresh,
        expiresIn: config_1.env.ACCESS_TOKEN_TTL_SECONDS,
    };
}
async function rotateRefreshToken(client, oldTokenId, memberId) {
    const rawRefresh = (0, tokens_1.generateOpaqueToken)();
    const tokenHash = (0, tokens_1.hashOpaqueToken)(rawRefresh);
    const expiresAt = (0, tokens_1.refreshExpiryDate)();
    const { rows } = await client.query(`INSERT INTO refresh_tokens (member_id, token_hash, expires_at)
     VALUES ($1, $2, $3)
     RETURNING id`, [memberId, tokenHash, expiresAt]);
    await client.query(`UPDATE refresh_tokens
     SET revoked_at = NOW(), replaced_by_id = $1
     WHERE id = $2`, [rows[0].id, oldTokenId]);
    return {
        accessToken: (0, tokens_1.signAccessToken)(memberId),
        refreshToken: rawRefresh,
        expiresIn: config_1.env.ACCESS_TOKEN_TTL_SECONDS,
    };
}
//# sourceMappingURL=auth.js.map