import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, boolean, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Users table - stores admin and friend accounts
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  role: text("role", { enum: ['admin', 'friend'] }).notNull().default('friend'),
  createdAt: timestamp("created_at").defaultNow(),
});

// Messages table - stores encrypted chat messages
export const messages = pgTable("messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  fromUserId: varchar("from_user_id").notNull().references(() => users.id),
  toUserId: varchar("to_user_id").notNull().references(() => users.id),
  content: text("content").notNull(),
  messageType: text("message_type", { enum: ['text', 'image', 'video', 'audio'] }).notNull().default('text'),
  mediaUrl: text("media_url"),
  isViewed: boolean("is_viewed").notNull().default(false),
  viewedAt: timestamp("viewed_at"),
  expiresAt: timestamp("expires_at"), // Message auto-delete timestamp
  createdAt: timestamp("created_at").defaultNow(),
});

// Admin settings - stores encryption keys, retention policies, PIN codes
export const adminSettings = pgTable("admin_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  adminUserId: varchar("admin_user_id").notNull().references(() => users.id),
  adminPin: text("admin_pin").notNull(),
  friendPin: text("friend_pin").notNull(),
  retentionPolicy: text("retention_policy", { enum: ['view', '1h', '24h'] }).notNull().default('24h'),
  encryptionKey: text("encryption_key"),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Schemas for validation
export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
});

export const insertMessageSchema = createInsertSchema(messages).omit({
  id: true,
  createdAt: true,
  isViewed: true,
  viewedAt: true,
});

export const insertAdminSettingsSchema = createInsertSchema(adminSettings).omit({
  id: true,
  updatedAt: true,
});

// Type exports
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type Message = typeof messages.$inferSelect;
export type InsertAdminSettings = z.infer<typeof insertAdminSettingsSchema>;
export type AdminSettings = typeof adminSettings.$inferSelect;
