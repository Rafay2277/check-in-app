export type GhlContact = {
    id: string;
    firstName?: string;
    lastName?: string;
    name?: string;
    phone?: string;
};
/** Normalize merge-tag style values like {{contact.checkin_points}} → checkin_points */
export declare function normalizePointsFieldKey(raw: string): string;
/**
 * Normalize custom-object field keys from merge tags, e.g.
 * {{custom_objects.check_ins.checkin_date}} → checkin_date
 */
export declare function normalizeCustomObjectFieldKey(raw: string): string;
/**
 * One Custom Object record per visit, associated to the Contact (history for automations).
 * No-ops when object key is empty or association cannot be resolved.
 *
 * Pass `existingRecordId` on outbox retries so we associate the same record
 * instead of creating a second "Check-in YYYY-MM-DD" entry.
 * Returns the GHL record id (or null when skipped).
 */
export declare function createGhlCheckinHistoryRecord(ghlContactId: string, pointsTotal: number, checkinDate: string, existingRecordId?: string): Promise<string | null>;
export declare function findGhlContactByPhone(phoneE164: string): Promise<GhlContact | null>;
/** Flying 4 (paid Active Member) vs Circle 4 (Car Community). */
export type MembershipTier = "premium" | "standard";
export type ContactMembership = {
    allowed: boolean;
    tier: MembershipTier | null;
};
/**
 * Resolve login eligibility + membership tier from GHL opportunity pipelines.
 * Active Member (premium) wins if the contact is also in Car Community.
 */
export declare function resolveContactMembership(ghlContactId: string): Promise<ContactMembership>;
/** True when the contact is in Active Member or Car Community (or configured allowlist). */
export declare function contactInAllowedPipelines(ghlContactId: string): Promise<boolean>;
export declare function membershipLabel(tier: MembershipTier): string;
/**
 * Free-text contact search (name or phone) against GHL directory.
 * Read-only; used by staff scanner lookup.
 */
export declare function searchGhlContacts(q: string, limit?: number): Promise<GhlContact[]>;
/** Points + member # from one GHL contact fetch. */
export declare function getGhlContactAppFields(ghlContactId: string): Promise<{
    points: number | null;
    memberNumber: string | null;
}>;
export declare function getGhlPointsTotal(ghlContactId: string): Promise<number | null>;
export declare function getGhlMemberNumber(ghlContactId: string): Promise<string | null>;
/** Temporary diagnostics for contacts where live points / member # fail to sync. */
export declare function inspectGhlPoints(ghlContactId: string): Promise<Record<string, unknown>>;
export declare function updateGhlCheckinProfile(ghlContactId: string, pointsTotal: number, checkinDate: string): Promise<void>;
export declare function updateGhlPointsTotal(ghlContactId: string, pointsTotal: number): Promise<void>;
export declare function addGhlCheckinNote(ghlContactId: string, pointsTotal: number, checkinDate?: string): Promise<void>;
