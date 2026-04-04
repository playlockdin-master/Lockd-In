import { eq, and, inArray, sql, notInArray } from "drizzle-orm";
import { db, users, questions, games, gamePlayers, gameRounds, roundAnswers, playerSeenQuestions } from "./db";
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

/** Store a newly AI-generated question in the bank. */
export async function storeQuestion(
  q: Question,
  rawTopic: string,
  region: string,
): Promise<string> {
  if (!hasDb(db)) return "";
  const rows = await db
    .insert(questions)
    .values({
      topic:          rawTopic,
      canonicalTopic: q.canonicalTopic ?? rawTopic,
      text:           q.text,
      options:        q.options,
      correctIndex:   q.correctIndex,
      explanation:    q.explanation,
      difficulty:     q.difficulty,
      region,
      isActive:       true,
    })
    .returning({ id: questions.id });
  return rows[0]?.id ?? "";
}

/**
 * Fetch a random unseen question from the bank for a given topic.
 * Matches on canonical_topic (case-insensitive) and region.
 * Excludes any question whose id is in excludeIds (already seen by participants).
 * Returns null if no suitable question exists.
 */
export async function fetchQuestionFromBank(
  topic: string,
  region: string,
  excludeIds: string[],
): Promise<(Question & { dbId: string }) | null> {
  if (!hasDb(db)) return null;

  const base = and(
    sql`lower(${questions.canonicalTopic}) = lower(${topic})`,
    sql`(${questions.region} = ${region} OR ${questions.region} = 'global')`,
    eq(questions.isActive, true),
    excludeIds.length > 0 ? notInArray(questions.id, excludeIds) : undefined,
  );

  const rows = await db
    .select()
    .from(questions)
    .where(base)
    .orderBy(sql`RANDOM()`)
    .limit(1);

  if (!rows[0]) return null;

  const row = rows[0];
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

/**
 * Count how many unseen questions exist for a topic.
 * Used to check if the bank pool is large enough to trust (threshold: 5).
 */
export async function countAvailableQuestions(
  topic: string,
  region: string,
  excludeIds: string[],
): Promise<number> {
  if (!hasDb(db)) return 0;

  const base = and(
    sql`lower(${questions.canonicalTopic}) = lower(${topic})`,
    sql`(${questions.region} = ${region} OR ${questions.region} = 'global')`,
    eq(questions.isActive, true),
    excludeIds.length > 0 ? notInArray(questions.id, excludeIds) : undefined,
  );

  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(questions)
    .where(base);

  return rows[0]?.count ?? 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// PLAYER SEEN QUESTIONS
// ─────────────────────────────────────────────────────────────────────────────

/** Get all question IDs already seen by a set of users. */
export async function getSeenQuestionIds(userIds: string[]): Promise<string[]> {
  if (!hasDb(db) || userIds.length === 0) return [];
  const rows = await db
    .select({ questionId: playerSeenQuestions.questionId })
    .from(playerSeenQuestions)
    .where(inArray(playerSeenQuestions.userId, userIds));
  return rows.map(r => r.questionId);
}

/** Mark a question as seen for a list of users. Ignores conflicts (already seen). */
export async function markQuestionSeen(userIds: string[], questionId: string): Promise<void> {
  if (!hasDb(db) || userIds.length === 0 || !questionId) return;
  await db
    .insert(playerSeenQuestions)
    .values(userIds.map(uid => ({ userId: uid, questionId })))
    .onConflictDoNothing();
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

/** Record a round. Returns the new round's id. */
export async function createGameRound(data: {
  gameId:      string;
  questionId?: string;
  roundNumber: number;
  topic:       string;
}): Promise<string> {
  if (!hasDb(db) || !data.gameId) return "";
  const rows = await db.insert(gameRounds).values(data).returning({ id: gameRounds.id });
  return rows[0]?.id ?? "";
}

/** Record every participant's answer for a round. */
export async function createRoundAnswers(
  roundId: string,
  answers: {
    userId?:      string | null;
    answerIndex:  number;
    timeTaken:    number;
    wasCorrect:   boolean;
    pointsEarned: number;
  }[],
): Promise<void> {
  if (!hasDb(db) || !roundId || answers.length === 0) return;
  await db.insert(roundAnswers).values(
    answers.map(a => ({ roundId, ...a, userId: a.userId ?? null }))
  );
}