import path from "path";
import { z } from "zod";
import { loadEnvFiles } from "./loadEnv";

loadEnvFiles();

/**
 * Hostinger often fails to persist DATABASE_URL (reserved/stripped on apply).
 * Resolution order:
 * 1) DATABASE_URL / POSTGRES_URL / SUPABASE_DB_URL
 * 2) DB_USER + DB_PASSWORD + DB_HOST (+ DB_PORT/DB_NAME)
 */
function resolveDatabaseUrl(): string | undefined {
  const direct =
    process.env.DATABASE_URL?.trim() ||
    process.env.POSTGRES_URL?.trim() ||
    process.env.SUPABASE_DB_URL?.trim();
  if (direct) return direct;

  const user = process.env.DB_USER?.trim();
  const password = process.env.DB_PASSWORD ?? "";
  const host = process.env.DB_HOST?.trim();
  const port = process.env.DB_PORT?.trim() || "5432";
  const name = process.env.DB_NAME?.trim() || "postgres";

  if (!user || !host) {
    console.error(
      "[env] DB missing. Have DB_USER=%s DB_HOST=%s DB_PASSWORD=%s (from panel or private/checkin.env)",
      user ? "yes" : "no",
      host ? "yes" : "no",
      process.env.DB_PASSWORD ? "yes" : "no"
    );
    return undefined;
  }

  const encUser = encodeURIComponent(user);
  const encPass = encodeURIComponent(password);
  return `postgresql://${encUser}:${encPass}@${host}:${port}/${name}`;
}

// Normalize before Zod so either DATABASE_URL or DB_* parts work
const resolvedDbUrl = resolveDatabaseUrl();
if (resolvedDbUrl) {
  process.env.DATABASE_URL = resolvedDbUrl;
}

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(3000),
  HTTPS_PORT: z.coerce.number().default(3443),
  PUBLIC_BASE_URL: z.string().default("http://localhost:3000"),
  PUBLIC_HTTPS_BASE_URL: z.string().optional().default(""),
  DATABASE_URL: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().default(900),
  REFRESH_TOKEN_TTL_SECONDS: z.coerce.number().default(2_592_000),
  STAFF_PIN: z.string().min(4),
  STAFF_SESSION_TTL_SECONDS: z.coerce.number().default(43_200),
  DEFAULT_PHONE_COUNTRY: z.string().default("US"),
  // V1 demo: skip Twilio SMS and issue session after GHL contact match
  SKIP_SMS_OTP: z
    .string()
    .optional()
    .transform((v) => v !== "false" && v !== "0"),
  MOCK_INTEGRATIONS: z
    .string()
    .optional()
    .transform((v) => v === "true" || v === "1"),
  TWILIO_ACCOUNT_SID: z.string().optional().default(""),
  TWILIO_AUTH_TOKEN: z.string().optional().default(""),
  TWILIO_FROM_NUMBER: z.string().optional().default(""),
  GHL_API_BASE_URL: z.string().default("https://services.leadconnectorhq.com"),
  GHL_ACCESS_TOKEN: z.string().optional().default(""),
  GHL_LOCATION_ID: z.string().optional().default(""),
  GHL_POINTS_FIELD_KEY: z.string().optional().default(""),
  GHL_POINTS_FIELD_ID: z.string().optional().default(""),
  OUTBOX_POLL_INTERVAL_MS: z.coerce.number().default(3000),
  OUTBOX_MAX_ATTEMPTS: z.coerce.number().default(8),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment configuration:", parsed.error.flatten().fieldErrors);
  console.error(
    "Tip: If Hostinger won't save DATABASE_URL, set DB_USER, DB_PASSWORD, DB_HOST, DB_PORT, DB_NAME instead."
  );
  process.exit(1);
}

export const env = {
  ...parsed.data,
  SKIP_SMS_OTP: parsed.data.SKIP_SMS_OTP ?? true,
  MOCK_INTEGRATIONS: parsed.data.MOCK_INTEGRATIONS ?? true,
};

export function assertLiveIntegrationsConfigured(): void {
  if (env.MOCK_INTEGRATIONS) return;

  const missing: string[] = [];
  if (!env.SKIP_SMS_OTP) {
    if (!env.TWILIO_ACCOUNT_SID) missing.push("TWILIO_ACCOUNT_SID");
    if (!env.TWILIO_AUTH_TOKEN) missing.push("TWILIO_AUTH_TOKEN");
    if (!env.TWILIO_FROM_NUMBER) missing.push("TWILIO_FROM_NUMBER");
  }
  if (!env.GHL_ACCESS_TOKEN) missing.push("GHL_ACCESS_TOKEN");
  if (!env.GHL_LOCATION_ID) missing.push("GHL_LOCATION_ID");
  if (!env.GHL_POINTS_FIELD_KEY && !env.GHL_POINTS_FIELD_ID) {
    missing.push("GHL_POINTS_FIELD_KEY or GHL_POINTS_FIELD_ID");
  }

  if (missing.length > 0) {
    throw new Error(
      `MOCK_INTEGRATIONS=false but missing required env: ${missing.join(", ")}`
    );
  }
}
