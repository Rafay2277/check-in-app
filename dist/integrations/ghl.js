"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizePointsFieldKey = normalizePointsFieldKey;
exports.normalizeCustomObjectFieldKey = normalizeCustomObjectFieldKey;
exports.createGhlCheckinHistoryRecord = createGhlCheckinHistoryRecord;
exports.findGhlContactByPhone = findGhlContactByPhone;
exports.resolveContactMembership = resolveContactMembership;
exports.contactInAllowedPipelines = contactInAllowedPipelines;
exports.membershipLabel = membershipLabel;
exports.searchGhlContacts = searchGhlContacts;
exports.getGhlContactAppFields = getGhlContactAppFields;
exports.getGhlPointsTotal = getGhlPointsTotal;
exports.getGhlMemberNumber = getGhlMemberNumber;
exports.inspectGhlPoints = inspectGhlPoints;
exports.updateGhlCheckinProfile = updateGhlCheckinProfile;
exports.updateGhlPointsTotal = updateGhlPointsTotal;
exports.addGhlCheckinNote = addGhlCheckinNote;
const config_1 = require("../config");
const dates_1 = require("../lib/dates");
function ghlHeaders() {
    return {
        Authorization: `Bearer ${config_1.env.GHL_ACCESS_TOKEN}`,
        Version: "2021-07-28",
        "Content-Type": "application/json",
        Accept: "application/json",
    };
}
/** Normalize merge-tag style values like {{contact.checkin_points}} → checkin_points */
function normalizePointsFieldKey(raw) {
    const trimmed = raw.trim();
    const merge = trimmed.match(/\{\{\s*contact\.([a-zA-Z0-9_]+)\s*\}\}/);
    if (merge)
        return merge[1];
    if (trimmed.startsWith("contact."))
        return trimmed.slice("contact.".length);
    return trimmed;
}
/**
 * Normalize custom-object field keys from merge tags, e.g.
 * {{custom_objects.check_ins.checkin_date}} → checkin_date
 */
function normalizeCustomObjectFieldKey(raw) {
    const trimmed = raw.trim();
    const merge = trimmed.match(/\{\{\s*custom_objects\.[a-zA-Z0-9_]+\.([a-zA-Z0-9_]+)\s*\}\}/);
    if (merge)
        return merge[1];
    const dotted = trimmed.match(/^custom_objects\.[a-zA-Z0-9_]+\.([a-zA-Z0-9_]+)$/);
    if (dotted)
        return dotted[1];
    return trimmed;
}
let cachedCheckinAssociation;
function isContactObjectKey(key) {
    if (!key)
        return false;
    const k = key.toLowerCase();
    return k === "contact" || k === "contacts";
}
async function resolveCheckinAssociation(schemaKey) {
    if (cachedCheckinAssociation !== undefined) {
        return cachedCheckinAssociation;
    }
    const configuredId = config_1.env.GHL_CHECKIN_ASSOCIATION_ID?.trim();
    const url = new URL(`${config_1.env.GHL_API_BASE_URL}/associations/objectKey/${encodeURIComponent(schemaKey)}`);
    url.searchParams.set("locationId", config_1.env.GHL_LOCATION_ID);
    const res = await fetch(url.toString(), {
        method: "GET",
        headers: ghlHeaders(),
    });
    if (res.ok) {
        const data = (await res.json());
        const list = Array.isArray(data)
            ? data
            : Array.isArray(data.associations)
                ? data.associations
                : data && typeof data === "object" && "id" in data
                    ? [data]
                    : [];
        const match = list.find((a) => {
            if (configuredId && a.id && a.id !== configuredId)
                return false;
            const first = String(a.firstObjectKey ?? "");
            const second = String(a.secondObjectKey ?? "");
            return ((first === schemaKey && isContactObjectKey(second)) ||
                (second === schemaKey && isContactObjectKey(first)));
        });
        if (match?.id) {
            cachedCheckinAssociation = {
                id: match.id,
                contactIsFirst: isContactObjectKey(String(match.firstObjectKey ?? "")),
            };
            return cachedCheckinAssociation;
        }
    }
    else {
        const text = await res.text();
        console.warn(`[ghl] could not auto-resolve check-in association (${res.status}): ${text}`);
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
async function createGhlCheckinHistoryRecord(ghlContactId, pointsTotal, checkinDate, existingRecordId) {
    const schemaKey = config_1.env.GHL_CHECKIN_OBJECT_KEY?.trim();
    if (!schemaKey)
        return null;
    if (config_1.env.MOCK_INTEGRATIONS) {
        console.log(`[MOCK GHL] create ${schemaKey} record date=${checkinDate} points=${pointsTotal} for contact ${ghlContactId}`);
        return existingRecordId || `mock_checkin_${checkinDate}`;
    }
    const association = await resolveCheckinAssociation(schemaKey);
    if (!association) {
        console.warn("[ghl] skipping check-in history record: set GHL_CHECKIN_ASSOCIATION_ID " +
            "(Settings → Custom Objects → Associations) and ensure the Private Integration " +
            "has objects/record.write + associations/relation.write (+ associations.readonly to auto-resolve).");
        return null;
    }
    let recordId = existingRecordId?.trim() || "";
    if (!recordId) {
        const dateKey = normalizeCustomObjectFieldKey(config_1.env.GHL_CHECKIN_OBJECT_DATE_FIELD_KEY || "checkin_date");
        const pointsKey = normalizeCustomObjectFieldKey(config_1.env.GHL_CHECKIN_OBJECT_POINTS_FIELD_KEY || "points_total");
        const nameKey = normalizeCustomObjectFieldKey(config_1.env.GHL_CHECKIN_OBJECT_NAME_FIELD_KEY || "check_in");
        const properties = {
            [dateKey]: checkinDate,
            [pointsKey]: pointsTotal,
        };
        if (nameKey) {
            // Primary display field on the Check-ins object (required by many GHL schemas).
            properties[nameKey] = `Check-in ${checkinDate}`;
        }
        const createRes = await fetch(`${config_1.env.GHL_API_BASE_URL}/objects/${encodeURIComponent(schemaKey)}/records`, {
            method: "POST",
            headers: ghlHeaders(),
            body: JSON.stringify({
                locationId: config_1.env.GHL_LOCATION_ID,
                properties,
            }),
        });
        if (!createRes.ok) {
            const text = await createRes.text();
            throw new Error(`GHL create check-in record failed (${createRes.status}): ${text}`);
        }
        const created = (await createRes.json());
        recordId = created.record?.id || created.id || "";
        if (!recordId) {
            throw new Error(`GHL create check-in record returned no id: ${JSON.stringify(created)}`);
        }
    }
    const firstRecordId = association.contactIsFirst ? ghlContactId : recordId;
    const secondRecordId = association.contactIsFirst ? recordId : ghlContactId;
    const relRes = await fetch(`${config_1.env.GHL_API_BASE_URL}/associations/relations`, {
        method: "POST",
        headers: ghlHeaders(),
        body: JSON.stringify({
            locationId: config_1.env.GHL_LOCATION_ID,
            associationId: association.id,
            firstRecordId,
            secondRecordId,
        }),
    });
    if (!relRes.ok) {
        const text = await relRes.text();
        // Retry after a successful create often hits "already associated".
        if (relRes.status === 409 ||
            /already|exist|duplicate/i.test(text)) {
            return recordId;
        }
        throw new Error(`GHL associate check-in record failed (${relRes.status}): ${text}`);
    }
    return recordId;
}
async function findGhlContactByPhone(phoneE164) {
    if (config_1.env.MOCK_INTEGRATIONS) {
        console.log(`[MOCK GHL] lookup contact by phone ${phoneE164}`);
        return {
            id: `mock_${phoneE164.replace(/\D/g, "")}`,
            name: "Mock Member",
            firstName: "Mock",
            lastName: "Member",
            phone: phoneE164,
        };
    }
    const url = new URL(`${config_1.env.GHL_API_BASE_URL}/contacts/search/duplicate`);
    url.searchParams.set("locationId", config_1.env.GHL_LOCATION_ID);
    url.searchParams.set("number", phoneE164);
    const dupRes = await fetch(url.toString(), {
        method: "GET",
        headers: ghlHeaders(),
    });
    let contact = null;
    if (dupRes.ok) {
        const text = await dupRes.text();
        try {
            const data = (text ? JSON.parse(text) : {});
            if (data.contact?.id)
                contact = data.contact;
        }
        catch {
            console.warn(`[ghl] duplicate search returned non-JSON for ${phoneE164}: ${text.slice(0, 180)}`);
            contact = await searchGhlContactsByPhone(phoneE164);
        }
    }
    else if (dupRes.status === 404) {
        return null;
    }
    else {
        contact = await searchGhlContactsByPhone(phoneE164);
    }
    if (!contact?.id)
        return null;
    // Duplicate search sometimes omits name fields — hydrate for login name checks.
    if (!contact.firstName && !contact.lastName && !contact.name) {
        const full = await getGhlContactById(contact.id);
        if (full)
            return full;
    }
    return contact;
}
async function getGhlContactById(ghlContactId) {
    const res = await fetch(`${config_1.env.GHL_API_BASE_URL}/contacts/${ghlContactId}`, {
        method: "GET",
        headers: ghlHeaders(),
    });
    if (!res.ok)
        return null;
    const text = await res.text();
    try {
        const data = (text ? JSON.parse(text) : {});
        return data.contact?.id ? data.contact : null;
    }
    catch {
        console.warn(`[ghl] get contact returned non-JSON for ${ghlContactId}: ${text.slice(0, 180)}`);
        return null;
    }
}
/** Cached allowed pipeline ids for this process (resolved by name). */
let cachedResolvedPipelines;
let cachedAllowedPipelineWarn = false;
function splitPipelineNames(raw) {
    return raw
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
}
function allowedPipelineNames() {
    return splitPipelineNames(config_1.env.GHL_ALLOWED_PIPELINE_NAMES);
}
function premiumPipelineNames() {
    return splitPipelineNames(config_1.env.GHL_PREMIUM_PIPELINE_NAMES);
}
async function resolveAllowedPipelines() {
    if (cachedResolvedPipelines !== undefined) {
        return cachedResolvedPipelines;
    }
    const wanted = new Set(allowedPipelineNames());
    const premiumWanted = new Set(premiumPipelineNames());
    if (wanted.size === 0) {
        cachedResolvedPipelines = { premiumIds: [], standardIds: [], allIds: [] };
        return cachedResolvedPipelines;
    }
    const url = new URL(`${config_1.env.GHL_API_BASE_URL}/opportunities/pipelines`);
    url.searchParams.set("locationId", config_1.env.GHL_LOCATION_ID);
    const res = await fetch(url.toString(), {
        method: "GET",
        headers: ghlHeaders(),
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`GHL list pipelines failed (${res.status}): ${text}`);
    }
    const data = (await res.json());
    const premiumIds = [];
    const standardIds = [];
    for (const p of data.pipelines ?? []) {
        if (!p.id || !p.name)
            continue;
        const name = p.name.trim().toLowerCase();
        if (!wanted.has(name))
            continue;
        if (premiumWanted.has(name)) {
            premiumIds.push(p.id);
        }
        else {
            standardIds.push(p.id);
        }
    }
    const allIds = [...premiumIds, ...standardIds];
    if (allIds.length === 0 && !cachedAllowedPipelineWarn) {
        cachedAllowedPipelineWarn = true;
        console.warn(`[ghl] no pipelines matched allowed names [${[...wanted].join(", ")}]. ` +
            `Check GHL_ALLOWED_PIPELINE_NAMES and Private Integration scope opportunities.readonly.`);
    }
    cachedResolvedPipelines = { premiumIds, standardIds, allIds };
    return cachedResolvedPipelines;
}
async function contactHasOpportunityInPipeline(ghlContactId, pipelineId) {
    // Marketplace docs use camelCase; some clients send snake_case — try camel first.
    const attempts = [
        {
            locationId: config_1.env.GHL_LOCATION_ID,
            contactId: ghlContactId,
            pipelineId,
            status: "all",
            limit: "1",
        },
        {
            location_id: config_1.env.GHL_LOCATION_ID,
            contact_id: ghlContactId,
            pipeline_id: pipelineId,
            status: "all",
            limit: "1",
        },
    ];
    let lastError = "";
    for (const params of attempts) {
        const url = new URL(`${config_1.env.GHL_API_BASE_URL}/opportunities/search`);
        for (const [k, v] of Object.entries(params)) {
            url.searchParams.set(k, v);
        }
        const res = await fetch(url.toString(), {
            method: "GET",
            headers: ghlHeaders(),
        });
        if (res.ok) {
            const data = (await res.json());
            return (data.opportunities?.length ?? 0) > 0;
        }
        lastError = await res.text();
        // Retry alternate param style only on 4xx validation-style errors.
        if (res.status < 400 || res.status >= 500) {
            throw new Error(`GHL opportunity search failed (${res.status}): ${lastError}`);
        }
    }
    throw new Error(`GHL opportunity search failed: ${lastError}`);
}
/**
 * Resolve login eligibility + membership tier from GHL opportunity pipelines.
 * Active Member (premium) wins if the contact is also in Car Community.
 */
async function resolveContactMembership(ghlContactId) {
    if (config_1.env.MOCK_INTEGRATIONS) {
        console.log(`[MOCK GHL] pipeline membership check for contact ${ghlContactId} → premium`);
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
async function contactInAllowedPipelines(ghlContactId) {
    return (await resolveContactMembership(ghlContactId)).allowed;
}
function membershipLabel(tier) {
    return tier === "premium" ? "Premium customer" : "Standard customer";
}
async function searchGhlContactsByPhone(phoneE164) {
    const contacts = await searchGhlContacts(phoneE164, 1);
    return contacts[0] ?? null;
}
/**
 * Free-text contact search (name or phone) against GHL directory.
 * Read-only; used by staff scanner lookup.
 */
async function searchGhlContacts(q, limit = 10) {
    const trimmed = q.trim();
    if (!trimmed)
        return [];
    if (config_1.env.MOCK_INTEGRATIONS) {
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
    const url = new URL(`${config_1.env.GHL_API_BASE_URL}/contacts/`);
    url.searchParams.set("locationId", config_1.env.GHL_LOCATION_ID);
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
    let data;
    try {
        data = (text ? JSON.parse(text) : {});
    }
    catch {
        throw new Error(`GHL contact search returned non-JSON (${res.status}): ${text.slice(0, 180)}`);
    }
    return data.contacts ?? [];
}
function parsePointsValue(raw) {
    if (raw == null || raw === "")
        return null;
    const n = typeof raw === "number" ? raw : Number(String(raw).trim());
    if (!Number.isFinite(n) || n < 0)
        return null;
    return Math.floor(n);
}
/** GHL returns custom fields as an array or occasionally as a key→value map. */
function extractCustomFields(contact) {
    const raw = contact.customFields ?? contact.customField;
    if (!raw)
        return [];
    if (Array.isArray(raw))
        return raw;
    if (typeof raw === "object") {
        return Object.entries(raw).map(([key, value]) => ({ key, value }));
    }
    return [];
}
function fieldMatchesPointsConfig(f) {
    const fieldId = config_1.env.GHL_POINTS_FIELD_ID?.trim();
    const fieldKey = normalizePointsFieldKey(config_1.env.GHL_POINTS_FIELD_KEY || "");
    if (fieldId && (f.id === fieldId || f.fieldId === fieldId))
        return true;
    if (!fieldKey)
        return false;
    const candidates = [f.key, f.fieldKey, f.name]
        .filter((k) => Boolean(k))
        .map((k) => normalizePointsFieldKey(k));
    return candidates.some((k) => k === fieldKey ||
        k.endsWith(`.${fieldKey}`) ||
        k.endsWith(`_${fieldKey}`) ||
        k.includes(fieldKey));
}
function fieldValueRaw(f) {
    return f.value ?? f.field_value ?? f.fieldValue;
}
/** Loose fallback: label/key looks like check-in points. */
function fieldLooksLikeCheckinPoints(f) {
    const blob = [f.key, f.fieldKey, f.name, f.id, f.fieldId]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "");
    return (blob.includes("checkinpoint") ||
        blob.includes("checkinpoints") ||
        blob.includes("loyaltypoint") ||
        blob === "points" ||
        blob.endsWith("points"));
}
async function fetchGhlContactRaw(ghlContactId) {
    const res = await fetch(`${config_1.env.GHL_API_BASE_URL}/contacts/${ghlContactId}`, {
        method: "GET",
        headers: ghlHeaders(),
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`GHL get contact failed (${res.status}): ${text}`);
    }
    const data = (await res.json());
    const contact = data.contact ?? {};
    return { contact, fields: extractCustomFields(contact) };
}
/** Walk a contact payload for member_number even if nested oddly. */
function memberNumberFromContactObject(contact) {
    const direct = [
        contact.member_number,
        contact.memberNumber,
        contact.memberNumber,
    ];
    for (const v of direct) {
        const parsed = parseMemberNumberValue(v);
        if (parsed)
            return parsed;
    }
    const stack = [contact];
    const seen = new Set();
    while (stack.length) {
        const cur = stack.pop();
        if (!cur || typeof cur !== "object" || seen.has(cur))
            continue;
        seen.add(cur);
        if (Array.isArray(cur)) {
            for (const item of cur)
                stack.push(item);
            continue;
        }
        for (const [k, v] of Object.entries(cur)) {
            const nk = normalizePointsFieldKey(k);
            if (nk === "member_number" ||
                nk.replace(/[^a-z0-9]+/gi, "").toLowerCase() === "membernumber") {
                const parsed = parseMemberNumberValue(v);
                if (parsed)
                    return parsed;
            }
            if (v && typeof v === "object")
                stack.push(v);
        }
    }
    return null;
}
function knownNonMemberFieldIds() {
    return new Set([
        config_1.env.GHL_POINTS_FIELD_ID?.trim(),
        config_1.env.GHL_CHECKIN_DATE_FIELD_ID?.trim(),
    ].filter((id) => Boolean(id)));
}
/** Value shape typical of cafe member #s (not dates, years, or car models). */
function valueLooksLikeMemberNumber(raw) {
    const parsed = parseMemberNumberValue(raw);
    if (!parsed)
        return false;
    // Dates / timestamps
    if (/^\d{4}-\d{2}-\d{2}/.test(parsed))
        return false;
    if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(parsed))
        return false;
    if (/^\d{10,}$/.test(parsed))
        return false;
    // Car year / model noise (e.g. 1984, 911)
    if (/^(19|20)\d{2}$/.test(parsed))
        return false;
    if (/^(911|928|944|718|992|993|996|997)$/.test(parsed))
        return false;
    // Member #s are usually short codes
    if (parsed.length > 12)
        return false;
    // Prefer mostly alphanumeric / digits
    return /^[A-Za-z0-9_-]+$/.test(parsed);
}
function resolvePointsFromFields(fields) {
    const configured = fields.find(fieldMatchesPointsConfig);
    if (configured) {
        return {
            points: parsePointsValue(fieldValueRaw(configured)),
            matchedBy: config_1.env.GHL_POINTS_FIELD_ID?.trim() ? "id" : "key",
            matched: {
                id: configured.id || configured.fieldId,
                key: configured.key || configured.fieldKey || configured.name,
                value: fieldValueRaw(configured),
            },
        };
    }
    const fallback = fields.find((f) => fieldLooksLikeCheckinPoints(f) && parsePointsValue(fieldValueRaw(f)) != null);
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
function parseMemberNumberValue(raw) {
    if (raw == null)
        return null;
    let s = String(raw).trim();
    if (!s)
        return null;
    // Accept "107", "#107", "Member #107"
    const hash = s.match(/#\s*([A-Za-z0-9_-]+)\s*$/);
    if (hash)
        s = hash[1];
    else
        s = s.replace(/^#\s*/, "");
    s = s.trim();
    return s || null;
}
function memberNumberFieldKey() {
    return normalizePointsFieldKey(config_1.env.GHL_MEMBER_NUMBER_FIELD_KEY || "member_number");
}
function fieldLooksLikeMemberNumber(f) {
    const blob = [f.key, f.fieldKey, f.name]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "");
    return (blob === "membernumber" ||
        blob === "memberno" ||
        blob === "membernum" ||
        blob.includes("membernumber") ||
        blob.includes("memberno"));
}
function fieldMatchesMemberNumberConfig(f, resolvedFieldId) {
    const configuredId = config_1.env.GHL_MEMBER_NUMBER_FIELD_ID?.trim() || resolvedFieldId;
    if (configuredId && (f.id === configuredId || f.fieldId === configuredId)) {
        return true;
    }
    const fieldKey = memberNumberFieldKey();
    if (!fieldKey)
        return false;
    const candidates = [f.key, f.fieldKey, f.name]
        .filter((k) => Boolean(k))
        .map((k) => normalizePointsFieldKey(k));
    return candidates.some((k) => k === fieldKey ||
        k.endsWith(`.${fieldKey}`) ||
        k.endsWith(`_${fieldKey}`));
}
/**
 * GHL contact payloads often only include `{ id, value }` for custom fields.
 * Resolve the real field id for member_number from location field definitions.
 */
let cachedMemberNumberFieldId;
async function resolveMemberNumberFieldId() {
    const configured = config_1.env.GHL_MEMBER_NUMBER_FIELD_ID?.trim();
    if (configured)
        return configured;
    if (cachedMemberNumberFieldId !== undefined)
        return cachedMemberNumberFieldId;
    const fieldKey = memberNumberFieldKey();
    if (!fieldKey || !config_1.env.GHL_LOCATION_ID) {
        cachedMemberNumberFieldId = null;
        return null;
    }
    try {
        const url = `${config_1.env.GHL_API_BASE_URL}/locations/${encodeURIComponent(config_1.env.GHL_LOCATION_ID)}/customFields`;
        const res = await fetch(url, { method: "GET", headers: ghlHeaders() });
        if (!res.ok) {
            const text = await res.text();
            console.warn(`[ghl] could not list custom fields for member_number (${res.status}): ${text.slice(0, 180)}`);
            cachedMemberNumberFieldId = null;
            return null;
        }
        const data = (await res.json());
        const list = Array.isArray(data.customFields) ? data.customFields : [];
        const match = list.find((f) => {
            const candidates = [f.fieldKey, f.key, f.name]
                .filter((k) => Boolean(k))
                .map((k) => normalizePointsFieldKey(k));
            return candidates.some((k) => k === fieldKey ||
                k.endsWith(`.${fieldKey}`) ||
                k.endsWith(`_${fieldKey}`) ||
                k.replace(/[^a-z0-9]+/gi, "").toLowerCase() === "membernumber");
        });
        cachedMemberNumberFieldId = match?.id || null;
        if (cachedMemberNumberFieldId) {
            console.log(`[ghl] resolved member_number field id=${cachedMemberNumberFieldId}`);
        }
        else {
            console.warn(`[ghl] no custom field matched key=${fieldKey} among ${list.length} definitions`);
        }
        return cachedMemberNumberFieldId;
    }
    catch (err) {
        console.warn("[ghl] member_number field id resolve failed", err);
        cachedMemberNumberFieldId = null;
        return null;
    }
}
async function resolveMemberNumberFromFields(fields, contact) {
    const resolvedId = await resolveMemberNumberFieldId();
    const configured = fields.find((f) => fieldMatchesMemberNumberConfig(f, resolvedId));
    if (configured) {
        const memberNumber = parseMemberNumberValue(fieldValueRaw(configured));
        if (memberNumber) {
            return {
                memberNumber,
                matchedBy: config_1.env.GHL_MEMBER_NUMBER_FIELD_ID?.trim() || resolvedId ? "id" : "key",
                matched: {
                    id: configured.id || configured.fieldId,
                    key: configured.key || configured.fieldKey || configured.name,
                    value: fieldValueRaw(configured),
                },
            };
        }
    }
    const fallback = fields.find((f) => fieldLooksLikeMemberNumber(f) &&
        parseMemberNumberValue(fieldValueRaw(f)) != null);
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
        .filter((c) => c.parsed &&
        valueLooksLikeMemberNumber(c.value) &&
        (!c.id || !skipIds.has(c.id)) &&
        !fieldMatchesPointsConfig(c.f) &&
        !fieldLooksLikeCheckinPoints(c.f));
    if (candidates.length === 1) {
        const only = candidates[0];
        if (only.id)
            cachedMemberNumberFieldId = only.id;
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
        if (only.id)
            cachedMemberNumberFieldId = only.id;
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
        const byCached = fields.find((f) => f.id === cachedMemberNumberFieldId || f.fieldId === cachedMemberNumberFieldId);
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
async function getGhlContactAppFields(ghlContactId) {
    if (config_1.env.MOCK_INTEGRATIONS) {
        return { points: null, memberNumber: null };
    }
    const { contact, fields } = await fetchGhlContactRaw(ghlContactId);
    const resolved = resolvePointsFromFields(fields);
    const member = await resolveMemberNumberFromFields(fields, contact);
    if (resolved.points == null) {
        if (fields.length > 0) {
            console.warn(`[ghl] points field not matched for contact ${ghlContactId}; ` +
                `have ${fields.length} custom fields, ` +
                `looking for id=${config_1.env.GHL_POINTS_FIELD_ID || "(none)"} ` +
                `key=${config_1.env.GHL_POINTS_FIELD_KEY || "(none)"}`);
        }
        else {
            console.warn(`[ghl] contact ${ghlContactId} returned 0 custom fields for points lookup`);
        }
    }
    else if (resolved.matchedBy === "fallback") {
        console.warn(`[ghl] points matched via fallback for ${ghlContactId}:`, resolved.matched);
    }
    if (member.memberNumber == null && fields.length > 0) {
        console.warn(`[ghl] member_number not matched for contact ${ghlContactId}; ` +
            `looking for id=${config_1.env.GHL_MEMBER_NUMBER_FIELD_ID || "(auto)"} ` +
            `key=${memberNumberFieldKey()}; ` +
            `sample=${JSON.stringify(fields.slice(0, 12).map((f) => ({
                id: f.id || f.fieldId || null,
                key: f.key || f.fieldKey || f.name || null,
                value: fieldValueRaw(f) ?? null,
            })))}`);
    }
    else if (member.matchedBy === "fallback") {
        console.warn(`[ghl] member_number matched via fallback for ${ghlContactId}:`, member.matched);
    }
    return {
        points: resolved.points,
        memberNumber: member.memberNumber,
    };
}
async function getGhlPointsTotal(ghlContactId) {
    const { points } = await getGhlContactAppFields(ghlContactId);
    return points;
}
async function getGhlMemberNumber(ghlContactId) {
    const { memberNumber } = await getGhlContactAppFields(ghlContactId);
    return memberNumber;
}
/** Temporary diagnostics for contacts where live points / member # fail to sync. */
async function inspectGhlPoints(ghlContactId) {
    if (config_1.env.MOCK_INTEGRATIONS) {
        return { mock: true, points: null, memberNumber: null };
    }
    const { contact, fields } = await fetchGhlContactRaw(ghlContactId);
    const resolved = resolvePointsFromFields(fields);
    const member = await resolveMemberNumberFromFields(fields, contact);
    const resolvedMemberFieldId = await resolveMemberNumberFieldId();
    return {
        configuredFieldId: config_1.env.GHL_POINTS_FIELD_ID || null,
        configuredFieldKey: config_1.env.GHL_POINTS_FIELD_KEY || null,
        memberNumberFieldId: config_1.env.GHL_MEMBER_NUMBER_FIELD_ID?.trim() ||
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
async function updateGhlCheckinProfile(ghlContactId, pointsTotal, checkinDate) {
    if (config_1.env.MOCK_INTEGRATIONS) {
        console.log(`[MOCK GHL] set points=${pointsTotal} checkin_date=${checkinDate} on contact ${ghlContactId}`);
        return;
    }
    if (!config_1.env.GHL_POINTS_FIELD_KEY && !config_1.env.GHL_POINTS_FIELD_ID) {
        throw new Error("GHL_POINTS_FIELD_KEY or GHL_POINTS_FIELD_ID is required");
    }
    // Never lower the CRM score if local/outbox is behind (e.g. local was 0).
    let safeTotal = pointsTotal;
    try {
        const live = await getGhlPointsTotal(ghlContactId);
        if (live != null && live > safeTotal) {
            console.warn(`[ghl] keeping live points ${live} instead of writing lower ${pointsTotal} for ${ghlContactId}`);
            safeTotal = live;
        }
    }
    catch (err) {
        console.warn(`[ghl] could not re-read live points before write for ${ghlContactId}; writing ${pointsTotal}`, err);
    }
    const customFields = [];
    if (config_1.env.GHL_POINTS_FIELD_ID) {
        customFields.push({
            id: config_1.env.GHL_POINTS_FIELD_ID,
            field_value: safeTotal,
        });
    }
    else {
        customFields.push({
            key: normalizePointsFieldKey(config_1.env.GHL_POINTS_FIELD_KEY),
            field_value: safeTotal,
        });
    }
    const dateKey = normalizePointsFieldKey(config_1.env.GHL_CHECKIN_DATE_FIELD_KEY || "");
    if (config_1.env.GHL_CHECKIN_DATE_FIELD_ID) {
        customFields.push({
            id: config_1.env.GHL_CHECKIN_DATE_FIELD_ID,
            field_value: checkinDate,
        });
    }
    else if (dateKey) {
        customFields.push({
            key: dateKey,
            field_value: checkinDate,
        });
    }
    const res = await fetch(`${config_1.env.GHL_API_BASE_URL}/contacts/${ghlContactId}`, {
        method: "PUT",
        headers: ghlHeaders(),
        body: JSON.stringify({ customFields }),
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`GHL update check-in profile failed (${res.status}): ${text}`);
    }
}
async function updateGhlPointsTotal(ghlContactId, pointsTotal) {
    await updateGhlCheckinProfile(ghlContactId, pointsTotal, (0, dates_1.calendarDateInShopTz)());
}
async function addGhlCheckinNote(ghlContactId, pointsTotal, checkinDate) {
    const date = checkinDate || (0, dates_1.calendarDateInShopTz)();
    const timestamp = new Date().toISOString();
    const body = `Loyalty check-in — +1 point (total: ${pointsTotal}) — ${date} (${timestamp})`;
    if (config_1.env.MOCK_INTEGRATIONS) {
        console.log(`[MOCK GHL] note on ${ghlContactId}: ${body}`);
        return;
    }
    const res = await fetch(`${config_1.env.GHL_API_BASE_URL}/contacts/${ghlContactId}/notes`, {
        method: "POST",
        headers: ghlHeaders(),
        body: JSON.stringify({ body }),
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`GHL add note failed (${res.status}): ${text}`);
    }
}
//# sourceMappingURL=ghl.js.map