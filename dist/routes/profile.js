"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.profileRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const pool_1 = require("../db/pool");
const ghl_1 = require("../integrations/ghl");
const phone_1 = require("../lib/phone");
const auth_1 = require("../middleware/auth");
exports.profileRouter = (0, express_1.Router)();
exports.profileRouter.use(auth_1.requireMemberAuth);
const profileSchema = zod_1.z.object({
    firstName: zod_1.z.string().trim().min(1).max(80),
    lastName: zod_1.z.string().trim().max(80).default(""),
    phone: zod_1.z.string().trim().min(7).max(32),
    email: zod_1.z
        .string()
        .trim()
        .max(160)
        .refine((v) => v === "" || zod_1.z.string().email().safeParse(v).success, {
        message: "Invalid email",
    })
        .default(""),
    vehicleMake: zod_1.z.string().trim().max(80).default(""),
    vehicleYear: zod_1.z.string().trim().max(16).default(""),
    vehicleModel: zod_1.z.string().trim().max(80).default(""),
});
async function memberGhlId(memberId) {
    const { rows } = await (0, pool_1.query)(`SELECT ghl_contact_id, phone_number FROM members WHERE id = $1`, [memberId]);
    const row = rows[0];
    if (!row?.ghl_contact_id)
        return null;
    return { ghlContactId: row.ghl_contact_id, phone: row.phone_number };
}
exports.profileRouter.get("/", async (req, res) => {
    if (!req.memberId) {
        res.status(401).json({ error: "Not authenticated" });
        return;
    }
    const member = await memberGhlId(req.memberId);
    if (!member) {
        res.status(404).json({ error: "Member not found" });
        return;
    }
    try {
        const profile = await (0, ghl_1.getGhlMemberProfile)(member.ghlContactId);
        if (!profile) {
            res.status(404).json({ error: "Contact not found in GoHighLevel" });
            return;
        }
        // Prefer local auth phone if GHL phone is empty.
        if (!profile.phone)
            profile.phone = member.phone;
        res.json(profile);
    }
    catch (err) {
        console.error("profile GET failed", err);
        res.status(502).json({ error: "Could not load profile from GoHighLevel" });
    }
});
exports.profileRouter.put("/", async (req, res) => {
    if (!req.memberId) {
        res.status(401).json({ error: "Not authenticated" });
        return;
    }
    const parsed = profileSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: "Invalid profile details" });
        return;
    }
    const phone = (0, phone_1.normalizePhone)(parsed.data.phone);
    if (!phone) {
        res.status(400).json({ error: "Invalid phone number" });
        return;
    }
    const member = await memberGhlId(req.memberId);
    if (!member) {
        res.status(404).json({ error: "Member not found" });
        return;
    }
    const input = {
        ...parsed.data,
        phone,
    };
    try {
        const profile = await (0, ghl_1.updateGhlMemberProfile)(member.ghlContactId, input);
        const displayName = [profile.firstName, profile.lastName]
            .map((p) => p.trim())
            .filter(Boolean)
            .join(" ");
        try {
            await (0, pool_1.query)(`UPDATE members
         SET name = $2,
             phone_number = $3,
             updated_at = NOW()
         WHERE id = $1`, [req.memberId, displayName || profile.firstName, phone]);
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            if (/unique|duplicate/i.test(msg)) {
                res.status(409).json({
                    error: "That phone number is already used by another account",
                    code: "PHONE_IN_USE",
                });
                return;
            }
            throw err;
        }
        res.json(profile);
    }
    catch (err) {
        console.error("profile PUT failed", err);
        res.status(502).json({ error: "Could not update profile in GoHighLevel" });
    }
});
//# sourceMappingURL=profile.js.map