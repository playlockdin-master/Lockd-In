import { Server, Socket } from "socket.io";

// Fix #13 — structured logger: [LEVEL] timestamp [source] message
// Consistent format makes Railway logs filterable by severity.
function ts() { return new Date().toISOString(); }
function log(msg: string)   { console.log( `[INFO]  ${ts()} [game] ${msg}`); }
function warn(msg: string)  { console.warn( `[WARN]  ${ts()} [game] ${msg}`); }
function err(msg: string)   { console.error(`[ERROR] ${ts()} [game] ${msg}`); }
import { Room, Player, validatePlayerNameShared, containsProfanity, TOPIC_TIME_SECONDS, QUESTION_TIME_SECONDS } from "@shared/schema";
import { generateQuestion, generateTopicSuggestions, TOPIC_DATASET } from "./ai";

// ── Per-socket rate limiter ──────────────────────────────────────────────────
// Tracks event counts per socket within a rolling 10-second window.
const rateLimitMap = new Map<string, Map<string, { count: number; windowStart: number }>>();

const RATE_LIMITS: Record<string, { max: number; windowMs: number }> = {
  joinRoom:             { max: 5,  windowMs: 10_000 },
  selectTopic:          { max: 5,  windowMs: 10_000 },
  submitAnswer:         { max: 5,  windowMs: 10_000 },
  getTopicSuggestions:  { max: 10, windowMs: 5_000  }, // static dataset — no API cost, generous limit
  react:                { max: 10, windowMs: 5_000  },
  setReady:             { max: 10, windowMs: 10_000 },
  updateSettings:       { max: 10, windowMs: 10_000 },
  startGame:            { max: 5,  windowMs: 10_000 },
  playAgain:            { max: 5,  windowMs: 10_000 },
  resetGame:            { max: 5,  windowMs: 10_000 },
  updateAvatar:         { max: 10, windowMs: 10_000 },
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
  if (entry.count > limit.max) return true;
  return false;
}

function cleanupRateLimit(socketId: string) {
  rateLimitMap.delete(socketId);
}

/** Returns an error string if the name is invalid, or null if it's fine */
function validatePlayerName(raw: unknown): string | null {
  return validatePlayerNameShared(raw);
}

function isUnusableTopic(topic: string): boolean {
  const t = topic.trim();
  if (t.length < 3) return true;
  if (!/[a-zA-Z]/.test(t)) return true;
  if (/^(.)\1+$/i.test(t)) return true;
  const letters = t.replace(/[^a-zA-Z]/g, '');
  const vowels = letters.replace(/[^aeiouAEIOU]/g, '');
  if (letters.length > 4 && vowels.length === 0) return true;
  if (containsProfanity(t)) return true;
  return false;
}


// ── In-memory stores ────────────────────────────────────────────────────────

// Fix #14 — known valid avatar IDs (must stay in sync with client/src/components/Avatar.tsx)
const VALID_AVATAR_IDS = new Set([
  'ghost','gremlin','blob','egg','demon','brain','astro','duck','skull','shroom','robo','cat',
]);

const MAX_ROOMS = 500; // prevent runaway room creation
const rooms = new Map<string, Room>();
const roomTimers = new Map<string, ReturnType<typeof setTimeout>>();
const playerJoinOrder = new Map<string, string[]>();

// O(1) socket → room code index — avoids linear scan on every event
const socketRoomMap = new Map<string, string>();

// Ghost store — preserves score/streak/host for players who disconnect
// so they can rejoin within 2 minutes and get everything back
interface GhostPlayer {
  name: string;
  avatarId: string;
  score: number;
  streak: number;
  isHost: boolean;
  wasTopicSelector: boolean;
  expiresAt: number;
  pendingAnswer?: { answerIndex: number; timeTaken: number };
}
const ghostPlayers = new Map<string, GhostPlayer>();

function ghostKey(roomCode: string, playerName: string): string {
  return `${roomCode}:${playerName.toLowerCase()}`;
}

const MAX_GHOSTS = 1000; // cap ghost store to prevent unbounded growth

function saveGhost(roomCode: string, player: Player, wasTopicSelector: boolean, pendingAnswer?: { answerIndex: number; timeTaken: number }) {
  // Evict oldest ghost if at cap
  if (ghostPlayers.size >= MAX_GHOSTS) {
    const firstKey = ghostPlayers.keys().next().value;
    if (firstKey) ghostPlayers.delete(firstKey);
  }
  ghostPlayers.set(ghostKey(roomCode, player.name), {
    name: player.name,
    avatarId: player.avatarId,
    score: player.score,
    streak: player.streak,
    isHost: player.isHost,
    wasTopicSelector,
    expiresAt: Date.now() + 2 * 60 * 1000,
    pendingAnswer,
  });
}

function restoreGhost(roomCode: string, playerName: string): GhostPlayer | null {
  const key = ghostKey(roomCode, playerName);
  const ghost = ghostPlayers.get(key);
  if (!ghost) return null;
  if (Date.now() > ghost.expiresAt) {
    ghostPlayers.delete(key);
    return null;
  }
  ghostPlayers.delete(key); // consume — one-time restore
  return ghost;
}

// Clean up expired ghosts every 30s
// Fix #12 — also clean rateLimitMap entries for sockets no longer in any room
setInterval(() => {
  const now = Date.now();
  for (const [key, ghost] of Array.from(ghostPlayers.entries())) {
    if (now > ghost.expiresAt) ghostPlayers.delete(key);
  }
  // Remove rate limit entries for socket IDs that are no longer in socketRoomMap
  // (i.e. sockets that dropped without emitting disconnect)
  for (const socketId of Array.from(rateLimitMap.keys())) {
    if (!socketRoomMap.has(socketId)) rateLimitMap.delete(socketId);
  }
}, 30_000);

// Clean up abandoned empty lobbies every 5 minutes
setInterval(() => {
  for (const [code, room] of Array.from(rooms.entries())) {
    if (room.players.length === 0) {
      clearRoomTimer(code);
      rooms.delete(code);
      playerJoinOrder.delete(code);
    }
  }
}, 5 * 60_000);

// ── Timer helpers ───────────────────────────────────────────────────────────

const ROUND_TOPIC_TIME    = TOPIC_TIME_SECONDS    * 1000;
const ROUND_QUESTION_TIME = QUESTION_TIME_SECONDS * 1000;
const ROUND_RESULTS_TIME  = 8000;

function clearRoomTimer(code: string) {
  const t = roomTimers.get(code);
  if (t) {
    clearTimeout(t);
    roomTimers.delete(code);
  }
}

function setRoomTimer(code: string, fn: () => void, delay: number) {
  clearRoomTimer(code);
  roomTimers.set(code, setTimeout(fn, delay));
}

// ── Socket setup ────────────────────────────────────────────────────────────

export function setupGameSockets(io: Server) {
  io.on("connection", (socket: Socket) => {
    log(`Socket connected: ${socket.id}`);

    socket.on("joinRoom", ({ roomCode, playerName, avatarId }) => {
      if (isRateLimited(socket.id, 'joinRoom')) {
        socket.emit('error', { message: 'Too many join attempts. Please wait a moment.' });
        return;
      }
      const nameError = validatePlayerName(playerName);
      if (nameError) {
        socket.emit('error', { message: nameError });
        return;
      }
      const cleanName = (playerName as string).trim();
      const cleanAvatar = (typeof avatarId === 'string' && VALID_AVATAR_IDS.has(avatarId)) ? avatarId : 'ghost';

      // Validate room code format if provided (must be alphanumeric, max 8 chars)
      if (roomCode && roomCode !== 'new') {
        const cleanCode = String(roomCode).trim().toUpperCase();
        if (!/^[A-Z0-9]{4,8}$/.test(cleanCode)) {
          socket.emit('error', { message: 'Invalid room code format.' });
          return;
        }
      }

      const code = (roomCode || generateRoomCode()).toUpperCase();
      socket.join(code);

      let room = rooms.get(code);
      if (!room) {
        // If a specific room code was given (not a "create new" request), reject — don't silently create
        if (roomCode && roomCode !== 'new') {
          socket.leave(code);
          socket.emit('error', { message: 'No room with that code exists. Check the code and try again.' });
          return;
        }
        // Enforce server-wide room cap
        if (rooms.size >= MAX_ROOMS) {
          socket.leave(code);
          socket.emit('error', { message: 'Server is at capacity. Please try again later.' });
          return;
        }
        room = {
          code,
          players: [],
          status: "lobby",
          mode: "round",
          target: 10,
          currentRound: 0,
          usedTopics: [],
          answers: {},
        };
        rooms.set(code, room);
        playerJoinOrder.set(code, []);
      }

      // Block joining rooms that have already ended — they'll reset to lobby shortly
      if (room.status === 'ended') {
        socket.leave(code);
        socket.emit('error', { message: 'That game has already ended. Please start a new room.' });
        return;
      }

      // ── FIX: Peek at ghost without consuming it yet ───────────────────────
      // We only consume (delete) the ghost after the player is safely in the room.
      const ghostKey_ = ghostKey(code, cleanName);
      const ghostRaw = ghostPlayers.get(ghostKey_);
      const ghost = (ghostRaw && Date.now() <= ghostRaw.expiresAt) ? ghostRaw : null;

      const nameAlreadyActive = room.players.some(
        p => p.name.toLowerCase() === cleanName.toLowerCase()
      );
      if (nameAlreadyActive && !ghost) {
        socket.leave(code); // ── FIX: leave channel before rejecting
        socket.emit('error', { message: 'That nickname is already taken in this room.' });
        return;
      }

      // Enforce max player cap (only for genuinely new players)
      if (!ghost && room.players.length >= 8) {
        socket.leave(code); // ── FIX: leave channel before rejecting
        socket.emit('error', { message: 'Room is full (max 8 players).' });
        return;
      }

      // ── FIX: Build player object before consuming ghost ───────────────────
      const isHost = ghost ? ghost.isHost : room.players.length === 0;
      const player: Player = {
        id: socket.id,
        name: cleanName,
        avatarId: cleanAvatar || (ghost ? ghost.avatarId : 'ghost'),
        score: ghost ? ghost.score : 0,
        streak: ghost ? ghost.streak : 0,
        // New players always start unready; ghosts restore their prior state
        // (mid-game status != lobby → they were effectively ready)
        isReady: ghost ? (room.status !== 'lobby') : false,
        isHost,
      };

      // If ghost was host, clear host flag from all current players
      if (ghost?.isHost) {
        room.players.forEach(p => { p.isHost = false; });
      }

      // Safely add player — consume ghost only after this point
      room.players.push(player);
      if (ghost) ghostPlayers.delete(ghostKey_); // consume now that player is in room

      // ── FIX: Register O(1) socket→room mapping ────────────────────────────
      socketRoomMap.set(socket.id, code);

      // ── FIX: Ghost rejoin — replace OLD socket.id with NEW in joinOrder ───
      // Previously the code only appended the new id, leaving the dead old id in
      // the list and corrupting the selector rotation (double slot for one player).
      const joinOrder = playerJoinOrder.get(code)!;
      if (ghost) {
        // Find and replace the old socket id in joinOrder
        const oldIdx = joinOrder.findIndex(id => {
          // The old id is no longer in room.players (we just pushed the new player),
          // so we find the slot that is NOT a current active player id.
          // Since we just pushed the new player, filter out the new socket.id too.
          return id !== socket.id && !room.players.some(p => p.id === id);
        });
        if (oldIdx !== -1) {
          joinOrder[oldIdx] = socket.id;
        } else if (!joinOrder.includes(socket.id)) {
          joinOrder.push(socket.id);
        }
      } else {
        if (!joinOrder.includes(socket.id)) {
          joinOrder.push(socket.id);
        }
      }

      // ── FIX: Restore topic selector if they were the one who left ─────────
      if (ghost?.wasTopicSelector && room.status === 'topic_selection') {
        room.topicSelectorId = socket.id;
        room.topicDeadline = Date.now() + ROUND_TOPIC_TIME;
        clearRoomTimer(code);
        setRoomTimer(code, () => {
          const liveRoomAtFire = rooms.get(code);
          if (!liveRoomAtFire || liveRoomAtFire.status !== 'topic_selection') return;
          const fallbackTopics = [
            "History","Science","Geography","Movies","Music","Sports","Animals","Space","Food","Technology",
          ];
          const randomTopic = fallbackTopics[Math.floor(Math.random() * fallbackTopics.length)];
          proceedToQuestion(liveRoomAtFire, io, randomTopic);
        }, ROUND_TOPIC_TIME);
      }

      // ── FIX: Handle joining during 'question' phase ───────────────────────
      if (room.status === 'question') {
        if (ghost?.pendingAnswer) {
          // Ghost rejoining: restore their answer under the new socket.id
          room.answers[socket.id] = ghost.pendingAnswer;
          // Also update roundPlayerIds to point to new socket.id
          if (room.roundPlayerIds) {
            const oldSlot = room.roundPlayerIds.findIndex(id =>
              id !== socket.id && !room.players.some(p => p.id === id && p.id !== socket.id)
            );
            if (oldSlot !== -1) room.roundPlayerIds[oldSlot] = socket.id;
            else if (!room.roundPlayerIds.includes(socket.id)) room.roundPlayerIds.push(socket.id);
          }
          // ── FIX: Check if restoring this answer completes the round ───────
          const eligibleIds = room.roundPlayerIds ?? room.players.map(p => p.id);
          const answeredEligible = eligibleIds.filter(id => room.answers[id] !== undefined).length;
          if (room.currentQuestion && eligibleIds.length > 0 && answeredEligible === eligibleIds.length) {
            io.to(code).emit("gameState", serializeRoom(room));
            clearRoomTimer(code);
            proceedToResults(room, io);
            return;
          }
        } else {
          // New player joining mid-question: mark them as a late joiner by adding
          // a sentinel answer. This excludes them from the "all answered" count
          // and from timeout penalties in proceedToResults.
          // They can still see and interact with the question UI but won't affect round flow.
          // We do NOT add them to roundPlayerIds so they're skipped in all checks.
          // Their sentinel answer prevents the "timed out" path in proceedToResults.
          room.answers[socket.id] = { answerIndex: -1, timeTaken: 0 }; // sentinel: late joiner
        }
      }

      io.to(code).emit("gameState", serializeRoom(room));
      log(`${cleanName} ${ghost ? 're' : ''}joined ${code}${ghost ? ` (restored ${ghost.score}pts, streak ${ghost.streak})` : ''}`);
    });

    socket.on("setReady", ({ isReady }) => {
      if (isRateLimited(socket.id, 'setReady')) return;
      const room = getRoomBySocketId(socket.id);
      if (!room) return;
      const player = room.players.find((p) => p.id === socket.id);
      if (player) {
        player.isReady = isReady;
        io.to(room.code).emit("gameState", serializeRoom(room));
      }
    });

    socket.on("updateSettings", ({ mode, target }) => {
      if (isRateLimited(socket.id, 'updateSettings')) return;
      const room = getRoomBySocketId(socket.id);
      if (!room || room.status !== "lobby") return;
      const player = room.players.find((p) => p.id === socket.id);
      if (!player || !player.isHost) return;
      const validModes = ['round', 'score'];
      if (!validModes.includes(mode)) return;
      const validRoundTargets = [10, 20];
      const validScoreTargets = [1000, 2000];
      const validTargets = mode === 'round' ? validRoundTargets : validScoreTargets;
      if (!validTargets.includes(target)) return;
      room.mode = mode;
      room.target = target;
      io.to(room.code).emit("gameState", serializeRoom(room));
    });

    socket.on("startGame", ({ mode, target }) => {
      if (isRateLimited(socket.id, 'startGame')) return;
      const room = getRoomBySocketId(socket.id);
      if (!room) return;
      const player = room.players.find((p) => p.id === socket.id);
      if (!player || !player.isHost) return;
      if (room.status !== 'lobby' || room.players.length < 2) return;
      const validModes = ['round', 'score'];
      if (!validModes.includes(mode)) return;
      const validRoundTargets = [10, 20];
      const validScoreTargets = [1000, 2000];
      const validTargets = mode === 'round' ? validRoundTargets : validScoreTargets;
      if (!validTargets.includes(target)) return;
      room.mode = mode;
      room.target = target;
      room.currentRound = 0;
      room.players.forEach((p) => {
        p.score = 0;
        p.streak = 0;
      });
      startTopicSelection(room, io);
    });

    socket.on("getTopicSuggestions", async () => {
      if (isRateLimited(socket.id, 'getTopicSuggestions')) return;
      const room = getRoomBySocketId(socket.id);
      if (!room || room.status !== "topic_selection") return;
      if (socket.id !== room.topicSelectorId) return;

      try {
        const used = room.usedTopics.slice(-15);
        const suggestions = await generateTopicSuggestions(used);
        socket.emit("topicSuggestions", { suggestions });
      } catch (err) {
        console.error("Failed to generate topic suggestions:", err);
        // Silently fail — client falls back to its static list
      }
    });

    socket.on("selectTopic", async ({ topic }) => {
      if (isRateLimited(socket.id, 'selectTopic')) return;
      const room = getRoomBySocketId(socket.id);
      if (!room || room.status !== "topic_selection") return;
      if (socket.id !== room.topicSelectorId) return;
      // Guard against double-submit: currentTopic set means we're already in flight
      if (room.currentTopic) return;

      if (isUnusableTopic(topic)) {
        socket.emit("error", { message: "That doesn't look like a valid topic — try something real!" });
        return;
      }

      // ── FIX: Lock topic immediately before the async gap ─────────────────
      // Set currentTopic now so any concurrent selectTopic event hitting the
      // guard above sees it and bails out — prevents double question generation.
      room.currentTopic = topic;
      clearRoomTimer(room.code);
      await proceedToQuestion(room, io, topic);
    });

    socket.on("submitAnswer", ({ answerIndex }) => {
      if (isRateLimited(socket.id, 'submitAnswer')) return;
      const room = getRoomBySocketId(socket.id);
      if (!room || room.status !== "question") return;

      if (typeof answerIndex !== 'number' || !Number.isInteger(answerIndex) || answerIndex < 0 || answerIndex > 3) return;

      if (!room.answers[socket.id]) {
        // ── FIX (Red #4): Calculate timeTaken server-side to prevent client spoofing ──
        // Client no longer sends timeTaken — we compute it from the authoritative deadline.
        const timeRemaining = room.questionDeadline
          ? Math.max(0, room.questionDeadline - Date.now())
          : 0;
        room.answers[socket.id] = { answerIndex, timeTaken: timeRemaining };

        io.to(room.code).emit("gameState", serializeRoom(room));

        // Only count players who were present when the question was delivered
        const eligibleIds = room.roundPlayerIds ?? room.players.map(p => p.id);
        const answeredEligible = eligibleIds.filter(id => room.answers[id] !== undefined).length;
        if (room.currentQuestion && answeredEligible === eligibleIds.length) {
          clearRoomTimer(room.code);
          proceedToResults(room, io);
        }
      }
    });

    socket.on("playAgain", () => {
      if (isRateLimited(socket.id, 'playAgain')) return;
      const room = getRoomBySocketId(socket.id);
      if (!room || room.status !== 'ended') return;
      if (!room.playAgainIds) room.playAgainIds = [];
      if (!room.viewingResultsIds) room.viewingResultsIds = room.players.map(p => p.id);

      if (!room.playAgainIds.includes(socket.id)) {
        room.playAgainIds.push(socket.id);
        // Remove from viewing results — they've committed to play again
        room.viewingResultsIds = room.viewingResultsIds.filter(id => id !== socket.id);
      }

      io.to(room.code).emit("gameState", serializeRoom(room));

      // Auto-transition to lobby when ALL players have voted play again
      const allVoted = room.players.every(p => room.playAgainIds!.includes(p.id));
      if (allVoted && room.players.length >= 2) {
        resetRoomToLobby(room, io);
      }
    });

    socket.on("resetGame", () => {
      if (isRateLimited(socket.id, 'resetGame')) return;
      const room = getRoomBySocketId(socket.id);
      if (!room) return;
      const player = room.players.find((p) => p.id === socket.id);
      if (!player || !player.isHost) return;
      if (room.status !== 'ended') return;

      // Reset all game state, keep players in the room
      room.status = 'lobby';
      room.currentRound = 0;
      room.usedTopics = [];
      room.answers = {};
      delete room.currentQuestion;
      delete room.currentTopic;
      delete room.fastestPlayerId;
      delete room.topicSelectorId;
      delete room.topicDeadline;
      delete room.questionDeadline;
      delete room.resultsDeadline;
      room.playAgainIds = [];
      room.viewingResultsIds = [];
      room.players.forEach((p) => {
        p.score = 0;
        p.streak = 0;
        p.isReady = false;
        delete p.lastAnswer;
        delete p.lastAnswerCorrect;
        delete p.lastPoints;
      });
      // Reset join order so turn rotation starts fresh
      playerJoinOrder.set(room.code, room.players.map(p => p.id));
      io.to(room.code).emit("gameState", serializeRoom(room));
    });

    // Fix #3 — host kick mechanic
    socket.on("kickPlayer", ({ targetId }) => {
      const room = getRoomBySocketId(socket.id);
      if (!room || room.status !== 'lobby') return;
      const kicker = room.players.find(p => p.id === socket.id);
      if (!kicker?.isHost) return;
      if (targetId === socket.id) return; // can't kick yourself
      const targetIdx = room.players.findIndex(p => p.id === targetId);
      if (targetIdx === -1) return;
      // Notify the kicked player before removing them
      io.to(targetId).emit('kicked', { message: 'You were removed from the room by the host.' });
      // Disconnect them from the Socket.IO room channel
      const targetSocket = io.sockets.sockets.get(targetId);
      if (targetSocket) targetSocket.leave(room.code);
      // Remove from data structures (same as handleDisconnect but no ghost)
      room.players.splice(targetIdx, 1);
      socketRoomMap.delete(targetId);
      const joinOrder = playerJoinOrder.get(room.code);
      if (joinOrder) {
        const ji = joinOrder.indexOf(targetId);
        if (ji !== -1) joinOrder.splice(ji, 1);
      }
      io.to(room.code).emit('gameState', serializeRoom(room));
      log(`[kick] host="${kicker.name}" kicked="${targetId}" room="${room.code}"`);
    });

    socket.on("updateAvatar", ({ avatarId }) => {
      if (isRateLimited(socket.id, 'updateAvatar')) return;
      const room = getRoomBySocketId(socket.id);
      if (!room) return;
      const player = room.players.find((p) => p.id === socket.id);
      if (!player) return;
      // Fix #14 — validate against known set, not just length
      if (typeof avatarId !== 'string' || !VALID_AVATAR_IDS.has(avatarId)) return;
      // Only allow in lobby
      if (room.status !== 'lobby') return;
      player.avatarId = avatarId;
      io.to(room.code).emit("gameState", serializeRoom(room));
    });

    socket.on("react", ({ emoji }) => {
      if (isRateLimited(socket.id, 'react')) return;
      const room = getRoomBySocketId(socket.id);
      if (!room) return;
      const ALLOWED_EMOJI = new Set(['👍', '😂', '🔥', '🤯']);
      if (typeof emoji !== 'string' || !ALLOWED_EMOJI.has(emoji)) return;
      io.to(room.code).emit("reaction", { playerId: socket.id, emoji });
    });

    socket.on("disconnect", () => {
      log(`Socket disconnected: ${socket.id}`);
      cleanupRateLimit(socket.id);
      handleDisconnect(socket.id, io);
    });

    // Intentional leave — same cleanup as disconnect but no ghost saved (player chose to leave)
    socket.on("leaveRoom", () => {
      cleanupRateLimit(socket.id);
      handleDisconnect(socket.id, io, /* saveGhost */ false);
    });
  });
}

/** Shared lobby-reset logic used by both resetGame and playAgain auto-transition */
function resetRoomToLobby(room: Room, io: Server) {
  // ── Yellow #2: Re-validate mode/target to guard against any drift ──────────
  const validModes = ['round', 'score'];
  if (!validModes.includes(room.mode)) room.mode = 'round';
  const validRoundTargets  = [10, 20];
  const validScoreTargets  = [1000, 2000];
  const validTargets = room.mode === 'round' ? validRoundTargets : validScoreTargets;
  if (!validTargets.includes(room.target)) room.target = room.mode === 'round' ? 10 : 1000;

  room.status = 'lobby';
  room.currentRound = 0;
  room.usedTopics = [];
  room.answers = {};
  delete room.currentQuestion;
  delete room.currentTopic;
  delete room.fastestPlayerId;
  delete room.topicSelectorId;
  delete room.topicDeadline;
  delete room.questionDeadline;
  delete room.resultsDeadline;
  room.playAgainIds = [];
  room.viewingResultsIds = [];
  room.players.forEach((p) => {
    p.score = 0;
    p.streak = 0;
    p.isReady = false;
    delete p.lastAnswer;
    delete p.lastAnswerCorrect;
    delete p.lastPoints;
  });
  playerJoinOrder.set(room.code, room.players.map(p => p.id));
  io.to(room.code).emit("gameState", serializeRoom(room));
}

/** Serialize room to a plain object safe for Socket.IO */
function serializeRoom(room: Room): object {
  return {
    code: room.code,
    players: room.players.map((p) => ({ ...p })),
    status: room.status,
    mode: room.mode,
    target: room.target,
    currentRound: room.currentRound,
    usedTopics: [...room.usedTopics],
    currentTopic: room.currentTopic,
    currentQuestion: room.currentQuestion
      ? { ...room.currentQuestion, options: [...room.currentQuestion.options] }
      : undefined,
    topicSelectorId: room.topicSelectorId,
    topicDeadline: room.topicDeadline,
    questionDeadline: room.questionDeadline,
    resultsDeadline: room.resultsDeadline,
    answers: { ...room.answers },
    roundPlayerIds: room.roundPlayerIds ? [...room.roundPlayerIds] : undefined,
    fastestPlayerId: room.fastestPlayerId,
    playAgainIds: room.playAgainIds ? [...room.playAgainIds] : [],
    viewingResultsIds: room.viewingResultsIds ? [...room.viewingResultsIds] : [],
  };
}

function generateRoomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  // Iterative — avoids stack overflow if code space gets crowded
  for (let attempt = 0; attempt < 100; attempt++) {
    let code = "";
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    if (!rooms.has(code)) return code;
  }
  // Extremely unlikely fallback — extend to 8 chars
  let code = "";
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

function getRoomBySocketId(socketId: string): Room | undefined {
  const code = socketRoomMap.get(socketId);
  if (!code) return undefined;
  return rooms.get(code);
}

function handleDisconnect(socketId: string, io: Server, saveGhostOnLeave = true) {
  // Use O(1) lookup BEFORE deleting the mapping
  const code = socketRoomMap.get(socketId);
  socketRoomMap.delete(socketId);

  if (!code) return; // Socket was never in a room (e.g. disconnected before joining)

  const room = rooms.get(code);
  if (!room) return;

  const playerIndex = room.players.findIndex((p) => p.id === socketId);
  if (playerIndex === -1) return; // Already removed (shouldn't happen, but safe)

  {
    const leavingPlayer = room.players[playerIndex];
    const wasSelector = room.topicSelectorId === socketId;

    // Save ghost before removing player — carry any pending answer.
    // Skip on intentional leave: player chose to go, no point preserving their slot.
    const pendingAnswer = room.answers[socketId] as { answerIndex: number; timeTaken: number } | undefined;
    const realPendingAnswer = pendingAnswer && pendingAnswer.answerIndex >= 0 ? pendingAnswer : undefined;
    if (saveGhostOnLeave) {
      saveGhost(code, leavingPlayer, wasSelector, realPendingAnswer);
    }

    room.players.splice(playerIndex, 1);

    // Clean up join order
    const joinOrder = playerJoinOrder.get(code);
    if (joinOrder) {
      const joinIndex = joinOrder.indexOf(socketId);
      if (joinIndex !== -1) joinOrder.splice(joinIndex, 1);
    }

    // Remove from playAgain list if present
    if (room.playAgainIds) {
      room.playAgainIds = room.playAgainIds.filter(id => id !== socketId);
    }
    // Remove from viewingResults list if present
    if (room.viewingResultsIds) {
      room.viewingResultsIds = room.viewingResultsIds.filter(id => id !== socketId);
    }

    // Clean stale answer entry
    delete room.answers[socketId];

    if (room.players.length === 0) {
      clearRoomTimer(code);
      rooms.delete(code);
      playerJoinOrder.delete(code);
      return;
    }

    // Transfer host if needed
    if (leavingPlayer.isHost) {
      room.players[0].isHost = true;
    }

    // Auto-end if only 1 player remains during active game
    if (room.players.length === 1 && room.status !== 'lobby' && room.status !== 'ended') {
      clearRoomTimer(code);
      room.status = 'ended';
      io.to(code).emit("gameState", serializeRoom(room));
      // Fix #1: same extended TTL as normal game end — 5 min with 30s warning
      const ENDED_ROOM_TTL    = 5 * 60_000;
      const EXPIRED_WARN_LEAD = 30_000;
      setRoomTimer(code, () => {
        const warnRoom = rooms.get(code);
        if (warnRoom) io.to(code).emit("roomExpired", { message: "Room session ended." });
        setRoomTimer(code, () => {
          const deadRoom = rooms.get(code);
          if (deadRoom) deadRoom.players.forEach(p => socketRoomMap.delete(p.id));
          rooms.delete(code);
          playerJoinOrder.delete(code);
          roomTimers.delete(code);
        }, EXPIRED_WARN_LEAD);
      }, ENDED_ROOM_TTL - EXPIRED_WARN_LEAD);
      return;
    }

    if (wasSelector && room.status === 'topic_selection') {
      // Selector left — reassign within the same round, do NOT increment
      clearRoomTimer(code);
      startTopicSelection(room, io, false);
    } else if (room.status === 'question') {
      // Also remove leaving player from roundPlayerIds so they don't count
      if (room.roundPlayerIds) {
        room.roundPlayerIds = room.roundPlayerIds.filter(id => id !== socketId);
      }
      // Check if all REMAINING eligible players have now answered.
      // Also guard: if the question hasn't arrived yet (AI still generating), don't
      // short-circuit to results — proceedToResults handles this case with a skip.
      const eligibleIds = room.roundPlayerIds ?? room.players.map(p => p.id);
      const answeredEligible = eligibleIds.filter(id => room.answers[id] !== undefined).length;
      if (room.currentQuestion && eligibleIds.length > 0 && answeredEligible === eligibleIds.length) {
        clearRoomTimer(code);
        proceedToResults(room, io);
      } else {
        io.to(code).emit("gameState", serializeRoom(room));
      }
    } else {
      io.to(code).emit("gameState", serializeRoom(room));
    }
  }
}

function startTopicSelection(room: Room, io: Server, incrementRound = true) {
  // ── Guard: re-fetch from Map — this may be called from a timer with a stale ref ──
  const liveRoom = rooms.get(room.code);
  if (!liveRoom) return; // room deleted while transition was pending
  if (liveRoom.players.length === 0) {
    // Everyone left — silently clean up rather than emitting to an empty channel
    clearRoomTimer(liveRoom.code);
    rooms.delete(liveRoom.code);
    playerJoinOrder.delete(liveRoom.code);
    return;
  }
  // Use the live reference from here
  room = liveRoom;

  room.status = "topic_selection";
  // Only increment the round counter when starting a genuinely new round.
  // When called after a selector disconnect we're reassigning within the same
  // round, so we must NOT increment or a 10-round game silently loses rounds.
  if (incrementRound) room.currentRound++;
  room.answers = {};
  delete room.currentQuestion;
  delete room.fastestPlayerId;
  delete room.currentTopic;
  delete room.roundPlayerIds; // will be set when question is delivered
  room.players.forEach((p) => {
    delete p.lastAnswer;
    delete p.lastAnswerCorrect;
    delete p.lastPoints;
  });

  const joinOrder = playerJoinOrder.get(room.code) || [];

  let selectorId = '';
  if (joinOrder.length > 0) {
    for (let attempt = 0; attempt < joinOrder.length; attempt++) {
      const index = (room.currentRound - 1 + attempt) % joinOrder.length;
      const candidate = joinOrder[index];
      if (room.players.some(p => p.id === candidate)) {
        selectorId = candidate;
        break;
      }
    }
  }

  if (!selectorId && room.players.length > 0) {
    selectorId = room.players[0].id;
  }

  room.topicSelectorId = selectorId;
  room.topicDeadline = Date.now() + ROUND_TOPIC_TIME;

  io.to(room.code).emit("gameState", serializeRoom(room));

  setRoomTimer(room.code, () => {
    const liveRoomAtFire = rooms.get(room.code);
    if (!liveRoomAtFire || liveRoomAtFire.status !== 'topic_selection') return;
    // Use shared TOPIC_DATASET, filtering out recently used topics so we never repeat
    const used = new Set(liveRoomAtFire.usedTopics.map((t: string) => t.toLowerCase()));
    const available = TOPIC_DATASET.filter((t: string) => !used.has(t.toLowerCase()));
    const pool = available.length > 0 ? available : TOPIC_DATASET;
    const randomTopic = pool[Math.floor(Math.random() * pool.length)];
    proceedToQuestion(liveRoomAtFire, io, randomTopic);
  }, ROUND_TOPIC_TIME);
}

// Topic fallback now uses the shared TOPIC_DATASET from ai.ts —
// single source of truth for suggestions, auto-pick, and NO_TRIVIA replacement.

async function proceedToQuestion(room: Room, io: Server, topic: string) {
  // Pre-flight: verify the room is still alive before spending an AI call.
  // The timer closure may hold a stale ref if all players left after the timer was set.
  const preCheck = rooms.get(room.code);
  if (!preCheck || preCheck.players.length === 0) {
    warn(`proceedToQuestion aborted — room ${room.code} is gone or empty`);
    return;
  }

  // currentTopic may already be set by selectTopic's pre-lock — only set if not
  if (!room.currentTopic) room.currentTopic = topic;
  room.usedTopics.push(topic);
  // Fix #7 — cap at 20 so array doesn't grow unboundedly in score mode
  if (room.usedTopics.length > 20) room.usedTopics.shift();
  room.status = "question";

  // Snapshot the round number so we can detect stale responses after the await
  const roundSnapshot = room.currentRound;

  io.to(room.code).emit("gameState", serializeRoom(room));

  try {
    const question = await generateQuestion(topic, room.usedTopics, room.code);

    // ── FIX: Full stale-room check after async gap ────────────────────────
    const liveRoom = rooms.get(room.code);
    if (!liveRoom) {
      warn(`Room ${room.code} disappeared during AI call — discarding question`);
      return;
    }
    if (liveRoom.currentRound !== roundSnapshot) {
      warn(`Room ${room.code} advanced to round ${liveRoom.currentRound} during AI call (was ${roundSnapshot}) — discarding stale question`);
      return;
    }
    if (liveRoom.status !== 'question') {
      warn(`Room ${room.code} status changed to '${liveRoom.status}' during AI call — discarding question`);
      return;
    }

    // Write to liveRoom (the authoritative reference) — not the stale local `room` ref
    liveRoom.currentQuestion = question;
    liveRoom.questionDeadline = Date.now() + ROUND_QUESTION_TIME;
    // Use the AI's canonical topic label if provided (corrects typos & abbreviations like "ch3ss" → "Chess")
    if (question.canonicalTopic?.trim()) {
      liveRoom.currentTopic = question.canonicalTopic.trim();
    }
    // Snapshot who is in the room RIGHT NOW — late joiners after this point are excluded
    // from the answer count and from scoring/timeout penalties for this round.
    liveRoom.roundPlayerIds = liveRoom.players.map(p => p.id);

    io.to(room.code).emit("gameState", serializeRoom(liveRoom));

    setRoomTimer(room.code, () => {
      proceedToResults(liveRoom, io);
    }, ROUND_QUESTION_TIME);

  } catch (err: any) {
    const liveRoom = rooms.get(room.code);
    if (!liveRoom || liveRoom.currentRound !== roundSnapshot) return;

    if (err?.code === "NO_TRIVIA") {
      // ── Bad topic: tell the room, pick a random replacement ──────────────
      warn(`NO_TRIVIA for topic "${topic}": ${err.message}`);

      const reason = err.message || "That topic can't be turned into a trivia question.";
      const usedFallbacks = room.usedTopics;
      const used = new Set(usedFallbacks.map((t: string) => t.toLowerCase()));
      const available = TOPIC_DATASET.filter((t: string) => !used.has(t.toLowerCase()));
      const pool = available.length > 0 ? available : TOPIC_DATASET;
      const randomTopic = pool[Math.floor(Math.random() * pool.length)];

      // Notify all players with the rejection reason
      io.to(room.code).emit("topicRejected", {
        badTopic: topic,
        reason,
        newTopic: randomTopic,
      });

      // Reset topic lock and proceed with the random replacement
      room.currentTopic = randomTopic;
      room.usedTopics.push(randomTopic);

      // Short pause so players can read the message, then generate
      await new Promise(res => setTimeout(res, 2500));

      // Re-check room is still alive after the pause
      const stillLive = rooms.get(room.code);
      if (!stillLive || stillLive.currentRound !== roundSnapshot) return;

      io.to(room.code).emit("gameState", serializeRoom(room));

      try {
        const question = await generateQuestion(randomTopic, room.usedTopics, room.code);
        const afterGen = rooms.get(room.code);
        if (!afterGen || afterGen.currentRound !== roundSnapshot) return;

        // Write to afterGen (live ref), not stale `room` closure
        afterGen.currentQuestion = question;
        afterGen.questionDeadline = Date.now() + ROUND_QUESTION_TIME;
        if (question.canonicalTopic?.trim()) {
          afterGen.currentTopic = question.canonicalTopic.trim();
        }
        afterGen.roundPlayerIds = afterGen.players.map(p => p.id);
        io.to(room.code).emit("gameState", serializeRoom(afterGen));
        setRoomTimer(room.code, () => { proceedToResults(afterGen, io); }, ROUND_QUESTION_TIME);
      } catch (innerErr) {
        err("Failed to generate fallback question:", innerErr);
        // ── Yellow #1 fix: re-fetch live ref before passing to startTopicSelection ──
        const liveForFallback = rooms.get(room.code);
        if (liveForFallback && liveForFallback.currentRound === roundSnapshot) {
          startTopicSelection(liveForFallback, io);
        }
      }

    } else {
      // Transient AI failure — restart topic selection
      err("Failed to generate question:", err?.message || err);
      startTopicSelection(room, io);
    }
  }
}

function proceedToResults(room: Room, io: Server) {
  // ── Guard: verify room is still alive and in the right state ─────────────
  // This function can be called from both a timer callback (with a stale closure ref)
  // and from handleDisconnect directly. If two paths race, the second call must be
  // a no-op. Re-fetching from the Map is the only safe way to check.
  const liveRoom = rooms.get(room.code);
  if (!liveRoom) return; // room was deleted (everyone left) before timer fired
  if (liveRoom.status !== 'question') return; // already moved on (double-call guard)
  if (liveRoom.players.length === 0) return; // no one left to score

  // From here use liveRoom as the authoritative reference
  room = liveRoom;

  // Guard: if the AI call hasn't returned yet there is no question to score against.
  // This can happen when a disconnect triggers the "all answered" check while the
  // question is still generating. The proceedToQuestion post-await code will re-check
  // status and bail out if it changed, so no question will ever arrive — we must skip
  // straight to the next round instead.
  if (!room.currentQuestion) {
    warn(`proceedToResults called on room ${room.code} before question arrived — skipping to next round`);
    startTopicSelection(room, io);
    return;
  }

  room.status = "results";
  room.resultsDeadline = Date.now() + ROUND_RESULTS_TIME;

  // Never use -1 as correctIndex fallback — sentinel answers have answerIndex -1
  // and would incorrectly score as "correct" if correctIndex defaulted to -1.
  const correctIndex = room.currentQuestion.correctIndex;
  const diffMultiplier =
    room.currentQuestion.difficulty === "Hard"
      ? 1.2
      : room.currentQuestion.difficulty === "Medium"
      ? 1.1
      : 1.0;

  // Track fastest correct answerer (highest timeTaken = answered earliest)
  let fastestTime = -1;
  let fastestId: string | undefined = undefined;

  Object.entries(room.answers).forEach(([playerId, answer]) => {
    const player = room.players.find((p) => p.id === playerId);
    if (!player) return;

    player.lastAnswer = answer.answerIndex;
    player.lastAnswerCorrect = answer.answerIndex === correctIndex;

    if (player.lastAnswerCorrect) {
      player.streak++;

      // Base points: flat per difficulty
      const base = Math.floor(75 * diffMultiplier);

      // Speed bonus: up to 40pts, scales with time remaining
      const timeMultiplier = Math.max(0, answer.timeTaken / ROUND_QUESTION_TIME);
      const speedBonus = Math.floor(40 * timeMultiplier);

      // Streak bonus: compounds the longer your streak goes
      let streakBonus = 0;
      if (player.streak >= 5) streakBonus = 75;
      else if (player.streak >= 4) streakBonus = 50;
      else if (player.streak >= 3) streakBonus = 30;
      else if (player.streak >= 2) streakBonus = 15;

      const points = base + speedBonus + streakBonus;
      player.lastPoints = points;
      player.score += points;

      // Fastest correct answer = highest timeTaken (most time left on clock)
      if (answer.timeTaken > fastestTime) {
        fastestTime = answer.timeTaken;
        fastestId = playerId;
      }
    } else {
      player.streak = 0;
      player.lastPoints = 0;
    }
  });

  // Mark players who timed out (not in answers{}) with null so the UI can
  // distinguish "timed out" from "answered wrong" (false).
  // Only applies to players who were present when the question was delivered.
  const eligibleIds = new Set(room.roundPlayerIds ?? room.players.map(p => p.id));
  room.players.forEach((p) => {
    if (!eligibleIds.has(p.id)) {
      // Late joiner — don't penalize; leave their last round state untouched
      p.lastAnswerCorrect = undefined;
      p.lastPoints = undefined;
      return;
    }
    if (!(p.id in room.answers)) {
      p.lastAnswerCorrect = null as any; // null = timed out
      p.lastPoints = 0;
      p.streak = 0;
    }
  });

  // Set fastest correct answerer — badge only, no bonus points
  room.fastestPlayerId = fastestId;

  io.to(room.code).emit("gameState", serializeRoom(room));

  setRoomTimer(room.code, () => {
    checkGameEndOrNextRound(room, io);
  }, ROUND_RESULTS_TIME);
}

function checkGameEndOrNextRound(room: Room, io: Server) {
  // ── Guard: re-fetch from Map — timer closure may hold a stale ref ─────────
  const liveRoom = rooms.get(room.code);
  if (!liveRoom) return; // room was deleted while timer was pending
  if (liveRoom.status !== 'results') return; // room was reset/ended by another path
  if (liveRoom.players.length === 0) {
    // Everyone left during the results phase — clean up silently
    clearRoomTimer(liveRoom.code);
    rooms.delete(liveRoom.code);
    playerJoinOrder.delete(liveRoom.code);
    return;
  }
  // Use the live authoritative reference from here
  room = liveRoom;

  let ended = false;
  if (room.mode === "round" && room.currentRound >= room.target) {
    ended = true;
  } else if (room.mode === "score") {
    // ── Guard against Math.max(...[]) === -Infinity when players array is empty
    const topScore = room.players.length > 0
      ? Math.max(...room.players.map(p => p.score))
      : 0;
    if (topScore >= room.target) {
      ended = true;
      // Tiebreaker: if multiple players hit the target in the same round,
      // the one who earned more points this round wins (i.e. answered faster/correct).
      room.players.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return (b.lastPoints ?? 0) - (a.lastPoints ?? 0);
      });
    }
  }

  if (ended) {
    room.status = "ended";
    room.playAgainIds = [];
    room.viewingResultsIds = room.players.map(p => p.id); // everyone starts viewing results
    clearRoomTimer(room.code);
    io.to(room.code).emit("gameState", serializeRoom(room));

    // Fix #1 + #5: Extended TTL — 5 minutes instead of 60 seconds.
    // Players on the podium screen easily take >60s reading results and
    // deciding whether to play again. The old 60s delete caused "room does
    // not exist" errors for any interaction after the first minute.
    //
    // Fix #5: Emit roomExpired 30s before deletion so clients can show a
    // friendly "session ended" screen instead of a broken error state.
    //
    // Fix #6: Clean socketRoomMap for all players when room is force-deleted
    // so we don't accumulate orphaned socket→room entries forever.
    const ENDED_ROOM_TTL    = 5 * 60_000;   // 5 minutes total
    const EXPIRED_WARN_LEAD = 30_000;        // warn 30s before deletion

    setRoomTimer(room.code, () => {
      // Warn clients 30s before deletion so UI can react gracefully
      const warnRoom = rooms.get(room.code);
      if (warnRoom) {
        io.to(room.code).emit("roomExpired", {
          message: "Room session ended. Start a new game to keep playing.",
        });
      }
      // Schedule the actual deletion 30s after the warning
      setRoomTimer(room.code, () => {
        const deadRoom = rooms.get(room.code);
        if (deadRoom) {
          // Fix #6: clean socketRoomMap for every player still tracked
          deadRoom.players.forEach(p => socketRoomMap.delete(p.id));
        }
        rooms.delete(room.code);
        playerJoinOrder.delete(room.code);
        roomTimers.delete(room.code);
      }, EXPIRED_WARN_LEAD);
    }, ENDED_ROOM_TTL - EXPIRED_WARN_LEAD);
  } else {
    startTopicSelection(room, io);
  }
}
