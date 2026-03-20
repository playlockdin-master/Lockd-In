import { z } from "zod";

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

export const insertPlayerSchema = z.object({
  name: z.string().min(1).max(20),
});

export type Difficulty = 'Easy' | 'Medium' | 'Hard';

export interface Question {
  text: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  difficulty: Difficulty;
  canonicalTopic?: string; // AI-normalised topic label (e.g. "ch3ss" → "Chess")
}

export type GameStateStatus = 'lobby' | 'topic_selection' | 'question' | 'results' | 'ended';

// Shared timer durations — defaults and limits
export const TOPIC_TIME_SECONDS = 25;
export const QUESTION_TIME_SECONDS = 18;

export const TOPIC_TIME_MIN = 25;
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
}

export interface Room {
  code: string;
  players: Player[];
  status: GameStateStatus;
  mode: 'round' | 'score';
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
}