"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkinRouter = void 0;
const express_1 = require("express");
const pool_1 = require("../db/pool");
const auth_1 = require("../middleware/auth");
const config_1 = require("../config");
const dates_1 = require("../lib/dates");
const dailyCheckin_1 = require("../lib/dailyCheckin");
const ghl_1 = require("../integrations/ghl");
const memberNumber_1 = require("../lib/memberNumber");
/** Temporary: include GHL field samples on /me until member # matching is confirmed. */
const DEBUG_MEMBER_NUMBER = false;
exports.checkinRouter = (0, express_1.Router)();
exports.checkinRouter.use(auth_1.requireMemberAuth);
/** Debug: what GHL returns for this member's check-in points field. */
exports.checkinRouter.get("/points-debug", async (req, res) => {
    const { rows } = await (0, pool_1.query)(`SELECT id, name, points_total, ghl_contact_id FROM members WHERE id = $1`, [req.memberId]);
    const member = rows[0];
    if (!member) {
        res.status(404).json({ error: "Member not found" });
        return;
    }
    try {
        const inspection = await (0, ghl_1.inspectGhlPoints)(member.ghl_contact_id);
        res.json({
            member: {
                id: member.id,
                name: member.name,
                localPoints: member.points_total,
                ghlContactId: member.ghl_contact_id,
            },
            ghl: inspection,
        });
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        res.status(502).json({
            error: "GHL points inspect failed",
            detail: message,
            member: {
                id: member.id,
                name: member.name,
                localPoints: member.points_total,
                ghlContactId: member.ghl_contact_id,
            },
        });
    }
});
exports.checkinRouter.get("/me", async (req, res) => {
    await (0, memberNumber_1.ensureMemberNumberSchema)();
    const { rows } = await (0, pool_1.query)(`SELECT id, name, phone_number, points_total, member_number, membership_tier, ghl_contact_id
     FROM members WHERE id = $1`, [req.memberId]);
    const member = rows[0];
    if (!member) {
        res.status(404).json({ error: "Member not found" });
        return;
    }
    let membershipTier = member.membership_tier;
    try {
        const membership = await (0, ghl_1.resolveContactMembership)(member.ghl_contact_id);
        if (membership.allowed && membership.tier && membership.tier !== membershipTier) {
            membershipTier = membership.tier;
            await (0, pool_1.query)(`UPDATE members
         SET membership_tier = $2::membership_tier, updated_at = NOW()
         WHERE id = $1`, [member.id, membershipTier]);
        }
    }
    catch (err) {
        console.warn("[checkin/me] membership refresh failed; using stored tier", err);
    }
    // GHL is source of truth for the score + member # shown in-app.
    let pointsTotal = member.points_total;
    let memberNumber = member.member_number;
    let memberNumberDebug = null;
    try {
        if (DEBUG_MEMBER_NUMBER) {
            memberNumberDebug = await (0, ghl_1.inspectGhlPoints)(member.ghl_contact_id);
            const ghlPoints = typeof memberNumberDebug.points === "number"
                ? memberNumberDebug.points
                : null;
            const ghlMemberNumber = typeof memberNumberDebug.memberNumber === "string"
                ? memberNumberDebug.memberNumber
                : memberNumberDebug.memberNumber == null
                    ? null
                    : String(memberNumberDebug.memberNumber);
            if (ghlPoints != null) {
                pointsTotal = ghlPoints;
                if (ghlPoints !== member.points_total) {
                    await (0, pool_1.query)(`UPDATE members
             SET points_total = GREATEST(points_total, $2),
                 updated_at = NOW()
             WHERE id = $1`, [member.id, ghlPoints]);
                }
            }
            if (ghlMemberNumber !== member.member_number) {
                memberNumber = ghlMemberNumber;
                await (0, memberNumber_1.ensureMemberNumberSchema)();
                await (0, pool_1.query)(`UPDATE members
           SET member_number = $2, updated_at = NOW()
           WHERE id = $1`, [member.id, ghlMemberNumber]);
            }
        }
        else {
            const ghl = await (0, ghl_1.getGhlContactAppFields)(member.ghl_contact_id);
            if (ghl.points != null) {
                pointsTotal = ghl.points;
                if (ghl.points !== member.points_total) {
                    await (0, pool_1.query)(`UPDATE members
             SET points_total = GREATEST(points_total, $2),
                 updated_at = NOW()
             WHERE id = $1`, [member.id, ghl.points]);
                }
            }
            if (ghl.memberNumber !== member.member_number) {
                memberNumber = ghl.memberNumber;
                await (0, memberNumber_1.ensureMemberNumberSchema)();
                await (0, pool_1.query)(`UPDATE members
           SET member_number = $2, updated_at = NOW()
           WHERE id = $1`, [member.id, ghl.memberNumber]);
            }
        }
    }
    catch (err) {
        console.warn("[checkin/me] GHL profile sync failed; using local values", err);
        if (DEBUG_MEMBER_NUMBER) {
            memberNumberDebug = {
                error: err instanceof Error ? err.message : String(err),
            };
        }
    }
    const checkedInToday = await (0, dailyCheckin_1.memberCheckedInToday)(member.id);
    res.json({
        id: member.id,
        name: member.name,
        phoneNumber: member.phone_number,
        pointsTotal,
        memberNumber: memberNumber || null,
        membershipTier,
        checkedInToday,
        checkinDate: (0, dates_1.calendarDateInShopTz)(),
        ...(DEBUG_MEMBER_NUMBER && memberNumberDebug
            ? { memberNumberDebug }
            : {}),
    });
});
/**
 * Member confirms check-in → mint a single-use QR token (15 min TTL).
 * Blocked if they already checked in today (shop timezone).
 */
exports.checkinRouter.post("/token", async (req, res) => {
    if (!req.memberId) {
        res.status(401).json({ error: "Not authenticated" });
        return;
    }
    if (await (0, dailyCheckin_1.memberCheckedInToday)(req.memberId)) {
        res.status(409).json({
            error: "You have already checked in today. Please visit again tomorrow.",
            code: "ALREADY_CHECKED_IN_TODAY",
            checkinDate: (0, dates_1.calendarDateInShopTz)(),
        });
        return;
    }
    // Expire any older unused tokens for this member (housekeeping; CAS still gates redeem)
    await (0, pool_1.query)(`UPDATE checkin_tokens
     SET status = 'expired'
     WHERE member_id = $1
       AND status = 'unused'
       AND created_at <= NOW() - INTERVAL '15 minutes'`, [req.memberId]);
    const { rows } = await (0, pool_1.query)(`INSERT INTO checkin_tokens (member_id, status)
     VALUES ($1, 'unused')
     RETURNING token::text AS token, created_at`, [req.memberId]);
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
exports.checkinRouter.get("/token/active", async (req, res) => {
    const { rows } = await (0, pool_1.query)(`SELECT token::text AS token, created_at, status::text AS status
     FROM checkin_tokens
     WHERE member_id = $1
       AND status = 'unused'
       AND created_at > NOW() - INTERVAL '15 minutes'
     ORDER BY created_at DESC
     LIMIT 1`, [req.memberId]);
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
        expiresInSeconds: Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000)),
        qrPayload: row.token,
        publicBaseUrl: config_1.env.PUBLIC_BASE_URL,
    });
});
/**
 * Member polls while showing QR — returns unused | used | expired.
 * Scoped to the signed-in member so tokens cannot be probed across accounts.
 */
exports.checkinRouter.get("/token/:token/status", async (req, res) => {
    const token = String(req.params.token || "").trim();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(token)) {
        res.status(400).json({ error: "Invalid token" });
        return;
    }
    const { rows } = await (0, pool_1.query)(`SELECT ct.status::text AS status,
            ct.created_at,
            ct.used_at,
            m.points_total
     FROM checkin_tokens ct
     INNER JOIN members m ON m.id = ct.member_id
     WHERE ct.token = $1::uuid
       AND ct.member_id = $2
     LIMIT 1`, [token, req.memberId]);
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
//# sourceMappingURL=checkin.js.map