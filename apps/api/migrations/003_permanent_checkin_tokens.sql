-- Permanent check-in cards (testing phase) — coexist with rotating checkin_tokens.
-- One active permanent token per member; reusable until deactivated.
-- Daily limit: one successful check-in per member per calendar day (see daily_checkins).

CREATE TABLE IF NOT EXISTS permanent_checkin_tokens (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token            UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  member_id        UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  label            TEXT,
  active           BOOLEAN NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deactivated_at   TIMESTAMPTZ
);

-- At most one *active* permanent card per member
CREATE UNIQUE INDEX IF NOT EXISTS idx_permanent_tokens_one_active_per_member
  ON permanent_checkin_tokens (member_id)
  WHERE active = TRUE;

CREATE INDEX IF NOT EXISTS idx_permanent_tokens_token_active
  ON permanent_checkin_tokens (token)
  WHERE active = TRUE;

CREATE TABLE IF NOT EXISTS daily_checkins (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id              UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  checkin_date           DATE NOT NULL,
  permanent_token_id     UUID NOT NULL REFERENCES permanent_checkin_tokens(id),
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (member_id, checkin_date)
);

CREATE INDEX IF NOT EXISTS idx_daily_checkins_date
  ON daily_checkins (checkin_date DESC);
