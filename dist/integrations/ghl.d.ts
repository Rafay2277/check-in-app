export type GhlCustomField = {
    id?: string;
    key?: string;
    fieldKey?: string;
    value?: unknown;
    field_value?: unknown;
};
export type GhlContact = {
    id: string;
    firstName?: string;
    lastName?: string;
    name?: string;
    phone?: string;
    email?: string;
    customFields?: GhlCustomField[];
};
export type GhlMemberProfile = {
    firstName: string;
    lastName: string;
    phone: string;
    email: string;
    vehicleMake: string;
    vehicleYear: string;
    vehicleModel: string;
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
export declare function getGhlMemberProfile(ghlContactId: string): Promise<GhlMemberProfile | null>;
export declare function updateGhlMemberProfile(ghlContactId: string, profile: GhlMemberProfile): Promise<GhlMemberProfile>;
/**
 * True when the contact has an opportunity in Active Member or Car Community
 * (or whatever is configured in GHL_ALLOWED_PIPELINE_NAMES).
 */
export declare function contactInAllowedPipelines(ghlContactId: string): Promise<boolean>;
/**
 * Free-text contact search (name or phone) against GHL directory.
 * Read-only; used by staff scanner lookup.
 */
export declare function searchGhlContacts(q: string, limit?: number): Promise<GhlContact[]>;
export declare function getGhlPointsTotal(ghlContactId: string): Promise<number | null>;
export declare function updateGhlCheckinProfile(ghlContactId: string, pointsTotal: number, checkinDate: string): Promise<void>;
export declare function updateGhlPointsTotal(ghlContactId: string, pointsTotal: number): Promise<void>;
export declare function addGhlCheckinNote(ghlContactId: string, pointsTotal: number, checkinDate?: string): Promise<void>;
