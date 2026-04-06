-- ── Migration: Add cross-session deduplication columns ───────────────────────
-- Implements Options 2 + 3 of the question repeat-prevention system.
-- Safe to re-run: all statements use IF NOT EXISTS / column existence guards.
--
-- Option 2 — Rolling hash window (user_stats.seen_hashes)
--   Stores the last 500 question text_hashes a user has seen, as a jsonb array.
--   Enables cross-session, cross-topic repeat prevention without a join table.
--   ~2 KB per user. 100k users ≈ 200 MB total — negligible.
--
-- Option 3 — Per-topic last-seen hash (user_topic_stats.last_seen_hash)
--   Stores the text_hash of the most recently served question for each
--   (user, topic) pair. Prevents immediate same-question re-serve even when
--   the rolling window hasn't registered a cross-topic hit yet.
--   Zero extra rows — piggybacks on the existing user_topic_stats table.
-- ─────────────────────────────────────────────────────────────────────────────

-- Option 2: rolling hash window on user_stats
ALTER TABLE "user_stats"
  ADD COLUMN IF NOT EXISTS "seen_hashes" jsonb NOT NULL DEFAULT '[]';

-- Option 3: last seen hash per (user, topic) on user_topic_stats
ALTER TABLE "user_topic_stats"
  ADD COLUMN IF NOT EXISTS "last_seen_hash" text;
