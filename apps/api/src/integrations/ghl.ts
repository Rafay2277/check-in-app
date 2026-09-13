import { env } from "../config";
import { calendarDateInShopTz } from "../lib/dates";

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
    const data = (await dupRes.json()) as { contact?: GhlContact };
    if (data.contact?.id) contact = data.contact;
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
  const data = (await res.json()) as { contact?: GhlContact };
  return data.contact?.id ? data.contact : null;
}

function customFieldValue(
  fields: GhlCustomField[] | undefined,
  wantedKey: string
): string {
  const key = normalizePointsFieldKey(wantedKey);
  if (!key || !fields?.length) return "";
  const match = fields.find((f) => {
    const candidates = [f.key, f.fieldKey]
      .filter(Boolean)
      .map((k) => normalizePointsFieldKey(String(k)));
    return candidates.includes(key);
  });
  if (!match) return "";
  const raw = match.value ?? match.field_value;
  if (raw == null) return "";
  return String(raw).trim();
}

function contactToMemberProfile(contact: GhlContact): GhlMemberProfile {
  return {
    firstName: (contact.firstName || "").trim(),
    lastName: (contact.lastName || "").trim(),
    phone: (contact.phone || "").trim(),
    email: (contact.email || "").trim(),
    vehicleMake: customFieldValue(
      contact.customFields,
      env.GHL_VEHICLE_MAKE_FIELD_KEY
    ),
    vehicleYear: customFieldValue(
      contact.customFields,
      env.GHL_VEHICLE_YEAR_FIELD_KEY
    ),
    vehicleModel: customFieldValue(
      contact.customFields,
      env.GHL_VEHICLE_MODEL_FIELD_KEY
    ),
  };
}

export async function getGhlMemberProfile(
  ghlContactId: string
): Promise<GhlMemberProfile | null> {
  if (env.MOCK_INTEGRATIONS) {
    return {
      firstName: "Mock",
      lastName: "Member",
      phone: "+15555550100",
      email: "mock@example.com",
      vehicleMake: "Porsche",
      vehicleYear: "2020",
      vehicleModel: "911",
    };
  }

  const contact = await getGhlContactById(ghlContactId);
  if (!contact) return null;
  return contactToMemberProfile(contact);
}

export async function updateGhlMemberProfile(
  ghlContactId: string,
  profile: GhlMemberProfile
): Promise<GhlMemberProfile> {
  if (env.MOCK_INTEGRATIONS) {
    console.log(`[MOCK GHL] update profile ${ghlContactId}`, profile);
    return profile;
  }

  const customFields: Array<{ key: string; field_value: string }> = [
    {
      key: normalizePointsFieldKey(env.GHL_VEHICLE_MAKE_FIELD_KEY),
      field_value: profile.vehicleMake,
    },
    {
      key: normalizePointsFieldKey(env.GHL_VEHICLE_YEAR_FIELD_KEY),
      field_value: profile.vehicleYear,
    },
    {
      key: normalizePointsFieldKey(env.GHL_VEHICLE_MODEL_FIELD_KEY),
      field_value: profile.vehicleModel,
    },
  ].filter((f) => f.key);

  const body: Record<string, unknown> = {
    firstName: profile.firstName,
    lastName: profile.lastName,
    email: profile.email || undefined,
    phone: profile.phone || undefined,
    customFields,
  };

  const res = await fetch(`${env.GHL_API_BASE_URL}/contacts/${ghlContactId}`, {
    method: "PUT",
    headers: ghlHeaders(),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GHL update profile failed (${res.status}): ${text}`);
  }

  const data = (await res.json()) as { contact?: GhlContact };
  if (data.contact?.id) {
    return contactToMemberProfile(data.contact);
  }

  // Some GHL responses omit custom fields on PUT — re-fetch for truth.
  const refreshed = await getGhlMemberProfile(ghlContactId);
  return refreshed ?? profile;
}

type GhlPipeline = {
  id?: string;
  name?: string;
};

/** Cached allowed pipeline ids for this process (resolved by name). */
let cachedAllowedPipelineIds: string[] | undefined;
let cachedAllowedPipelineWarn = false;

function allowedPipelineNames(): string[] {
  return env.GHL_ALLOWED_PIPELINE_NAMES.split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

async function resolveAllowedPipelineIds(): Promise<string[]> {
  if (cachedAllowedPipelineIds !== undefined) {
    return cachedAllowedPipelineIds;
  }

  const wanted = new Set(allowedPipelineNames());
  if (wanted.size === 0) {
    cachedAllowedPipelineIds = [];
    return cachedAllowedPipelineIds;
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
  const matched = (data.pipelines ?? [])
    .filter((p) => p.id && p.name && wanted.has(p.name.trim().toLowerCase()))
    .map((p) => p.id as string);

  if (matched.length === 0 && !cachedAllowedPipelineWarn) {
    cachedAllowedPipelineWarn = true;
    console.warn(
      `[ghl] no pipelines matched allowed names [${[...wanted].join(", ")}]. ` +
        `Check GHL_ALLOWED_PIPELINE_NAMES and Private Integration scope opportunities.readonly.`
    );
  }

  cachedAllowedPipelineIds = matched;
  return cachedAllowedPipelineIds;
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
 * True when the contact has an opportunity in Active Member or Car Community
 * (or whatever is configured in GHL_ALLOWED_PIPELINE_NAMES).
 */
export async function contactInAllowedPipelines(
  ghlContactId: string
): Promise<boolean> {
  if (env.MOCK_INTEGRATIONS) {
    console.log(
      `[MOCK GHL] pipeline membership check for contact ${ghlContactId} → allow`
    );
    return true;
  }

  const pipelineIds = await resolveAllowedPipelineIds();
  if (pipelineIds.length === 0) {
    return false;
  }

  for (const pipelineId of pipelineIds) {
    if (await contactHasOpportunityInPipeline(ghlContactId, pipelineId)) {
      return true;
    }
  }
  return false;
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
