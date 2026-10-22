-- Cafe member number from GHL contact custom field {{contact.member_number}}
ALTER TABLE members
  ADD COLUMN IF NOT EXISTS member_number TEXT;
