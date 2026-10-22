import { env } from "../config";
import { calendarDateInShopTz } from "../lib/dates";

export type GhlContact = {
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

/**
 * Normalize custom-object field keys from merge tags, e.g.
 * {{custom_objects.check_ins.checkin_date}} → checkin_date
 */
export function normalizeCustomObjectFieldKey(raw: string): string {
  const trimmed = raw.trim();
  const merge = trimmed.match(
    /\{\{\s*custom_objects\.[a-zA-Z0-9_]+\.([a-zA-Z0-9_]+)\s*\}\}/
  );
  if (merge) return merge[1];
  const dotted = trimmed.match(/^custom_objects\.[a-zA-Z0-9_]+\.([a-zA-Z0-9_]+)$/);
  if (dotted) return dotted[1];
  return trimmed;
}

type GhlAssociation = {
  id?: string;
  firstObjectKey?: string;
  secondObjectKey?: string;
};

let cachedCheckinAssociation:
  | { id: string; contactIsFirst: boolean }
  | null
  | undefined;

function isContactObjectKey(key: string | undefined): boolean {
  if (!key) return false;
  const k = key.toLowerCase();
  return k === "contact" || k === "contacts";
}

async function resolveCheckinAssociation(
  schemaKey: string
): Promise<{ id: string; contactIsFirst: boolean } | null> {
  if (cachedCheckinAssociation !== undefined) {
    return cachedCheckinAssociation;
  }

  const configuredId = env.GHL_CHECKIN_ASSOCIATION_ID?.trim();

  const url = new URL(
    `${env.GHL_API_BASE_URL}/associations/objectKey/${encodeURIComponent(schemaKey)}`
  );
  url.searchParams.set("locationId", env.GHL_LOCATION_ID);

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: ghlHeaders(),
  });

  if (res.ok) {
    const data = (await res.json()) as
      | GhlAssociation
      | { associations?: GhlAssociation[] }
      | GhlAssociation[];

    const list: GhlAssociation[] = Array.isArray(data)
      ? data
      : Array.isArray((data as { associations?: GhlAssociation[] }).associations)
        ? (data as { associations: GhlAssociation[] }).associations
        : data && typeof data === "object" && "id" in data
          ? [data as GhlAssociation]
          : [];

    const match = list.find((a) => {
      if (configuredId && a.id && a.id !== configuredId) return false;
      const first = String(a.firstObjectKey ?? "");
      const second = String(a.secondObjectKey ?? "");
      return (
        (first === schemaKey && isContactObjectKey(second)) ||
        (second === schemaKey && isContactObjectKey(first))
      );
    });

    if (match?.id) {
      cachedCheckinAssociation = {
        id: match.id,
        contactIsFirst: isContactObjectKey(String(match.firstObjectKey ?? "")),
      };
      return cachedCheckinAssociation;
    }
  } else {
    const text = await res.text();
    console.warn(
      `[ghl] could not auto-resolve check-in association (${res.status}): ${text}`
    );
  }

  // Fallback: env id only — assume Contact is first object (typical 1:many setup).
  if (configuredId) {
    cachedCheckinAssociation = { id: configuredId, contactIsFirst: true };
    return cachedCheckinAssociation;
  }

  cachedCheckinAssociation = null;
  return null;
}

/**
 * One Custom Object record per visit, associated to the Contact (history for automations).
 * No-ops when object key is empty or association cannot be resolved.
 *
 * Pass `existingRecordId` on outbox retries so we associate the same record
 * instead of creating a second "Check-in YYYY-MM-DD" entry.
 * Returns the GHL record id (or null when skipped).
 */
export async function createGhlCheckinHistoryRecord(
  ghlContactId: string,
  pointsTotal: number,
  checkinDate: string,
  existingRecordId?: string
): Promise<string | null> {
  const schemaKey = env.GHL_CHECKIN_OBJECT_KEY?.trim();
  if (!schemaKey) return null;

  if (env.MOCK_INTEGRATIONS) {
    console.log(
      `[MOCK GHL] create ${schemaKey} record date=${checkinDate} points=${pointsTotal} for contact ${ghlContactId}`
    );
    return existingRecordId || `mock_checkin_${checkinDate}`;
  }

  const association = await resolveCheckinAssociation(schemaKey);
  if (!association) {
    console.warn(
      "[ghl] skipping check-in history record: set GHL_CHECKIN_ASSOCIATION_ID " +
        "(Settings → Custom Objects → Associations) and ensure the Private Integration " +
        "has objects/record.write + associations/relation.write (+ associations.readonly to auto-resolve)."
    );
    return null;
  }

  let recordId = existingRecordId?.trim() || "";

  if (!recordId) {
    const dateKey = normalizeCustomObjectFieldKey(
      env.GHL_CHECKIN_OBJECT_DATE_FIELD_KEY || "checkin_date"
    );
    const pointsKey = normalizeCustomObjectFieldKey(
      env.GHL_CHECKIN_OBJECT_POINTS_FIELD_KEY || "points_total"
    );
    const nameKey = normalizeCustomObjectFieldKey(
      env.GHL_CHECKIN_OBJECT_NAME_FIELD_KEY || "check_in"
    );

    const properties: Record<string, string | number> = {
      [dateKey]: checkinDate,
      [pointsKey]: pointsTotal,
    };
    if (nameKey) {
      // Primary display field on the Check-ins object (required by many GHL schemas).
      properties[nameKey] = `Check-in ${checkinDate}`;
    }

    const createRes = await fetch(
      `${env.GHL_API_BASE_URL}/objects/${encodeURIComponent(schemaKey)}/records`,
      {
        method: "POST",
        headers: ghlHeaders(),
        body: JSON.stringify({
          locationId: env.GHL_LOCATION_ID,
          properties,
        }),
      }
    );

    if (!createRes.ok) {
      const text = await createRes.text();
      throw new Error(
        `GHL create check-in record failed (${createRes.status}): ${text}`
      );
    }

    const created = (await createRes.json()) as {
      record?: { id?: string };
      id?: string;
    };
    recordId = created.record?.id || created.id || "";
    if (!recordId) {
      throw new Error(
        `GHL create check-in record returned no id: ${JSON.stringify(created)}`
      );
    }
  }

  const firstRecordId = association.contactIsFirst ? ghlContactId : recordId;
  const secondRecordId = association.contactIsFirst ? recordId : ghlContactId;

  const relRes = await fetch(
    `${env.GHL_API_BASE_URL}/associations/relations`,
    {
      method: "POST",
      headers: ghlHeaders(),
      body: JSON.stringify({
        locationId: env.GHL_LOCATION_ID,
        associationId: association.id,
        firstRecordId,
        secondRecordId,
      }),
    }
  );

  if (!relRes.ok) {
    const text = await relRes.text();
    // Retry after a successful create often hits "already associated".
    if (
      relRes.status === 409 ||
      /already|exist|duplicate/i.test(text)
    ) {
      return recordId;
    }
    throw new Error(
      `GHL associate check-in record failed (${relRes.status}): ${text}`
    );
  }

  return recordId;
}

export async function findGhlContactByPhone(
  phoneE164: string
): Promise<GhlContact | null> {
  if (env.MOCK_INTEGRATIONS) {
    console.log(`[MOCK GHL] lookup contact by phone ${phoneE164}`);
    return {
      id: `mock_${phoneE164.replace(/\D/g, "")}`,
      name: "Mock Member",
      firstName: "Mock",
      lastName: "Member",
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

  let contact: GhlContact | null = null;

  if (dupRes.ok) {
    const text = await dupRes.text();
    try {
      const data = (text ? JSON.parse(text) : {}) as { contact?: GhlContact };
      if (data.contact?.id) contact = data.contact;
    } catch {
      console.warn(
        `[ghl] duplicate search returned non-JSON for ${phoneE164}: ${text.slice(0, 180)}`
      );
      contact = await searchGhlContactsByPhone(phoneE164);
    }
  } else if (dupRes.status === 404) {
    return null;
  } else {
    contact = await searchGhlContactsByPhone(phoneE164);
  }

  if (!contact?.id) return null;

  // Duplicate search sometimes omits name fields — hydrate for login name checks.
  if (!contact.firstName && !contact.lastName && !contact.name) {
    const full = await getGhlContactById(contact.id);
    if (full) return full;
  }

  return contact;
}

async function getGhlContactById(
  ghlContactId: string
): Promise<GhlContact | null> {
  const res = await fetch(`${env.GHL_API_BASE_URL}/contacts/${ghlContactId}`, {
    method: "GET",
    headers: ghlHeaders(),
  });
  if (!res.ok) return null;
  const text = await res.text();
  try {
    const data = (text ? JSON.parse(text) : {}) as { contact?: GhlContact };
    return data.contact?.id ? data.contact : null;
  } catch {
    console.warn(
      `[ghl] get contact returned non-JSON for ${ghlContactId}: ${text.slice(0, 180)}`
    );
    return null;
  }
}

type GhlPipeline = {
  id?: string;
  name?: string;
};

/** Flying 4 (paid Active Member) vs Circle 4 (Car Community). */
export type MembershipTier = "premium" | "standard";

export type ContactMembership = {
  allowed: boolean;
  tier: MembershipTier | null;
};

type ResolvedPipelines = {
  premiumIds: string[];
  standardIds: string[];
  allIds: string[];
};

/** Cached allowed pipeline ids for this process (resolved by name). */
let cachedResolvedPipelines: ResolvedPipelines | undefined;
let cachedAllowedPipelineWarn = false;

function splitPipelineNames(raw: string): string[] {
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function allowedPipelineNames(): string[] {
  return splitPipelineNames(env.GHL_ALLOWED_PIPELINE_NAMES);
}

function premiumPipelineNames(): string[] {
  return splitPipelineNames(env.GHL_PREMIUM_PIPELINE_NAMES);
}

async function resolveAllowedPipelines(): Promise<ResolvedPipelines> {
  if (cachedResolvedPipelines !== undefined) {
    return cachedResolvedPipelines;
  }

  const wanted = new Set(allowedPipelineNames());
  const premiumWanted = new Set(premiumPipelineNames());
  if (wanted.size === 0) {
    cachedResolvedPipelines = { premiumIds: [], standardIds: [], allIds: [] };
    return cachedResolvedPipelines;
  }

  const url = new URL(`${env.GHL_API_BASE_URL}/opportunities/pipelines`);
  url.searchParams.set("locationId", env.GHL_LOCATION_ID);

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: ghlHeaders(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `GHL list pipelines failed (${res.status}): ${text}`
    );
  }

  const data = (await res.json()) as {
    pipelines?: GhlPipeline[];
  };

  const premiumIds: string[] = [];
  const standardIds: string[] = [];
  for (const p of data.pipelines ?? []) {
    if (!p.id || !p.name) continue;
    const name = p.name.trim().toLowerCase();
    if (!wanted.has(name)) continue;
    if (premiumWanted.has(name)) {
      premiumIds.push(p.id);
    } else {
      standardIds.push(p.id);
    }
  }

  const allIds = [...premiumIds, ...standardIds];

  if (allIds.length === 0 && !cachedAllowedPipelineWarn) {
    cachedAllowedPipelineWarn = true;
    console.warn(
      `[ghl] no pipelines matched allowed names [${[...wanted].join(", ")}]. ` +
        `Check GHL_ALLOWED_PIPELINE_NAMES and Private Integration scope opportunities.readonly.`
    );
  }

  cachedResolvedPipelines = { premiumIds, standardIds, allIds };
  return cachedResolvedPipelines;
}

async function contactHasOpportunityInPipeline(
  ghlContactId: string,
  pipelineId: string
): Promise<boolean> {
  // Marketplace docs use camelCase; some clients send snake_case — try camel first.
  const attempts: Array<Record<string, string>> = [
    {
      locationId: env.GHL_LOCATION_ID,
      contactId: ghlContactId,
      pipelineId,
      status: "all",
      limit: "1",
    },
    {
      location_id: env.GHL_LOCATION_ID,
      contact_id: ghlContactId,
      pipeline_id: pipelineId,
      status: "all",
      limit: "1",
    },
  ];

  let lastError = "";
  for (const params of attempts) {
    const url = new URL(`${env.GHL_API_BASE_URL}/opportunities/search`);
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }

    const res = await fetch(url.toString(), {
      method: "GET",
      headers: ghlHeaders(),
    });

    if (res.ok) {
      const data = (await res.json()) as {
        opportunities?: unknown[];
      };
      return (data.opportunities?.length ?? 0) > 0;
    }

    lastError = await res.text();
    // Retry alternate param style only on 4xx validation-style errors.
    if (res.status < 400 || res.status >= 500) {
      throw new Error(
        `GHL opportunity search failed (${res.status}): ${lastError}`
      );
    }
  }

  throw new Error(`GHL opportunity search failed: ${lastError}`);
}

/**
 * Resolve login eligibility + membership tier from GHL opportunity pipelines.
 * Active Member (premium) wins if the contact is also in Car Community.
 */
export async function resolveContactMembership(
  ghlContactId: string
): Promise<ContactMembership> {
  if (env.MOCK_INTEGRATIONS) {
    console.log(
      `[MOCK GHL] pipeline membership check for contact ${ghlContactId} → premium`
    );
    return { allowed: true, tier: "premium" };
  }

  const { premiumIds, standardIds, allIds } = await resolveAllowedPipelines();
  if (allIds.length === 0) {
    return { allowed: false, tier: null };
  }

  for (const pipelineId of premiumIds) {
    if (await contactHasOpportunityInPipeline(ghlContactId, pipelineId)) {
      return { allowed: true, tier: "premium" };
    }
  }

  for (const pipelineId of standardIds) {
    if (await contactHasOpportunityInPipeline(ghlContactId, pipelineId)) {
      return { allowed: true, tier: "standard" };
    }
  }

  return { allowed: false, tier: null };
}

/** True when the contact is in Active Member or Car Community (or configured allowlist). */
export async function contactInAllowedPipelines(
  ghlContactId: string
): Promise<boolean> {
  return (await resolveContactMembership(ghlContactId)).allowed;
}

export function membershipLabel(tier: MembershipTier): string {
  return tier === "premium" ? "Premium customer" : "Standard customer";
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

  const text = await res.text();
  let data: GhlSearchResponse;
  try {
    data = (text ? JSON.parse(text) : {}) as GhlSearchResponse;
  } catch {
    throw new Error(
      `GHL contact search returned non-JSON (${res.status}): ${text.slice(0, 180)}`
    );
  }
  return data.contacts ?? [];
}

type GhlCustomField = {
  id?: string;
  fieldId?: string;
  key?: string;
  fieldKey?: string;
  name?: string;
  value?: unknown;
  field_value?: unknown;
  fieldValue?: unknown;
};

function parsePointsValue(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  const n = typeof raw === "number" ? raw : Number(String(raw).trim());
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.floor(n);
}

/** GHL returns custom fields as an array or occasionally as a key→value map. */
function extractCustomFields(contact: {
  customFields?: GhlCustomField[] | Record<string, unknown>;
  customField?: GhlCustomField[] | Record<string, unknown>;
}): GhlCustomField[] {
  const raw = contact.customFields ?? contact.customField;
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "object") {
    return Object.entries(raw).map(([key, value]) => ({ key, value }));
  }
  return [];
}

function fieldMatchesPointsConfig(f: GhlCustomField): boolean {
  const fieldId = env.GHL_POINTS_FIELD_ID?.trim();
  const fieldKey = normalizePointsFieldKey(env.GHL_POINTS_FIELD_KEY || "");
  if (fieldId && (f.id === fieldId || f.fieldId === fieldId)) return true;
  if (!fieldKey) return false;
  const candidates = [f.key, f.fieldKey, f.name]
    .filter((k): k is string => Boolean(k))
    .map((k) => normalizePointsFieldKey(k));
  return candidates.some(
    (k) =>
      k === fieldKey ||
      k.endsWith(`.${fieldKey}`) ||
      k.endsWith(`_${fieldKey}`) ||
      k.includes(fieldKey)
  );
}

function fieldValueRaw(f: GhlCustomField): unknown {
  return f.value ?? f.field_value ?? f.fieldValue;
}

/** Loose fallback: label/key looks like check-in points. */
function fieldLooksLikeCheckinPoints(f: GhlCustomField): boolean {
  const blob = [f.key, f.fieldKey, f.name, f.id, f.fieldId]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
  return (
    blob.includes("checkinpoint") ||
    blob.includes("checkinpoints") ||
    blob.includes("loyaltypoint") ||
    blob === "points" ||
    blob.endsWith("points")
  );
}

async function fetchGhlContactRaw(ghlContactId: string): Promise<{
  contact: Record<string, unknown> & {
    customFields?: GhlCustomField[] | Record<string, unknown>;
    customField?: GhlCustomField[] | Record<string, unknown>;
  };
  fields: GhlCustomField[];
}> {
  const res = await fetch(`${env.GHL_API_BASE_URL}/contacts/${ghlContactId}`, {
    method: "GET",
    headers: ghlHeaders(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GHL get contact failed (${res.status}): ${text}`);
  }

  const data = (await res.json()) as {
    contact?: Record<string, unknown> & {
      customFields?: GhlCustomField[] | Record<string, unknown>;
      customField?: GhlCustomField[] | Record<string, unknown>;
    };
  };
  const contact = data.contact ?? {};
  return { contact, fields: extractCustomFields(contact) };
}

/** Walk a contact payload for member_number even if nested oddly. */
function memberNumberFromContactObject(
  contact: Record<string, unknown>
): string | null {
  const direct = [
    contact.member_number,
    contact.memberNumber,
    (contact as { memberNumber?: unknown }).memberNumber,
  ];
  for (const v of direct) {
    const parsed = parseMemberNumberValue(v);
    if (parsed) return parsed;
  }

  const stack: unknown[] = [contact];
  const seen = new Set<unknown>();
  while (stack.length) {
    const cur = stack.pop();
    if (!cur || typeof cur !== "object" || seen.has(cur)) continue;
    seen.add(cur);
    if (Array.isArray(cur)) {
      for (const item of cur) stack.push(item);
      continue;
    }
    for (const [k, v] of Object.entries(cur as Record<string, unknown>)) {
      const nk = normalizePointsFieldKey(k);
      if (
        nk === "member_number" ||
        nk.replace(/[^a-z0-9]+/gi, "").toLowerCase() === "membernumber"
      ) {
        const parsed = parseMemberNumberValue(v);
        if (parsed) return parsed;
      }
      if (v && typeof v === "object") stack.push(v);
    }
  }
  return null;
}

function knownNonMemberFieldIds(): Set<string> {
  return new Set(
    [
      env.GHL_POINTS_FIELD_ID?.trim(),
      env.GHL_CHECKIN_DATE_FIELD_ID?.trim(),
    ].filter((id): id is string => Boolean(id))
  );
}

/** Value shape typical of cafe member #s (not dates, not big point totals). */
function valueLooksLikeMemberNumber(raw: unknown): boolean {
  const parsed = parseMemberNumberValue(raw);
  if (!parsed) return false;
  // Dates / timestamps
  if (/^\d{4}-\d{2}-\d{2}/.test(parsed)) return false;
  if (/^\d{10,}$/.test(parsed)) return false;
  // Member #s are usually short codes
  if (parsed.length > 12) return false;
  // Prefer mostly alphanumeric / digits
  return /^[A-Za-z0-9_-]+$/.test(parsed);
}

function resolvePointsFromFields(fields: GhlCustomField[]): {
  points: number | null;
  matchedBy: "id" | "key" | "fallback" | null;
  matched?: { id?: string; key?: string; value?: unknown };
} {
  const configured = fields.find(fieldMatchesPointsConfig);
  if (configured) {
    return {
      points: parsePointsValue(fieldValueRaw(configured)),
      matchedBy: env.GHL_POINTS_FIELD_ID?.trim() ? "id" : "key",
      matched: {
        id: configured.id || configured.fieldId,
        key: configured.key || configured.fieldKey || configured.name,
        value: fieldValueRaw(configured),
      },
    };
  }

  const fallback = fields.find(
    (f) => fieldLooksLikeCheckinPoints(f) && parsePointsValue(fieldValueRaw(f)) != null
  );
  if (fallback) {
    return {
      points: parsePointsValue(fieldValueRaw(fallback)),
      matchedBy: "fallback",
      matched: {
        id: fallback.id || fallback.fieldId,
        key: fallback.key || fallback.fieldKey || fallback.name,
        value: fieldValueRaw(fallback),
      },
    };
  }

  return { points: null, matchedBy: null };
}

function parseMemberNumberValue(raw: unknown): string | null {
  if (raw == null) return null;
  let s = String(raw).trim();
  if (!s) return null;
  // Accept "107", "#107", "Member #107"
  const hash = s.match(/#\s*([A-Za-z0-9_-]+)\s*$/);
  if (hash) s = hash[1];
  else s = s.replace(/^#\s*/, "");
  s = s.trim();
  return s || null;
}

function memberNumberFieldKey(): string {
  return normalizePointsFieldKey(
    env.GHL_MEMBER_NUMBER_FIELD_KEY || "member_number"
  );
}

function fieldLooksLikeMemberNumber(f: GhlCustomField): boolean {
  const blob = [f.key, f.fieldKey, f.name]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
  return (
    blob === "membernumber" ||
    blob === "memberno" ||
    blob === "membernum" ||
    blob.includes("membernumber") ||
    blob.includes("memberno")
  );
}

function fieldMatchesMemberNumberConfig(
  f: GhlCustomField,
  resolvedFieldId: string | null
): boolean {
  const configuredId = env.GHL_MEMBER_NUMBER_FIELD_ID?.trim() || resolvedFieldId;
  if (configuredId && (f.id === configuredId || f.fieldId === configuredId)) {
    return true;
  }
  const fieldKey = memberNumberFieldKey();
  if (!fieldKey) return false;
  const candidates = [f.key, f.fieldKey, f.name]
    .filter((k): k is string => Boolean(k))
    .map((k) => normalizePointsFieldKey(k));
  return candidates.some(
    (k) =>
      k === fieldKey ||
      k.endsWith(`.${fieldKey}`) ||
      k.endsWith(`_${fieldKey}`)
  );
}

/**
 * GHL contact payloads often only include `{ id, value }` for custom fields.
 * Resolve the real field id for member_number from location field definitions.
 */
let cachedMemberNumberFieldId: string | null | undefined;

async function resolveMemberNumberFieldId(): Promise<string | null> {
  const configured = env.GHL_MEMBER_NUMBER_FIELD_ID?.trim();
  if (configured) return configured;
  if (cachedMemberNumberFieldId !== undefined) return cachedMemberNumberFieldId;

  const fieldKey = memberNumberFieldKey();
  if (!fieldKey || !env.GHL_LOCATION_ID) {
    cachedMemberNumberFieldId = null;
    return null;
  }

  try {
    const url = `${env.GHL_API_BASE_URL}/locations/${encodeURIComponent(
      env.GHL_LOCATION_ID
    )}/customFields`;
    const res = await fetch(url, { method: "GET", headers: ghlHeaders() });
    if (!res.ok) {
      const text = await res.text();
      console.warn(
        `[ghl] could not list custom fields for member_number (${res.status}): ${text.slice(0, 180)}`
      );
      cachedMemberNumberFieldId = null;
      return null;
    }
    const data = (await res.json()) as {
      customFields?: Array<{
        id?: string;
        fieldKey?: string;
        key?: string;
        name?: string;
      }>;
    };
    const list = Array.isArray(data.customFields) ? data.customFields : [];
    const match = list.find((f) => {
      const candidates = [f.fieldKey, f.key, f.name]
        .filter((k): k is string => Boolean(k))
        .map((k) => normalizePointsFieldKey(k));
      return candidates.some(
        (k) =>
          k === fieldKey ||
          k.endsWith(`.${fieldKey}`) ||
          k.endsWith(`_${fieldKey}`) ||
          k.replace(/[^a-z0-9]+/gi, "").toLowerCase() === "membernumber"
      );
    });
    cachedMemberNumberFieldId = match?.id || null;
    if (cachedMemberNumberFieldId) {
      console.log(
        `[ghl] resolved member_number field id=${cachedMemberNumberFieldId}`
      );
    } else {
      console.warn(
        `[ghl] no custom field matched key=${fieldKey} among ${list.length} definitions`
      );
    }
    return cachedMemberNumberFieldId;
  } catch (err) {
    console.warn("[ghl] member_number field id resolve failed", err);
    cachedMemberNumberFieldId = null;
    return null;
  }
}

async function resolveMemberNumberFromFields(
  fields: GhlCustomField[],
  contact?: Record<string, unknown>
): Promise<{
  memberNumber: string | null;
  matchedBy: "id" | "key" | "fallback" | "value" | "contact" | null;
  matched?: { id?: string; key?: string; value?: unknown };
}> {
  const resolvedId = await resolveMemberNumberFieldId();
  const configured = fields.find((f) =>
    fieldMatchesMemberNumberConfig(f, resolvedId)
  );
  if (configured) {
    const memberNumber = parseMemberNumberValue(fieldValueRaw(configured));
    if (memberNumber) {
      return {
        memberNumber,
        matchedBy:
          env.GHL_MEMBER_NUMBER_FIELD_ID?.trim() || resolvedId ? "id" : "key",
        matched: {
          id: configured.id || configured.fieldId,
          key: configured.key || configured.fieldKey || configured.name,
          value: fieldValueRaw(configured),
        },
      };
    }
  }

  const fallback = fields.find(
    (f) =>
      fieldLooksLikeMemberNumber(f) &&
      parseMemberNumberValue(fieldValueRaw(f)) != null
  );
  if (fallback) {
    return {
      memberNumber: parseMemberNumberValue(fieldValueRaw(fallback)),
      matchedBy: "fallback",
      matched: {
        id: fallback.id || fallback.fieldId,
        key: fallback.key || fallback.fieldKey || fallback.name,
        value: fieldValueRaw(fallback),
      },
    };
  }

  if (contact) {
    const fromContact = memberNumberFromContactObject(contact);
    if (fromContact) {
      return { memberNumber: fromContact, matchedBy: "contact" };
    }
  }

  /**
   * Last resort: GHL often returns only `{ id, value }` with no key.
   * Skip known points/date fields, then take the best short code-looking value.
   * Once found, cache that field id so later contacts stay consistent.
   */
  const skipIds = knownNonMemberFieldIds();
  const candidates = fields
    .map((f) => {
      const id = f.id || f.fieldId || "";
      const value = fieldValueRaw(f);
      return {
        f,
        id,
        value,
        parsed: parseMemberNumberValue(value),
      };
    })
    .filter(
      (c) =>
        c.parsed &&
        valueLooksLikeMemberNumber(c.value) &&
        (!c.id || !skipIds.has(c.id)) &&
        !fieldMatchesPointsConfig(c.f) &&
        !fieldLooksLikeCheckinPoints(c.f)
    );

  if (candidates.length === 1) {
    const only = candidates[0];
    if (only.id) cachedMemberNumberFieldId = only.id;
    return {
      memberNumber: only.parsed,
      matchedBy: "value",
      matched: {
        id: only.id || undefined,
        key: only.f.key || only.f.fieldKey || only.f.name,
        value: only.value,
      },
    };
  }

  // Prefer pure numeric member #s (e.g. 107) over other codes when several match.
  const numeric = candidates.filter((c) => /^\d{1,6}$/.test(c.parsed || ""));
  if (numeric.length === 1) {
    const only = numeric[0];
    if (only.id) cachedMemberNumberFieldId = only.id;
    return {
      memberNumber: only.parsed,
      matchedBy: "value",
      matched: {
        id: only.id || undefined,
        key: only.f.key || only.f.fieldKey || only.f.name,
        value: only.value,
      },
    };
  }

  // If we previously learned the field id via value match, reuse it.
  if (cachedMemberNumberFieldId) {
    const byCached = fields.find(
      (f) => f.id === cachedMemberNumberFieldId || f.fieldId === cachedMemberNumberFieldId
    );
    if (byCached) {
      const memberNumber = parseMemberNumberValue(fieldValueRaw(byCached));
      if (memberNumber) {
        return {
          memberNumber,
          matchedBy: "id",
          matched: {
            id: cachedMemberNumberFieldId,
            value: fieldValueRaw(byCached),
          },
        };
      }
    }
  }

  return { memberNumber: null, matchedBy: null };
}

/** Points + member # from one GHL contact fetch. */
export async function getGhlContactAppFields(
  ghlContactId: string
): Promise<{ points: number | null; memberNumber: string | null }> {
  if (env.MOCK_INTEGRATIONS) {
    return { points: null, memberNumber: null };
  }

  const { contact, fields } = await fetchGhlContactRaw(ghlContactId);
  const resolved = resolvePointsFromFields(fields);
  const member = await resolveMemberNumberFromFields(fields, contact);

  if (resolved.points == null) {
    if (fields.length > 0) {
      console.warn(
        `[ghl] points field not matched for contact ${ghlContactId}; ` +
          `have ${fields.length} custom fields, ` +
          `looking for id=${env.GHL_POINTS_FIELD_ID || "(none)"} ` +
          `key=${env.GHL_POINTS_FIELD_KEY || "(none)"}`
      );
    } else {
      console.warn(
        `[ghl] contact ${ghlContactId} returned 0 custom fields for points lookup`
      );
    }
  } else if (resolved.matchedBy === "fallback") {
    console.warn(
      `[ghl] points matched via fallback for ${ghlContactId}:`,
      resolved.matched
    );
  }

  if (member.memberNumber == null && fields.length > 0) {
    console.warn(
      `[ghl] member_number not matched for contact ${ghlContactId}; ` +
        `looking for id=${env.GHL_MEMBER_NUMBER_FIELD_ID || "(auto)"} ` +
        `key=${memberNumberFieldKey()}; ` +
        `sample=${JSON.stringify(
          fields.slice(0, 12).map((f) => ({
            id: f.id || f.fieldId || null,
            key: f.key || f.fieldKey || f.name || null,
            value: fieldValueRaw(f) ?? null,
          }))
        )}`
    );
  } else if (member.matchedBy === "fallback") {
    console.warn(
      `[ghl] member_number matched via fallback for ${ghlContactId}:`,
      member.matched
    );
  }

  return {
    points: resolved.points,
    memberNumber: member.memberNumber,
  };
}

export async function getGhlPointsTotal(
  ghlContactId: string
): Promise<number | null> {
  const { points } = await getGhlContactAppFields(ghlContactId);
  return points;
}

export async function getGhlMemberNumber(
  ghlContactId: string
): Promise<string | null> {
  const { memberNumber } = await getGhlContactAppFields(ghlContactId);
  return memberNumber;
}

/** Temporary diagnostics for contacts where live points / member # fail to sync. */
export async function inspectGhlPoints(
  ghlContactId: string
): Promise<Record<string, unknown>> {
  if (env.MOCK_INTEGRATIONS) {
    return { mock: true, points: null, memberNumber: null };
  }

  const { contact, fields } = await fetchGhlContactRaw(ghlContactId);
  const resolved = resolvePointsFromFields(fields);
  const member = await resolveMemberNumberFromFields(fields, contact);
  const resolvedMemberFieldId = await resolveMemberNumberFieldId();
  return {
    configuredFieldId: env.GHL_POINTS_FIELD_ID || null,
    configuredFieldKey: env.GHL_POINTS_FIELD_KEY || null,
    memberNumberFieldId:
      env.GHL_MEMBER_NUMBER_FIELD_ID?.trim() ||
      resolvedMemberFieldId ||
      cachedMemberNumberFieldId ||
      null,
    memberNumberFieldKey: memberNumberFieldKey(),
    fieldCount: fields.length,
    points: resolved.points,
    matchedBy: resolved.matchedBy,
    matched: resolved.matched || null,
    memberNumber: member.memberNumber,
    memberNumberMatchedBy: member.matchedBy,
    memberNumberMatched: member.matched || null,
    sampleFields: fields.slice(0, 40).map((f) => ({
      id: f.id || f.fieldId || null,
      key: f.key || f.fieldKey || f.name || null,
      value: fieldValueRaw(f) ?? null,
    })),
  };
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

  // Never lower the CRM score if local/outbox is behind (e.g. local was 0).
  let safeTotal = pointsTotal;
  try {
    const live = await getGhlPointsTotal(ghlContactId);
    if (live != null && live > safeTotal) {
      console.warn(
        `[ghl] keeping live points ${live} instead of writing lower ${pointsTotal} for ${ghlContactId}`
      );
      safeTotal = live;
    }
  } catch (err) {
    console.warn(
      `[ghl] could not re-read live points before write for ${ghlContactId}; writing ${pointsTotal}`,
      err
    );
  }

  const customFields: Array<{ id?: string; key?: string; field_value: string | number }> =
    [];

  if (env.GHL_POINTS_FIELD_ID) {
    customFields.push({
      id: env.GHL_POINTS_FIELD_ID,
      field_value: safeTotal,
    });
  } else {
    customFields.push({
      key: normalizePointsFieldKey(env.GHL_POINTS_FIELD_KEY),
      field_value: safeTotal,
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
