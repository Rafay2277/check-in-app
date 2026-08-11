/**
 * Look up GHL contacts by full name for permanent-card generation.
 * Prints JSON report: clean | ambiguous | missing
 */
const NAMES = [
  "Joshua Lesavoy",
  "Matthew Leberer",
  "Mikey Brown",
  "Bryan Cole",
  "Keith Kanemoto",
  "Christopher Stickland",
  "Troy Hawks",
  "Kent Kirimli",
  "Aleksandar Djuric",
  "Alexandra Sczudlo",
  "Hyer Solomon",
  "Ravinder Sandhu",
  "Trevor Smith",
  "Steve Metsovas",
  "Karol Clark",
  "William Whittington",
  "Ian Bass",
  "David Molesworth",
  "Eric Schaefer",
  "Michael Carpenter",
  "Gideon Hod",
  "Ryan O'Shea",
  "Michael Harley",
  "Brent Coleman",
  "Robert Guerena",
  "Alex Singer",
];

const GHL_API_BASE_URL =
  process.env.GHL_API_BASE_URL || "https://services.leadconnectorhq.com";
const GHL_ACCESS_TOKEN =
  process.env.GHL_ACCESS_TOKEN || "pit-a0fd1440-d7c2-4225-90a9-663611497330";
const GHL_LOCATION_ID =
  process.env.GHL_LOCATION_ID || "yHs4RFTv6UhefdKgZfgM";

function normalizeName(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[''`]/g, "'")
    .replace(/[^a-z0-9'\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function contactDisplayName(c) {
  if (c.name && String(c.name).trim()) return String(c.name).trim();
  return [c.firstName, c.lastName].filter(Boolean).join(" ").trim();
}

function isExactNameMatch(wanted, contact) {
  const w = normalizeName(wanted);
  const n = normalizeName(contactDisplayName(contact));
  if (w === n) return true;
  const fromParts = normalizeName(
    [contact.firstName, contact.lastName].filter(Boolean).join(" ")
  );
  return Boolean(fromParts) && w === fromParts;
}

async function searchGhl(q) {
  const url = new URL(`${GHL_API_BASE_URL}/contacts/`);
  url.searchParams.set("locationId", GHL_LOCATION_ID);
  url.searchParams.set("query", q);
  url.searchParams.set("limit", "20");

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${GHL_ACCESS_TOKEN}`,
      Version: "2021-07-28",
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GHL search failed (${res.status}): ${text}`);
  }
  const data = await res.json();
  return data.contacts || [];
}

async function main() {
  const clean = [];
  const ambiguous = [];
  const missing = [];

  for (const name of NAMES) {
    process.stdout.write(`lookup: ${name}… `);
    let contacts;
    try {
      contacts = await searchGhl(name);
    } catch (err) {
      console.log("ERROR");
      ambiguous.push({
        name,
        reason: "ghl_error",
        detail: err instanceof Error ? err.message : String(err),
      });
      continue;
    }

    const exact = contacts.filter((c) => isExactNameMatch(name, c));
    if (exact.length === 1) {
      const c = exact[0];
      console.log("CLEAN");
      clean.push({
        name,
        ghlContactId: c.id,
        phone: c.phone || c.phoneE164 || null,
        ghlName: contactDisplayName(c),
      });
    } else if (exact.length > 1) {
      console.log(`AMBIGUOUS (${exact.length} exact)`);
      ambiguous.push({
        name,
        reason: "multiple_exact",
        candidates: exact.map((c) => ({
          id: c.id,
          name: contactDisplayName(c),
          phone: c.phone || null,
        })),
      });
    } else if (contacts.length === 0) {
      console.log("MISSING");
      missing.push({ name, reason: "no_results" });
    } else {
      console.log(`AMBIGUOUS (no exact among ${contacts.length})`);
      ambiguous.push({
        name,
        reason: "no_exact_match",
        candidates: contacts.slice(0, 8).map((c) => ({
          id: c.id,
          name: contactDisplayName(c),
          phone: c.phone || null,
        })),
      });
    }

    // gentle rate limit
    await new Promise((r) => setTimeout(r, 250));
  }

  const report = { clean, ambiguous, missing };
  const outPath = require("path").join(
    __dirname,
    "..",
    "tmp",
    "ghl-member-lookup.json"
  );
  require("fs").mkdirSync(require("path").dirname(outPath), { recursive: true });
  require("fs").writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log("\n=== SUMMARY ===");
  console.log(`clean: ${clean.length}`);
  console.log(`ambiguous: ${ambiguous.length}`);
  console.log(`missing: ${missing.length}`);
  console.log(`wrote ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
