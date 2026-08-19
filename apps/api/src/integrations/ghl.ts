import { env } from "../config";
import { calendarDateInShopTz } from "../lib/dates";

type GhlContact = {
  id: string;
  firstName?: string;
  lastName?: string;
  name?: string;
  phone?: string;
};

type GhlSearchResponse = {
  contacts?: GhlContact[];
};

function ghlHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${env.GHL_ACCESS_TOKEN}`,
    Version: "2021-07-28",
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

/** Normalize merge-tag style values like {{contact.checkin_points}} → checkin_points */
export function normalizePointsFieldKey(raw: string): string {
  const trimmed = raw.trim();
  const merge = trimmed.match(/\{\{\s*contact\.([a-zA-Z0-9_]+)\s*\}\}/);
  if (merge) return merge[1];
  if (trimmed.startsWith("contact.")) return trimmed.slice("contact.".length);
  return trimmed;
}

export async function findGhlContactByPhone(
  phoneE164: string
): Promise<GhlContact | null> {
  if (env.MOCK_INTEGRATIONS) {
    console.log(`[MOCK GHL] lookup contact by phone ${phoneE164}`);
    return {
      id: `mock_${phoneE164.replace(/\D/g, "")}`,
      name: "Mock Member",
      phone: phoneE164,
    };
  }

  const url = new URL(`${env.GHL_API_BASE_URL}/contacts/search/duplicate`);
  url.searchParams.set("locationId", env.GHL_LOCATION_ID);
  url.searchParams.set("number", phoneE164);

  const dupRes = await fetch(url.toString(), {
    method: "GET",
    headers: ghlHeaders(),
  });

  if (dupRes.ok) {
    const data = (await dupRes.json()) as { contact?: GhlContact };
    if (data.contact?.id) return data.contact;
  }

  if (dupRes.status === 404) {
    return null;
  }

  // Fallback: contacts list query
  return searchGhlContactsByPhone(phoneE164);
}

async function searchGhlContactsByPhone(
  phoneE164: string
): Promise<GhlContact | null> {
  const contacts = await searchGhlContacts(phoneE164, 1);
  return contacts[0] ?? null;
}

/**
 * Free-text contact search (name or phone) against GHL directory.
 * Read-only; used by staff scanner lookup.
 */
export async function searchGhlContacts(
  q: string,
  limit = 10
): Promise<GhlContact[]> {
  const trimmed = q.trim();
  if (!trimmed) return [];

  if (env.MOCK_INTEGRATIONS) {
    console.log(`[MOCK GHL] search contacts q=${trimmed}`);
    return [
      {
        id: `mock_search_${trimmed.replace(/\W/g, "").slice(0, 12) || "x"}`,
        name: `Mock Match (${trimmed})`,
        firstName: "Mock",
        lastName: "Match",
        phone: trimmed.startsWith("+") ? trimmed : "+15555550100",
      },
    ];
  }

  const url = new URL(`${env.GHL_API_BASE_URL}/contacts/`);
  url.searchParams.set("locationId", env.GHL_LOCATION_ID);
  url.searchParams.set("query", trimmed);
  url.searchParams.set("limit", String(Math.min(Math.max(limit, 1), 20)));

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: ghlHeaders(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GHL contact search failed (${res.status}): ${text}`);
  }

  const data = (await res.json()) as GhlSearchResponse;
  return data.contacts ?? [];
}

export async function getGhlPointsTotal(
  ghlContactId: string
): Promise<number | null> {
  if (env.MOCK_INTEGRATIONS) {
    return null;
  }

  const res = await fetch(`${env.GHL_API_BASE_URL}/contacts/${ghlContactId}`, {
    method: "GET",
    headers: ghlHeaders(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GHL get contact failed (${res.status}): ${text}`);
  }

  const data = (await res.json()) as {
    contact?: {
      customFields?: Array<{
        id?: string;
        key?: string;
        fieldKey?: string;
        value?: unknown;
        field_value?: unknown;
      }>;
    };
  };

  const fields = data.contact?.customFields ?? [];
  const fieldId = env.GHL_POINTS_FIELD_ID?.trim();
  const fieldKey = normalizePointsFieldKey(env.GHL_POINTS_FIELD_KEY || "");

  const match = fields.find((f) => {
    if (fieldId && f.id === fieldId) return true;
    if (fieldKey && (f.key === fieldKey || f.fieldKey === fieldKey)) return true;
    return false;
  });

  if (!match) return null;

  const raw = match.value ?? match.field_value;
  const n = typeof raw === "number" ? raw : Number(String(raw).trim());
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.floor(n);
}

export async function updateGhlCheckinProfile(
  ghlContactId: string,
  pointsTotal: number,
  checkinDate: string
): Promise<void> {
  if (env.MOCK_INTEGRATIONS) {
    console.log(
      `[MOCK GHL] set points=${pointsTotal} checkin_date=${checkinDate} on contact ${ghlContactId}`
    );
    return;
  }

  if (!env.GHL_POINTS_FIELD_KEY && !env.GHL_POINTS_FIELD_ID) {
    throw new Error("GHL_POINTS_FIELD_KEY or GHL_POINTS_FIELD_ID is required");
  }

  const customFields: Array<{ id?: string; key?: string; field_value: string | number }> =
    [];

  if (env.GHL_POINTS_FIELD_ID) {
    customFields.push({
      id: env.GHL_POINTS_FIELD_ID,
      field_value: pointsTotal,
    });
  } else {
    customFields.push({
      key: normalizePointsFieldKey(env.GHL_POINTS_FIELD_KEY),
      field_value: pointsTotal,
    });
  }

  const dateKey = normalizePointsFieldKey(env.GHL_CHECKIN_DATE_FIELD_KEY || "");
  if (env.GHL_CHECKIN_DATE_FIELD_ID) {
    customFields.push({
      id: env.GHL_CHECKIN_DATE_FIELD_ID,
      field_value: checkinDate,
    });
  } else if (dateKey) {
    customFields.push({
      key: dateKey,
      field_value: checkinDate,
    });
  }

  const res = await fetch(`${env.GHL_API_BASE_URL}/contacts/${ghlContactId}`, {
    method: "PUT",
    headers: ghlHeaders(),
    body: JSON.stringify({ customFields }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GHL update check-in profile failed (${res.status}): ${text}`);
  }
}

export async function updateGhlPointsTotal(
  ghlContactId: string,
  pointsTotal: number
): Promise<void> {
  await updateGhlCheckinProfile(
    ghlContactId,
    pointsTotal,
    calendarDateInShopTz()
  );
}

export async function addGhlCheckinNote(
  ghlContactId: string,
  pointsTotal: number,
  checkinDate?: string
): Promise<void> {
  const date = checkinDate || calendarDateInShopTz();
  const timestamp = new Date().toISOString();
  const body = `Loyalty check-in — +1 point (total: ${pointsTotal}) — ${date} (${timestamp})`;

  if (env.MOCK_INTEGRATIONS) {
    console.log(`[MOCK GHL] note on ${ghlContactId}: ${body}`);
    return;
  }

  const res = await fetch(
    `${env.GHL_API_BASE_URL}/contacts/${ghlContactId}/notes`,
    {
      method: "POST",
      headers: ghlHeaders(),
      body: JSON.stringify({ body }),
    }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GHL add note failed (${res.status}): ${text}`);
  }
}
