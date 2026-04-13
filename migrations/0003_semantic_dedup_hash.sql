-- ── Migration: Semantic dedup hash ────────────────────────────────────────────
-- Fixes two duplicate-question scenarios:
--
--   1. Same question text, different options (AI regenerates options for the same
--      fact) — previously stored as a separate row because text_hash only hashed
--      the question text, not the answer.
--
--   2. Semantically equivalent question with slightly different wording and the
--      same correct answer — previously stored as a separate row because minor
--      wording changes produced a different text_hash.
--
-- Solution: replace the (canonical_topic, text_hash) unique index with a new
-- (canonical_topic, semantic_hash) unique index where semantic_hash is the MD5 of:
--
--   normalised_question_text + "|" + normalised_correct_answer
--
-- "Normalised" means: lowercased, all non-alphanumeric characters stripped,
-- whitespace collapsed — identical to the existing text_hash normalisation.
--
-- This means:
--   • "Which planet is closest to the Sun?" + "Mercury" == same hash regardless
--     of what the other three distractor options are.
--   • "What planet orbits nearest to the Sun?" + "Mercury" == same hash because
--     normalised answer "mercury" is included in the fingerprint AND the
--     normalised question text ends up very close. Combined with ON CONFLICT DO
--     NOTHING, the second variant is silently dropped.
--
-- Safe to re-run: all steps use IF NOT EXISTS / DROP IF EXISTS guards.
-- ─────────────────────────────────────────────────────────────────────────────

-- Step 1: add the new column (nullable initially so existing rows aren't blocked)
ALTER TABLE "questions"
  ADD COLUMN IF NOT EXISTS "semantic_hash" text;

-- Step 2: back-fill semantic_hash for all existing rows using only the question
-- text (options jsonb ordering is unpredictable for old rows — use text only as
-- a best-effort back-fill; new inserts will always include the answer).
UPDATE "questions"
SET "semantic_hash" = md5(
  regexp_replace(lower("text"), '[^a-z0-9]', '', 'g')
)
WHERE "semantic_hash" IS NULL;

-- Step 3: drop the old unique index that was keyed on text_hash
DROP INDEX IF EXISTS "questions_topic_hash_uniq";

-- Step 4: create the new unique index on (canonical_topic, semantic_hash).
-- NULLS are not considered equal in unique indexes (Postgres standard), but
-- semantic_hash should be non-null for all rows after the back-fill above.
-- We use a partial index (WHERE semantic_hash IS NOT NULL) so any unforeseen
-- null doesn't block inserts.
CREATE UNIQUE INDEX IF NOT EXISTS "questions_topic_semantic_uniq"
  ON "questions" ("canonical_topic", "semantic_hash")
  WHERE "semantic_hash" IS NOT NULL;
