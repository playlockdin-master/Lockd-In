import type { Express } from "express";
import type { Server } from "http";
import { Server as SocketIOServer } from "socket.io";
import { setupGameSockets } from "./gameState";
import { db, users, gamePlayers, games } from "./db";
import { updateUserAvatar } from "./storage";
import { userStats, userTopicStats } from "@shared/schema";
import { eq, and, sql, desc } from "drizzle-orm";

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
   * Single row lookup on user_stats.
   */
  app.get("/api/player/:userId/stats", async (req, res) => {
    if (!db) { res.json({ error: "DB not configured" }); return; }
    try {
      const { userId } = req.params;

      const rows = await db
        .select()
        .from(userStats)
        .where(eq(userStats.userId, userId))
        .limit(1);

      const row = rows[0];
      if (!row) {
        res.json({
          totalGames: 0, totalScore: 0, bestStreak: 0,
          totalAnswered: 0, totalCorrect: 0, accuracy: 0,
        });
        return;
      }

      const accuracy = row.totalAnswered > 0
        ? Math.round((row.totalCorrect / row.totalAnswered) * 100)
        : 0;

      res.json({
        totalGames:    row.totalGames,
        totalScore:    row.totalScore,
        bestStreak:    row.bestStreak,
        totalAnswered: row.totalAnswered,
        totalCorrect:  row.totalCorrect,
        accuracy,
      });
    } catch (err) {
      console.error("[api] /player/stats error:", err);
      res.status(500).json({ error: "Internal error" });
    }
  });

  /**
   * GET /api/player/:userId/topics
   * Per-topic accuracy, questions answered — from user_topic_stats.
   */
  app.get("/api/player/:userId/topics", async (req, res) => {
    if (!db) { res.json({ error: "DB not configured" }); return; }
    try {
      const { userId } = req.params;

      const rows = await db
        .select()
        .from(userTopicStats)
        .where(eq(userTopicStats.userId, userId))
        .orderBy(desc(userTopicStats.totalAnswered));

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
   */
  app.get("/api/player/:userId/games", async (req, res) => {
    if (!db) { res.json({ error: "DB not configured" }); return; }
    try {
      const { userId } = req.params;

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
   * ?period=daily|weekly|monthly|alltime  (default: alltime)
   */
  app.get("/api/leaderboard/global", async (req, res) => {
    if (!db) { res.json({ error: "DB not configured" }); return; }
    const period = (req.query.period as string) || "alltime";

    try {
      if (period === "alltime") {
        // Fast path — use pre-aggregated user_stats
        const rows = await db
          .select({
            userId:     users.id,
            username:   users.username,
            avatarId:   users.avatarId,
            totalScore: userStats.totalScore,
            totalGames: userStats.totalGames,
            bestStreak: userStats.bestStreak,
          })
          .from(userStats)
          .innerJoin(users, eq(userStats.userId, users.id))
          .orderBy(desc(userStats.totalScore))
          .limit(50);
        res.json({ leaderboard: rows, period });
        return;
      }

      // Time-filtered path — aggregate from game_players joined with games
      const intervalMap: Record<string, string> = {
        daily:   "1 day",
        weekly:  "7 days",
        monthly: "30 days",
      };
      const interval = intervalMap[period] ?? "7 days";

      const rows = await db
        .select({
          userId:     gamePlayers.userId,
          username:   users.username,
          avatarId:   users.avatarId,
          totalScore: sql<number>`cast(sum(${gamePlayers.finalScore}) as int)`,
          totalGames: sql<number>`cast(count(distinct ${gamePlayers.gameId}) as int)`,
          bestStreak: sql<number>`cast(max(${gamePlayers.bestStreak}) as int)`,
        })
        .from(gamePlayers)
        .innerJoin(games, eq(gamePlayers.gameId, games.id))
        .innerJoin(users, eq(gamePlayers.userId, users.id))
        .where(sql`${gamePlayers.userId} is not null and ${games.startedAt} >= now() - interval '${sql.raw(interval)}'`)
        .groupBy(gamePlayers.userId, users.id)
        .orderBy(desc(sql`sum(${gamePlayers.finalScore})`))
        .limit(50);

      res.json({ leaderboard: rows, period });
    } catch (err) {
      console.error("[api] /leaderboard/global error:", err);
      res.status(500).json({ error: "Internal error" });
    }
  });

  // IMPORTANT: /api/leaderboard/topics must stay ABOVE /api/leaderboard/topic/:topic.

  /**
   * GET /api/leaderboard/topics
   * Distinct topics from user_topic_stats with enough data (min 5 answered).
   */
  app.get("/api/leaderboard/topics", async (req, res) => {
    if (!db) { res.json({ error: "DB not configured" }); return; }
    try {
      const rows = await db
        .select({
          topic: userTopicStats.topic,
          count: sql<number>`count(*)::int`,
        })
        .from(userTopicStats)
        .where(sql`${userTopicStats.totalAnswered} >= 5`)
        .groupBy(userTopicStats.topic)
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
   * Top 20 players by accuracy on a specific topic (min 5 questions answered).
   */
  app.get("/api/leaderboard/topic/:topic", async (req, res) => {
    if (!db) { res.json({ error: "DB not configured" }); return; }
    try {
      const { topic } = req.params;

      const rows = await db
        .select({
          userId:        userTopicStats.userId,
          username:      users.username,
          avatarId:      users.avatarId,
          totalAnswered: userTopicStats.totalAnswered,
          totalCorrect:  userTopicStats.totalCorrect,
        })
        .from(userTopicStats)
        .innerJoin(users, eq(userTopicStats.userId, users.id))
        .where(
          and(
            sql`lower(${userTopicStats.topic}) = lower(${topic})`,
            sql`${userTopicStats.totalAnswered} >= 5`,
          )
        )
        .orderBy(
          desc(sql`${userTopicStats.totalCorrect}::float / ${userTopicStats.totalAnswered}`),
          desc(userTopicStats.totalAnswered),
        )
        .limit(20);

      const leaderboard = rows.map(r => ({
        userId:        r.userId,
        username:      r.username,
        avatarId:      r.avatarId,
        totalAnswered: r.totalAnswered,
        totalCorrect:  r.totalCorrect,
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

  // POST /api/player/avatar — save avatar for logged-in user
  app.post("/api/player/avatar", async (req, res) => {
    const userId = req.session?.userId;
    if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }
    const { avatarId } = req.body as { avatarId?: string };
    if (!avatarId || typeof avatarId !== "string") {
      res.status(400).json({ error: "avatarId required" }); return;
    }
    try {
      await updateUserAvatar(userId, avatarId);
      req.session.avatarId = avatarId;
      req.session.save(() => res.json({ ok: true }));
    } catch (err) {
      res.status(500).json({ error: "Failed to update avatar" });
    }
  });

  return httpServer;
}
