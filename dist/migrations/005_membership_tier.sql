-- Membership tier from GHL pipelines:
-- Active Member → premium (Flying 4)
-- Car Community → standard (Circle 4)
-- Both → premium

CREATE TYPE membership_tier AS ENUM ('premium', 'standard');

ALTER TABLE members
  ADD COLUMN IF NOT EXISTS membership_tier membership_tier NOT NULL DEFAULT 'standard';
