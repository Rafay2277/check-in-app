import type { GhlContact } from "../integrations/ghl";

/** Lowercase, strip punctuation, collapse whitespace. */
export function normalizePersonName(raw: string): string {
  return raw
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function contactFullName(contact: {
  firstName?: string;
  lastName?: string;
  name?: string;
}): string {
  const fromParts = [contact.firstName, contact.lastName]
    .map((p) => (p || "").trim())
    .filter(Boolean)
    .join(" ");
  const named = (contact.name || "").trim();
  return fromParts || named;
}

/**
 * True when the typed login name belongs to this GHL contact.
 * Allows first/last order swap and minor punctuation/casing differences.
 */
export function loginNameMatchesContact(
  enteredName: string,
  contact: Pick<GhlContact, "firstName" | "lastName" | "name">
): boolean {
  const entered = normalizePersonName(enteredName);
  if (!entered) return false;

  const full = normalizePersonName(contactFullName(contact));
  if (!full) return false;

  if (entered === full) return true;

  const enteredTokens = entered.split(" ").filter(Boolean).sort();
  const contactTokens = full.split(" ").filter(Boolean).sort();
  if (
    enteredTokens.length >= 2 &&
    contactTokens.length >= 2 &&
    enteredTokens.length === contactTokens.length &&
    enteredTokens.every((t, i) => t === contactTokens[i])
  ) {
    return true;
  }

  // Also accept "First Last" against firstName/lastName when `name` is empty/odd.
  const first = normalizePersonName(contact.firstName || "");
  const last = normalizePersonName(contact.lastName || "");
  if (first && last) {
    const combo = normalizePersonName(`${first} ${last}`);
    const swapped = normalizePersonName(`${last} ${first}`);
    if (entered === combo || entered === swapped) return true;
  }

  return false;
}
