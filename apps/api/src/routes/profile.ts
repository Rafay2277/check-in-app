import { Router } from "express";
import { z } from "zod";
import { query } from "../db/pool";
import {
  getGhlMemberProfile,
  updateGhlMemberProfile,
  type GhlMemberProfile,
} from "../integrations/ghl";
import { normalizePhone } from "../lib/phone";
import { AuthedRequest, requireMemberAuth } from "../middleware/auth";

export const profileRouter = Router();

profileRouter.use(requireMemberAuth);

const profileSchema = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().max(80).default(""),
  phone: z.string().trim().min(7).max(32),
  email: z
    .string()
    .trim()
    .max(160)
    .refine((v) => v === "" || z.string().email().safeParse(v).success, {
      message: "Invalid email",
    })
    .default(""),
  vehicleMake: z.string().trim().max(80).default(""),
  vehicleYear: z.string().trim().max(16).default(""),
  vehicleModel: z.string().trim().max(80).default(""),
});

async function memberGhlId(memberId: string): Promise<{
  ghlContactId: string;
  phone: string;
} | null> {
  const { rows } = await query<{
    ghl_contact_id: string | null;
    phone_number: string;
  }>(
    `SELECT ghl_contact_id, phone_number FROM members WHERE id = $1`,
    [memberId]
  );
  const row = rows[0];
  if (!row?.ghl_contact_id) return null;
  return { ghlContactId: row.ghl_contact_id, phone: row.phone_number };
}

profileRouter.get("/", async (req: AuthedRequest, res) => {
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
    const profile = await getGhlMemberProfile(member.ghlContactId);
    if (!profile) {
      res.status(404).json({ error: "Contact not found in GoHighLevel" });
      return;
    }
    // Prefer local auth phone if GHL phone is empty.
    if (!profile.phone) profile.phone = member.phone;
    res.json(profile);
  } catch (err) {
    console.error("profile GET failed", err);
    res.status(502).json({ error: "Could not load profile from GoHighLevel" });
  }
});

profileRouter.put("/", async (req: AuthedRequest, res) => {
  if (!req.memberId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const parsed = profileSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid profile details" });
    return;
  }

  const phone = normalizePhone(parsed.data.phone);
  if (!phone) {
    res.status(400).json({ error: "Invalid phone number" });
    return;
  }

  const member = await memberGhlId(req.memberId);
  if (!member) {
    res.status(404).json({ error: "Member not found" });
    return;
  }

  const input: GhlMemberProfile = {
    ...parsed.data,
    phone,
  };

  try {
    const profile = await updateGhlMemberProfile(member.ghlContactId, input);

    const displayName = [profile.firstName, profile.lastName]
      .map((p) => p.trim())
      .filter(Boolean)
      .join(" ");

    try {
      await query(
        `UPDATE members
         SET name = $2,
             phone_number = $3,
             updated_at = NOW()
         WHERE id = $1`,
        [req.memberId, displayName || profile.firstName, phone]
      );
    } catch (err) {
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
  } catch (err) {
    console.error("profile PUT failed", err);
    res.status(502).json({ error: "Could not update profile in GoHighLevel" });
  }
});
