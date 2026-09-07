import type { GhlContact } from "../integrations/ghl";
/** Lowercase, strip punctuation, collapse whitespace. */
export declare function normalizePersonName(raw: string): string;
export declare function contactFullName(contact: {
    firstName?: string;
    lastName?: string;
    name?: string;
}): string;
/**
 * True when the typed login name belongs to this GHL contact.
 * Allows first/last order swap and minor punctuation/casing differences.
 */
export declare function loginNameMatchesContact(enteredName: string, contact: Pick<GhlContact, "firstName" | "lastName" | "name">): boolean;
