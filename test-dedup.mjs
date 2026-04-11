/**
 * DEDUP QA TEST — Self-contained, no DB, no network, no sockets.
 *
 * Tests the full question deduplication logic across 3 simulated game sessions
 * with the same 3 players playing the same topic repeatedly.
 *
 * Simulates exactly:
 *   - 3 rooms, 5 rounds each (same players, same topic "Physics")
 *   - All code paths: in-session askedQuestions, in-memory markServed/hasBeenServed,
 *     cross-session seen_hashes (Options 2+3), pool floor (Option 4)
 *   - The DB is simulated as plain JS objects — no pg required
 *
 * Pass criteria:
 *   □ No question repeated within a single session (in-session dedup)
 *   □ No question repeated across sessions for logged-in players (cross-session dedup)
 *   □ Guests get best-effort dedup (usage_count ordering) but no guarantee
 *   □ Pool floor forces AI generation when < MIN_POOL_SIZE questions exist
 *   □ endGame correctly writes seen_hashes for all present players, not just answerers
 */

import crypto from 'crypto';

// ─── Colour helpers ──────────────────────────────────────────────────────────
const G = s => `\x1b[32m${s}\x1b[0m`;  // green
const R = s => `\x1b[31m${s}\x1b[0m`;  // red
const Y = s => `\x1b[33m${s}\x1b[0m`;  // yellow
const B = s => `\x1b[36m${s}\x1b[0m`;  // cyan
const W = s => `\x1b[1m${s}\x1b[0m`;   // bold

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) {
    console.log(G('  ✓ ') + msg);
    passed++;
  } else {
    console.log(R('  ✗ ') + msg);
    failed++;
  }
}

// ─── Replicate the exact in-memory dedup from ai.ts ─────────────────────────

const roomSeenQuestions = new Map(); // roomId → Map<fingerprint, {addedAt}>

function questionFingerprint(q) {
  const answer = q.options[q.correctIndex]?.toLowerCase().trim() ?? '';
  return q.text.slice(0, 80).toLowerCase().trim() + '|' + answer;
}

function hasBeenServed(roomId, q) {
  const seen = roomSeenQuestions.get(roomId);
  if (!seen) return false;
  return seen.has(questionFingerprint(q));
}

function markServed(roomId, q) {
  if (!roomSeenQuestions.has(roomId)) roomSeenQuestions.set(roomId, new Map());
  roomSeenQuestions.get(roomId).set(questionFingerprint(q), { addedAt: Date.now() });
}

function clearRoomCache(roomId) {
  roomSeenQuestions.delete(roomId);
}

function computeTextHash(text) {
  const normalised = text.toLowerCase().replace(/[^a-z0-9]/g, '');
  return crypto.createHash('md5').update(normalised).digest('hex');
}

// ─── Simulated question bank (replaces Postgres) ────────────────────────────
// Each entry: { id, canonicalTopic, text, options, correctIndex, explanation,
//               difficulty, region, textHash, usageCount, lastUsedAt }

const questionBank = [];
let questionIdCounter = 1;

function storeQuestion(q, rawTopic, region) {
  const normalised = q.text.toLowerCase().replace(/[^a-z0-9]/g, '');
  const textHash = crypto.createHash('md5').update(normalised).digest('hex');
  const canonicalTopic = (q.canonicalTopic ?? rawTopic)
    .trim()
    .replace(/\w\S*/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());

  // Check unique index (canonical_topic, text_hash)
  const exists = questionBank.find(
    r => r.canonicalTopic.toLowerCase() === canonicalTopic.toLowerCase() && r.textHash === textHash
  );
  if (exists) return '';  // onConflictDoNothing

  const id = `q${questionIdCounter++}`;
  questionBank.push({
    id, topic: rawTopic, canonicalTopic, text: q.text,
    options: q.options, correctIndex: q.correctIndex,
    explanation: q.explanation, difficulty: q.difficulty,
    region, textHash, usageCount: 0, lastUsedAt: null,
    isActive: true,
  });
  return id;
}

// Replicates fetchRoomSeenData + fetchQuestionFromBank from storage.ts
const MIN_POOL_SIZE = 3;

// Simulated user_stats: userId → { seenHashes: string[] }
const userStatsDb = new Map();
// Simulated user_topic_stats: `${userId}:${topic.lower}` → { lastSeenHash }
const userTopicStatsDb = new Map();

function fetchRoomSeenData(playerUserIds, chooserUserId, topic) {
  const excludeHashes = new Set();
  for (const uid of playerUserIds) {
    const stats = userStatsDb.get(uid);
    if (stats) {
      for (const h of stats.seenHashes) excludeHashes.add(h);
    }
    // Option 3: per-topic last seen hash
    const topicKey = `${uid}:${topic.toLowerCase()}`;
    const topicStats = userTopicStatsDb.get(topicKey);
    if (topicStats?.lastSeenHash) excludeHashes.add(topicStats.lastSeenHash);
  }
  return { excludeHashes };
}

function fetchQuestionFromBank(topic, region, roomSeen) {
  // Option 4: pool floor
  const pool = questionBank.filter(
    r => r.canonicalTopic.toLowerCase() === topic.toLowerCase() &&
         (r.region === region || r.region === 'global') &&
         r.isActive
  );
  if (pool.length < MIN_POOL_SIZE) return null;

  const excludeSet = roomSeen?.excludeHashes ?? new Set();

  // Filter out seen questions
  let candidates = pool.filter(r => !r.textHash || !excludeSet.has(r.textHash));

  // All excluded → return null, force AI generation (never repeat from DB)
  if (candidates.length === 0) return null;

  // Order by: not-recently-used first, then usageCount asc, then random
  const now = Date.now();
  candidates.sort((a, b) => {
    const aFresh = a.lastUsedAt && (now - a.lastUsedAt) < 3600000 ? 0 : 1;
    const bFresh = b.lastUsedAt && (now - b.lastUsedAt) < 3600000 ? 0 : 1;
    if (bFresh !== aFresh) return bFresh - aFresh;
    if (a.usageCount !== b.usageCount) return a.usageCount - b.usageCount;
    return Math.random() - 0.5;
  });

  const row = candidates[0];
  row.usageCount++;
  row.lastUsedAt = Date.now();

  return { dbId: row.id, textHash: row.textHash, text: row.text,
           options: row.options, correctIndex: row.correctIndex,
           explanation: row.explanation, difficulty: row.difficulty,
           canonicalTopic: row.canonicalTopic };
}

// Replicates upsertUserStats + upsertUserTopicStats from storage.ts
const MAX_SEEN_HASHES = 500;

function upsertUserStats(userId, stats, newSeenHashes = []) {
  const existing = userStatsDb.get(userId) ?? {
    totalGames: 0, totalCorrect: 0, totalAnswered: 0,
    bestStreak: 0, totalScore: 0, seenHashes: []
  };
  existing.totalGames++;
  existing.totalCorrect  += stats.totalCorrect;
  existing.totalAnswered += stats.totalAnswered;
  existing.bestStreak    = Math.max(existing.bestStreak, stats.bestStreak);
  existing.totalScore    += stats.totalScore;
  // Atomic append + trim (mirrors the SQL in storage.ts)
  const combined = [...existing.seenHashes, ...newSeenHashes];
  existing.seenHashes = combined.slice(-MAX_SEEN_HASHES);
  userStatsDb.set(userId, existing);
}

function upsertUserTopicStats(userId, topicTally) {
  for (const [topic, counts] of Object.entries(topicTally)) {
    const key = `${userId}:${topic.toLowerCase()}`;
    const existing = userTopicStatsDb.get(key) ?? { totalAnswered: 0, totalCorrect: 0, lastSeenHash: null };
    existing.totalAnswered += counts.answered;
    existing.totalCorrect  += counts.correct;
    if (counts.lastSeenHash) existing.lastSeenHash = counts.lastSeenHash;
    userTopicStatsDb.set(key, existing);
  }
}

// ─── Simulated AI question generator ────────────────────────────────────────
// Instead of calling real AI, generate deterministic fake questions
// with unique text so we can track repeats precisely.

let questionTextCounter = 1;

function generateAIQuestion(topic, askedQuestions = []) {
  // Keep generating until we get one not in askedQuestions
  let attempts = 0;
  while (attempts < 100) {
    const num = questionTextCounter++;
    const text = `${topic} question #${num}: What is concept ${num}?`;
    const fingerprint = text.slice(0, 80).toLowerCase().trim();
    const alreadyAsked = askedQuestions.some(
      q => q.slice(0, 80).toLowerCase().trim() === fingerprint
    );
    if (!alreadyAsked) {
      return {
        text,
        options: [`Answer ${num}A`, `Answer ${num}B`, `Answer ${num}C`, `Answer ${num}D`],
        correctIndex: 0,
        explanation: `Explanation for concept ${num}`,
        difficulty: 'Medium',
        canonicalTopic: topic,
      };
    }
    attempts++;
  }
  throw new Error('Could not generate unique question');
}

// ─── Simulate one full round ─────────────────────────────────────────────────
// Returns: { question, textHash, servedFromDb }

function simulateRound(roomId, topic, region, players, askedQuestions) {
  // 1. Fetch room seen data (all logged-in players)
  const loggedInUserIds = players
    .filter(p => p.userId)
    .map(p => p.userId);

  const roomSeen = loggedInUserIds.length > 0
    ? fetchRoomSeenData(loggedInUserIds, null, topic)
    : undefined;

  // 2. Try DB bank first
  let question = null;
  let servedFromDb = false;

  const dbQuestion = fetchQuestionFromBank(topic, region, roomSeen);
  if (dbQuestion) {
    // In-session check (Bug B fix)
    const alreadyAsked = askedQuestions.some(
      q => q.slice(0, 80).toLowerCase().trim() === dbQuestion.text.slice(0, 80).toLowerCase().trim()
    );
    if (!alreadyAsked) {
      question = dbQuestion;
      servedFromDb = true;
      markServed(roomId, dbQuestion);
    }
  }

  // 3. Fall through to AI
  if (!question) {
    question = generateAIQuestion(topic, askedQuestions);
    // Compute textHash immediately (our race condition fix)
    question.textHash = computeTextHash(question.text);
    markServed(roomId, question);
    // Store in bank
    const dbId = storeQuestion(question, topic, region);
    question.dbId = dbId;
  }

  return { question, textHash: question.textHash ?? null, servedFromDb };
}

// ─── Simulate endGame stats write ────────────────────────────────────────────

function simulateEndGame(players, roundHistory) {
  for (const p of players) {
    if (!p.userId) continue;

    let totalCorrect = 0, totalAnswered = 0;
    const topicTally = {};
    const newSeenHashes = [];

    for (const round of roundHistory) {
      const answerIndex = round.playerAnswers[p.id];
      if (answerIndex === undefined || answerIndex === -2) continue;

      // Always init topicTally first (crash-fix)
      if (!topicTally[round.topic]) topicTally[round.topic] = { answered: 0, correct: 0 };

      if (round.questionTextHash) {
        if (!newSeenHashes.includes(round.questionTextHash)) {
          newSeenHashes.push(round.questionTextHash);
        }
        topicTally[round.topic].lastSeenHash = round.questionTextHash;
      }

      totalAnswered++;
      const isCorrect = answerIndex === round.correctIndex && answerIndex >= 0;
      if (isCorrect) totalCorrect++;
      topicTally[round.topic].answered++;
      if (isCorrect) topicTally[round.topic].correct++;
    }

    if (newSeenHashes.length > 0 || totalAnswered > 0) {
      upsertUserStats(p.userId, { totalCorrect, totalAnswered, bestStreak: 0, totalScore: 0 }, newSeenHashes);
      upsertUserTopicStats(p.userId, topicTally);
    }
  }
}

// ─── Full multi-session simulation ──────────────────────────────────────────

function runSession(sessionLabel, roomId, topic, region, players, roundCount, allServedQuestions) {
  console.log(B(`\n  ── ${sessionLabel} ──`));
  clearRoomCache(roomId);

  const askedQuestions = [];
  const roundHistory = [];
  const sessionQuestions = [];

  for (let round = 0; round < roundCount; round++) {
    const { question, textHash, servedFromDb } = simulateRound(
      roomId, topic, region, players, askedQuestions
    );

    askedQuestions.push(question.text);
    sessionQuestions.push({ text: question.text, hash: textHash });

    // Simulate all players answering (answerIndex 0 = correct)
    const playerAnswers = {};
    for (const p of players) {
      playerAnswers[p.id] = 0; // everyone answers correctly
    }

    roundHistory.push({
      topic,
      correctIndex: question.correctIndex,
      questionTextHash: textHash,
      playerAnswers,
    });

    const source = servedFromDb ? Y('[DB]') : G('[AI]');
    console.log(`    Round ${round + 1} ${source} ${question.text.slice(0, 60)}`);

    // Check: no repeat within this session
    const prevInSession = sessionQuestions.slice(0, -1).find(q => q.hash === textHash && textHash !== null);
    assert(!prevInSession, `Round ${round + 1}: not a repeat within session (hash: ${textHash?.slice(0,8)}...)`);

    // Check: no repeat across all previous sessions
    const prevAcrossSessions = allServedQuestions.find(q => q.hash === textHash && textHash !== null);
    const loggedInCount = players.filter(p => p.userId).length;
    if (loggedInCount > 0) {
      assert(!prevAcrossSessions,
        `Round ${round + 1}: not a cross-session repeat for logged-in players (hash: ${textHash?.slice(0,8)}...)`
      );
    }
  }

  simulateEndGame(players, roundHistory);
  return sessionQuestions;
}

// ═══════════════════════════════════════════════════════════════════════════
// TEST SUITE
// ═══════════════════════════════════════════════════════════════════════════

console.log(W('\n════════════════════════════════════════'));
console.log(W('  DEDUP QA TEST — Lockd-In'));
console.log(W('════════════════════════════════════════'));

// ─────────────────────────────────────────────────────────────────
// TEST 1: Pool floor — DB skipped when < MIN_POOL_SIZE questions
// ─────────────────────────────────────────────────────────────────
console.log(W('\n[TEST 1] Option 4 — Pool floor'));

{
  const topic = 'Astronomy';
  const region = 'global';
  // Only 2 questions in bank — below MIN_POOL_SIZE (3)
  storeQuestion({ text: 'Astronomy Q1: What is a pulsar?', options: ['A','B','C','D'], correctIndex: 0, explanation: 'e', difficulty: 'Easy', canonicalTopic: topic }, topic, region);
  storeQuestion({ text: 'Astronomy Q2: What is a quasar?', options: ['A','B','C','D'], correctIndex: 0, explanation: 'e', difficulty: 'Easy', canonicalTopic: topic }, topic, region);

  const result = fetchQuestionFromBank(topic, region, undefined);
  assert(result === null, 'Pool of 2 returns null (below MIN_POOL_SIZE=3) → forces AI generation');

  // Add 1 more to hit the floor
  storeQuestion({ text: 'Astronomy Q3: What is a nebula?', options: ['A','B','C','D'], correctIndex: 0, explanation: 'e', difficulty: 'Easy', canonicalTopic: topic }, topic, region);
  const result2 = fetchQuestionFromBank(topic, region, undefined);
  assert(result2 !== null, 'Pool of 3 returns a question (at MIN_POOL_SIZE=3)');
}

// ─────────────────────────────────────────────────────────────────
// TEST 2: In-session dedup — same question never twice in one game
// ─────────────────────────────────────────────────────────────────
console.log(W('\n[TEST 2] In-session dedup (askedQuestions + markServed)'));

{
  const topic = 'Chemistry';
  const region = 'global';
  const roomId = 'ROOM-SESS-TEST';
  clearRoomCache(roomId);

  // Pre-load exactly 3 questions (hits pool floor, uses DB)
  const q1 = { text: 'Chemistry Q1: What is H2O?', options: ['Water','X','Y','Z'], correctIndex: 0, explanation: 'e', difficulty: 'Easy', canonicalTopic: topic };
  const q2 = { text: 'Chemistry Q2: What is NaCl?', options: ['Salt','X','Y','Z'], correctIndex: 0, explanation: 'e', difficulty: 'Easy', canonicalTopic: topic };
  const q3 = { text: 'Chemistry Q3: What is CO2?', options: ['Carbon dioxide','X','Y','Z'], correctIndex: 0, explanation: 'e', difficulty: 'Easy', canonicalTopic: topic };
  [q1, q2, q3].forEach(q => storeQuestion(q, topic, region));

  const players = [{ id: 'p1', userId: 'user-alice' }];
  const askedInSession = [];
  const seen = new Set();

  for (let i = 0; i < 6; i++) {
    const { question } = simulateRound(roomId, topic, region, players, askedInSession);
    askedInSession.push(question.text);
    const fp = questionFingerprint(question);
    assert(!seen.has(fp), `Round ${i+1}: unique question in session (${question.text.slice(0,40)})`);
    seen.add(fp);
  }
}

// ─────────────────────────────────────────────────────────────────
// TEST 3: Cross-session dedup — 3 rooms, same players, same topic
// This is the exact scenario that was broken.
// ─────────────────────────────────────────────────────────────────
console.log(W('\n[TEST 3] Cross-session dedup — 3 rooms × 5 rounds, same players, topic="Physics"'));

{
  const topic = 'Physics';
  const region = 'global';

  const players = [
    { id: 'pA', userId: 'user-alice'   },
    { id: 'pB', userId: 'user-bob'     },
    { id: 'pC', userId: null           }, // guest — no cross-session protection
  ];

  const allServed = []; // accumulates across all sessions

  const s1 = runSession('Room 1 (t=0)', 'ROOM001', topic, region, players, 5, allServed);
  allServed.push(...s1);

  const s2 = runSession('Room 2 (t=15min)', 'ROOM002', topic, region, players, 5, allServed);
  allServed.push(...s2);

  const s3 = runSession('Room 3 (t=30min)', 'ROOM003', topic, region, players, 5, allServed);
  allServed.push(...s3);

  // Summary check: all 15 hashes are unique for logged-in players
  const hashes = allServed.map(q => q.hash).filter(Boolean);
  const uniqueHashes = new Set(hashes);
  assert(
    uniqueHashes.size === hashes.length,
    `All ${hashes.length} questions across 3 sessions are unique (${uniqueHashes.size} unique hashes)`
  );
}

// ─────────────────────────────────────────────────────────────────
// TEST 4: Guest player — no cross-session protection but no crash
// ─────────────────────────────────────────────────────────────────
console.log(W('\n[TEST 4] Guest player — graceful degradation, no crash'));

{
  const topic = 'Biology';
  const region = 'global';
  const guestOnly = [{ id: 'pGuest', userId: null }];

  // Pre-load 3 questions
  ['Cell', 'DNA', 'RNA'].forEach((t, i) =>
    storeQuestion({ text: `Biology Q${i+1}: What is ${t}?`, options: ['A','B','C','D'], correctIndex: 0, explanation: 'e', difficulty: 'Easy', canonicalTopic: topic }, topic, region)
  );

  let crashed = false;
  try {
    const askedQ = [];
    for (let i = 0; i < 4; i++) {
      const { question } = simulateRound('ROOM-GUEST', topic, region, guestOnly, askedQ);
      askedQ.push(question.text);
    }
    assert(true, 'Guest-only room completed 4 rounds without crash');
  } catch (e) {
    crashed = true;
    assert(false, `Guest-only room crashed: ${e.message}`);
  }
}

// ─────────────────────────────────────────────────────────────────
// TEST 5: endGame write — seen_hashes written even for timed-out players
// ─────────────────────────────────────────────────────────────────
console.log(W('\n[TEST 5] endGame write — timed-out player still gets seen_hashes written'));

{
  const userId = 'user-timedout';
  const playerId = 'p-timeout';
  const topic = 'Geography';

  const roundHistory = [
    { topic, correctIndex: 0, questionTextHash: 'hash-geo-1', playerAnswers: { [playerId]: -1 } }, // timed out
    { topic, correctIndex: 0, questionTextHash: 'hash-geo-2', playerAnswers: { [playerId]: -1 } }, // timed out
    { topic, correctIndex: 0, questionTextHash: 'hash-geo-3', playerAnswers: { [playerId]: -2 } }, // absent (late join)
  ];

  simulateEndGame([{ id: playerId, userId }], roundHistory);

  const stats = userStatsDb.get(userId);
  assert(stats !== undefined, 'user_stats row was created for timed-out player');
  assert(
    stats.seenHashes.includes('hash-geo-1') && stats.seenHashes.includes('hash-geo-2'),
    'Timed-out rounds hash-geo-1 and hash-geo-2 recorded in seen_hashes'
  );
  assert(
    !stats.seenHashes.includes('hash-geo-3'),
    'Absent (late-join, -2) round hash-geo-3 NOT recorded (correct — player never saw it)'
  );
}

// ─────────────────────────────────────────────────────────────────
// TEST 6: topicTally crash fix — null questionTextHash doesn't crash
// ─────────────────────────────────────────────────────────────────
console.log(W('\n[TEST 6] topicTally crash fix — null questionTextHash'));

{
  const userId = 'user-nullhash';
  const playerId = 'p-nullhash';
  const topic = 'History';

  const roundHistory = [
    // Old DB question with no textHash computed — this used to crash endGame
    { topic, correctIndex: 0, questionTextHash: null, playerAnswers: { [playerId]: 0 } },
    { topic, correctIndex: 0, questionTextHash: 'hash-hist-2', playerAnswers: { [playerId]: 1 } },
  ];

  let crashed = false;
  try {
    simulateEndGame([{ id: playerId, userId }], roundHistory);
    const stats = userStatsDb.get(userId);
    assert(stats !== undefined, 'endGame completed without crash for null-textHash round');
    assert(
      stats.seenHashes.includes('hash-hist-2'),
      'Non-null hash from same game still recorded correctly'
    );
    assert(
      stats.seenHashes.length === 1,
      'Only 1 hash recorded (null textHash correctly skipped, not crashed)'
    );
  } catch (e) {
    assert(false, `endGame crashed on null textHash: ${e.message}`);
  }
}

// ─────────────────────────────────────────────────────────────────
// TEST 7: Pool exhaustion fallback — when all seen, still serves
// ─────────────────────────────────────────────────────────────────
console.log(W('\n[TEST 7] Pool exhaustion fallback — serves question even when all seen'));

{
  const topic = 'Maths';
  const region = 'global';
  const uid = 'user-exhausted';

  // Pre-load exactly 3 questions
  const mathQs = [
    { text: 'Maths Q1: What is 1+1?', options: ['2','1','3','4'], correctIndex: 0, explanation: 'e', difficulty: 'Easy', canonicalTopic: topic },
    { text: 'Maths Q2: What is 2+2?', options: ['4','3','5','6'], correctIndex: 0, explanation: 'e', difficulty: 'Easy', canonicalTopic: topic },
    { text: 'Maths Q3: What is 3+3?', options: ['6','5','7','8'], correctIndex: 0, explanation: 'e', difficulty: 'Easy', canonicalTopic: topic },
  ];
  mathQs.forEach(q => storeQuestion(q, topic, region));

  // Mark all 3 as seen by this user
  const allHashes = questionBank
    .filter(r => r.canonicalTopic.toLowerCase() === topic.toLowerCase())
    .map(r => r.textHash);
  upsertUserStats(uid, { totalCorrect: 3, totalAnswered: 3, bestStreak: 3, totalScore: 300 }, allHashes);

  const roomSeen = fetchRoomSeenData([uid], null, topic);
  assert(roomSeen.excludeHashes.size >= 3, `Exclude set has ${roomSeen.excludeHashes.size} hashes (all 3 seen questions)`);

  const result = fetchQuestionFromBank(topic, region, roomSeen);
  assert(result === null,
    'Pool exhaustion: returns null to force AI generation (never serves a repeat)'
  );
}

// ─────────────────────────────────────────────────────────────────
// TEST 8: Mixed room — logged-in + guest, dedup applies to logged-in only
// ─────────────────────────────────────────────────────────────────
console.log(W('\n[TEST 8] Mixed room (logged-in + guest) — dedup covers all logged-in players'));

{
  const topic = 'Music';
  const region = 'global';
  const roomId = 'ROOM-MIXED';

  const musicQs = ['Jazz', 'Blues', 'Rock', 'Pop', 'Soul'].map((s, i) => ({
    text: `Music Q${i+1}: What genre is ${s}?`,
    options: [s, 'Other1', 'Other2', 'Other3'],
    correctIndex: 0, explanation: 'e', difficulty: 'Easy', canonicalTopic: topic
  }));
  musicQs.forEach(q => storeQuestion(q, topic, region));

  const mixedPlayers = [
    { id: 'pX', userId: 'user-xavier' },
    { id: 'pY', userId: 'user-yvonne' },
    { id: 'pZ', userId: null },  // guest
  ];

  // Session 1
  const askedR1 = [];
  const r1Questions = [];
  for (let i = 0; i < 5; i++) {
    const { question, textHash } = simulateRound(roomId, topic, region, mixedPlayers, askedR1);
    askedR1.push(question.text);
    r1Questions.push({ text: question.text, hash: textHash });
  }
  const rh1 = r1Questions.map((q, i) => ({
    topic, correctIndex: 0, questionTextHash: q.hash,
    playerAnswers: { pX: 0, pY: 0, pZ: 0 }
  }));
  simulateEndGame(mixedPlayers, rh1);

  // Session 2
  clearRoomCache('ROOM-MIXED2');
  const askedR2 = [];
  const r2Questions = [];
  for (let i = 0; i < 5; i++) {
    const { question, textHash } = simulateRound('ROOM-MIXED2', topic, region, mixedPlayers, askedR2);
    askedR2.push(question.text);
    r2Questions.push({ text: question.text, hash: textHash });
  }

  // For logged-in players: no repeats
  const s1Hashes = new Set(r1Questions.map(q => q.hash).filter(Boolean));
  const s2Hashes = r2Questions.map(q => q.hash).filter(Boolean);
  const crossRepeats = s2Hashes.filter(h => s1Hashes.has(h));
  assert(crossRepeats.length === 0,
    `Logged-in players: 0 cross-session repeats out of ${s2Hashes.length} questions (mixed room)`
  );

  const xStats = userStatsDb.get('user-xavier');
  const yStats = userStatsDb.get('user-yvonne');
  assert(xStats?.seenHashes.length >= 5, `user-xavier: ${xStats?.seenHashes.length} hashes written to DB`);
  assert(yStats?.seenHashes.length >= 5, `user-yvonne: ${yStats?.seenHashes.length} hashes written to DB`);
}

// ─────────────────────────────────────────────────────────────────
// RESULTS
// ─────────────────────────────────────────────────────────────────

console.log(W('\n════════════════════════════════════════'));
console.log(W('  RESULTS'));
console.log(W('════════════════════════════════════════'));
console.log(G(`  Passed: ${passed}`));
if (failed > 0) {
  console.log(R(`  Failed: ${failed}`));
  console.log(R('\n  ✗ DEDUP IS BROKEN — see failures above'));
} else {
  console.log(G('\n  ✓ ALL TESTS PASSED — dedup is working correctly'));
}
console.log('');
process.exit(failed > 0 ? 1 : 0);
