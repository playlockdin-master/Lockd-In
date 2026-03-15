import { z } from 'zod';
import { insertPlayerSchema } from './schema';

export const errorSchemas = {
  validation: z.object({
    message: z.string(),
    field: z.string().optional(),
  }),
  notFound: z.object({
    message: z.string(),
  }),
  internal: z.object({
    message: z.string(),
  }),
};

export const api = {
  // Real-time synchronization is mostly handled via Socket.IO, but we can add utility API routes if needed
};

// URL Builder helper
export function buildUrl(path: string, params?: Record<string, string | number>): string {
  let url = path;
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (url.includes(`:${key}`)) {
        url = url.replace(`:${key}`, String(value));
      }
    });
  }
  return url;
}

// WebSocket Events Schema Contract
export const ws = {
  // Client to Server
  send: {
    joinRoom: z.object({ roomCode: z.string().optional(), playerName: z.string() }),
    setReady: z.object({ isReady: z.boolean() }),
    startGame: z.object({ mode: z.enum(['round', 'score']), target: z.number() }),
    selectTopic: z.object({ topic: z.string() }),
    submitAnswer: z.object({ answerIndex: z.number() }),
    react: z.object({ emoji: z.string() })
  },
  // Server to Client
  receive: {
    gameState: z.any(), // The full GameState object (Room)
    error: z.object({ message: z.string() }),
    reaction: z.object({ playerId: z.string(), emoji: z.string() })
  }
};
