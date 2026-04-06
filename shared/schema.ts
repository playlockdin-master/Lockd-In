// ── Drizzle DB table definitions ─────────────────────────────────────────────
import {
  pgTable, uuid, text, boolean, integer, real, timestamp, jsonb, index, uniqueIndex, primaryKey,
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
  // ── Question intelligence columns (Part 3) ────────────────────────────────
  usageCount:   integer('usage_count').notNull().default(0),
  lastUsedAt:   timestamp('last_used_at'),
  qualityScore: real('quality_score').notNull().default(0.5),
  textHash:     text('text_hash'),
  totalServed:  integer('total_served').notNull().default(0),
  totalCorrect: integer('total_correct').notNull().default(0),
}, t => ({
  topicIdx:      index('questions_topic_idx').on(t.canonicalTopic),
  regionIdx:     index('questions_region_idx').on(t.region),
  topicHashUniq: uniqueIndex('questions_topic_hash_uniq').on(t.canonicalTopic, t.textHash),
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
  gameIdx:    index('game_players_game_idx').on(t.gameId),
  userIdx:    index('game_players_user_idx').on(t.userId),
  uniqueName: uniqueIndex('game_players_game_name_uniq').on(t.gameId, t.playerName),
}));

// ── User aggregate stats (Part 2) ─────────────────────────────────────────────
export const userStats = pgTable('user_stats', {
  userId:        uuid('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  totalGames:    integer('total_games').notNull().default(0),
  totalCorrect:  integer('total_correct').notNull().default(0),
  totalAnswered: integer('total_answered').notNull().default(0),
  bestStreak:    integer('best_streak').notNull().default(0),
  totalScore:    integer('total_score').notNull().default(0),
  updatedAt:     timestamp('updated_at').notNull().defaultNow(),
  // ── Dedup Option 2: rolling window of last 500 question text_hashes seen ──
  // Stored as a jsonb array of MD5 strings (matching questions.text_hash).
  // Capped at 500 entries; oldest entries are dropped when the cap is reached.
  // Enables cross-session repeat prevention without a separate join table.
  seenHashes:    jsonb('seen_hashes').notNull().default([]).$type<string[]>(),
});

export const userTopicStats = pgTable('user_topic_stats', {
  userId:        uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  topic:         text('topic').notNull(),
  totalAnswered: integer('total_answered').notNull().default(0),
  totalCorrect:  integer('total_correct').notNull().default(0),
  // ── Dedup Option 3: last question hash served to this user for this topic ──
  // Prevents immediately re-serving the same question on consecutive rounds
  // of the same topic, even across different game sessions.
  lastSeenHash:  text('last_seen_hash'),
}, t => ({
  pk:      primaryKey({ columns: [t.userId, t.topic] }),
  userIdx: index('uts_user_idx').on(t.userId),
}));

// ── Relations ─────────────────────────────────────────────────────────────────
export const usersRelations = relations(users, ({ many, one }) => ({
  gamePlayers:    many(gamePlayers),
  userStats:      one(userStats, { fields: [users.id], references: [userStats.userId] }),
  userTopicStats: many(userTopicStats),
}));

export const gamesRelations = relations(games, ({ many }) => ({
  gamePlayers: many(gamePlayers),
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
  flag: string;
  description: string;
  countries: CountryDef[];
}

export interface CountryDef {
  code: string;
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
  canonicalTopic?: string;
}

export type GameStateStatus = 'lobby' | 'topic_selection' | 'question' | 'results' | 'ended' | 'generating';

export const TOPIC_TIME_SECONDS = 25;
export const QUESTION_TIME_SECONDS = 25;

export const TOPIC_TIME_MIN = 15;
export const TOPIC_TIME_MAX = 60;
export const QUESTION_TIME_MIN = 15;
export const QUESTION_TIME_MAX = 60;

export interface Player {
  id: string;
  socketId: string;
  name: string;
  avatarId: string;
  score: number;
  streak: number;
  bestStreak: number; // peak streak reached during this game — never resets
  isReady: boolean;
  isHost: boolean;
  isConnected: boolean;
  lastAnswer?: number;
  lastAnswerCorrect?: boolean | null;
  lastPoints?: number;
  reaction?: string;
  userId?: string;
  /** @deprecated use isConnected instead */
  isReconnecting?: boolean;
}

export interface RoundRecord {
  topic: string;
  correctIndex: number;
  playerAnswers: Record<string, number>;
  questionTextHash?: string | null; // text_hash of the question served this round (for dedup tracking)
}

export interface Room {
  code: string;
  players: Player[];
  status: GameStateStatus;
  mode: 'round' | 'score';
  topicMode: 'live' | 'preset';
  target: number;
  topicTimeSecs: number;
  questionTimeSecs: number;
  currentRound: number;
  usedTopics: string[];
  currentTopic?: string;
  currentQuestion?: Question;
  topicSelectorId?: string;
  topicDeadline?: number;
  questionDeadline?: number;
  resultsDeadline?: number;
  answers: Record<string, { answerIndex: number, timeTaken: number }>;
  questionParticipants?: string[];
  /** @deprecated alias kept for wire-compat */
  roundPlayerIds?: string[];
  fastestPlayerId?: string;
  playAgainIds?: string[];
  viewingResultsIds?: string[];
  askedQuestions?: string[];
  presetTopics?: Record<string, { topic: string; difficulty: 'Easy' | 'Medium' | 'Hard' }[]>;
  pregeneratedQuestions?: (Question & { topic: string })[];
  regionMode?: RegionMode;
  regionId?: RegionId;
  countryCode?: string;
  roundHistory?: RoundRecord[];
  dbGameId?: string;
  currentQuestionDbId?: string;
  currentQuestionTextHash?: string | null; // text_hash of current question (for dedup seen-hash tracking)
}
