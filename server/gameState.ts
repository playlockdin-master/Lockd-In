import { Server, Socket } from "socket.io";
import { v4 as uuidv4 } from "uuid";

// ── Structured logger ────────────────────────────────────────────────────────
function ts() { return new Date().toISOString(); }
function log(msg: string)  { console.log( `[INFO]  ${ts()} [game] ${msg}`); }
function warn(msg: string) { console.warn( `[WARN]  ${ts()} [game] ${msg}`); }
function err(msg: string)  { console.error(`[ERROR] ${ts()} [game] ${msg}`); }

import {
  Room, Player,
  validatePlayerNameShared, containsProfanity,
  TOPIC_TIME_SECONDS, QUESTION_TIME_SECONDS,
  TOPIC_TIME_MIN, TOPIC_TIME_MAX,
  QUESTION_TIME_MIN, QUESTION_TIME_MAX,
  type RegionMode, REGIONS,
} from "@shared/schema";
import {
  generateQuestion, generateTopicSuggestions, suggestSimilarTopic,
  TOPIC_DATASET, clearRoomCache, buildRegionContext,
  generateQuestionsForPresetMode,
} from "./ai";

// ── Rate limiter ─────────────────────────────────────────────────────────────
const rateLimitMap = new Map<string, Map<string, { count: number; windowStart: number }>>();

const RATE_LIMITS: Record<string, { max: number; windowMs: number }> = {
  joinRoom:            { max: 5,  windowMs: 10_000 },
  selectTopic:         { max: 5,  windowMs: 10_000 },
  submitAnswer:        { max: 5,  windowMs: 10_000 },
  getTopicSuggestions: { max: 10, windowMs: 5_000  },
  react:               { max: 10, windowMs: 5_000  },
  setReady:            { max: 10, windowMs: 10_000 },
  updateSettings:      { max: 10, windowMs: 10_000 },
  startGame:           { max: 5,  windowMs: 10_000 },
  playAgain:           { max: 5,  windowMs: 10_000 },
  submitPresetTopics:  { max: 5,  windowMs: 10_000 },
  resetGame:           { max: 5,  windowMs: 10_000 },
  updateAvatar:        { max: 10, windowMs: 10_000 },
};

function isRateLimited(socketId: string, event: string): boolean {
  const limit = RATE_LIMITS[event];
  if (!limit) return false;
  if (!rateLimitMap.has(socketId)) rateLimitMap.set(socketId, new Map());
  const socketEvents = rateLimitMap.get(socketId)!;
  const now = Date.now();
  const entry = socketEvents.get(event);
  if (!entry || now - entry.windowStart >= limit.windowMs) {
    socketEvents.set(event, { count: 1, windowStart: now });
    return false;
  }
  entry.count++;
  return entry.count > limit.max;
}

function cleanupRateLimit(socketId: string) { rateLimitMap.delete(socketId); }

// ── Validation helpers ───────────────────────────────────────────────────────
const VALID_AVATAR_IDS = new Set([
  'ghost','gremlin','blob','egg','demon','brain','astro','duck','skull',
  'shroom','robo','cat','witch','cloud','fox','zombie','dragon','bear',
]);

function validatePlayerName(raw: unknown): string | null {
  return validatePlayerNameShared(raw);
}

function isUnusableTopic(topic: string): boolean {
  const t = topic.trim();
  if (t.length < 3) return true;
  if (!/[a-zA-Z]/.test(t)) return true;
  if (/^(.)\1+$/i.test(t)) return true;
  const letters = t.replace(/[^a-zA-Z]/g, '');
  const vowels  = letters.replace(/[^aeiouAEIOU]/g, '');
  if (letters.length > 4 && vowels.length === 0) return true;
  if (containsProfanity(t)) return true;
  return false;
}

// ── In-memory stores ─────────────────────────────────────────────────────────

const MAX_ROOMS = 500;

/**
 * Primary game store — keyed by room code.
 * The room object is the ONLY source of truth for game state.
 * All indexes below are derived from it and kept in sync.
 */
const rooms      = new Map<string, Room>();

/**
 * One timer slot per room — covers topic, question, results, cleanup timers.
 * setRoomTimer replaces whatever is there; clearRoomTimer cancels it.
 * Game-phase timers (question, results) are NEVER cleared by player events —
 * only by the game engine advancing to the next phase.
 */
const roomTimers = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * Dual-index: socket ↔ player ↔ room.
 * These are the ONLY indexes outside the Room object.
 * Every entry added here MUST be removed when the player/socket is gone.
 *
 *   socketToPlayer: fast lookup on every incoming event
 *   playerToSocket: used to emit directly to one player
 *   playerToRoom:   used to find a player's room without scanning all rooms
 */
const socketToPlayer = new Map<string, string>(); // socketId  → playerId
const playerToSocket = new Map<string, string>(); // playerId  → socketId
const playerToRoom   = new Map<string, string>(); // playerId  → roomCode

/**
 * Per-room join-order array of permanent playerIds.
 * Used for deterministic topic-selector rotation.
 * Survives reconnects because it's keyed by playerId not socketId.
 */
const roomJoinOrder = new Map<string, string[]>(); // roomCode → playerId[]

/**
 * Grace-period timers keyed by playerId.
 * When a socket disconnects we start a 15s timer. If they reconnect before
 * it fires we cancel it. If it fires we call hardRemovePlayer which is the
 * ONE place a player is removed from room.players.
 */
const disconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();

const RECONNECT_GRACE_MS = 15_000; // 15 s

// ── Timer helpers ─────────────────────────────────────────────────────────────
function topicTimeMs(room: Room):    number { return (room.topicTimeSecs    ?? TOPIC_TIME_SECONDS)    * 1000; }
function questionTimeMs(room: Room): number { return (room.questionTimeSecs ?? QUESTION_TIME_SECONDS) * 1000; }
const ROUND_RESULTS_TIME = 8_000;

function clearRoomTimer(code: string) {
  const t = roomTimers.get(code);
  if (t) { clearTimeout(t); roomTimers.delete(code); }
}

function setRoomTimer(code: string, fn: () => void, delay: number) {
  clearRoomTimer(code); // always replace — one slot per room
  roomTimers.set(code, setTimeout(fn, delay));
}

// ── Full room teardown — clears everything ────────────────────────────────────
/**
 * Completely destroys a room and all associated indexes.
 * Called when a room is genuinely dead: empty + grace expired, or force-deleted.
 */
function destroyRoom(code: string) {
  const room = rooms.get(code);
  if (room) {
    // Clean up all player-level indexes
    for (const p of room.players) {
      if (p.socketId) socketToPlayer.delete(p.socketId);
      playerToSocket.delete(p.id);
      playerToRoom.delete(p.id);
      // Cancel any lingering disconnect timers
      const dt = disconnectTimers.get(p.id);
      if (dt) { clearTimeout(dt); disconnectTimers.delete(p.id); }
    }
  }
  clearRoomTimer(code);
  rooms.delete(code);
  roomJoinOrder.delete(code);
  roomTimers.delete(code); // belt-and-suspenders after clearRoomTimer
  log(`Room ${code} destroyed`);
}

// ── Periodic GC ───────────────────────────────────────────────────────────────
// Runs every 30s. Cleans rate-limit entries for sockets no longer tracked.
setInterval(() => {
  for (const sid of Array.from(rateLimitMap.keys())) {
    if (!socketToPlayer.has(sid)) rateLimitMap.delete(sid);
  }
}, 30_000);

// Runs every 5 min. Safety net for rooms that somehow ended up empty without
// going through the normal teardown path (e.g. a server-side bug).
setInterval(() => {
  for (const [code, room] of Array.from(rooms.entries())) {
    if (room.players.length === 0 && !roomTimers.has(code)) {
      // No timer means nothing is waiting to delete it — do it now.
      warn(`GC: orphan empty room ${code} found — destroying`);
      destroyRoom(code);
    }
  }
}, 5 * 60_000);

// ── Lookup helpers ────────────────────────────────────────────────────────────
function getRoomByPlayerId(playerId: string): Room | undefined {
  const code = playerToRoom.get(playerId);
  return code ? rooms.get(code) : undefined;
}

function getRoomBySocketId(socketId: string): Room | undefined {
  const pid = socketToPlayer.get(socketId);
  return pid ? getRoomByPlayerId(pid) : undefined;
}

function getPlayerBySocketId(socketId: string): Player | undefined {
  const pid = socketToPlayer.get(socketId);
  if (!pid) return undefined;
  const room = getRoomByPlayerId(pid);
  return room?.players.find(p => p.id === pid);
}

function emitToPlayer(io: Server, playerId: string, event: string, data: unknown) {
  const sid = playerToSocket.get(playerId);
  if (sid) io.to(sid).emit(event, data);
}

// ── Room code generator ───────────────────────────────────────────────────────
function generateRoomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  for (let attempt = 0; attempt < 100; attempt++) {
    let code = "";
    for (let i = 0; i < 6; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
    if (!rooms.has(code)) return code;
  }
  // Extremely unlikely — fall back to 8-char code
  let code = "";
  for (let i = 0; i < 8; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
  return code;
}

// ── Serializer ────────────────────────────────────────────────────────────────
function serializeRoom(room: Room): object {
  return {
    code:             room.code,
    players:          room.players.map(p => ({ ...p })),
    status:           room.status,
    mode:             room.mode,
    target:           room.target,
    topicTimeSecs:    room.topicTimeSecs    ?? TOPIC_TIME_SECONDS,
    questionTimeSecs: room.questionTimeSecs ?? QUESTION_TIME_SECONDS,
    currentRound:     room.currentRound,
    usedTopics:       [...room.usedTopics],
    askedQuestions:   [...(room.askedQuestions ?? [])],
    currentTopic:     room.currentTopic,
    currentQuestion:  room.currentQuestion
      ? { ...room.currentQuestion, options: [...room.currentQuestion.options] }
      : undefined,
    topicSelectorId:       room.topicSelectorId,
    topicDeadline:         room.topicDeadline,
    questionDeadline:      room.questionDeadline,
    resultsDeadline:       room.resultsDeadline,
    answers:               { ...room.answers },
    // Send both names — clients can use either; roundPlayerIds is the legacy alias
    questionParticipants:  room.questionParticipants ? [...room.questionParticipants] : undefined,
    roundPlayerIds:        room.questionParticipants ? [...room.questionParticipants] : undefined,
    fastestPlayerId:       room.fastestPlayerId,
    playAgainIds:          room.playAgainIds      ? [...room.playAgainIds]      : [],
    viewingResultsIds:     room.viewingResultsIds ? [...room.viewingResultsIds] : [],
    regionMode:            room.regionMode  ?? "global",
    regionId:              room.regionId,
    countryCode:           room.countryCode,
    topicMode:             room.topicMode   ?? 'live',
    presetTopics:          room.presetTopics ?? {},
    pregeneratedQuestionsCount: (room.pregeneratedQuestions ?? []).length,
  };
}

// ── Socket setup ──────────────────────────────────────────────────────────────
export function setupGameSockets(io: Server) {
  io.on("connection", (socket: Socket) => {
    log(`Socket connected: ${socket.id}`);

    // ── joinRoom ──────────────────────────────────────────────────────────────
    socket.on("joinRoom", ({ roomCode, playerName, avatarId, playerId: clientPlayerId }) => {
      if (isRateLimited(socket.id, 'joinRoom')) {
        socket.emit('error', { message: 'Too many join attempts. Please wait a moment.' });
        return;
      }

      const nameError = validatePlayerName(playerName);
      if (nameError) { socket.emit('error', { message: nameError }); return; }

      const cleanName   = (playerName as string).trim();
      const cleanAvatar = (typeof avatarId === 'string' && VALID_AVATAR_IDS.has(avatarId)) ? avatarId : 'ghost';

      if (roomCode && roomCode !== 'new') {
        const cleanCode = String(roomCode).trim().toUpperCase();
        if (!/^[A-Z0-9]{4,8}$/.test(cleanCode)) {
          socket.emit('error', { message: 'Invalid room code format.' });
          return;
        }
      }

      const code = (roomCode || generateRoomCode()).toUpperCase();
      let room = rooms.get(code);

      // ── Create room if needed ─────────────────────────────────────────────
      if (!room) {
        if (roomCode && roomCode !== 'new') {
          socket.emit('error', { message: 'No room with that code exists. Check the code and try again.' });
          return;
        }
        if (rooms.size >= MAX_ROOMS) {
          socket.emit('error', { message: 'Server is at capacity. Please try again later.' });
          return;
        }
        room = {
          code,
          players: [],
          status:  "lobby",
          mode:    "round",
          target:  10,
          topicTimeSecs:    TOPIC_TIME_SECONDS,
          questionTimeSecs: QUESTION_TIME_SECONDS,
          currentRound: 0,
          usedTopics:   [],
          askedQuestions: [],
          answers: {},
          regionMode: "global",
          topicMode:  "live",
        };
        rooms.set(code, room);
        roomJoinOrder.set(code, []);
        log(`Room ${code} created`);
      }

      if (room.status === 'ended') {
        socket.emit('error', { message: 'That game has already ended. Please start a new room.' });
        return;
      }

      socket.join(code);

      // ── Resolve identity ───────────────────────────────────────────────────
      // Priority: (1) client-supplied UUID match, (2) name match for offline player.
      // A currently-connected player with the same name is a collision — rejected.
      let existingPlayer: Player | undefined;

      if (typeof clientPlayerId === 'string' && clientPlayerId.length > 0) {
        existingPlayer = room.players.find(p => p.id === clientPlayerId);
      }
      if (!existingPlayer) {
        existingPlayer = room.players.find(
          p => p.name.toLowerCase() === cleanName.toLowerCase()
        );
      }

      if (existingPlayer && existingPlayer.isConnected) {
        // A live socket already owns this identity — reject
        socket.leave(code);
        socket.emit('error', { message: 'That nickname is already in use in this room.' });
        return;
      }

      // ── Reconnect path ────────────────────────────────────────────────────
      if (existingPlayer) {
        // Cancel grace-period timer — they made it back
        const dt = disconnectTimers.get(existingPlayer.id);
        if (dt) { clearTimeout(dt); disconnectTimers.delete(existingPlayer.id); }

        // Update socket indexes
        const oldSocketId = existingPlayer.socketId;
        if (oldSocketId && oldSocketId !== socket.id) socketToPlayer.delete(oldSocketId);
        socketToPlayer.set(socket.id, existingPlayer.id);
        playerToSocket.set(existingPlayer.id, socket.id);
        playerToRoom.set(existingPlayer.id, code); // idempotent but ensures it's set

        existingPlayer.socketId    = socket.id;
        existingPlayer.isConnected = true;
        if (cleanAvatar) existingPlayer.avatarId = cleanAvatar;

        io.to(code).emit("gameState", serializeRoom(room));
        socket.emit("playerIdentity", { playerId: existingPlayer.id });
        log(`${cleanName} reconnected to ${code} (pid=${existingPlayer.id})`);
        return;
      }

      // ── New player path ───────────────────────────────────────────────────
      // Count only connected players toward the cap — offline players in the
      // grace window don't block new joins.
      const connectedCount = room.players.filter(p => p.isConnected).length;
      if (connectedCount >= 8) {
        socket.leave(code);
        socket.emit('error', { message: 'Room is full (max 8 players).' });
        return;
      }

      // isHost = true only if there are NO players at all (connected or offline).
      // A room where everyone is in the grace window still has an implicit host
      // who will reconnect — don't hand it to a new stranger.
      const isHost = room.players.length === 0;

      const playerId = uuidv4();
      const player: Player = {
        id:          playerId,
        socketId:    socket.id,
        name:        cleanName,
        avatarId:    cleanAvatar,
        score:       0,
        streak:      0,
        isReady:     false,
        isHost,
        isConnected: true,
      };

      room.players.push(player);
      roomJoinOrder.get(code)!.push(playerId);

      // Register all three indexes atomically
      socketToPlayer.set(socket.id, playerId);
      playerToSocket.set(playerId, socket.id);
      playerToRoom.set(playerId, code);

      // Late-joiner during a live question: sentinel excludes them from scoring
      if (room.status === 'question') {
        room.answers[playerId] = { answerIndex: -2, timeTaken: 0 };
      }

      io.to(code).emit("gameState", serializeRoom(room));
      socket.emit("playerIdentity", { playerId });
      log(`${cleanName} joined ${code} (pid=${playerId}, host=${isHost})`);
    });

    // ── setReady ──────────────────────────────────────────────────────────────
    socket.on("setReady", ({ isReady }) => {
      if (isRateLimited(socket.id, 'setReady')) return;
      const room   = getRoomBySocketId(socket.id);
      const player = getPlayerBySocketId(socket.id);
      if (!room || !player) return;
      player.isReady = isReady;
      io.to(room.code).emit("gameState", serializeRoom(room));
    });

    // ── updateSettings ────────────────────────────────────────────────────────
    socket.on("updateSettings", ({ mode, target, topicTimeSecs, questionTimeSecs, regionMode, regionId, countryCode }) => {
      if (isRateLimited(socket.id, 'updateSettings')) return;
      const room   = getRoomBySocketId(socket.id);
      const player = getPlayerBySocketId(socket.id);
      if (!room || !player || !player.isHost || room.status !== 'lobby') return;

      const validModes = ['round', 'score'];
      if (!validModes.includes(mode)) return;
      const validTargets = mode === 'round' ? [10, 20] : [1000, 2000];
      if (!validTargets.includes(target)) return;

      room.mode   = mode;
      room.target = target;

      if (typeof topicTimeSecs === 'number' && topicTimeSecs >= TOPIC_TIME_MIN && topicTimeSecs <= TOPIC_TIME_MAX)
        room.topicTimeSecs = topicTimeSecs;
      if (typeof questionTimeSecs === 'number' && questionTimeSecs >= QUESTION_TIME_MIN && questionTimeSecs <= QUESTION_TIME_MAX)
        room.questionTimeSecs = questionTimeSecs;

      const validRegionModes: RegionMode[] = ['global', 'regional'];
      if (regionMode && validRegionModes.includes(regionMode)) {
        room.regionMode = regionMode;
        if (regionMode === 'regional') {
          const validRegionIds = REGIONS.map(r => r.id);
          if (regionId && validRegionIds.includes(regionId)) {
            room.regionId = regionId;
            const region  = REGIONS.find(r => r.id === regionId);
            const validCC = region?.countries.map(c => c.code) ?? [];
            room.countryCode = (countryCode && validCC.includes(countryCode)) ? countryCode : undefined;
          } else { room.regionId = undefined; room.countryCode = undefined; }
        } else { room.regionId = undefined; room.countryCode = undefined; }
      }
      io.to(room.code).emit("gameState", serializeRoom(room));
    });

    // ── startGame ─────────────────────────────────────────────────────────────
    socket.on("startGame", ({ mode, target, topicTimeSecs, questionTimeSecs, regionMode, regionId, countryCode }) => {
      if (isRateLimited(socket.id, 'startGame')) return;
      const room   = getRoomBySocketId(socket.id);
      const player = getPlayerBySocketId(socket.id);
      if (!room || !player || !player.isHost || room.status !== 'lobby') return;
      // Need at least 2 live (connected) players to start
      if (room.players.filter(p => p.isConnected).length < 2) return;

      const validModes = ['round', 'score'];
      if (!validModes.includes(mode)) return;
      const validTargets = mode === 'round' ? [10, 20] : [1000, 2000];
      if (!validTargets.includes(target)) return;

      room.mode   = mode;
      room.target = target;

      if (typeof topicTimeSecs === 'number' && topicTimeSecs >= TOPIC_TIME_MIN && topicTimeSecs <= TOPIC_TIME_MAX)
        room.topicTimeSecs = topicTimeSecs;
      if (typeof questionTimeSecs === 'number' && questionTimeSecs >= QUESTION_TIME_MIN && questionTimeSecs <= QUESTION_TIME_MAX)
        room.questionTimeSecs = questionTimeSecs;

      const validRegionModes: RegionMode[] = ['global', 'regional'];
      if (regionMode && validRegionModes.includes(regionMode)) {
        room.regionMode = regionMode;
        if (regionMode === 'regional') {
          const validRegionIds = REGIONS.map(r => r.id);
          if (regionId && validRegionIds.includes(regionId)) {
            room.regionId = regionId;
            const region  = REGIONS.find(r => r.id === regionId);
            const validCC = region?.countries.map(c => c.code) ?? [];
            room.countryCode = (countryCode && validCC.includes(countryCode)) ? countryCode : undefined;
          }
        } else { room.regionId = undefined; room.countryCode = undefined; }
      }

      room.currentRound = 0;
      room.players.forEach(p => { p.score = 0; p.streak = 0; });

      if (room.topicMode === 'preset') {
        const host           = room.players.find(p => p.isHost);
        const hostSubmission = host ? (room.presetTopics ?? {})[host.id] : undefined;
        if (!hostSubmission || hostSubmission.length === 0) {
          socket.emit('error', { message: 'Host must submit at least 1 topic before starting.' });
          room.status = 'lobby'; room.currentRound = 0;
          room.players.forEach(p => { p.score = 0; p.streak = 0; });
          io.to(room.code).emit('gameState', serializeRoom(room));
          return;
        }
        const notSubmitted = room.players.filter(
          p => p.isConnected && (room.presetTopics ?? {})[p.id] === undefined
        );
        if (notSubmitted.length > 0) {
          const names = notSubmitted.map(p => p.name).join(', ');
          socket.emit('error', { message: `Still waiting for: ${names} (they can submit 0 topics to skip)` });
          room.status = 'lobby'; room.currentRound = 0;
          room.players.forEach(p => { p.score = 0; p.streak = 0; });
          io.to(room.code).emit('gameState', serializeRoom(room));
          return;
        }
        const allTopicEntries = Object.values(room.presetTopics ?? {}).flat();
        startPresetMode(room, io, allTopicEntries);
      } else {
        startTopicSelection(room, io);
      }
    });

    // ── getTopicSuggestions ───────────────────────────────────────────────────
    socket.on("getTopicSuggestions", async () => {
      if (isRateLimited(socket.id, 'getTopicSuggestions')) return;
      const room   = getRoomBySocketId(socket.id);
      const player = getPlayerBySocketId(socket.id);
      if (!room || !player || room.status !== 'topic_selection') return;
      if (player.id !== room.topicSelectorId) return;
      try {
        const suggestions = await generateTopicSuggestions([]);
        socket.emit("topicSuggestions", { suggestions });
      } catch { /* silently fail — client falls back to static list */ }
    });

    // ── selectTopic ───────────────────────────────────────────────────────────
    socket.on("selectTopic", async ({ topic, difficulty }) => {
      if (isRateLimited(socket.id, 'selectTopic')) return;
      const room   = getRoomBySocketId(socket.id);
      const player = getPlayerBySocketId(socket.id);
      if (!room || !player || room.status !== 'topic_selection') return;
      if (player.id !== room.topicSelectorId) return;
      if (room.currentTopic) return; // double-submit guard

      if (isUnusableTopic(topic)) {
        socket.emit("error", { message: "That doesn't look like a valid topic — try something real!" });
        return;
      }

      const validDifficulties  = ['Easy', 'Medium', 'Hard'];
      const difficultyOverride = validDifficulties.includes(difficulty) ? difficulty : undefined;

      // Lock topic before the async gap to prevent double-submission races
      room.currentTopic = topic;
      clearRoomTimer(room.code);
      await proceedToQuestion(room, io, topic, difficultyOverride);
    });

    // ── submitAnswer ──────────────────────────────────────────────────────────
    socket.on("submitAnswer", ({ answerIndex }) => {
      if (isRateLimited(socket.id, 'submitAnswer')) return;
      const room   = getRoomBySocketId(socket.id);
      const player = getPlayerBySocketId(socket.id);
      if (!room || !player || room.status !== 'question') return;
      if (typeof answerIndex !== 'number' || !Number.isInteger(answerIndex) || answerIndex < 0 || answerIndex > 3) return;

      const pid          = player.id;
      const participants = room.questionParticipants ?? [];
      // Reject late-joiners (not in frozen participant list)
      if (!participants.includes(pid)) return;
      // Reject double-submit
      const existing = room.answers[pid];
      if (existing && existing.answerIndex >= 0) return;

      const timeRemaining = room.questionDeadline ? Math.max(0, room.questionDeadline - Date.now()) : 0;
      room.answers[pid]   = { answerIndex, timeTaken: timeRemaining };

      io.to(room.code).emit("gameState", serializeRoom(room));
      checkAllAnswered(room, io);
    });

    // ── updateTopicMode ───────────────────────────────────────────────────────
    socket.on("updateTopicMode", ({ topicMode }) => {
      const room   = getRoomBySocketId(socket.id);
      const player = getPlayerBySocketId(socket.id);
      if (!room || !player || !player.isHost || room.status !== 'lobby') return;
      if (topicMode !== 'live' && topicMode !== 'preset') return;
      room.topicMode = topicMode;
      if (topicMode === 'live') { room.presetTopics = {}; room.pregeneratedQuestions = []; }
      io.to(room.code).emit('gameState', serializeRoom(room));
    });

    // ── submitPresetTopics ────────────────────────────────────────────────────
    socket.on("submitPresetTopics", ({ topics }) => {
      if (isRateLimited(socket.id, 'submitPresetTopics')) return;
      const room   = getRoomBySocketId(socket.id);
      const player = getPlayerBySocketId(socket.id);
      if (!room || !player || room.status !== 'lobby' || !Array.isArray(topics)) return;

      const validDifficulties = ['Easy', 'Medium', 'Hard'];
      const cleaned: { topic: string; difficulty: 'Easy' | 'Medium' | 'Hard' }[] = topics
        .filter((t: any) => t && typeof t.topic === 'string' && t.topic.trim().length >= 2)
        .map((t: any) => ({
          topic:      t.topic.trim().slice(0, 50),
          difficulty: validDifficulties.includes(t.difficulty) ? t.difficulty : 'Medium',
        }))
        .filter((t: any) => !containsProfanity(t.topic))
        .slice(0, 5);

      if (player.isHost && cleaned.length === 0) {
        socket.emit('error', { message: 'As host, please add at least 1 topic.' });
        return;
      }
      if (!room.presetTopics) room.presetTopics = {};
      room.presetTopics[player.id] = cleaned;
      io.to(room.code).emit('gameState', serializeRoom(room));
      log(`${player.name} submitted ${cleaned.length} preset topic(s) in ${room.code}`);
    });

    // ── playAgain ─────────────────────────────────────────────────────────────
    socket.on("playAgain", () => {
      if (isRateLimited(socket.id, 'playAgain')) return;
      const room   = getRoomBySocketId(socket.id);
      const player = getPlayerBySocketId(socket.id);
      if (!room || !player || room.status !== 'ended') return;

      if (!room.playAgainIds)      room.playAgainIds      = [];
      if (!room.viewingResultsIds) room.viewingResultsIds = room.players.map(p => p.id);

      const pid = player.id;
      if (!room.playAgainIds.includes(pid)) {
        room.playAgainIds.push(pid);
        room.viewingResultsIds = room.viewingResultsIds.filter(id => id !== pid);
      }

      io.to(room.code).emit("gameState", serializeRoom(room));

      // Auto-transition when all CONNECTED players have voted
      const connected = room.players.filter(p => p.isConnected);
      if (connected.length >= 1 && connected.every(p => room.playAgainIds!.includes(p.id))) {
        resetRoomToLobby(room, io);
      }
    });

    // ── resetGame ─────────────────────────────────────────────────────────────
    socket.on("resetGame", () => {
      if (isRateLimited(socket.id, 'resetGame')) return;
      const room   = getRoomBySocketId(socket.id);
      const player = getPlayerBySocketId(socket.id);
      if (!room || !player || !player.isHost || room.status !== 'ended') return;
      clearRoomCache(room.code, room.usedTopics);
      resetRoomToLobby(room, io);
    });

    // ── kickPlayer ────────────────────────────────────────────────────────────
    socket.on("kickPlayer", ({ targetId }) => {
      const room   = getRoomBySocketId(socket.id);
      const player = getPlayerBySocketId(socket.id);
      if (!room || !player || !player.isHost || room.status !== 'lobby') return;
      if (targetId === player.id) return; // can't kick yourself

      const targetIdx = room.players.findIndex(p => p.id === targetId);
      if (targetIdx === -1) return;

      const target    = room.players[targetIdx];
      const targetSid = playerToSocket.get(targetId);

      // Notify before removing
      emitToPlayer(io, targetId, 'kicked', { message: 'You were removed from the room by the host.' });
      if (targetSid) {
        io.sockets.sockets.get(targetSid)?.leave(room.code);
        socketToPlayer.delete(targetSid);
      }

      // Cancel any pending disconnect timer
      const dt = disconnectTimers.get(targetId);
      if (dt) { clearTimeout(dt); disconnectTimers.delete(targetId); }

      // Clean all indexes
      playerToSocket.delete(targetId);
      playerToRoom.delete(targetId);
      room.players.splice(targetIdx, 1);
      const jo = roomJoinOrder.get(room.code);
      if (jo) { const ji = jo.indexOf(targetId); if (ji !== -1) jo.splice(ji, 1); }

      io.to(room.code).emit('gameState', serializeRoom(room));
      log(`[kick] host="${player.name}" kicked pid="${targetId}" name="${target.name}"`);
    });

    // ── updateAvatar ──────────────────────────────────────────────────────────
    socket.on("updateAvatar", ({ avatarId }) => {
      if (isRateLimited(socket.id, 'updateAvatar')) return;
      const room   = getRoomBySocketId(socket.id);
      const player = getPlayerBySocketId(socket.id);
      if (!room || !player || room.status !== 'lobby') return;
      if (typeof avatarId !== 'string' || !VALID_AVATAR_IDS.has(avatarId)) return;
      player.avatarId = avatarId;
      io.to(room.code).emit("gameState", serializeRoom(room));
    });

    // ── react ─────────────────────────────────────────────────────────────────
    socket.on("react", ({ emoji }) => {
      if (isRateLimited(socket.id, 'react')) return;
      const room   = getRoomBySocketId(socket.id);
      const player = getPlayerBySocketId(socket.id);
      if (!room || !player) return;
      const ALLOWED = new Set(['👍', '😂', '🔥', '🤯']);
      if (typeof emoji !== 'string' || !ALLOWED.has(emoji)) return;
      io.to(room.code).emit("reaction", { playerId: player.id, emoji });
    });

    // ── disconnect ────────────────────────────────────────────────────────────
    socket.on("disconnect", () => {
      log(`Socket disconnected: ${socket.id}`);
      cleanupRateLimit(socket.id);

      const pid  = socketToPlayer.get(socket.id);

      // Always remove the socket entry — whether or not we find a player
      socketToPlayer.delete(socket.id);

      if (!pid) return;

      const room   = getRoomByPlayerId(pid);
      if (!room) {
        // Player had no room — clean up dangling indexes
        playerToSocket.delete(pid);
        playerToRoom.delete(pid);
        return;
      }

      const player = room.players.find(p => p.id === pid);
      if (!player) {
        // Player not in room.players — clean up dangling indexes
        playerToSocket.delete(pid);
        playerToRoom.delete(pid);
        return;
      }

      // Mark offline — game state (timer, participants, answers) UNCHANGED
      player.isConnected = false;
      player.socketId    = '';
      playerToSocket.delete(pid);
      // Keep playerToRoom so grace-period reconnect can find the room

      if (room.status !== 'ended') {
        io.to(room.code).emit("gameState", serializeRoom(room));
      }

      // Start grace-period countdown
      const existing = disconnectTimers.get(pid);
      if (existing) clearTimeout(existing); // cancel any previous timer for this player

      disconnectTimers.set(pid, setTimeout(() => {
        disconnectTimers.delete(pid);
        // Re-fetch live room — it may have been deleted or reset while we waited
        const liveRoom = getRoomByPlayerId(pid);
        if (!liveRoom) {
          // Room already gone — just clean up the stale playerToRoom entry
          playerToRoom.delete(pid);
          return;
        }
        const stillOffline = liveRoom.players.find(p => p.id === pid && !p.isConnected);
        if (stillOffline) {
          log(`Grace expired pid=${pid} name="${stillOffline.name}" in ${liveRoom.code} — hard remove`);
          hardRemovePlayer(pid, liveRoom, io);
        }
        // If player reconnected (isConnected=true) grace timer is cancelled above;
        // this branch is only hit if they're still offline.
      }, RECONNECT_GRACE_MS));
    });

    // ── leaveRoom (intentional quit) ──────────────────────────────────────────
    socket.on("leaveRoom", () => {
      cleanupRateLimit(socket.id);
      const pid  = socketToPlayer.get(socket.id);
      // Remove the socket index entry first so hardRemovePlayer doesn't double-delete
      socketToPlayer.delete(socket.id);
      const room = pid ? getRoomByPlayerId(pid) : undefined;
      if (pid && room) {
        // Also clean playerToSocket so hardRemovePlayer's socketToPlayer.delete
        // on leaving.socketId won't touch an already-deleted key
        playerToSocket.delete(pid);
        const player = room.players.find(p => p.id === pid);
        if (player) player.socketId = ''; // prevent hardRemovePlayer from re-deleting
        hardRemovePlayer(pid, room, io);
      }
    });
  });
}

// ── Hard remove ───────────────────────────────────────────────────────────────
/**
 * Permanently removes a player from room.players and all indexes.
 * This is the ONLY place players are removed.
 *
 * Game-phase invariants preserved:
 *   - questionParticipants is NEVER touched — missing answers → timed-out at results
 *   - Question/results timers are NEVER cleared — the game engine runs to completion
 *   - Only the topic-selection phase gets a new selector assigned (no timer reset)
 */
function hardRemovePlayer(pid: string, room: Room, io: Server) {
  const code      = room.code;
  const playerIdx = room.players.findIndex(p => p.id === pid);
  if (playerIdx === -1) {
    // Already removed — clean up any stale indexes that survived
    playerToSocket.delete(pid);
    playerToRoom.delete(pid);
    return;
  }

  const leaving = room.players[playerIdx];

  // Cancel disconnect timer if still pending
  const dt = disconnectTimers.get(pid);
  if (dt) { clearTimeout(dt); disconnectTimers.delete(pid); }

  // Clean socket indexes — guard against already-deleted entries
  if (leaving.socketId && socketToPlayer.get(leaving.socketId) === pid) {
    socketToPlayer.delete(leaving.socketId);
  }
  playerToSocket.delete(pid);
  playerToRoom.delete(pid);

  // Remove from room
  room.players.splice(playerIdx, 1);

  // Remove from join-order
  const jo = roomJoinOrder.get(code);
  if (jo) { const ji = jo.indexOf(pid); if (ji !== -1) jo.splice(ji, 1); }

  // Remove from meta-lists
  if (room.playAgainIds)      room.playAgainIds      = room.playAgainIds.filter(id => id !== pid);
  if (room.viewingResultsIds) room.viewingResultsIds = room.viewingResultsIds.filter(id => id !== pid);

  log(`Player pid=${pid} name="${leaving.name}" removed from ${code} (${room.players.length} remain)`);

  // ── Room empty? ───────────────────────────────────────────────────────────
  if (room.players.length === 0) {
    // Schedule destruction — give 60s for a last-player refresh to reconnect.
    // If nobody comes back, destroyRoom cleans everything up.
    clearRoomTimer(code); // cancel any game-phase timer
    setRoomTimer(code, () => {
      const still = rooms.get(code);
      if (still && still.players.length === 0) {
        destroyRoom(code);
      }
      // If someone rejoined in those 60s, room.players.length > 0, leave it alone.
    }, 60_000);
    return;
  }

  // ── Transfer host if needed ───────────────────────────────────────────────
  if (leaving.isHost) {
    // Give host to first remaining player (connected or not — they may reconnect)
    room.players[0].isHost = true;
    log(`Host transferred to "${room.players[0].name}" in ${code}`);
  }

  // ── Only 1 player left during active game → end it ───────────────────────
  if (room.players.length === 1 && room.status !== 'lobby' && room.status !== 'ended') {
    clearRoomTimer(code);
    room.status = 'ended';
    io.to(code).emit("gameState", serializeRoom(room));
    scheduleEndedRoomCleanup(room, io);
    return;
  }

  // ── Topic-selection: reassign selector (timer keeps running) ──────────────
  if (room.topicSelectorId === pid && room.status === 'topic_selection') {
    reassignTopicSelector(room, io);
    return; // reassignTopicSelector emits gameState
  }

  // ── Question phase: check if everyone remaining has answered ─────────────
  // We do NOT touch questionParticipants or the timer.
  // checkAllAnswered will advance early only if all connected participants answered.
  // If not, the timer fires and proceedToResults auto-submits the missing ones.
  if (room.status === 'question') {
    checkAllAnswered(room, io);
    // checkAllAnswered emits if it advances; we emit unconditionally below
  }

  io.to(code).emit("gameState", serializeRoom(room));
}

// ── Early-advance: all connected participants answered ────────────────────────
/**
 * Advances to results early ONLY when every connected participant has submitted.
 * Disconnected participants' answers are left empty — proceedToResults auto-submits
 * them as timed-out. We never advance early when there are zero real answers
 * (all participants are offline) — let the timer run instead of skipping the round.
 */
function checkAllAnswered(room: Room, io: Server) {
  if (room.status !== 'question' || !room.currentQuestion) return;

  const participants = room.questionParticipants ?? [];
  if (participants.length === 0) return;

  let realAnswerCount   = 0;
  let connectedWaiting  = 0;

  for (const pid of participants) {
    const answer = room.answers[pid];
    const hasRealAnswer = answer !== undefined && answer.answerIndex >= 0;
    if (hasRealAnswer) {
      realAnswerCount++;
    } else {
      // Not answered yet — is this player still connected?
      const p = room.players.find(pl => pl.id === pid);
      if (p && p.isConnected) connectedWaiting++;
    }
  }

  // Only advance early if at least one real answer exists AND no connected player
  // is still waiting. (If everyone disconnected mid-question, let the timer run.)
  if (connectedWaiting === 0 && realAnswerCount > 0) {
    clearRoomTimer(room.code);
    io.to(room.code).emit("gameState", serializeRoom(room));
    proceedToResults(room, io);
  }
}

// ── Reassign topic selector ───────────────────────────────────────────────────
function reassignTopicSelector(room: Room, io: Server) {
  const liveRoom = rooms.get(room.code);
  if (!liveRoom || liveRoom.players.length === 0) return;
  room = liveRoom;

  const joinOrder    = roomJoinOrder.get(room.code) ?? [];
  const connectedIds = room.players.filter(p => p.isConnected).map(p => p.id);

  // Find next connected player in join order, skipping the old selector
  let newSelector = '';
  for (let i = 0; i < joinOrder.length; i++) {
    const candidate = joinOrder[(room.currentRound - 1 + i) % joinOrder.length];
    if (connectedIds.includes(candidate) && candidate !== room.topicSelectorId) {
      newSelector = candidate;
      break;
    }
  }
  // If everyone else is also offline, fall back to first connected player
  if (!newSelector && connectedIds.length > 0) newSelector = connectedIds[0];

  room.topicSelectorId = newSelector || room.topicSelectorId; // keep old if nobody else
  // Topic deadline and timer are UNCHANGED — the clock keeps counting down
  io.to(room.code).emit("gameState", serializeRoom(room));
  log(`Topic selector reassigned → pid=${newSelector} in ${room.code}`);
}

// ── Lobby reset ───────────────────────────────────────────────────────────────
function resetRoomToLobby(room: Room, io: Server) {
  // Validate mode/target in case of any drift
  if (!['round', 'score'].includes(room.mode)) room.mode = 'round';
  const validTargets = room.mode === 'round' ? [10, 20] : [1000, 2000];
  if (!validTargets.includes(room.target)) room.target = room.mode === 'round' ? 10 : 1000;

  clearRoomTimer(room.code);
  clearRoomCache(room.code, room.usedTopics);

  room.status               = 'lobby';
  room.currentRound         = 0;
  room.usedTopics           = [];
  room.askedQuestions       = [];
  room.answers              = {};
  room.questionParticipants = undefined;
  room.roundPlayerIds       = undefined;
  delete room.currentQuestion;
  delete room.currentTopic;
  delete room.fastestPlayerId;
  delete room.topicSelectorId;
  delete room.topicDeadline;
  delete room.questionDeadline;
  delete room.resultsDeadline;
  room.playAgainIds          = [];
  room.viewingResultsIds     = [];
  room.presetTopics          = {};
  room.pregeneratedQuestions = [];
  // topicMode intentionally preserved — keep host's preference across play-agains

  room.players.forEach(p => {
    p.score = 0; p.streak = 0; p.isReady = false;
    delete p.lastAnswer; delete p.lastAnswerCorrect; delete p.lastPoints;
  });

  // Rebuild join order: preserve relative order for players still in the room
  const existing  = roomJoinOrder.get(room.code) ?? [];
  const allPids   = new Set(room.players.map(p => p.id));
  const rebuilt   = existing.filter(pid => allPids.has(pid));
  room.players.forEach(p => { if (!rebuilt.includes(p.id)) rebuilt.push(p.id); });
  roomJoinOrder.set(room.code, rebuilt);

  io.to(room.code).emit("gameState", serializeRoom(room));
}

// ── Preset mode ───────────────────────────────────────────────────────────────
async function startPresetMode(room: Room, io: Server, allTopics: { topic: string; difficulty: 'Easy' | 'Medium' | 'Hard' }[]) {
  const liveRoom = rooms.get(room.code);
  if (!liveRoom || liveRoom.players.filter(p => p.isConnected).length === 0) return;
  room = liveRoom;

  room.status = 'generating';
  io.to(room.code).emit('gameState', serializeRoom(room));
  log(`[preset] generating ${room.target} questions for room ${room.code}`);

  try {
    const regionCtx = buildRegionContext(room.regionMode, room.regionId, room.countryCode);
    const questions  = await generateQuestionsForPresetMode(allTopics, room.target, room.code, regionCtx || undefined);
    const stillLive  = rooms.get(room.code);
    if (!stillLive || stillLive.players.filter(p => p.isConnected).length === 0) return;
    stillLive.pregeneratedQuestions = questions;
    log(`[preset] ${questions.length} questions ready for room ${room.code}`);
    startPresetRound(stillLive, io);
  } catch (e: any) {
    err(`[preset] generation failed: ${e?.message}`);
    const still = rooms.get(room.code);
    if (!still) return;
    still.status = 'lobby'; still.currentRound = 0;
    still.players.forEach(p => { p.score = 0; p.streak = 0; });
    io.to(room.code).emit('gameState', serializeRoom(still));
    io.to(room.code).emit('error', { message: 'Failed to generate questions. Please try again.' });
  }
}

function startPresetRound(room: Room, io: Server) {
  const liveRoom = rooms.get(room.code);
  if (!liveRoom || liveRoom.players.length === 0) return;
  room = liveRoom;

  const questions  = room.pregeneratedQuestions ?? [];
  const roundIndex = room.currentRound; // 0-based index into questions array

  // Score-mode: check if top score has been reached
  if (room.mode === 'score') {
    const topScore = Math.max(0, ...room.players.map(p => p.score));
    if (topScore >= room.target) { endGame(room, io); return; }
  }

  if (roundIndex >= questions.length) { endGame(room, io); return; }

  room.currentRound++;
  room.status               = 'question';
  room.answers              = {};
  room.currentQuestion      = questions[roundIndex];
  room.currentTopic         = questions[roundIndex].topic;
  room.questionDeadline     = Date.now() + questionTimeMs(room);
  // Freeze participants NOW — this list NEVER changes for the life of this question
  room.questionParticipants = room.players.map(p => p.id);
  room.roundPlayerIds       = [...room.questionParticipants];
  room.fastestPlayerId      = undefined;
  room.players.forEach(p => { delete p.lastAnswer; delete p.lastAnswerCorrect; delete p.lastPoints; });

  io.to(room.code).emit('gameState', serializeRoom(room));

  // Timer runs to completion — never cleared by player events
  setRoomTimer(room.code, () => { proceedToResults(room, io); }, questionTimeMs(room));
}

// ── Topic selection ───────────────────────────────────────────────────────────
function startTopicSelection(room: Room, io: Server, incrementRound = true) {
  const liveRoom = rooms.get(room.code);
  if (!liveRoom) return;
  if (liveRoom.players.length === 0) {
    // Everyone left — destroy cleanly rather than leaving a zombie room
    destroyRoom(liveRoom.code);
    return;
  }
  room = liveRoom;

  room.status = "topic_selection";
  if (incrementRound) room.currentRound++;

  // Reset per-round state
  room.answers              = {};
  room.questionParticipants = undefined;
  room.roundPlayerIds       = undefined;
  delete room.currentQuestion;
  delete room.fastestPlayerId;
  delete room.currentTopic;
  room.players.forEach(p => { delete p.lastAnswer; delete p.lastAnswerCorrect; delete p.lastPoints; });

  // Pick selector: walk join-order starting at (round-1) mod length,
  // skip anyone who is offline
  const joinOrder    = roomJoinOrder.get(room.code) ?? [];
  const connectedIds = room.players.filter(p => p.isConnected).map(p => p.id);

  let selectorId = '';
  for (let attempt = 0; attempt < joinOrder.length; attempt++) {
    const candidate = joinOrder[(room.currentRound - 1 + attempt) % joinOrder.length];
    if (connectedIds.includes(candidate)) { selectorId = candidate; break; }
  }
  if (!selectorId && connectedIds.length > 0) selectorId = connectedIds[0];

  room.topicSelectorId = selectorId;
  room.topicDeadline   = Date.now() + topicTimeMs(room);

  io.to(room.code).emit("gameState", serializeRoom(room));

  // Timer always runs — auto-picks a random topic on expiry
  setRoomTimer(room.code, () => {
    const live = rooms.get(room.code);
    if (!live || live.status !== 'topic_selection') return;
    const randomTopic = TOPIC_DATASET[Math.floor(Math.random() * TOPIC_DATASET.length)];
    proceedToQuestion(live, io, randomTopic);
  }, topicTimeMs(room));
}

// ── Question generation ───────────────────────────────────────────────────────
async function proceedToQuestion(room: Room, io: Server, topic: string, difficultyOverride?: string) {
  const preCheck = rooms.get(room.code);
  if (!preCheck || preCheck.players.length === 0) {
    warn(`proceedToQuestion aborted — room ${room.code} is gone or empty`);
    return;
  }

  if (!room.currentTopic) room.currentTopic = topic;
  room.status = "question";

  const roundSnapshot     = room.currentRound;
  const regionCtxSnapshot = buildRegionContext(room.regionMode, room.regionId, room.countryCode);

  io.to(room.code).emit("gameState", serializeRoom(room));

  try {
    const question = await generateQuestion(
      topic, [], room.code, undefined,
      difficultyOverride as any,
      room.askedQuestions ?? [],
      regionCtxSnapshot,
    );

    // Post-await stale-room checks
    const liveRoom = rooms.get(room.code);
    if (!liveRoom) { warn(`Room ${room.code} gone during AI call`); return; }
    if (liveRoom.currentRound !== roundSnapshot) { warn(`Round advanced during AI call — discarding`); return; }
    if (liveRoom.status !== 'question') { warn(`Status changed during AI call — discarding`); return; }

    liveRoom.currentQuestion  = question;
    liveRoom.questionDeadline = Date.now() + questionTimeMs(liveRoom);
    if (!liveRoom.askedQuestions) liveRoom.askedQuestions = [];
    liveRoom.askedQuestions.push(question.text);
    if (question.canonicalTopic?.trim()) liveRoom.currentTopic = question.canonicalTopic.trim();

    // Freeze participants — immutable for this question's lifetime
    liveRoom.questionParticipants = liveRoom.players.map(p => p.id);
    liveRoom.roundPlayerIds       = [...liveRoom.questionParticipants];

    io.to(room.code).emit("gameState", serializeRoom(liveRoom));

    // Timer runs to completion
    setRoomTimer(room.code, () => { proceedToResults(liveRoom, io); }, questionTimeMs(liveRoom));

  } catch (error: any) {
    const liveRoom = rooms.get(room.code);
    if (!liveRoom || liveRoom.currentRound !== roundSnapshot) return;

    if (error?.code === "NO_TRIVIA") {
      warn(`NO_TRIVIA for "${topic}": ${error.message}`);

      let replacementTopic: string;
      try {
        replacementTopic = await suggestSimilarTopic(topic, []);
        log(`[similar-topic] "${topic}" → "${replacementTopic}"`);
      } catch {
        replacementTopic = TOPIC_DATASET[Math.floor(Math.random() * TOPIC_DATASET.length)];
        log(`[similar-topic] AI failed, using random: "${replacementTopic}"`);
      }

      io.to(room.code).emit("topicRejected", {
        badTopic: topic, reason: error.message, newTopic: replacementTopic,
      });
      room.currentTopic = replacementTopic;

      await new Promise(res => setTimeout(res, 2500));

      const stillLive = rooms.get(room.code);
      if (!stillLive || stillLive.currentRound !== roundSnapshot) return;

      io.to(room.code).emit("gameState", serializeRoom(room));

      try {
        const q2 = await generateQuestion(
          replacementTopic, [], room.code, undefined, undefined,
          room.askedQuestions ?? [],
          buildRegionContext(stillLive.regionMode, stillLive.regionId, stillLive.countryCode),
        );
        const afterGen = rooms.get(room.code);
        if (!afterGen || afterGen.currentRound !== roundSnapshot) return;

        afterGen.currentQuestion      = q2;
        afterGen.questionDeadline     = Date.now() + questionTimeMs(afterGen);
        if (q2.canonicalTopic?.trim()) afterGen.currentTopic = q2.canonicalTopic.trim();
        afterGen.questionParticipants = afterGen.players.map(p => p.id);
        afterGen.roundPlayerIds       = [...afterGen.questionParticipants];

        io.to(room.code).emit("gameState", serializeRoom(afterGen));
        setRoomTimer(room.code, () => { proceedToResults(afterGen, io); }, questionTimeMs(afterGen));
      } catch (innerErr) {
        err(`Failed to generate fallback question: ${innerErr}`);
        const lff = rooms.get(room.code);
        if (lff && lff.currentRound === roundSnapshot) startTopicSelection(lff, io, false);
      }
    } else {
      err(`Failed to generate question: ${error?.message || error}`);
      const lff = rooms.get(room.code);
      if (lff && lff.currentRound === roundSnapshot) startTopicSelection(lff, io, false);
    }
  }
}

// ── Results ───────────────────────────────────────────────────────────────────
function proceedToResults(room: Room, io: Server) {
  // Re-fetch from Map — this may be called from a timer closure holding a stale ref
  const liveRoom = rooms.get(room.code);
  if (!liveRoom) return;
  if (liveRoom.status !== 'question') return; // already advanced (double-call guard)
  if (!liveRoom.currentQuestion) {
    warn(`proceedToResults called before question arrived — skipping round`);
    startTopicSelection(liveRoom, io, false);
    return;
  }
  room = liveRoom;

  room.status          = "results";
  room.resultsDeadline = Date.now() + ROUND_RESULTS_TIME;

  const correctIndex   = room.currentQuestion.correctIndex;
  const diffMultiplier =
    room.currentQuestion.difficulty === "Hard"   ? 1.2 :
    room.currentQuestion.difficulty === "Medium" ? 1.1 : 1.0;

  let fastestTime = -1;
  let fastestId: string | undefined;

  // Work from the frozen participant list — includes players who may have left
  // (their Player object was removed by hardRemovePlayer, so find() returns undefined;
  // we still mark their answer as timed-out but skip scoring — they're gone)
  const participants = new Set(room.questionParticipants ?? room.players.map(p => p.id));

  // Auto-submit timed-out answers for all participants who didn't answer
  for (const pid of Array.from(participants)) {
    const existing = room.answers[pid];
    if (!existing || existing.answerIndex < 0) {
      room.answers[pid] = { answerIndex: -1, timeTaken: 0 }; // timed-out sentinel
    }
  }

  // Score participants who are still in room.players (hard-removed players are skipped)
  for (const pid of Array.from(participants)) {
    const answer = room.answers[pid];
    const player = room.players.find(p => p.id === pid);
    if (!player || !answer) continue; // player left mid-round — skip scoring

    player.lastAnswer = answer.answerIndex;
    const isCorrect   = answer.answerIndex === correctIndex && answer.answerIndex >= 0;
    player.lastAnswerCorrect = isCorrect;

    if (isCorrect) {
      player.streak++;
      const base       = Math.floor(75 * diffMultiplier);
      const timeMult   = Math.max(0, answer.timeTaken / questionTimeMs(room));
      const speedBonus = Math.floor(40 * timeMult);
      let streakBonus  = 0;
      if      (player.streak >= 5) streakBonus = 75;
      else if (player.streak >= 4) streakBonus = 50;
      else if (player.streak >= 3) streakBonus = 30;
      else if (player.streak >= 2) streakBonus = 15;
      const points      = base + speedBonus + streakBonus;
      player.lastPoints = points;
      player.score     += points;
      if (answer.timeTaken > fastestTime) { fastestTime = answer.timeTaken; fastestId = pid; }
    } else if (answer.answerIndex === -1) {
      // Timed out
      player.lastAnswerCorrect = null as any;
      player.lastPoints = 0;
      player.streak     = 0;
    } else {
      // Wrong answer
      player.streak     = 0;
      player.lastPoints = 0;
    }
  }

  // Late-joiners (not in participants) — leave their display state untouched
  room.players.forEach(p => {
    if (!participants.has(p.id)) {
      p.lastAnswerCorrect = undefined;
      p.lastPoints        = undefined;
    }
  });

  room.fastestPlayerId = fastestId;
  io.to(room.code).emit("gameState", serializeRoom(room));

  // Results timer runs to completion — game engine drives next phase
  setRoomTimer(room.code, () => { checkGameEndOrNextRound(room, io); }, ROUND_RESULTS_TIME);
}

// ── Next round / game end ─────────────────────────────────────────────────────
function checkGameEndOrNextRound(room: Room, io: Server) {
  const liveRoom = rooms.get(room.code);
  if (!liveRoom) return;
  if (liveRoom.status !== 'results') return; // already moved on
  if (liveRoom.players.length === 0) {
    destroyRoom(liveRoom.code);
    return;
  }
  room = liveRoom;

  let ended = false;
  if (room.mode === 'round' && room.currentRound >= room.target) {
    ended = true;
  } else if (room.mode === 'score') {
    const topScore = Math.max(0, ...room.players.map(p => p.score));
    if (topScore >= room.target) {
      ended = true;
      const sorted = [...room.players].sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return (b.lastPoints ?? 0) - (a.lastPoints ?? 0);
      });
      room.players.splice(0, room.players.length, ...sorted);
    }
  }
  if (!ended && room.topicMode === 'preset') {
    const total = room.pregeneratedQuestions?.length ?? 0;
    if (total > 0 && room.currentRound >= total) ended = true;
  }

  if (ended) endGame(room, io);
  else if (room.topicMode === 'preset') startPresetRound(room, io);
  else startTopicSelection(room, io);
}

// ── End game ──────────────────────────────────────────────────────────────────
function endGame(room: Room, io: Server) {
  room.status            = "ended";
  room.playAgainIds      = [];
  room.viewingResultsIds = room.players.map(p => p.id);
  clearRoomTimer(room.code); // no more game-phase timers
  io.to(room.code).emit("gameState", serializeRoom(room));
  scheduleEndedRoomCleanup(room, io);
}

// ── Ended-room cleanup schedule ───────────────────────────────────────────────
/**
 * Keeps the room alive for 5 minutes so players can see the podium,
 * share results, and vote to play again.
 * Warns 30s before deletion so the client can show a graceful message.
 */
function scheduleEndedRoomCleanup(room: Room, io: Server) {
  const ENDED_ROOM_TTL    = 5 * 60_000;
  const EXPIRED_WARN_LEAD = 30_000;

  setRoomTimer(room.code, () => {
    const warnRoom = rooms.get(room.code);
    if (warnRoom) {
      io.to(room.code).emit('roomExpired', {
        message: 'Room session ended. Start a new game to keep playing.',
      });
    }
    // Final deletion 30s after the warning
    setRoomTimer(room.code, () => {
      destroyRoom(room.code);
    }, EXPIRED_WARN_LEAD);
  }, ENDED_ROOM_TTL - EXPIRED_WARN_LEAD);
}
