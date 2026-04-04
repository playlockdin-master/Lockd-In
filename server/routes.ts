import type { Express } from "express";
import type { Server } from "http";
import { Server as SocketIOServer } from "socket.io";
import { setupGameSockets } from "./gameState";
import { db, users, gamePlayers, gameRounds, roundAnswers, games } from "./db";
import { eq, and, sql, desc, isNotNull } from "drizzle-orm";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // ── Socket.IO setup ────────────────────────────────────────────────────────
  const allowedOrigin: string | false =
    process.env.CLIENT_ORIGIN
      ? process.env.CLIENT_ORIGIN
      : process.env.NODE_ENV === 'production'
        ? false
        : '*';

  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: allowedOrigin,
      methods: ["GET", "POST"],
    },
    pingInterval: 8000,
    pingTimeout: 10000,
    transports: ["websocket", "polling"],
  });

  setupGameSockets(io);

  // ── Phase 5: Dashboard & Leaderboard API routes ────────────────────────────
  //
  // ROUTE ORDERING NOTE: /api/leaderboard/topics MUST be registered before
  // /api/leaderboard/topic/:topic — otherwise Express matches the literal
  // string "topics" as the :topic param and returns wrong data.

  /**
   * GET /api/player/:userId/stats
   * Total games, accuracy, best streak, total score for a user.
   */
  app.get("/api/player/:userId/stats", async (req, res) => {
    if (!db) { res.json({ error: "DB not configured" }); return; }
    try {
      const { userId } = req.params;

      const gpRows = await db
        .select({
          totalGames: sql<number>`count(distinct ${gamePlayers.gameId})::int`,
          totalScore: sql<number>`coalesce(sum(${gamePlayers.finalScore}), 0)::int`,
          bestStreak: sql<number>`coalesce(max(${gamePlayers.bestStreak}), 0)::int`,
        })
        .from(gamePlayers)
        .where(eq(gamePlayers.userId, userId));

      const raRows = await db
        .select({
          totalAnswered: sql<number>`count(*)::int`,
          totalCorrect:  sql<number>`coalesce(sum(case when ${roundAnswers.wasCorrect} then 1 else 0 end), 0)::int`,
        })
        .from(roundAnswers)
        .where(eq(roundAnswers.userId, userId));

      const gp = gpRows[0] ?? { totalGames: 0, totalScore: 0, bestStreak: 0 };
      const ra = raRows[0] ?? { totalAnswered: 0, totalCorrect: 0 };

      const accuracy = ra.totalAnswered > 0
        ? Math.round((ra.totalCorrect / ra.totalAnswered) * 100)
        : 0;

      res.json({
        totalGames:    gp.totalGames,
        totalScore:    gp.totalScore,
        bestStreak:    gp.bestStreak,
        totalAnswered: ra.totalAnswered,
        totalCorrect:  ra.totalCorrect,
        accuracy,
      });
    } catch (err) {
      console.error("[api] /player/stats error:", err);
      res.status(500).json({ error: "Internal error" });
    }
  });

  /**
   * GET /api/player/:userId/topics
   * Per-topic accuracy, questions answered.
   */
  app.get("/api/player/:userId/topics", async (req, res) => {
    if (!db) { res.json({ error: "DB not configured" }); return; }
    try {
      const { userId } = req.params;

      const rows = await db
        .select({
          topic:         gameRounds.topic,
          totalAnswered: sql<number>`count(*)::int`,
          totalCorrect:  sql<number>`coalesce(sum(case when ${roundAnswers.wasCorrect} then 1 else 0 end), 0)::int`,
        })
        .from(roundAnswers)
        .innerJoin(gameRounds, eq(roundAnswers.roundId, gameRounds.id))
        .where(eq(roundAnswers.userId, userId))
        .groupBy(gameRounds.topic)
        .orderBy(desc(sql`count(*)`));

      const topics = rows.map(r => ({
        topic:         r.topic,
        totalAnswered: r.totalAnswered,
        totalCorrect:  r.totalCorrect,
        accuracy:      r.totalAnswered > 0
          ? Math.round((r.totalCorrect / r.totalAnswered) * 100)
          : 0,
      }));

      res.json({ topics });
    } catch (err) {
      console.error("[api] /player/topics error:", err);
      res.status(500).json({ error: "Internal error" });
    }
  });

  /**
   * GET /api/player/:userId/games
   * Last 20 games with final score, rank, and player count.
   *
   * N+1 fix: rank and player count computed with a single window-function
   * query instead of one extra DB round-trip per game row.
   */
  app.get("/api/player/:userId/games", async (req, res) => {
    if (!db) { res.json({ error: "DB not configured" }); return; }
    try {
      const { userId } = req.params;

      // Step 1: fetch the user's last 20 games
      const rows = await db
        .select({
          gameId:     gamePlayers.gameId,
          finalScore: gamePlayers.finalScore,
          bestStreak: gamePlayers.bestStreak,
          roomCode:   games.roomCode,
          mode:       games.mode,
          target:     games.target,
          startedAt:  games.startedAt,
          endedAt:    games.endedAt,
        })
        .from(gamePlayers)
        .innerJoin(games, eq(gamePlayers.gameId, games.id))
        .where(eq(gamePlayers.userId, userId))
        .orderBy(desc(games.startedAt))
        .limit(20);

      if (rows.length === 0) {
        res.json({ games: [] });
        return;
      }

      // Step 2: single query — rank + player count for all game ids at once
      // using window functions, avoiding N+1 (one query per game).
      const gameIds = rows.map(r => `'${r.gameId}'`).join(',');
      const rankRows = await db!
        .select({
          gameId:      gamePlayers.gameId,
          userId:      gamePlayers.userId,
          rank:        sql<number>`rank() over (partition by ${gamePlayers.gameId} order by ${gamePlayers.finalScore} desc)::int`,
          playerCount: sql<number>`count(*) over (partition by ${gamePlayers.gameId})::int`,
        })
        .from(gamePlayers)
        .where(sql`${gamePlayers.gameId} = any(array[${sql.raw(gameIds)}]::uuid[])`);

      // Build a lookup: gameId → { rank, playerCount } for this user
      const rankMap = new Map<string, { rank: number; playerCount: number }>();
      for (const r of rankRows) {
        if (r.userId === userId) {
          rankMap.set(r.gameId, { rank: r.rank, playerCount: r.playerCount });
        }
      }

      const enriched = rows.map(row => {
        const rankInfo = rankMap.get(row.gameId) ?? { rank: 0, playerCount: 0 };
        return {
          gameId:      row.gameId,
          roomCode:    row.roomCode,
          mode:        row.mode,
          target:      row.target,
          finalScore:  row.finalScore,
          bestStreak:  row.bestStreak,
          playerCount: rankInfo.playerCount,
          rank:        rankInfo.rank,
          startedAt:   row.startedAt,
          endedAt:     row.endedAt,
        };
      });

      res.json({ games: enriched });
    } catch (err) {
      console.error("[api] /player/games error:", err);
      res.status(500).json({ error: "Internal error" });
    }
  });

  /**
   * GET /api/leaderboard/global
   * Top 50 players by total score.
   */
  app.get("/api/leaderboard/global", async (req, res) => {
    if (!db) { res.json({ error: "DB not configured" }); return; }
    try {
      const rows = await db
        .select({
          userId:     users.id,
          username:   users.username,
          avatarId:   users.avatarId,
          totalScore: sql<number>`coalesce(sum(${gamePlayers.finalScore}), 0)::int`,
          totalGames: sql<number>`count(distinct ${gamePlayers.gameId})::int`,
          bestStreak: sql<number>`coalesce(max(${gamePlayers.bestStreak}), 0)::int`,
        })
        .from(gamePlayers)
        .innerJoin(users, eq(gamePlayers.userId, users.id))
        .where(isNotNull(gamePlayers.userId))
        .groupBy(users.id, users.username, users.avatarId)
        .orderBy(desc(sql`sum(${gamePlayers.finalScore})`))
        .limit(50);

      res.json({ leaderboard: rows });
    } catch (err) {
      console.error("[api] /leaderboard/global error:", err);
      res.status(500).json({ error: "Internal error" });
    }
  });

  // IMPORTANT: /api/leaderboard/topics must stay ABOVE /api/leaderboard/topic/:topic.
  // If reversed, Express matches the literal word "topics" as the :topic param
  // and this route never fires.

  /**
   * GET /api/leaderboard/topics
   * Topics that have enough data for a leaderboard tab.
   */
  app.get("/api/leaderboard/topics", async (req, res) => {
    if (!db) { res.json({ error: "DB not configured" }); return; }
    try {
      const rows = await db
        .select({
          topic: gameRounds.topic,
          count: sql<number>`count(*)::int`,
        })
        .from(roundAnswers)
        .innerJoin(gameRounds, eq(roundAnswers.roundId, gameRounds.id))
        .where(isNotNull(roundAnswers.userId))
        .groupBy(gameRounds.topic)
        .having(sql`count(*) >= 5`)
        .orderBy(desc(sql`count(*)`))
        .limit(30);

      res.json({ topics: rows.map(r => r.topic) });
    } catch (err) {
      console.error("[api] /leaderboard/topics error:", err);
      res.status(500).json({ error: "Internal error" });
    }
  });

  /**
   * GET /api/leaderboard/topic/:topic
   * Top 20 players by accuracy on a specific topic (min 5 questions).
   */
  app.get("/api/leaderboard/topic/:topic", async (req, res) => {
    if (!db) { res.json({ error: "DB not configured" }); return; }
    try {
      const { topic } = req.params;

      const rows = await db
        .select({
          userId:        roundAnswers.userId,
          username:      users.username,
          avatarId:      users.avatarId,
          totalAnswered: sql<number>`count(*)::int`,
          totalCorrect:  sql<number>`coalesce(sum(case when ${roundAnswers.wasCorrect} then 1 else 0 end), 0)::int`,
        })
        .from(roundAnswers)
        .innerJoin(gameRounds, eq(roundAnswers.roundId, gameRounds.id))
        .innerJoin(users, eq(roundAnswers.userId, users.id))
        .where(
          and(
            sql`lower(${gameRounds.topic}) = lower(${topic})`,
            isNotNull(roundAnswers.userId)
          )
        )
        .groupBy(roundAnswers.userId, users.username, users.avatarId)
        .having(sql`count(*) >= 5`)
        .orderBy(
          desc(sql`sum(case when ${roundAnswers.wasCorrect} then 1 else 0 end)::float / count(*)`),
          desc(sql`count(*)`)
        )
        .limit(20);

      const leaderboard = rows.map(r => ({
        userId:        r.userId,
        username:      r.username,
        avatarId:      r.avatarId,
        totalAnswered: r.totalAnswered,
        totalCorrect:  r.totalCorrect,
        // Division-by-zero guard: HAVING count(*) >= 5 makes this safe in practice,
        // but guard explicitly in case of unexpected type coercion from Postgres.
        accuracy:      r.totalAnswered > 0
          ? Math.round((r.totalCorrect / r.totalAnswered) * 100)
          : 0,
      }));

      res.json({ topic, leaderboard });
    } catch (err) {
      console.error("[api] /leaderboard/topic error:", err);
      res.status(500).json({ error: "Internal error" });
    }
  });

  return httpServer;
}
