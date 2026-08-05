type GhlContact = {
    id: string;
    firstName?: string;
    lastName?: string;
    name?: string;
    phone?: string;
};
/** Normalize merge-tag style values like {{contact.checkin_points}} → checkin_points */
export declare function normalizePointsFieldKey(raw: string): string;
export declare function findGhlContactByPhone(phoneE164: string): Promise<GhlContact | null>;
/**
 * Free-text contact search (name or phone) against GHL directory.
 * Read-only; used by staff scanner lookup.
 */
export declare function searchGhlContacts(q: string, limit?: number): Promise<GhlContact[]>;
export declare function updateGhlPointsTotal(ghlContactId: string, pointsTotal: number): Promise<void>;
export declare function addGhlCheckinNote(ghlContactId: string, pointsTotal: number): Promise<void>;
export {};
