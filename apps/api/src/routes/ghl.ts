import { Router } from "express";
import { z } from "zod";
import { query } from "../db/pool";
import { requireStaffAuth, AuthedRequest } from "../middleware/auth";
import { searchGhlContacts } from "../integrations/ghl";

export const ghlRouter = Router();

ghlRouter.use(requireStaffAuth);

const searchSchema = z.object({
  q: z.string().trim().min(2).max(80),
});

ghlRouter.get("/contacts/search", async (req: AuthedRequest, res) => {
  const parsed = searchSchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Query must be at least 2 characters" });
    return;
  }

  try {
    const contacts = await searchGhlContacts(parsed.data.q, 10);
    const ghlIds = contacts.map((c) => c.id).filter(Boolean);

    let pointsByGhlId = new Map<string, number>();
    if (ghlIds.length > 0) {
      const { rows } = await query<{
        ghl_contact_id: string;
        points_total: number;
        name: string;
        phone_number: string;
      }>(
        `SELECT ghl_contact_id, points_total, name, phone_number
         FROM members
         WHERE ghl_contact_id = ANY($1::text[])`,
        [ghlIds]
      );
      pointsByGhlId = new Map(
        rows.map((r) => [r.ghl_contact_id, r.points_total])
      );
    }

    res.json({
      results: contacts.map((c) => {
        const displayName =
          c.name ||
          [c.firstName, c.lastName].filter(Boolean).join(" ") ||
          "Unknown";
        return {
          ghlContactId: c.id,
          name: displayName,
          phone: c.phone || null,
          pointsTotal: pointsByGhlId.has(c.id)
            ? pointsByGhlId.get(c.id)!
            : null,
          hasLocalMember: pointsByGhlId.has(c.id),
        };
      }),
    });
  } catch (err) {
    console.error("ghl/contacts/search failed", err);
    res.status(502).json({
      error: err instanceof Error ? err.message : "GHL search failed",
    });
  }
});
