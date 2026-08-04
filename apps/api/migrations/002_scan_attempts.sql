-- Optional scan attempt log for rejected/invalid staff scans (analytics only).
-- Does not participate in token CAS / fulfillment.

CREATE TABLE IF NOT EXISTS scan_attempts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  result      TEXT NOT NULL CHECK (result IN ('approved', 'rejected')),
  reason      TEXT,
  token       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scan_attempts_created
  ON scan_attempts (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_scan_attempts_result_created
  ON scan_attempts (result, created_at DESC);
