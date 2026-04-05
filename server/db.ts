import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  console.warn("[db] DATABASE_URL not set — database features (auth, question bank, history) will be unavailable.");
}

export const pool = process.env.DATABASE_URL
  ? new Pool({ connectionString: process.env.DATABASE_URL, max: 10 })
  : null;

export const db = pool ? drizzle(pool, { schema }) : null;

// Re-export tables for convenient imports elsewhere
export {
  users, questions, games, gamePlayers,
  userStats, userTopicStats,
} from "@shared/schema";
