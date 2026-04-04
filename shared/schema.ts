// ── Drizzle DB table definitions ─────────────────────────────────────────────
import {
  pgTable, uuid, text, boolean, integer, timestamp, jsonb, index, primaryKey,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

export const users = pgTable('users', {
  id:            uuid('id').primaryKey().defaultRandom(),
  oauthProvider: text('oauth_provider').notNull(),           // 'google' | 'discord'
  oauthId:       text('oauth_id').notNull(),                 // provider's user id
  username:      text('username').notNull(),
  avatarId:      text('avatar_id').notNull().default('ghost'),
  createdAt:     timestamp('created_at').notNull().defaultNow(),
  lastSeenAt:    timestamp('last_seen_at').notNull().defaultNow(),
}, t => ({
  providerIdx: index('users_provider_idx').on(t.oauthProvider, t.oauthId),
}));

export const questions = pgTable('questions', {
  id:             uuid('id').primaryKey().defaultRandom(),
  topic:          text('topic').notNull(),
  canonicalTopic: text('canonical_topic').notNull(),
  text:           text('text').notNull(),
  options:        jsonb('options').notNull().$type<string[]>(),
  correctIndex:   integer('correct_index').notNull(),
  explanation:    text('explanation').notNull(),
  difficulty:     text('difficulty').notNull(),              // 'Easy' | 'Medium' | 'Hard'
  region:         text('region').notNull().default('global'),// 'global' | RegionId
  isActive:       boolean('is_active').notNull().default(true),
  createdAt:      timestamp('created_at').notNull().defaultNow(),
}, t => ({
  topicIdx:  index('questions_topic_idx').on(t.canonicalTopic),
  regionIdx: index('questions_region_idx').on(t.region),
}));

export const games = pgTable('games', {
  id:         uuid('id').primaryKey().defaultRandom(),
  roomCode:   text('room_code').notNull(),
  mode:       text('mode').notNull(),                        // 'round' | 'score'
  target:     integer('target').notNull(),
  regionMode: text('region_mode').notNull().default('global'),
  startedAt:  timestamp('started_at').notNull().defaultNow(),
  endedAt:    timestamp('ended_at'),
});

export const gamePlayers = pgTable('game_players', {
  id:         uuid('id').primaryKey().defaultRandom(),
  gameId:     uuid('game_id').notNull().references(() => games.id, { onDelete: 'cascade' }),
  userId:     uuid('user_id').references(() => users.id, { onDelete: 'set null' }), // null = guest
  playerName: text('player_name').notNull(),
  avatarId:   text('avatar_id').notNull().default('ghost'),
  finalScore: integer('final_score').notNull().default(0),
  bestStreak: integer('best_streak').notNull().default(0),
}, t => ({
  gameIdx: index('game_players_game_idx').on(t.gameId),
  userIdx: index('game_players_user_idx').on(t.userId),
}));

export const gameRounds = pgTable('game_rounds', {
  id:          uuid('id').primaryKey().defaultRandom(),
  gameId:      uuid('game_id').notNull().references(() => games.id, { onDelete: 'cascade' }),
  questionId:  uuid('question_id').references(() => questions.id, { onDelete: 'set null' }),
  roundNumber: integer('round_number').notNull(),
  topic:       text('topic').notNull(),
}, t => ({
  gameIdx: index('game_rounds_game_idx').on(t.gameId),
}));

export const roundAnswers = pgTable('round_answers', {
  id:           uuid('id').primaryKey().defaultRandom(),
  roundId:      uuid('round_id').notNull().references(() => gameRounds.id, { onDelete: 'cascade' }),
  userId:       uuid('user_id').references(() => users.id, { onDelete: 'set null' }), // null = guest
  answerIndex:  integer('answer_index').notNull(),           // -1 = timeout, -2 = absent
  timeTaken:    integer('time_taken').notNull().default(0),  // ms remaining when answered
  wasCorrect:   boolean('was_correct').notNull().default(false),
  pointsEarned: integer('points_earned').notNull().default(0),
}, t => ({
  roundIdx: index('round_answers_round_idx').on(t.roundId),
  userIdx:  index('round_answers_user_idx').on(t.userId),
}));

export const playerSeenQuestions = pgTable('player_seen_questions', {
  userId:     uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  questionId: uuid('question_id').notNull().references(() => questions.id, { onDelete: 'cascade' }),
  seenAt:     timestamp('seen_at').notNull().defaultNow(),
}, t => ({
  pk:       primaryKey({ columns: [t.userId, t.questionId] }),
  userIdx:  index('psq_user_idx').on(t.userId),
}));

// ── Relations ─────────────────────────────────────────────────────────────────
export const usersRelations = relations(users, ({ many }) => ({
  gamePlayers:          many(gamePlayers),
  roundAnswers:         many(roundAnswers),
  playerSeenQuestions:  many(playerSeenQuestions),
}));

export const gamesRelations = relations(games, ({ many }) => ({
  gamePlayers: many(gamePlayers),
  gameRounds:  many(gameRounds),
}));

export const gameRoundsRelations = relations(gameRounds, ({ one, many }) => ({
  game:         one(games,     { fields: [gameRounds.gameId],     references: [games.id] }),
  question:     one(questions, { fields: [gameRounds.questionId], references: [questions.id] }),
  roundAnswers: many(roundAnswers),
}));

export const roundAnswersRelations = relations(roundAnswers, ({ one }) => ({
  round: one(gameRounds, { fields: [roundAnswers.roundId], references: [gameRounds.id] }),
  user:  one(users,      { fields: [roundAnswers.userId],  references: [users.id] }),
}));

export const playerSeenQuestionsRelations = relations(playerSeenQuestions, ({ one }) => ({
  user:     one(users,     { fields: [playerSeenQuestions.userId],     references: [users.id] }),
  question: one(questions, { fields: [playerSeenQuestions.questionId], references: [questions.id] }),
}));

// ── Shared profanity list — single source of truth for client + server ────────
export const PROFANITY_SET = new Set([
  'fuck','shit','cunt','bitch','asshole','bastard','cock','dick','pussy',
  'nigger','nigga','faggot','fag','slut','whore','retard','rape','piss',
  'fucked','fucker','fucking','shitting','bitches','dicks','cocks','cunts',
]);

export function containsProfanity(text: string): boolean {
  const words = text.toLowerCase().split(/[\s_\-\.]+/);
  return words.some(w => PROFANITY_SET.has(w));
}

/** Returns an error string if the name is invalid, or null if it's fine */
export function validatePlayerNameShared(raw: unknown): string | null {
  if (typeof raw !== 'string') return 'Nickname must be a string.';
  const name = raw.trim();
  if (name.length < 2) return 'Nickname must be at least 2 characters.';
  if (name.length > 20) return 'Nickname must be 20 characters or less.';
  if (!/[a-zA-Z]/.test(name)) return 'Nickname must contain at least one letter.';
  if (containsProfanity(name)) return "That nickname isn't allowed. Please choose another.";
  return null;
}

export type Difficulty = 'Easy' | 'Medium' | 'Hard';

// ── Region system ─────────────────────────────────────────────────────────────

export type RegionMode = 'global' | 'regional';

export type RegionId =
  | 'south_asia'
  | 'east_asia'
  | 'americas'
  | 'europe'
  | 'mena_africa'
  | 'oceania';

export interface RegionDef {
  id: RegionId;
  label: string;
  flag: string;         // representative emoji flag
  description: string;
  countries: CountryDef[];
}

export interface CountryDef {
  code: string;         // ISO-ish short code
  label: string;
  flag: string;
}

export const REGIONS: RegionDef[] = [
  {
    id: 'south_asia',
    label: 'South Asia',
    flag: '🌏',
    description: 'India, Pakistan, Sri Lanka, Bangladesh & more',
    countries: [
      { code: 'in', label: 'India',       flag: '🇮🇳' },
      { code: 'pk', label: 'Pakistan',    flag: '🇵🇰' },
      { code: 'lk', label: 'Sri Lanka',   flag: '🇱🇰' },
      { code: 'bd', label: 'Bangladesh',  flag: '🇧🇩' },
      { code: 'np', label: 'Nepal',       flag: '🇳🇵' },
    ],
  },
  {
    id: 'east_asia',
    label: 'East Asia',
    flag: '🌏',
    description: 'Japan, Korea, China & Southeast Asia',
    countries: [
      { code: 'jp', label: 'Japan',         flag: '🇯🇵' },
      { code: 'kr', label: 'South Korea',   flag: '🇰🇷' },
      { code: 'cn', label: 'China',         flag: '🇨🇳' },
      { code: 'sg', label: 'Singapore',     flag: '🇸🇬' },
      { code: 'ph', label: 'Philippines',   flag: '🇵🇭' },
      { code: 'id', label: 'Indonesia',     flag: '🇮🇩' },
      { code: 'th', label: 'Thailand',      flag: '🇹🇭' },
      { code: 'vn', label: 'Vietnam',       flag: '🇻🇳' },
    ],
  },
  {
    id: 'americas',
    label: 'Americas',
    flag: '🌎',
    description: 'United States, Canada, Latin America',
    countries: [
      { code: 'us', label: 'United States', flag: '🇺🇸' },
      { code: 'ca', label: 'Canada',        flag: '🇨🇦' },
      { code: 'mx', label: 'Mexico',        flag: '🇲🇽' },
      { code: 'br', label: 'Brazil',        flag: '🇧🇷' },
      { code: 'ar', label: 'Argentina',     flag: '🇦🇷' },
      { code: 'co', label: 'Colombia',      flag: '🇨🇴' },
    ],
  },
  {
    id: 'europe',
    label: 'Europe',
    flag: '🌍',
    description: 'UK, EU, Nordics & Eastern Europe',
    countries: [
      { code: 'gb', label: 'United Kingdom', flag: '🇬🇧' },
      { code: 'de', label: 'Germany',        flag: '🇩🇪' },
      { code: 'fr', label: 'France',         flag: '🇫🇷' },
      { code: 'es', label: 'Spain',          flag: '🇪🇸' },
      { code: 'it', label: 'Italy',          flag: '🇮🇹' },
      { code: 'nl', label: 'Netherlands',    flag: '🇳🇱' },
      { code: 'se', label: 'Sweden',         flag: '🇸🇪' },
      { code: 'pl', label: 'Poland',         flag: '🇵🇱' },
    ],
  },
  {
    id: 'mena_africa',
    label: 'MENA & Africa',
    flag: '🌍',
    description: 'Middle East, North Africa & Sub-Saharan Africa',
    countries: [
      { code: 'sa', label: 'Saudi Arabia',  flag: '🇸🇦' },
      { code: 'ae', label: 'UAE',           flag: '🇦🇪' },
      { code: 'eg', label: 'Egypt',         flag: '🇪🇬' },
      { code: 'ng', label: 'Nigeria',       flag: '🇳🇬' },
      { code: 'za', label: 'South Africa',  flag: '🇿🇦' },
      { code: 'ke', label: 'Kenya',         flag: '🇰🇪' },
      { code: 'ma', label: 'Morocco',       flag: '🇲🇦' },
    ],
  },
  {
    id: 'oceania',
    label: 'Oceania',
    flag: '🌏',
    description: 'Australia, New Zealand & Pacific Islands',
    countries: [
      { code: 'au', label: 'Australia',    flag: '🇦🇺' },
      { code: 'nz', label: 'New Zealand',  flag: '🇳🇿' },
      { code: 'fj', label: 'Fiji',         flag: '🇫🇯' },
    ],
  },
];

/** Lookup helper — returns region def or undefined */
export function getRegion(id: RegionId): RegionDef | undefined {
  return REGIONS.find(r => r.id === id);
}

/** Lookup helper — returns country def or undefined */
export function getCountry(regionId: RegionId, countryCode: string): CountryDef | undefined {
  return getRegion(regionId)?.countries.find(c => c.code === countryCode);
}

export interface Question {
  text: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  difficulty: Difficulty;
  canonicalTopic?: string; // AI-normalised topic label (e.g. "ch3ss" → "Chess")
}

export type GameStateStatus = 'lobby' | 'topic_selection' | 'question' | 'results' | 'ended' | 'generating';

// Shared timer durations — defaults and limits
export const TOPIC_TIME_SECONDS = 25;
export const QUESTION_TIME_SECONDS = 25;

export const TOPIC_TIME_MIN = 15;
export const TOPIC_TIME_MAX = 60;
export const QUESTION_TIME_MIN = 15;
export const QUESTION_TIME_MAX = 60;

export interface Player {
  id: string;         // permanent player identity (UUID, generated once at first join)
  socketId: string;   // current live socket — changes on every reconnect
  name: string;
  avatarId: string; // character id e.g. "ghost" | "gremlin" | ...
  score: number;
  streak: number;
  isReady: boolean;
  isHost: boolean;
  isConnected: boolean; // true = has an active socket right now
  lastAnswer?: number;
  lastAnswerCorrect?: boolean | null; // true = correct, false = wrong, null = timed out
  lastPoints?: number;
  reaction?: string;
  /** @deprecated use isConnected instead — kept for schema compatibility during transition */
  isReconnecting?: boolean;
}

export interface RoundRecord {
  topic: string;
  correctIndex: number;
  playerAnswers: Record<string, number>; // permanent playerId -> answerIndex (-1 = timeout, -2 = absent)
}

export interface Room {
  code: string;
  players: Player[];
  status: GameStateStatus;
  mode: 'round' | 'score';
  topicMode: 'live' | 'preset'; // 'live' = players type topic each round, 'preset' = topics submitted upfront
  target: number; // e.g. 10 or 20 for round mode, 1000 or 2000 for score mode
  topicTimeSecs: number;    // host-configured topic selection timer (25–60s)
  questionTimeSecs: number; // host-configured answer timer (15–60s)
  currentRound: number;
  usedTopics: string[];
  currentTopic?: string;
  currentQuestion?: Question;
  topicSelectorId?: string;  // permanent playerId whose turn it is
  topicDeadline?: number;
  questionDeadline?: number;
  resultsDeadline?: number;
  answers: Record<string, { answerIndex: number, timeTaken: number }>; // permanent playerId -> answer
  /**
   * Locked list of permanent playerIds who were present at question-start.
   * This set NEVER changes during a question — disconnects/reconnects only
   * update Player.isConnected. The timer runs to completion; at timeout
   * any playerId in this set without an answer is auto-submitted as timed-out.
   */
  questionParticipants?: string[];
  /** @deprecated alias kept for wire-compat — mirrors questionParticipants */
  roundPlayerIds?: string[];
  fastestPlayerId?: string; // permanent playerId of fastest correct answerer
  playAgainIds?: string[];  // permanent playerIds who pressed Play Again
  viewingResultsIds?: string[]; // permanent playerIds still on podium screen
  askedQuestions?: string[]; // fingerprints of questions asked this game — used for deduplication
  // Preset mode fields
  presetTopics?: Record<string, { topic: string; difficulty: 'Easy' | 'Medium' | 'Hard' }[]>; // permanent playerId -> topics
  pregeneratedQuestions?: (Question & { topic: string })[]; // all pre-generated questions for preset mode
  // Region system — controls cultural context injected into AI question generation
  regionMode?: RegionMode;    // 'global' (no bias) | 'regional' (biased to region)
  regionId?: RegionId;        // which region (only when regionMode === 'regional')
  countryCode?: string;       // optional drill-down to a specific country within the region
  roundHistory?: RoundRecord[]; // full record of every round — used for share card stats
}