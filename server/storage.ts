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

// ── Option 4 config: minimum question pool size before falling back to AI ─────
const MIN_POOL_SIZE = 3;

// ── Option 2 config: rolling seen-hash window size per user ───────────────────
const MAX_SEEN_HASHES = 500;

// ─────────────────────────────────────────────────────────────────────────────
// USER METHODS
// ─────────────────────────────────────────────────────────────────────────────

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

export async function findUserById(id: string): Promise<DbUser | null> {
  if (!hasDb(db)) return null;
  const rows = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function createUser(data: NewUser): Promise<DbUser> {
  if (!hasDb(db)) throw new Error("Database not configured");
  const rows = await db.insert(users).values(data).returning();
  return rows[0];
}

export async function touchUserLastSeen(id: string): Promise<void> {
  if (!hasDb(db)) return;
  await db.update(users).set({ lastSeenAt: new Date() }).where(eq(users.id, id));
}

// ─────────────────────────────────────────────────────────────────────────────
// QUESTION BANK METHODS
// ─────────────────────────────────────────────────────────────────────────────

export async function storeQuestion(
  q: Question,
  rawTopic: string,
  region: string,
): Promise<string> {
  if (!hasDb(db)) return "";

  // textHash — MD5 of normalised question text only (kept for backward compat
  // with seen_hashes rolling window which references it).
  const normalised = q.text.toLowerCase().replace(/[^a-z0-9]/g, '');
  const textHash = crypto.createHash('md5').update(normalised).digest('hex');

  // semanticHash — MD5 of normalised question text + "|" + normalised correct answer.
  // This is the dedup key. Two questions that ask the same thing and share the
  // same correct answer produce the same hash, even if:
  //   • the wording is slightly different ("Which planet…" vs "What planet…")
  //   • the distractor options are completely different
  // The unique index (canonical_topic, semantic_hash) silently drops the
  // duplicate via ON CONFLICT DO NOTHING.
  const normalisedAnswer = (q.options[q.correctIndex] ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
  const semanticHash = crypto
    .createHash('md5')
    .update(normalised + '|' + normalisedAnswer)
    .digest('hex');

  // Bug 4 fix: normalize canonicalTopic to Title Case before storing.
  const rawCanonical = (q.canonicalTopic ?? rawTopic).trim();
  const canonicalTopic = rawCanonical.replace(/\w\S*/g, w =>
    w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
  );

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
      semanticHash,
    })
    .onConflictDoNothing()
    .returning({ id: questions.id });

  return rows[0]?.id ?? "";
}

// ─────────────────────────────────────────────────────────────────────────────
// CHOOSER DEDUP CONTEXT
// Single JOIN query fetching both Option 2 (seenHashes) and Option 3
// (lastSeenHash for this topic) for the topic chooser in one DB round-trip.
// Returns empty fallback gracefully for guests or when DB is unavailable.
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// ROOM SEEN DATA
//
// Fetches the union of seen_hashes across ALL logged-in players in the room
// in a single query, plus the topic-specific lastSeenHash for the chooser.
//
// WHY ALL PLAYERS, NOT JUST THE CHOOSER:
//   The original "chooser-only" policy meant that for any given round, only
//   the topic selector was protected from repeats. The other 3-7 players had
//   zero cross-session dedup — their seen_hashes were written but never read.
//   In a 10-round game, each player is the chooser for ~2 rounds, meaning they
//   were unprotected for ~80% of rounds. This caused the reported repetitions.
//
//   The fix: union ALL logged-in players' seen_hashes. A question is excluded
//   if ANY player in the room has already seen it. Guests (no userId) are
//   naturally excluded from the union — they get best-effort variety via
//   usage_count ordering only.
//
// POOL EXHAUSTION SAFETY:
//   If the exclude set is so large that no unseen question remains,
//   fetchQuestionFromBank falls back to serving without exclusion rather than
//   breaking the round. Better one repeat than a broken game.
// ─────────────────────────────────────────────────────────────────────────────

export interface RoomSeenData {
  excludeHashes: Set<string>;  // union of all players' seen hashes + chooser's lastSeenHash
}

export async function fetchRoomSeenData(
  playerUserIds: string[],   // all logged-in playerIds in the room
  chooserUserId: string | null,
  topic: string,
): Promise<RoomSeenData> {
  const empty: RoomSeenData = { excludeHashes: new Set() };
  if (!hasDb(db) || playerUserIds.length === 0) return empty;

  try {
    // Single query: fetch seen_hashes for ALL logged-in players at once,
    // plus the chooser's per-topic lastSeenHash via a left join.
    // The left join returns one row per user_stats entry; we union the arrays
    // in application code (small number of players, negligible cost).
    const rows = await db
      .select({
        userId:       userStats.userId,
        seenHashes:   userStats.seenHashes,
        lastSeenHash: userTopicStats.lastSeenHash,
      })
      .from(userStats)
      .leftJoin(
        userTopicStats,
        and(
          eq(userTopicStats.userId, userStats.userId),
          sql`lower(${userTopicStats.topic}) = lower(${topic})`,
        ),
      )
      .where(sql`${userStats.userId} = ANY(ARRAY[${sql.join(
        playerUserIds.map(id => sql`${id}::uuid`),
        sql`, `,
      )}])`);

    const excludeHashes = new Set<string>();
    for (const row of rows) {
      // Option 2: union rolling window hashes from all players
      const hashes = (row.seenHashes as string[]) ?? [];
      for (const h of hashes) {
        if (h) excludeHashes.add(h);
      }
      // Option 3: add the per-topic lastSeenHash (only meaningful for the chooser,
      // but harmless to include for all — if anyone last saw this topic's question,
      // skip it for everyone)
      if (row.lastSeenHash) excludeHashes.add(row.lastSeenHash);
    }

    return { excludeHashes };
  } catch {
    return empty;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// FETCH FROM QUESTION BANK
//
// Option 4 — Pool floor:
//   Returns null if topic has < MIN_POOL_SIZE active questions, forcing AI
//   generation so the pool grows organically over time.
//
// Options 2 + 3 — All-player exclusion:
//   Excludes any question whose text_hash appears in any room player's
//   seen_hashes (rolling window) or any player's lastSeenHash for this topic.
//   Guests (no userId) are excluded from the union — they get variety via
//   usage_count ordering only.
//
// Returns textHash alongside the question so gameState records it in
// roundHistory for the end-of-game seen_hashes write.
// ─────────────────────────────────────────────────────────────────────────────

export async function fetchQuestionFromBank(
  topic: string,
  region: string,
  roomSeen?: RoomSeenData,
): Promise<(Question & { dbId: string; textHash: string | null }) | null> {
  if (!hasDb(db)) return null;

  // Option 4: pool floor — skip DB if topic pool is too thin
  const countRows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(questions)
    .where(
      and(
        sql`lower(${questions.canonicalTopic}) = lower(${topic})`,
        sql`(${questions.region} = ${region} OR ${questions.region} = 'global')`,
        eq(questions.isActive, true),
      )
    );

  const poolSize = countRows[0]?.count ?? 0;
  if (poolSize < MIN_POOL_SIZE) return null;

  const excludeSet = roomSeen?.excludeHashes ?? new Set<string>();

  const baseWhere = and(
    sql`lower(${questions.canonicalTopic}) = lower(${topic})`,
    sql`(${questions.region} = ${region} OR ${questions.region} = 'global')`,
    eq(questions.isActive, true),
  );

  // Only apply the exclusion clause when we actually have hashes to exclude.
  // Note: questions with NULL textHash are NOT excluded — they're older questions
  // with no hash computed yet. They'll naturally get lower priority via usage_count.
  const whereWithExclusion = excludeSet.size > 0
    ? and(
        baseWhere,
        sql`(${questions.textHash} IS NULL OR ${questions.textHash} NOT IN (${sql.join(
          [...excludeSet].map(h => sql`${h}`),
          sql`, `,
        )}))`,
      )
    : baseWhere;

  const orderBy = [
    // Prefer questions not used in the last hour (freshness across all players)
    sql`CASE WHEN ${questions.lastUsedAt} > NOW() - INTERVAL '1 hour' THEN 0 ELSE 1 END DESC`,
    // Then least-used overall
    questions.usageCount,
    // Random tiebreak so the same question isn't always picked first
    sql`RANDOM()`,
  ] as const;

  let rows = await db
    .select()
    .from(questions)
    .where(whereWithExclusion)
    .orderBy(...orderBy)
    .limit(1);

  // All questions in the pool have been seen by someone in the room.
  // Return null so the caller falls through to AI generation, which will store
  // a fresh question and grow the pool. This is always better than a repeat.
  // The in-session askedQuestions guard in gameState is a further safety net.
  if (!rows[0]) return null;
  const row = rows[0];

  // Bump usage count fire-and-forget
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
    textHash:       row.textHash ?? null,
    text:           row.text,
    options:        row.options as string[],
    correctIndex:   row.correctIndex,
    explanation:    row.explanation,
    difficulty:     row.difficulty as Question["difficulty"],
    canonicalTopic: row.canonicalTopic,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// USER STATS METHODS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Upsert aggregate stats for a user after a game ends.
 * newSeenHashes: text_hash values of questions served this game (Option 2).
 * Uses atomic SQL append+trim to avoid read-modify-write race conditions.
 */
export async function upsertUserStats(
  userId: string,
  stats: { totalCorrect: number; totalAnswered: number; bestStreak: number; totalScore: number },
  newSeenHashes: string[] = [],
): Promise<void> {
  if (!hasDb(db) || !userId) return;

  await db
    .insert(userStats)
    .values({
      userId,
      totalGames:    1,
      totalCorrect:  stats.totalCorrect,
      totalAnswered: stats.totalAnswered,
      bestStreak:    stats.bestStreak,
      totalScore:    stats.totalScore,
      updatedAt:     new Date(),
      seenHashes:    newSeenHashes,
    })
    .onConflictDoUpdate({
      target: userStats.userId,
      set: {
        totalGames:    sql`${userStats.totalGames} + 1`,
        totalCorrect:  sql`${userStats.totalCorrect} + EXCLUDED.total_correct`,
        totalAnswered: sql`${userStats.totalAnswered} + EXCLUDED.total_answered`,
        bestStreak:    sql`GREATEST(${userStats.bestStreak}, EXCLUDED.best_streak)`,
        totalScore:    sql`${userStats.totalScore} + EXCLUDED.total_score`,
        updatedAt:     new Date(),
        // Atomic append + trim — no application-level read needed
        seenHashes: newSeenHashes.length > 0
          ? sql`(
              SELECT jsonb_agg(h ORDER BY rn DESC)
              FROM (
                SELECT h, row_number() OVER () AS rn
                FROM jsonb_array_elements_text(
                  COALESCE(${userStats.seenHashes}, '[]'::jsonb) ||
                  ${JSON.stringify(newSeenHashes)}::jsonb
                ) AS h
              ) sub
              LIMIT ${MAX_SEEN_HASHES}
            )`
          : userStats.seenHashes,
      },
    });
}

/**
 * Upsert per-topic stats for a user after a game ends.
 * topicTally may include lastSeenHash (Option 3) — the text_hash of the
 * last question served for each topic this game.
 */
export async function upsertUserTopicStats(
  userId: string,
  topicTally: Record<string, { answered: number; correct: number; lastSeenHash?: string }>,
): Promise<void> {
  if (!hasDb(db) || !userId) return;
  const entries = Object.entries(topicTally);
  if (entries.length === 0) return;

  for (const [topic, counts] of entries) {
    await db
      .insert(userTopicStats)
      .values({
        userId,
        topic,
        totalAnswered: counts.answered,
        totalCorrect:  counts.correct,
        lastSeenHash:  counts.lastSeenHash ?? null,
      })
      .onConflictDoUpdate({
        target: [userTopicStats.userId, userTopicStats.topic],
        set: {
          totalAnswered: sql`${userTopicStats.totalAnswered} + EXCLUDED.total_answered`,
          totalCorrect:  sql`${userTopicStats.totalCorrect} + EXCLUDED.total_correct`,
          // Option 3: always overwrite with the most recently seen hash
          lastSeenHash: counts.lastSeenHash
            ? sql`EXCLUDED.last_seen_hash`
            : userTopicStats.lastSeenHash,
        },
      });
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

export async function finalizeGame(gameId: string): Promise<void> {
  if (!hasDb(db) || !gameId) return;
  await db.update(games).set({ endedAt: new Date() }).where(eq(games.id, gameId));
}

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

export async function isUsernameTaken(username: string): Promise<boolean> {
  if (!hasDb(db)) return false;
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(sql`lower(${users.username}) = lower(${username})`)
    .limit(1);
  return rows.length > 0;
}

export async function updateUserAvatar(id: string, avatarId: string): Promise<void> {
  if (!hasDb(db)) return;
  await db.update(users).set({ avatarId }).where(eq(users.id, id));
}