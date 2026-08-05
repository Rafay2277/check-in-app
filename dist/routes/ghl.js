"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ghlRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const pool_1 = require("../db/pool");
const auth_1 = require("../middleware/auth");
const ghl_1 = require("../integrations/ghl");
exports.ghlRouter = (0, express_1.Router)();
exports.ghlRouter.use(auth_1.requireStaffAuth);
const searchSchema = zod_1.z.object({
    q: zod_1.z.string().trim().min(2).max(80),
});
exports.ghlRouter.get("/contacts/search", async (req, res) => {
    const parsed = searchSchema.safeParse(req.query);
    if (!parsed.success) {
        res.status(400).json({ error: "Query must be at least 2 characters" });
        return;
    }
    try {
        const contacts = await (0, ghl_1.searchGhlContacts)(parsed.data.q, 10);
        const ghlIds = contacts.map((c) => c.id).filter(Boolean);
        let pointsByGhlId = new Map();
        if (ghlIds.length > 0) {
            const { rows } = await (0, pool_1.query)(`SELECT ghl_contact_id, points_total, name, phone_number
         FROM members
         WHERE ghl_contact_id = ANY($1::text[])`, [ghlIds]);
            pointsByGhlId = new Map(rows.map((r) => [r.ghl_contact_id, r.points_total]));
        }
        res.json({
            results: contacts.map((c) => {
                const displayName = c.name ||
                    [c.firstName, c.lastName].filter(Boolean).join(" ") ||
                    "Unknown";
                return {
                    ghlContactId: c.id,
                    name: displayName,
                    phone: c.phone || null,
                    pointsTotal: pointsByGhlId.has(c.id)
                        ? pointsByGhlId.get(c.id)
                        : null,
                    hasLocalMember: pointsByGhlId.has(c.id),
                };
            }),
        });
    }
    catch (err) {
        console.error("ghl/contacts/search failed", err);
        res.status(502).json({
            error: err instanceof Error ? err.message : "GHL search failed",
        });
    }
});
//# sourceMappingURL=ghl.js.map