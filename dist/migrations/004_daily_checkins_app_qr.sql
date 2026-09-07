-- Allow daily_checkins to record both permanent cards and app QR check-ins.
-- One row per member per calendar day (UNIQUE already on member_id + checkin_date).

ALTER TABLE daily_checkins
  ALTER COLUMN permanent_token_id DROP NOT NULL;

ALTER TABLE daily_checkins
  ADD COLUMN IF NOT EXISTS checkin_token_id UUID REFERENCES checkin_tokens(id);
