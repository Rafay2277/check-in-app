/**
 * Mint permanent tokens for clean GHL matches and write labeled QR PNGs.
 * Skips names listed in --skip or absent from tmp/ghl-member-lookup.json clean list.
 */
const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");
const QRCode = require("qrcode");

const ROOT = path.join(__dirname, "..");
const LOOKUP = path.join(ROOT, "tmp", "ghl-member-lookup.json");
const OUT_DIR = path.join(ROOT, "tmp", "permanent-qr-cards");

function resolveDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const user = process.env.DB_USER;
  const password = process.env.DB_PASSWORD ?? "";
  const host = process.env.DB_HOST;
  const port = process.env.DB_PORT || "5432";
  const name = process.env.DB_NAME || "postgres";
  if (user && host) {
    return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${name}`;
  }
  throw new Error(
    "Set DATABASE_URL or DB_USER/DB_PASSWORD/DB_HOST (and optionally DB_PORT/DB_NAME)"
  );
}

function safeFilename(name) {
  return String(name)
    .replace(/[\/\\?%*:|"<>]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

async function upsertMember(client, { name, phone, ghlContactId }) {
  const { rows } = await client.query(
    `INSERT INTO members (name, phone_number, ghl_contact_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (phone_number) DO UPDATE
       SET name = EXCLUDED.name,
           ghl_contact_id = EXCLUDED.ghl_contact_id,
           updated_at = NOW()
     RETURNING id, name, phone_number, points_total`,
    [name, phone, ghlContactId]
  );
  return rows[0];
}

async function ensurePermanentToken(client, memberId, label) {
  const { rows: existing } = await client.query(
    `SELECT id, token::text AS token, active
     FROM permanent_checkin_tokens
     WHERE member_id = $1 AND active = TRUE
     LIMIT 1`,
    [memberId]
  );
  if (existing[0]) return existing[0];

  const { rows } = await client.query(
    `INSERT INTO permanent_checkin_tokens (member_id, label, active)
     VALUES ($1, $2, TRUE)
     RETURNING id, token::text AS token, active`,
    [memberId, label]
  );
  return rows[0];
}

async function main() {
  const report = JSON.parse(fs.readFileSync(LOOKUP, "utf8"));
  const clean = report.clean || [];
  if (!clean.length) {
    console.error("No clean matches in lookup report");
    process.exit(1);
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const pool = new Pool({
    connectionString: resolveDatabaseUrl(),
    ssl: { rejectUnauthorized: false },
  });

  const minted = [];
  const client = await pool.connect();
  try {
    for (const row of clean) {
      if (!row.phone) {
        console.warn("SKIP (no phone):", row.name);
        continue;
      }
      await client.query("BEGIN");
      try {
        const member = await upsertMember(client, {
          name: row.name,
          phone: row.phone,
          ghlContactId: row.ghlContactId,
        });
        const tokenRow = await ensurePermanentToken(
          client,
          member.id,
          row.name
        );
        await client.query("COMMIT");

        const file = path.join(OUT_DIR, `${safeFilename(row.name)}.png`);
        await QRCode.toFile(file, tokenRow.token, {
          type: "png",
          width: 512,
          margin: 2,
          errorCorrectionLevel: "M",
        });

        // sidecar label text for printing
        fs.writeFileSync(
          path.join(OUT_DIR, `${safeFilename(row.name)}.txt`),
          [
            `Name: ${row.name}`,
            `GHL: ${row.ghlContactId}`,
            `Phone: ${row.phone}`,
            `Token: ${tokenRow.token}`,
            `Member ID: ${member.id}`,
          ].join("\n") + "\n"
        );

        minted.push({ name: row.name, file, token: tokenRow.token });
        console.log("OK", row.name, "→", path.basename(file));
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      }
    }
  } finally {
    client.release();
    await pool.end();
  }

  const manifest = path.join(OUT_DIR, "manifest.json");
  fs.writeFileSync(
    manifest,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        count: minted.length,
        skippedMissing: (report.missing || []).map((m) => m.name),
        skippedAmbiguous: (report.ambiguous || []).map((m) => m.name),
        cards: minted,
      },
      null,
      2
    )
  );
  console.log(`\nMinted ${minted.length} cards → ${OUT_DIR}`);
  console.log(`Manifest: ${manifest}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
