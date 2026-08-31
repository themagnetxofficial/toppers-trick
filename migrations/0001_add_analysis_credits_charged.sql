-- Record the page-based charge for every analysis.
-- Safe to run against existing installations and legacy analysis rows.
ALTER TABLE "analyses"
  ADD COLUMN IF NOT EXISTS "credits_charged" INTEGER NOT NULL DEFAULT 1;