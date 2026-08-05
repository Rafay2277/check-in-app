"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkinRouter = void 0;
const express_1 = require("express");
const pool_1 = require("../db/pool");
const auth_1 = require("../middleware/auth");
const config_1 = require("../config");
exports.checkinRouter = (0, express_1.Router)();
exports.checkinRouter.use(auth_1.requireMemberAuth);
exports.checkinRouter.get("/me", async (req, res) => {
    const { rows } = await (0, pool_1.query)(`SELECT id, name, phone_number, points_total FROM members WHERE id = $1`, [req.memberId]);
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
exports.checkinRouter.post("/token", async (req, res) => {
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
//# sourceMappingURL=checkin.js.map