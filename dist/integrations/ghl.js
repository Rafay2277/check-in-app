"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizePointsFieldKey = normalizePointsFieldKey;
exports.findGhlContactByPhone = findGhlContactByPhone;
exports.searchGhlContacts = searchGhlContacts;
exports.updateGhlPointsTotal = updateGhlPointsTotal;
exports.addGhlCheckinNote = addGhlCheckinNote;
const config_1 = require("../config");
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
async function findGhlContactByPhone(phoneE164) {
    if (config_1.env.MOCK_INTEGRATIONS) {
        console.log(`[MOCK GHL] lookup contact by phone ${phoneE164}`);
        return {
            id: `mock_${phoneE164.replace(/\D/g, "")}`,
            name: "Mock Member",
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
    if (dupRes.ok) {
        const data = (await dupRes.json());
        if (data.contact?.id)
            return data.contact;
    }
    if (dupRes.status === 404) {
        return null;
    }
    // Fallback: contacts list query
    return searchGhlContactsByPhone(phoneE164);
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
    const data = (await res.json());
    return data.contacts ?? [];
}
async function updateGhlPointsTotal(ghlContactId, pointsTotal) {
    if (config_1.env.MOCK_INTEGRATIONS) {
        console.log(`[MOCK GHL] set points=${pointsTotal} on contact ${ghlContactId} field=${config_1.env.GHL_POINTS_FIELD_KEY || "(unset)"}`);
        return;
    }
    if (!config_1.env.GHL_POINTS_FIELD_KEY && !config_1.env.GHL_POINTS_FIELD_ID) {
        throw new Error("GHL_POINTS_FIELD_KEY or GHL_POINTS_FIELD_ID is required");
    }
    const customField = config_1.env.GHL_POINTS_FIELD_ID
        ? { id: config_1.env.GHL_POINTS_FIELD_ID, field_value: pointsTotal }
        : {
            key: normalizePointsFieldKey(config_1.env.GHL_POINTS_FIELD_KEY),
            field_value: pointsTotal,
        };
    const res = await fetch(`${config_1.env.GHL_API_BASE_URL}/contacts/${ghlContactId}`, {
        method: "PUT",
        headers: ghlHeaders(),
        body: JSON.stringify({
            customFields: [customField],
        }),
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`GHL update points failed (${res.status}): ${text}`);
    }
}
async function addGhlCheckinNote(ghlContactId, pointsTotal) {
    const timestamp = new Date().toISOString();
    const body = `Loyalty check-in — +1 point (total: ${pointsTotal}) — ${timestamp}`;
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