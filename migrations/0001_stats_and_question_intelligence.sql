-- ── Migration: Drop legacy tables, add user stats, extend questions ──────────
-- Run this once against your Postgres database.
-- Safe to re-run: all statements use IF NOT EXISTS / IF EXISTS guards.

-- ── PART 1: Drop tables with FK dependencies first ───────────────────────────

DROP TABLE IF EXISTS "round_answers";
DROP TABLE IF EXISTS "game_rounds";
DROP TABLE IF EXISTS "player_seen_questions";

-- ── PART 2: Create user aggregate stats tables ────────────────────────────────

CREATE TABLE IF NOT EXISTS "user_stats" (
  "user_id"        uuid    PRIMARY KEY REFERENCES "users"("id") ON DELETE CASCADE,
  "total_games"    integer NOT NULL DEFAULT 0,
  "total_correct"  integer NOT NULL DEFAULT 0,
  "total_answered" integer NOT NULL DEFAULT 0,
  "best_streak"    integer NOT NULL DEFAULT 0,
  "total_score"    integer NOT NULL DEFAULT 0,
  "updated_at"     timestamp NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "user_topic_stats" (
  "user_id"        uuid    NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "topic"          text    NOT NULL,
  "total_answered" integer NOT NULL DEFAULT 0,
  "total_correct"  integer NOT NULL DEFAULT 0,
  PRIMARY KEY ("user_id", "topic")
);

CREATE INDEX IF NOT EXISTS "uts_user_idx" ON "user_topic_stats" ("user_id");

-- ── PART 3: Add question intelligence columns to questions table ───────────────

ALTER TABLE "questions"
  ADD COLUMN IF NOT EXISTS "usage_count"   integer   NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "last_used_at"  timestamp,
  ADD COLUMN IF NOT EXISTS "quality_score" real      NOT NULL DEFAULT 0.5,
  ADD COLUMN IF NOT EXISTS "text_hash"     text,
  ADD COLUMN IF NOT EXISTS "total_served"  integer   NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "total_correct" integer   NOT NULL DEFAULT 0;

-- Unique index on (canonical_topic, text_hash) for deduplication.
-- Partial index: only applies when text_hash IS NOT NULL, so existing
-- rows with text_hash = NULL are excluded and don't conflict with each other.
CREATE UNIQUE INDEX IF NOT EXISTS "questions_topic_hash_uniq"
  ON "questions" ("canonical_topic", "text_hash")
  WHERE "text_hash" IS NOT NULL;
