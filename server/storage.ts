import { db } from "./db";
import { type Room, type Player, type Question } from "@shared/schema";

export interface IStorage {
  // Add methods here if you need to persist game history or user stats.
  // For the real-time core loop, we will use in-memory state in gameState.ts, 
  // but if we want to save matches later, we can add it here.
}

export class DatabaseStorage implements IStorage {
  // Implement persistence methods here
}

export const storage = new DatabaseStorage();
