-- Initial schema for member loyalty check-in
-- Run via: npm run migrate (apps/api)

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS members (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  phone_number  TEXT NOT NULL UNIQUE,
  ghl_contact_id TEXT NOT NULL,
  points_total  INTEGER NOT NULL DEFAULT 0 CHECK (points_total >= 0),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_members_phone ON members (phone_number);
CREATE INDEX IF NOT EXISTS idx_members_ghl_contact ON members (ghl_contact_id);

CREATE TABLE IF NOT EXISTS otp_challenges (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number    TEXT NOT NULL,
  name            TEXT NOT NULL,
  ghl_contact_id  TEXT NOT NULL,
  code_hash       TEXT NOT NULL,
  attempts        INTEGER NOT NULL DEFAULT 0,
  max_attempts    INTEGER NOT NULL DEFAULT 5,
  expires_at      TIMESTAMPTZ NOT NULL,
  resend_available_at TIMESTAMPTZ NOT NULL,
  consumed_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_otp_phone_active
  ON otp_challenges (phone_number, created_at DESC)
  WHERE consumed_at IS NULL;

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id       UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  token_hash      TEXT NOT NULL UNIQUE,
  expires_at      TIMESTAMPTZ NOT NULL,
  revoked_at      TIMESTAMPTZ,
  replaced_by_id  UUID REFERENCES refresh_tokens(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_member
  ON refresh_tokens (member_id)
  WHERE revoked_at IS NULL;

CREATE TYPE checkin_token_status AS ENUM ('unused', 'used', 'expired');

CREATE TABLE IF NOT EXISTS checkin_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token       UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  member_id   UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  status      checkin_token_status NOT NULL DEFAULT 'unused',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  used_at     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_checkin_tokens_member_created
  ON checkin_tokens (member_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_checkin_tokens_unused_created
  ON checkin_tokens (created_at)
  WHERE status = 'unused';

CREATE TYPE outbox_task_type AS ENUM ('award_ghl_point');
CREATE TYPE outbox_task_status AS ENUM ('pending', 'done', 'failed');

CREATE TABLE IF NOT EXISTS outbox_tasks (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type          outbox_task_type NOT NULL,
  payload       JSONB NOT NULL,
  status        outbox_task_status NOT NULL DEFAULT 'pending',
  attempts      INTEGER NOT NULL DEFAULT 0,
  last_error    TEXT,
  dedupe_key    TEXT UNIQUE,
  available_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_outbox_pending
  ON outbox_tasks (available_at, created_at)
  WHERE status = 'pending';
