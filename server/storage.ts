import crypto from 'crypto';
import { eq, and, sql } from "drizzle-orm";
import { db, users, questions, games, gamePlayers, userStats, userTopicStats } from "./db";
import type { Question } from "@shared/schema";

// ── Type exports used by gameState and auth ───────────────────────────────────
export type DbUser = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

// ── Guard — all storage methods are no-ops when DB is not configured ──────────
function hasDb(d: typeof db): d is NonNullable<typeof db> {
  return d !== null;
}

// ─────────────────────────────────────────────────────────────────────────────
// USER METHODS
// ─────────────────────────────────────────────────────────────────────────────

/** Find a user by OAuth provider + provider user id. Returns null if not found. */
export async function findUserByOAuth(
  provider: string,
  oauthId: string,
): Promise<DbUser | null> {
  if (!hasDb(db)) return null;
  const rows = await db
    .select()
    .from(users)
    .where(and(eq(users.oauthProvider, provider), eq(users.oauthId, oauthId)))
    .limit(1);
  return rows[0] ?? null;
}

/** Find a user by their internal UUID. */
export async function findUserById(id: string): Promise<DbUser | null> {
  if (!hasDb(db)) return null;
  const rows = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return rows[0] ?? null;
}

/** Create a new user row. Returns the created user. */
export async function createUser(data: NewUser): Promise<DbUser> {
  if (!hasDb(db)) throw new Error("Database not configured");
  const rows = await db.insert(users).values(data).returning();
  return rows[0];
}

/** Touch last_seen_at on login. */
export async function touchUserLastSeen(id: string): Promise<void> {
  if (!hasDb(db)) return;
  await db.update(users).set({ lastSeenAt: new Date() }).where(eq(users.id, id));
}

// ─────────────────────────────────────────────────────────────────────────────
// QUESTION BANK METHODS
// ─────────────────────────────────────────────────────────────────────────────

/** Store a newly AI-generated question in the bank. Returns empty string on duplicate. */
export async function storeQuestion(
  q: Question,
  rawTopic: string,
  region: string,
): Promise<string> {
  if (!hasDb(db)) return "";

  // Compute normalised MD5 hash for deduplication
  const normalised = q.text.toLowerCase().replace(/[^a-z0-9]/g, '');
  const textHash = crypto.createHash('md5').update(normalised).digest('hex');
  const canonicalTopic = q.canonicalTopic ?? rawTopic;

  const rows = await db
    .insert(questions)
    .values({
      topic:          rawTopic,
      canonicalTopic,
      text:           q.text,
      options:        q.options,
      correctIndex:   q.correctIndex,
      explanation:    q.explanation,
      difficulty:     q.difficulty,
      region,
      isActive:       true,
      textHash,
    })
    .onConflictDoNothing()
    .returning({ id: questions.id });

  // Returns empty string when conflict (duplicate silently skipped)
  return rows[0]?.id ?? "";
}

/**
 * Fetch a random question from the bank for a given topic using smart ordering.
 * Prefers questions not used recently and with lower usage counts.
 * Returns null if no suitable question exists.
 */
export async function fetchQuestionFromBank(
  topic: string,
  region: string,
): Promise<(Question & { dbId: string }) | null> {
  if (!hasDb(db)) return null;

  const rows = await db
    .select()
    .from(questions)
    .where(
      and(
        sql`lower(${questions.canonicalTopic}) = lower(${topic})`,
        sql`(${questions.region} = ${region} OR ${questions.region} = 'global')`,
        eq(questions.isActive, true),
      )
    )
    .orderBy(
      sql`CASE WHEN ${questions.lastUsedAt} > NOW() - INTERVAL '1 hour' THEN 0 ELSE 1 END DESC`,
      questions.usageCount,
      sql`RANDOM()`,
    )
    .limit(1);

  if (!rows[0]) return null;

  const row = rows[0];

  // Fire-and-forget: bump usage count and last_used_at
  db!
    .update(questions)
    .set({
      usageCount: sql`${questions.usageCount} + 1`,
      lastUsedAt: new Date(),
    })
    .where(eq(questions.id, row.id))
    .catch(() => { /* ignore */ });

  return {
    dbId:           row.id,
    text:           row.text,
    options:        row.options as string[],
    correctIndex:   row.correctIndex,
    explanation:    row.explanation,
    difficulty:     row.difficulty as Question["difficulty"],
    canonicalTopic: row.canonicalTopic,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// USER STATS METHODS (Part 2)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Upsert aggregate stats for a user after a game ends.
 * Increments totals and keeps the maximum best streak.
 */
export async function upsertUserStats(
  userId: string,
  stats: { totalCorrect: number; totalAnswered: number; bestStreak: number; totalScore: number },
): Promise<void> {
  if (!hasDb(db) || !userId) return;
  await db.execute(sql`
    INSERT INTO user_stats (user_id, total_games, total_correct, total_answered, best_streak, total_score, updated_at)
    VALUES (
      ${userId}::uuid,
      1,
      ${stats.totalCorrect},
      ${stats.totalAnswered},
      ${stats.bestStreak},
      ${stats.totalScore},
      NOW()
    )
    ON CONFLICT (user_id) DO UPDATE SET
      total_games    = user_stats.total_games + 1,
      total_correct  = user_stats.total_correct + EXCLUDED.total_correct,
      total_answered = user_stats.total_answered + EXCLUDED.total_answered,
      best_streak    = GREATEST(user_stats.best_streak, EXCLUDED.best_streak),
      total_score    = user_stats.total_score + EXCLUDED.total_score,
      updated_at     = NOW()
  `);
}

/**
 * Upsert per-topic stats for a user after a game ends.
 */
export async function upsertUserTopicStats(
  userId: string,
  topicTally: Record<string, { answered: number; correct: number }>,
): Promise<void> {
  if (!hasDb(db) || !userId) return;
  const entries = Object.entries(topicTally);
  if (entries.length === 0) return;

  for (const [topic, counts] of entries) {
    await db.execute(sql`
      INSERT INTO user_topic_stats (user_id, topic, total_answered, total_correct)
      VALUES (${userId}::uuid, ${topic}, ${counts.answered}, ${counts.correct})
      ON CONFLICT (user_id, topic) DO UPDATE SET
        total_answered = user_topic_stats.total_answered + EXCLUDED.total_answered,
        total_correct  = user_topic_stats.total_correct + EXCLUDED.total_correct
    `);
  }
}

/**
 * Batch update question quality counters after a round.
 */
export async function updateQuestionStats(
  updates: { questionId: string; served: number; correct: number }[],
): Promise<void> {
  if (!hasDb(db) || updates.length === 0) return;
  for (const u of updates) {
    await db
      .update(questions)
      .set({
        totalServed:  sql`${questions.totalServed} + ${u.served}`,
        totalCorrect: sql`${questions.totalCorrect} + ${u.correct}`,
      })
      .where(eq(questions.id, u.questionId));
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GAME HISTORY METHODS
// ─────────────────────────────────────────────────────────────────────────────

/** Create a game record when a game starts. Returns the new game's id. */
export async function createGame(data: {
  roomCode: string;
  mode: string;
  target: number;
  regionMode: string;
}): Promise<string> {
  if (!hasDb(db)) return "";
  const rows = await db.insert(games).values(data).returning({ id: games.id });
  return rows[0]?.id ?? "";
}

/** Mark a game as finished. */
export async function finalizeGame(gameId: string): Promise<void> {
  if (!hasDb(db) || !gameId) return;
  await db.update(games).set({ endedAt: new Date() }).where(eq(games.id, gameId));
}

/** Upsert a player's participation record. Call on join; update on game end. */
export async function upsertGamePlayer(data: {
  gameId:     string;
  userId?:    string | null;
  playerName: string;
  avatarId:   string;
  finalScore?: number;
  bestStreak?: number;
}): Promise<string> {
  if (!hasDb(db) || !data.gameId) return "";
  const rows = await db
    .insert(gamePlayers)
    .values({
      gameId:     data.gameId,
      userId:     data.userId ?? null,
      playerName: data.playerName,
      avatarId:   data.avatarId,
      finalScore: data.finalScore ?? 0,
      bestStreak: data.bestStreak ?? 0,
    })
    .onConflictDoNothing()
    .returning({ id: gamePlayers.id });
  return rows[0]?.id ?? "";
}

/** Update final score + streak for a player at game end. */
export async function updateGamePlayerScore(
  gameId: string,
  playerName: string,
  finalScore: number,
  bestStreak: number,
): Promise<void> {
  if (!hasDb(db) || !gameId) return;
  await db
    .update(gamePlayers)
    .set({ finalScore, bestStreak })
    .where(and(eq(gamePlayers.gameId, gameId), eq(gamePlayers.playerName, playerName)));
}

/** Attach a real userId to guest game_players rows after login. */
export async function claimGuestGameRows(
  playerName: string,
  userId: string,
): Promise<void> {
  if (!hasDb(db)) return;
  await db
    .update(gamePlayers)
    .set({ userId })
    .where(and(eq(gamePlayers.playerName, playerName), sql`${gamePlayers.userId} IS NULL`));
}
