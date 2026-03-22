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
  id: string; // socket id
  name: string;
  avatarId: string; // character id e.g. "ghost" | "gremlin" | ...
  score: number;
  streak: number;
  isReady: boolean;
  isHost: boolean;
  lastAnswer?: number;
  lastAnswerCorrect?: boolean | null; // true = correct, false = wrong, null = timed out
  lastPoints?: number;
  reaction?: string;
  isReconnecting?: boolean; // true during the 10s grace window after disconnect
}

export interface Room {
  code: string;
  players: Player[];
  status: GameStateStatus;
  mode: 'round' | 'score' | 'preset';
  topicMode?: 'live' | 'preset'; // 'live' = players type topic each round, 'preset' = topics submitted upfront
  target: number; // e.g. 10 or 20 for round mode, 1000 or 2000 for score mode
  topicTimeSecs: number;    // host-configured topic selection timer (25–60s)
  questionTimeSecs: number; // host-configured answer timer (15–60s)
  currentRound: number;
  usedTopics: string[];
  currentTopic?: string;
  currentQuestion?: Question;
  topicSelectorId?: string; // Player ID whose turn it is
  topicDeadline?: number;
  questionDeadline?: number;
  resultsDeadline?: number;
  answers: Record<string, { answerIndex: number, timeTaken: number }>; // playerId -> { answerIndex, timeTaken }
  roundPlayerIds?: string[]; // IDs of players who were present when this round's question started — used to exclude late joiners
  fastestPlayerId?: string; // ID of the player who answered correctly first
  playAgainIds?: string[]; // players who pressed Play Again during 'ended' state
  viewingResultsIds?: string[]; // players still on podium screen, haven't clicked play again
  askedQuestions?: string[]; // fingerprints of questions asked this game — used for deduplication
  // Preset mode fields
  presetTopics?: Record<string, { topic: string; difficulty: 'Easy' | 'Medium' | 'Hard' }[]>; // playerId → topics submitted with difficulty
  pregeneratedQuestions?: (Question & { topic: string })[]; // all pre-generated questions for preset mode
  // Region system — controls cultural context injected into AI question generation
  regionMode?: RegionMode;    // 'global' (no bias) | 'regional' (biased to region)
  regionId?: RegionId;        // which region (only when regionMode === 'regional')
  countryCode?: string;       // optional drill-down to a specific country within the region
}