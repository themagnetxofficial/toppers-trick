-- ============================================================
-- ToppersTrick — Full Database Schema
-- Run this in Supabase → SQL Editor → New Query → Run
-- ============================================================

-- 1. users
CREATE TABLE IF NOT EXISTS "users" (
  "id"            SERIAL PRIMARY KEY,
  "clerk_user_id" TEXT NOT NULL UNIQUE,
  "name"          TEXT,
  "email"         TEXT,
  "is_admin"      BOOLEAN NOT NULL DEFAULT FALSE,
  "is_suspended"  BOOLEAN NOT NULL DEFAULT FALSE,
  "created_at"    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. credits  (legacy per-user credit counter — kept for compatibility)
CREATE TABLE IF NOT EXISTS "credits" (
  "id"                  SERIAL PRIMARY KEY,
  "user_id"             INTEGER NOT NULL REFERENCES "users"("id"),
  "credits_remaining"   INTEGER NOT NULL DEFAULT 2,
  "total_purchased"     INTEGER NOT NULL DEFAULT 0,
  "free_credit_used"    BOOLEAN NOT NULL DEFAULT FALSE,
  "updated_at"          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. analyses
CREATE TABLE IF NOT EXISTS "analyses" (
  "id"                 SERIAL PRIMARY KEY,
  "user_id"            INTEGER NOT NULL REFERENCES "users"("id"),
  "category"           TEXT NOT NULL,               -- 'school' | 'college'
  "class_or_course"    TEXT,
  "board_or_university" TEXT,
  "subject"            TEXT NOT NULL,
  "years_analyzed"     INTEGER,
  "status"             TEXT NOT NULL DEFAULT 'pending', -- pending | processing | completed | failed
  "processing_stage"   TEXT,                            -- text_extraction | ai_analysis | pdf_generation
  "processing_current" INTEGER,
  "processing_total"   INTEGER,
  "error_message"      TEXT,
  "credits_charged"    INTEGER NOT NULL DEFAULT 1,
  "degraded"           BOOLEAN NOT NULL DEFAULT FALSE,
  "quality_issues"     JSONB NOT NULL DEFAULT '[]'::jsonb,
  "ai_response_json"   JSONB,
  "pdf_file_path"      TEXT,
  "input_file_paths"   JSONB,
  "created_at"         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. payments
CREATE TABLE IF NOT EXISTS "payments" (
  "id"                   SERIAL PRIMARY KEY,
  "user_id"              INTEGER NOT NULL REFERENCES "users"("id"),
  "amount"               INTEGER NOT NULL,           -- in paise (₹89 = 8900)
  "razorpay_order_id"    TEXT,
  "razorpay_payment_id"  TEXT,
  "package_name"         TEXT,                       -- 'starter' | 'value'
  "status"               TEXT NOT NULL DEFAULT 'pending', -- pending | success | failed
  "created_at"           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. credit_batches  (FIFO expiry-aware credit tracking)
CREATE TABLE IF NOT EXISTS "credit_batches" (
  "id"                SERIAL PRIMARY KEY,
  "user_id"           INTEGER NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "credits_total"     INTEGER NOT NULL,
  "credits_remaining" INTEGER NOT NULL,
  "is_paid"           BOOLEAN NOT NULL DEFAULT FALSE,
  "purchased_at"      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "expires_at"        TIMESTAMPTZ,                   -- NULL = never expires (free credits)
  "payment_id"        INTEGER                        -- optional FK to payments.id
);

-- 6. token_usage_logs
CREATE TABLE IF NOT EXISTS "token_usage_logs" (
  "id"              SERIAL PRIMARY KEY,
  "analysis_id"     INTEGER NOT NULL REFERENCES "analyses"("id"),
  "input_tokens"    INTEGER NOT NULL DEFAULT 0,
  "output_tokens"   INTEGER NOT NULL DEFAULT 0,
  "estimated_cost"  TEXT,
  "created_at"      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. blog_posts
CREATE TABLE IF NOT EXISTS "blog_posts" (
  "id"                SERIAL PRIMARY KEY,
  "slug"              TEXT NOT NULL UNIQUE,
  "title"             TEXT NOT NULL,
  "excerpt"           TEXT,
  "content"           TEXT,                          -- HTML from TipTap
  "featured_image_url" TEXT,
  "category"          TEXT,
  "meta_title"        TEXT,
  "meta_description"  TEXT,
  "status"            TEXT NOT NULL DEFAULT 'draft', -- draft | published
  "published_at"      TIMESTAMPTZ,
  "created_at"        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at"        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. contact_submissions
CREATE TABLE IF NOT EXISTS "contact_submissions" (
  "id"         SERIAL PRIMARY KEY,
  "name"       TEXT NOT NULL,
  "email"      TEXT NOT NULL,
  "subject"    TEXT NOT NULL,
  "message"    TEXT NOT NULL,
  "status"     TEXT NOT NULL DEFAULT 'pending',      -- pending | resolved
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- Verify: list all created tables
-- ============================================================
SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;
