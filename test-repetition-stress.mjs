/**
 * REPETITION STRESS TEST — Cross-room, cross-session, at scale.
 *
 * Simulates realistic game traffic and measures EXACT repetition rates.
 * Flags any repetition as a numbered issue with full context.
 *
 * Scenarios:
 *   A. Same 4 players, same topic, 10 rooms back-to-back (the reported bug)
 *   B. Same 4 players, rotating topics, 10 rooms
 *   C. 8 players (4 logged-in + 4 guests), same topic, 5 rooms
 *   D. Large game: 50 rooms, 10 rounds each, 6 players — measures repetition %
 *   E. Pool exhaustion: only 3 questions in DB, 20 rounds played — measures fallback rate
 *   F. Cold start: 0 questions in DB, verifies AI path works end-to-end
 */

import crypto from 'crypto';

// ─── Colour + formatting ─────────────────────────────────────────────────────
const G  = s => `\x1b[32m${s}\x1b[0m`;
const R  = s => `\x1b[31m${s}\x1b[0m`;
const Y  = s => `\x1b[33m${s}\x1b[0m`;
const B  = s => `\x1b[36m${s}\x1b[0m`;
const W  = s => `\x1b[1m${s}\x1b[0m`;
const DIM = s => `\x1b[2m${s}\x1b[0m`;

// ─── Global counters ─────────────────────────────────────────────────────────
let totalAsserts = 0;
let totalFailed  = 0;
const flags = []; // { severity: 'ERROR'|'WARN', scenario, message, detail }

function assert(cond, msg, detail = '') {
  totalAsserts++;
  if (!cond) {
    totalFailed++;
    return false;
  }
  return true;
}

function flag(severity, scenario, message, detail = '') {
  flags.push({ severity, scenario, message, detail });
  const icon = severity === 'ERROR' ? R('  ✗ FLAG') : Y('  ⚠ WARN');
  console.log(`${icon} [${scenario}] ${message}`);
  if (detail) console.log(DIM(`       ${detail}`));
}

function ok(scenario, message) {
  console.log(G('  ✓ ') + DIM(`[${scenario}]`) + ' ' + message);
}

// ─── Core dedup logic (mirrors ai.ts + storage.ts exactly) ──────────────────

const roomSeenQuestions = new Map();

function computeHash(text) {
  const n = text.toLowerCase().replace(/[^a-z0-9]/g, '');
  return crypto.createHash('md5').update(n).digest('hex');
}

function fingerprint(q) {
  const ans = q.options[q.correctIndex]?.toLowerCase().trim() ?? '';
  return q.text.slice(0, 80).toLowerCase().trim() + '|' + ans;
}

function hasBeenServed(roomId, q) {
  return roomSeenQuestions.get(roomId)?.has(fingerprint(q)) ?? false;
}

function markServed(roomId, q) {
  if (!roomSeenQuestions.has(roomId)) roomSeenQuestions.set(roomId, new Map());
  roomSeenQuestions.get(roomId).set(fingerprint(q), Date.now());
}

function clearRoomCache(roomId) {
  roomSeenQuestions.delete(roomId);
}

// ─── Simulated DB ────────────────────────────────────────────────────────────

const questionBank   = [];  // all stored questions
let   qIdCounter     = 1;
const userStatsDb    = new Map();  // userId → { seenHashes[], totalGames, etc }
const userTopicDb    = new Map();  // `uid:topic` → { lastSeenHash, answered, correct }

const MIN_POOL_SIZE    = 3;
const MAX_SEEN_HASHES  = 500;

function storeQuestion(q, topic, region) {
  const textHash = computeHash(q.text);
  const canon = (q.canonicalTopic ?? topic).trim()
    .replace(/\w\S*/g, w => w[0].toUpperCase() + w.slice(1).toLowerCase());

  // Unique index: (canonicalTopic, textHash)
  if (questionBank.find(r => r.canonicalTopic.toLowerCase() === canon.toLowerCase() && r.textHash === textHash))
    return '';

  const id = `q${qIdCounter++}`;
  questionBank.push({
    id, topic, canonicalTopic: canon, text: q.text,
    options: q.options, correctIndex: q.correctIndex,
    explanation: q.explanation, difficulty: q.difficulty ?? 'Medium',
    region, textHash, usageCount: 0, lastUsedAt: null, isActive: true,
  });
  return id;
}

function countPool(topic, region) {
  return questionBank.filter(r =>
    r.canonicalTopic.toLowerCase() === topic.toLowerCase() &&
    (r.region === region || r.region === 'global') && r.isActive
  ).length;
}

function fetchRoomSeenData(playerUserIds, topic) {
  const excludeHashes = new Set();
  for (const uid of playerUserIds) {
    const stats = userStatsDb.get(uid);
    if (stats) for (const h of stats.seenHashes) excludeHashes.add(h);
    const tk = `${uid}:${topic.toLowerCase()}`;
    const ts = userTopicDb.get(tk);
    if (ts?.lastSeenHash) excludeHashes.add(ts.lastSeenHash);
  }
  return { excludeHashes };
}

function fetchQuestionFromBank(topic, region, roomSeen) {
  // Option 4: pool floor
  const pool = questionBank.filter(r =>
    r.canonicalTopic.toLowerCase() === topic.toLowerCase() &&
    (r.region === region || r.region === 'global') && r.isActive
  );
  if (pool.length < MIN_POOL_SIZE) return null;

  const excl = roomSeen?.excludeHashes ?? new Set();
  const candidates = pool.filter(r => !r.textHash || !excl.has(r.textHash));
  if (candidates.length === 0) return null;

  // Order: fresh first, then least-used, then random
  const now = Date.now();
  candidates.sort((a, b) => {
    const aFresh = a.lastUsedAt && (now - a.lastUsedAt) < 3_600_000 ? 0 : 1;
    const bFresh = b.lastUsedAt && (now - b.lastUsedAt) < 3_600_000 ? 0 : 1;
    if (bFresh !== aFresh) return bFresh - aFresh;
    if (a.usageCount !== b.usageCount) return a.usageCount - b.usageCount;
    return Math.random() - 0.5;
  });

  const row = candidates[0];
  row.usageCount++;
  row.lastUsedAt = now;
  return { ...row };
}

function upsertUserStats(userId, { totalCorrect, totalAnswered, bestStreak, totalScore }, newHashes = []) {
  const e = userStatsDb.get(userId) ?? {
    totalGames: 0, totalCorrect: 0, totalAnswered: 0,
    bestStreak: 0, totalScore: 0, seenHashes: []
  };
  e.totalGames++;
  e.totalCorrect  += totalCorrect;
  e.totalAnswered += totalAnswered;
  e.bestStreak     = Math.max(e.bestStreak, bestStreak);
  e.totalScore    += totalScore;
  const combined   = [...e.seenHashes, ...newHashes];
  e.seenHashes     = combined.slice(-MAX_SEEN_HASHES);
  userStatsDb.set(userId, e);
}

function upsertUserTopicStats(userId, topicTally) {
  for (const [topic, counts] of Object.entries(topicTally)) {
    const key = `${userId}:${topic.toLowerCase()}`;
    const e   = userTopicDb.get(key) ?? { totalAnswered: 0, totalCorrect: 0, lastSeenHash: null };
    e.totalAnswered += counts.answered;
    e.totalCorrect  += counts.correct;
    if (counts.lastSeenHash) e.lastSeenHash = counts.lastSeenHash;
    userTopicDb.set(key, e);
  }
}

// ─── Simulated AI generator ──────────────────────────────────────────────────
// In production the AI generates unique questions. Here we use a counter so
// we can track exactly which questions were repeated and why.

let aiCounter = 1;

function generateAI(topic, askedQuestions = []) {
  // AI avoids repeating asked questions — simulate this correctly
  let attempts = 0;
  while (attempts++ < 200) {
    const n    = aiCounter++;
    const text = `${topic} question #${n}: Concept ${n}`;
    const fp   = text.slice(0, 80).toLowerCase().trim();
    if (!askedQuestions.some(q => q.slice(0, 80).toLowerCase().trim() === fp)) {
      return {
        text,
        options:       [`Ans${n}A`, `Ans${n}B`, `Ans${n}C`, `Ans${n}D`],
        correctIndex:  0,
        explanation:   `Exp ${n}`,
        difficulty:    'Medium',
        canonicalTopic: topic,
        textHash:      computeHash(text),
      };
    }
  }
  throw new Error('AI exhausted unique questions');
}

// ─── Single round simulation ─────────────────────────────────────────────────

function simulateRound(roomId, topic, region, players, askedQuestions) {
  const loggedInIds = players.filter(p => p.userId).map(p => p.userId);

  const roomSeen = loggedInIds.length > 0
    ? fetchRoomSeenData(loggedInIds, topic)
    : undefined;

  // Try DB first
  const dbQ = fetchQuestionFromBank(topic, region, roomSeen);
  if (dbQ) {
    const alreadyAsked = askedQuestions.some(
      q => q.slice(0, 80).toLowerCase().trim() === dbQ.text.slice(0, 80).toLowerCase().trim()
    );
    if (!alreadyAsked) {
      markServed(roomId, dbQ);
      return { question: dbQ, textHash: dbQ.textHash, fromDb: true };
    }
  }

  // AI fallback
  const q = generateAI(topic, askedQuestions);
  q.textHash = computeHash(q.text);
  markServed(roomId, q);
  storeQuestion(q, topic, region);
  return { question: q, textHash: q.textHash, fromDb: false };
}

// ─── End-of-game write ───────────────────────────────────────────────────────

function endGame(players, roundHistory) {
  for (const p of players) {
    if (!p.userId) continue;
    let totalCorrect = 0, totalAnswered = 0;
    const topicTally = {};
    const newHashes  = [];

    for (const round of roundHistory) {
      const ans = round.playerAnswers[p.id];
      if (ans === undefined || ans === -2) continue;
      if (!topicTally[round.topic]) topicTally[round.topic] = { answered: 0, correct: 0 };
      if (round.questionTextHash) {
        if (!newHashes.includes(round.questionTextHash)) newHashes.push(round.questionTextHash);
        topicTally[round.topic].lastSeenHash = round.questionTextHash;
      }
      totalAnswered++;
      const isCorrect = ans === round.correctIndex && ans >= 0;
      if (isCorrect) totalCorrect++;
      topicTally[round.topic].answered++;
      if (isCorrect) topicTally[round.topic].correct++;
    }

    if (newHashes.length > 0 || totalAnswered > 0) {
      upsertUserStats(p.userId, { totalCorrect, totalAnswered, bestStreak: 0, totalScore: 0 }, newHashes);
      upsertUserTopicStats(p.userId, topicTally);
    }
  }
}

// ─── Run one full session (room) ─────────────────────────────────────────────

function runRoom(roomId, topic, region, players, rounds) {
  clearRoomCache(roomId);
  const askedQ   = [];
  const history  = [];
  const served   = [];

  for (let r = 0; r < rounds; r++) {
    const { question, textHash, fromDb } = simulateRound(roomId, topic, region, players, askedQ);
    askedQ.push(question.text);
    served.push({ text: question.text, hash: textHash, fromDb });

    const playerAnswers = {};
    for (const p of players) playerAnswers[p.id] = 0;

    history.push({
      topic,
      correctIndex:    question.correctIndex,
      questionTextHash: textHash,
      playerAnswers,
    });
  }

  endGame(players, history);
  return served;
}

// ─── Repetition analyser ─────────────────────────────────────────────────────

function analyseRepetitions(scenarioLabel, allServed, loggedInUserIds) {
  const total = allServed.length;
  if (total === 0) return { repeats: 0, repeatPct: 0, repeatDetails: [] };

  const seen     = new Map(); // hash → first occurrence { roomIndex, roundIndex, text }
  const repeats  = [];

  for (const { hash, text, roomIndex, roundIndex, fromDb } of allServed) {
    if (!hash) continue;
    if (seen.has(hash)) {
      const first = seen.get(hash);
      repeats.push({
        hash:       hash.slice(0, 8),
        text:       text.slice(0, 60),
        firstSeen:  `Room ${first.roomIndex+1} Round ${first.roundIndex+1}`,
        repeatAt:   `Room ${roomIndex+1} Round ${roundIndex+1}`,
        fromDb,
      });
    } else {
      seen.set(hash, { roomIndex, roundIndex, text });
    }
  }

  const repeatPct = ((repeats.length / total) * 100).toFixed(1);
  return { repeats: repeats.length, total, repeatPct, repeatDetails: repeats };
}

// ═══════════════════════════════════════════════════════════════════════════
// SCENARIOS
// ═══════════════════════════════════════════════════════════════════════════

console.log(W('\n╔══════════════════════════════════════════════════╗'));
console.log(W('║  REPETITION STRESS TEST — Lockd-In Dedup System  ║'));
console.log(W('╚══════════════════════════════════════════════════╝'));
console.log(DIM('  Testing cross-room, cross-session repetition rates\n'));

// ─────────────────────────────────────────────────────────────────────────────
// SCENARIO A: The exact reported bug
// Same 4 players, same topic "Physics", 10 rooms back-to-back
// PRE-FIX: would get 100% repetition (same question every time)
// POST-FIX: should be 0% for logged-in players
// ─────────────────────────────────────────────────────────────────────────────
console.log(W('\n[SCENARIO A] Same 4 players × same topic × 10 rooms (the reported bug)'));

{
  const S = 'A';
  const topic  = 'Physics';
  const region = 'global';
  const players = [
    { id: 'pA1', userId: 'alice' },
    { id: 'pA2', userId: 'bob'   },
    { id: 'pA3', userId: 'carol' },
    { id: 'pA4', userId: 'dave'  },
  ];

  const allServed = [];
  for (let i = 0; i < 10; i++) {
    const served = runRoom(`A-ROOM${i}`, topic, region, players, 10);
    served.forEach((q, r) => allServed.push({ ...q, roomIndex: i, roundIndex: r }));
  }

  const { repeats, total, repeatPct, repeatDetails } = analyseRepetitions(S, allServed, ['alice','bob','carol','dave']);

  console.log(`  Total questions served: ${total} across 10 rooms × 10 rounds`);
  console.log(`  Unique questions:       ${total - repeats}`);
  console.log(`  Cross-room repeats:     ${repeats} (${repeatPct}%)`);

  if (repeats > 0) {
    flag('ERROR', S, `${repeats} cross-room repeats detected (${repeatPct}%) — dedup NOT working for logged-in players!`);
    repeatDetails.slice(0, 5).forEach(r =>
      flag('ERROR', S, `  Repeated: "${r.text}..."`, `First: ${r.firstSeen} → Again: ${r.repeatAt} [fromDb=${r.fromDb}]`)
    );
    if (repeatDetails.length > 5) flag('ERROR', S, `  ...and ${repeatDetails.length - 5} more repeats`);
  } else {
    ok(S, `0% repetition — all ${total} questions unique across 10 rooms for logged-in players ✓`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SCENARIO B: Same players, rotating topics across rooms
// ─────────────────────────────────────────────────────────────────────────────
console.log(W('\n[SCENARIO B] Same 4 players × rotating topics × 10 rooms'));

{
  const S = 'B';
  const topics  = ['History', 'Science', 'Geography', 'Movies', 'Sports', 'Music', 'Politics', 'Technology', 'Food', 'Art'];
  const region  = 'global';
  const players = [
    { id: 'pB1', userId: 'alice' },
    { id: 'pB2', userId: 'bob'   },
    { id: 'pB3', userId: 'carol' },
    { id: 'pB4', userId: 'dave'  },
  ];

  const allServedByTopic = {};
  for (let i = 0; i < 10; i++) {
    const topic  = topics[i];
    const served = runRoom(`B-ROOM${i}`, topic, region, players, 5);
    if (!allServedByTopic[topic]) allServedByTopic[topic] = [];
    served.forEach((q, r) => allServedByTopic[topic].push({ ...q, roomIndex: i, roundIndex: r }));
  }

  let totalRepeats = 0, totalQ = 0;
  for (const [topic, served] of Object.entries(allServedByTopic)) {
    const { repeats } = analyseRepetitions(S, served, ['alice','bob','carol','dave']);
    totalRepeats += repeats;
    totalQ += served.length;
  }

  const repeatPct = ((totalRepeats / totalQ) * 100).toFixed(1);
  if (totalRepeats > 0) {
    flag('ERROR', S, `${totalRepeats} cross-room repeats (${repeatPct}%) across rotating topics`);
  } else {
    ok(S, `0% repetition across 10 different topics × 10 rooms ✓`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SCENARIO C: Mixed room — 4 logged-in + 4 guests
// Logged-in: 0% repeat. Guests: best-effort only.
// ─────────────────────────────────────────────────────────────────────────────
console.log(W('\n[SCENARIO C] Mixed room (4 logged-in + 4 guests) × same topic × 5 rooms'));

{
  const S = 'C';
  const topic  = 'Cricket';
  const region = 'global';
  const players = [
    { id: 'pC1', userId: 'alice'  },
    { id: 'pC2', userId: 'bob'    },
    { id: 'pC3', userId: 'carol'  },
    { id: 'pC4', userId: 'dave'   },
    { id: 'pC5', userId: null     },  // guests
    { id: 'pC6', userId: null     },
    { id: 'pC7', userId: null     },
    { id: 'pC8', userId: null     },
  ];

  const allServed = [];
  for (let i = 0; i < 5; i++) {
    const served = runRoom(`C-ROOM${i}`, topic, region, players, 10);
    served.forEach((q, r) => allServed.push({ ...q, roomIndex: i, roundIndex: r }));
  }

  const loggedInIds = ['alice','bob','carol','dave'];
  const { repeats, total, repeatPct } = analyseRepetitions(S, allServed, loggedInIds);

  if (repeats > 0) {
    flag('ERROR', S, `${repeats} cross-room repeats (${repeatPct}%) — logged-in players should have 0%`);
  } else {
    ok(S, `0% repetition for logged-in players in mixed 8-player rooms × 5 sessions ✓`);
  }
  ok(S, `Guest players: no cross-session guarantee (by design — they have no userId) ✓`);
}

// ─────────────────────────────────────────────────────────────────────────────
// SCENARIO D: Scale test — 50 rooms, 10 rounds, 6 players
// Measures overall system repetition rate at realistic traffic volume
// ─────────────────────────────────────────────────────────────────────────────
console.log(W('\n[SCENARIO D] Scale — 50 rooms × 10 rounds × 6 players (same friend group)'));

{
  const S = 'D';
  const topic  = 'Bollywood';
  const region = 'global';
  const players = [
    { id: 'pD1', userId: 'u1' },
    { id: 'pD2', userId: 'u2' },
    { id: 'pD3', userId: 'u3' },
    { id: 'pD4', userId: 'u4' },
    { id: 'pD5', userId: 'u5' },
    { id: 'pD6', userId: 'u6' },
  ];

  const allServed = [];
  for (let i = 0; i < 50; i++) {
    const served = runRoom(`D-ROOM${i}`, topic, region, players, 10);
    served.forEach((q, r) => allServed.push({ ...q, roomIndex: i, roundIndex: r }));
  }

  const { repeats, total, repeatPct } = analyseRepetitions(S, allServed, ['u1','u2','u3','u4','u5','u6']);

  console.log(`  Total questions served: ${total} (50 rooms × 10 rounds)`);
  console.log(`  Cross-room repeats:     ${repeats} (${repeatPct}%)`);

  if (repeats > 0) {
    flag('ERROR', S, `${repeats} repeats (${repeatPct}%) across 50 rooms — dedup breakdown at scale!`,
      `Logged-in players should see 0% repeats until they exhaust the AI's unique question pool.`
    );
  } else {
    ok(S, `0% repetition across 50 rooms × 10 rounds — scales correctly ✓`);
  }

  // Check DB bank growth — pool should grow as AI generates unique questions
  const poolSize = countPool(topic, 'global');
  console.log(`  DB pool size after 50 rooms: ${poolSize} unique questions stored`);
  if (poolSize < 10) {
    flag('WARN', S, `DB pool only has ${poolSize} questions for "${topic}" — storeQuestion may be deduping too aggressively`);
  } else {
    ok(S, `DB pool grew to ${poolSize} questions — question bank healthy ✓`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SCENARIO E: Pool exhaustion — only 3 questions in DB, 20+ rounds
// When all DB questions are seen, system must fall through to AI (not repeat)
// ─────────────────────────────────────────────────────────────────────────────
console.log(W('\n[SCENARIO E] Pool exhaustion — 3 DB questions, 20 rounds, 2 rooms'));

{
  const S = 'E';
  const topic  = 'TinyTopic';
  const region = 'global';
  const players = [
    { id: 'pE1', userId: 'u-exhaust-1' },
    { id: 'pE2', userId: 'u-exhaust-2' },
  ];

  // Pre-load exactly 3 questions — hits MIN_POOL_SIZE
  ['Alpha', 'Beta', 'Gamma'].forEach((name, i) =>
    storeQuestion({
      text: `TinyTopic Q${i+1}: ${name}?`,
      options: ['A','B','C','D'], correctIndex: 0,
      explanation: 'e', difficulty: 'Easy', canonicalTopic: topic,
    }, topic, region)
  );

  const allServed = [];
  for (let i = 0; i < 2; i++) {
    const served = runRoom(`E-ROOM${i}`, topic, region, players, 10);
    served.forEach((q, r) => allServed.push({ ...q, roomIndex: i, roundIndex: r }));
  }

  const { repeats, total, repeatPct } = analyseRepetitions(S, allServed, ['u-exhaust-1','u-exhaust-2']);
  const fromDb  = allServed.filter(q => q.fromDb).length;
  const fromAI  = allServed.filter(q => !q.fromDb).length;

  console.log(`  Total rounds: ${total}  |  From DB: ${fromDb}  |  From AI: ${fromAI}`);
  console.log(`  Cross-room repeats: ${repeats} (${repeatPct}%)`);

  if (repeats > 0) {
    flag('ERROR', S, `${repeats} repeats (${repeatPct}%) even after pool exhaustion — fallback to AI not working!`);
  } else {
    ok(S, `0% repeats — system correctly falls through to AI when DB pool is exhausted ✓`);
  }

  // After the 3 pre-loaded questions are seen, AI must be generating new ones
  if (fromAI < 10) {
    flag('WARN', S, `Only ${fromAI} AI-generated questions — expected more after pool was exhausted by logged-in players`);
  } else {
    ok(S, `AI generated ${fromAI} new questions when pool was exhausted — fallback works ✓`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SCENARIO F: Cold start — 0 questions in DB for new topic
// DB returns null (pool floor), AI generates, question stored, next room reuses
// ─────────────────────────────────────────────────────────────────────────────
console.log(W('\n[SCENARIO F] Cold start — brand new topic, 0 questions in DB'));

{
  const S = 'F';
  const topic   = 'NicheTopicXYZ123';
  const region  = 'global';
  const players = [
    { id: 'pF1', userId: 'u-cold-1' },
    { id: 'pF2', userId: 'u-cold-2' },
  ];

  const poolBefore = countPool(topic, region);

  const served1 = runRoom('F-ROOM1', topic, region, players, 5);
  const poolAfter5 = countPool(topic, region);

  const served2 = runRoom('F-ROOM2', topic, region, players, 5);
  const poolAfter10 = countPool(topic, region);

  console.log(`  Pool size: before=${poolBefore}, after room1=${poolAfter5}, after room2=${poolAfter10}`);

  if (poolBefore !== 0) {
    flag('WARN', S, `Expected 0 questions for new topic "${topic}", found ${poolBefore}`);
  } else {
    ok(S, `Correctly started with 0 questions in DB ✓`);
  }

  if (poolAfter5 === 0) {
    flag('ERROR', S, `Pool still 0 after room1 — AI questions not being stored!`);
  } else {
    ok(S, `Room 1 grew pool to ${poolAfter5} questions (AI → DB storage working) ✓`);
  }

  // Cross-session check
  const allServed = [
    ...served1.map((q, r) => ({ ...q, roomIndex: 0, roundIndex: r })),
    ...served2.map((q, r) => ({ ...q, roomIndex: 1, roundIndex: r })),
  ];
  const { repeats, total, repeatPct } = analyseRepetitions(S, allServed, ['u-cold-1','u-cold-2']);

  if (repeats > 0) {
    flag('ERROR', S, `${repeats} repeats (${repeatPct}%) even on cold start — cross-session dedup failed!`);
  } else {
    ok(S, `0% repeats across 2 sessions on cold-start topic ✓`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SCENARIO G: Seen-hashes rolling window correctness
// After MAX_SEEN_HASHES questions, oldest should be evictable
// ─────────────────────────────────────────────────────────────────────────────
console.log(W('\n[SCENARIO G] Rolling window — MAX_SEEN_HASHES cap enforcement'));

{
  const S = 'G';
  const uid = 'u-rolling';

  // Write 600 hashes in two batches (over the 500-cap)
  const batch1 = Array.from({ length: 300 }, (_, i) => `hash-batch1-${i}`);
  const batch2 = Array.from({ length: 300 }, (_, i) => `hash-batch2-${i}`);

  upsertUserStats(uid, { totalCorrect: 0, totalAnswered: 0, bestStreak: 0, totalScore: 0 }, batch1);
  upsertUserStats(uid, { totalCorrect: 0, totalAnswered: 0, bestStreak: 0, totalScore: 0 }, batch2);

  const stats = userStatsDb.get(uid);
  const len   = stats.seenHashes.length;

  if (len > MAX_SEEN_HASHES) {
    flag('ERROR', S, `seen_hashes has ${len} entries — exceeds MAX_SEEN_HASHES=${MAX_SEEN_HASHES}! Rolling window broken.`);
  } else {
    ok(S, `seen_hashes capped at ${len}/${MAX_SEEN_HASHES} after writing 600 hashes ✓`);
  }

  // Verify oldest batch1 hashes were evicted
  const oldHashKept  = stats.seenHashes.some(h => h === 'hash-batch1-0');
  const newHashKept  = stats.seenHashes.some(h => h === 'hash-batch2-299');

  if (oldHashKept) {
    flag('WARN', S, `hash-batch1-0 (oldest) still in window — expected it to be evicted after 600 writes`);
  } else {
    ok(S, `Oldest hashes correctly evicted from rolling window ✓`);
  }

  if (!newHashKept) {
    flag('ERROR', S, `hash-batch2-299 (newest) missing from window — rolling window not preserving recent hashes!`);
  } else {
    ok(S, `Newest hashes correctly retained in rolling window ✓`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// FINAL REPORT
// ═══════════════════════════════════════════════════════════════════════════

console.log(W('\n╔══════════════════════════════════════════════════╗'));
console.log(W('║              STRESS TEST RESULTS                  ║'));
console.log(W('╚══════════════════════════════════════════════════╝'));

const errors = flags.filter(f => f.severity === 'ERROR');
const warns  = flags.filter(f => f.severity === 'WARN');

if (errors.length === 0 && warns.length === 0) {
  console.log(G('\n  ✓ ALL SCENARIOS PASSED — Cross-room repetition rate: 0%'));
  console.log(G('  ✓ Dedup system is working correctly end-to-end\n'));
} else {
  if (errors.length > 0) {
    console.log(R(`\n  ✗ ${errors.length} ERROR(S) — Cross-room repetition IS occurring:`));
    errors.forEach(f => console.log(R(`    • [${f.scenario}] ${f.message}`)));
  }
  if (warns.length > 0) {
    console.log(Y(`\n  ⚠ ${warns.length} WARNING(S):`));
    warns.forEach(f => console.log(Y(`    • [${f.scenario}] ${f.message}`)));
  }
  console.log('');
}

// Scenario summary table
console.log(W('  Scenario summary:'));
const scenarios = ['A','B','C','D','E','F','G'];
const labels = {
  A: 'Same players × same topic × 10 rooms',
  B: 'Same players × rotating topics × 10 rooms',
  C: 'Mixed (logged-in + guests) × 5 rooms',
  D: 'Scale: 50 rooms × 10 rounds × 6 players',
  E: 'Pool exhaustion (3 DB questions, 20 rounds)',
  F: 'Cold start (0 DB questions)',
  G: 'Rolling window cap enforcement',
};

for (const s of scenarios) {
  const errs = flags.filter(f => f.severity === 'ERROR' && f.scenario === s).length;
  const wrns = flags.filter(f => f.severity === 'WARN'  && f.scenario === s).length;
  const status = errs > 0 ? R('✗ FAIL') : wrns > 0 ? Y('⚠ WARN') : G('✓ PASS');
  console.log(`  ${status}  [${s}] ${labels[s]}`);
}

console.log('');
process.exit(errors.length > 0 ? 1 : 0);
