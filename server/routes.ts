import type { Express } from "express";
import type { Server } from "http";
import { Server as SocketIOServer } from "socket.io";
import { setupGameSockets } from "./gameState";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // ── Yellow #3 fix: avoid CORS wildcard in production ──────────────────────
  // CLIENT_ORIGIN must be set to your deployed frontend URL (e.g. https://qotion.online).
  // In development (no env var), allow same-origin only via false — never use `true` in prod.
  const allowedOrigin: string | false =
    process.env.CLIENT_ORIGIN
      ? process.env.CLIENT_ORIGIN
      : process.env.NODE_ENV === 'production'
        ? false // lock down in prod if no origin is configured
        : '*';  // permissive in local dev only
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: allowedOrigin,
      methods: ["GET", "POST"],
    },
    // Tuned to the game's 15-second question window.
    // Clients that go silent for >10s are considered dead and disconnected
    // promptly so the room can reassign/advance rather than hanging.
    pingInterval: 8000,
    pingTimeout: 10000,
    transports: ["websocket", "polling"],
  });

  setupGameSockets(io);

  return httpServer;
}
