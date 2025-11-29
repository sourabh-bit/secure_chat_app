import { type User, type InsertUser, type Message, type InsertMessage, type AdminSettings, type InsertAdminSettings, users, messages, adminSettings } from "@shared/schema";
import { db } from "./db";
import { eq, and } from "drizzle-orm";

export interface IStorage {
  // User operations
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;

  // Message operations
  createMessage(message: InsertMessage): Promise<Message>;
  getMessages(fromUserId: string, toUserId: string, limit?: number): Promise<Message[]>;
  markMessageAsViewed(messageId: string): Promise<Message>;
  deleteMessage(messageId: string): Promise<void>;
  deleteAllMessages(): Promise<void>;

  // Admin settings
  getAdminSettings(adminUserId: string): Promise<AdminSettings | undefined>;
  updateAdminSettings(adminUserId: string, settings: Partial<InsertAdminSettings>): Promise<AdminSettings>;
}

export class DrizzleStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
    return result[0];
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.username, username)).limit(1);
    return result[0];
  }

  async createUser(user: InsertUser): Promise<User> {
    const result = await db.insert(users).values(user).returning();
    return result[0];
  }

  async createMessage(message: InsertMessage): Promise<Message> {
    const result = await db.insert(messages).values(message).returning();
    return result[0];
  }

  async getMessages(fromUserId: string, toUserId: string, limit = 50): Promise<Message[]> {
    const result = await db
      .select()
      .from(messages)
      .where(
        and(
          eq(messages.fromUserId, fromUserId),
          eq(messages.toUserId, toUserId)
        )
      )
      .orderBy((t) => t.createdAt)
      .limit(limit);
    return result;
  }

  async markMessageAsViewed(messageId: string): Promise<Message> {
    const result = await db
      .update(messages)
      .set({ isViewed: true, viewedAt: new Date() })
      .where(eq(messages.id, messageId))
      .returning();
    return result[0];
  }

  async deleteMessage(messageId: string): Promise<void> {
    await db.delete(messages).where(eq(messages.id, messageId));
  }

  async deleteAllMessages(): Promise<void> {
    await db.delete(messages);
  }

  async getAdminSettings(adminUserId: string): Promise<AdminSettings | undefined> {
    const result = await db
      .select()
      .from(adminSettings)
      .where(eq(adminSettings.adminUserId, adminUserId))
      .limit(1);
    return result[0];
  }

  async updateAdminSettings(adminUserId: string, settings: Partial<InsertAdminSettings>): Promise<AdminSettings> {
    const result = await db
      .update(adminSettings)
      .set({ ...settings, updatedAt: new Date() })
      .where(eq(adminSettings.adminUserId, adminUserId))
      .returning();
    return result[0];
  }
}

export const storage = new DrizzleStorage();
