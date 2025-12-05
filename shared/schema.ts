import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, boolean, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Users table (admin and friend identities)
export const users = pgTable("users", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(), // 'admin' or 'friend'
  password: text("password").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Active sessions for multi-device support
export const sessions = pgTable("sessions", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id", { length: 36 }).notNull().references(() => users.id, { onDelete: 'cascade' }),
  deviceId: varchar("device_id").notNull(), // Unique per device/browser tab
  deviceType: varchar("device_type").notNull(), // 'mobile', 'desktop', 'tablet'
  userAgent: text("user_agent"),
  ipAddress: varchar("ip_address"),
  isActive: boolean("is_active").default(true).notNull(),
  lastSeen: timestamp("last_seen").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Messages with full sync support
export const messages = pgTable("messages", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  roomId: varchar("room_id").notNull(),
  senderId: varchar("sender_id", { length: 36 }).notNull().references(() => users.id, { onDelete: 'cascade' }),
  receiverId: varchar("receiver_id", { length: 36 }).references(() => users.id, { onDelete: 'cascade' }),
  messageType: varchar("message_type").notNull().default('text'), // 'text', 'image', 'video', 'audio'
  text: text("text"),
  mediaUrl: text("media_url"),
  replyToId: varchar("reply_to_id", { length: 36 }),
  isDeleted: boolean("is_deleted").default(false).notNull(),
  deletedAt: timestamp("deleted_at"),
  deletedById: varchar("deleted_by_id", { length: 36 }).references(() => users.id, { onDelete: 'set null' }),
  expiresAt: timestamp("expires_at"), // For disappearing messages
  delivered: boolean("delivered").default(false).notNull(), // For offline message delivery
  timestamp: timestamp("timestamp").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Message read status per user
export const messageReads = pgTable("message_reads", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  messageId: varchar("message_id", { length: 36 }).notNull().references(() => messages.id, { onDelete: 'cascade' }),
  userId: varchar("user_id", { length: 36 }).notNull().references(() => users.id, { onDelete: 'cascade' }),
  readAt: timestamp("read_at").defaultNow().notNull(),
});

// Sync state for each session (for incremental sync)
export const syncStates = pgTable("sync_states", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  sessionId: varchar("session_id", { length: 36 }).notNull().references(() => sessions.id, { onDelete: 'cascade' }),
  lastMessageId: varchar("last_message_id", { length: 36 }).references(() => messages.id),
  lastSyncAt: timestamp("last_sync_at").defaultNow().notNull(),
  unreadCount: integer("unread_count").default(0).notNull(),
});

// Push notification subscriptions
export const pushSubscriptions = pgTable("push_subscriptions", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id", { length: 36 }).notNull().references(() => users.id, { onDelete: 'cascade' }),
  endpoint: text("endpoint").notNull(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Typing indicators
export const typingIndicators = pgTable("typing_indicators", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  roomId: varchar("room_id").notNull(),
  userId: varchar("user_id", { length: 36 }).notNull().references(() => users.id, { onDelete: 'cascade' }),
  isTyping: boolean("is_typing").default(true).notNull(),
  lastUpdated: timestamp("last_updated").defaultNow().notNull(),
});

// Message retention settings per room
export const messageRetention = pgTable("message_retention", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  roomId: varchar("room_id").notNull().unique(),
  retentionMode: varchar("retention_mode").notNull().default('forever'), // 'forever', 'after_seen', '1h', '24h'
  setByUserId: varchar("set_by_user_id", { length: 36 }).notNull().references(() => users.id, { onDelete: 'cascade' }),
  setAt: timestamp("set_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export const insertSessionSchema = createInsertSchema(sessions).omit({
  id: true,
  createdAt: true,
});

export const insertMessageSchema = createInsertSchema(messages).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertMessageReadSchema = createInsertSchema(messageReads).omit({
  id: true,
});

export const insertSyncStateSchema = createInsertSchema(syncStates).omit({
  id: true,
});

export const insertPushSubscriptionSchema = createInsertSchema(pushSubscriptions).omit({
  id: true,
  createdAt: true,
});

export const insertTypingIndicatorSchema = createInsertSchema(typingIndicators).omit({
  id: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type MessageRead = typeof messageReads.$inferSelect;
export type SyncState = typeof syncStates.$inferSelect;
export type PushSubscription = typeof pushSubscriptions.$inferSelect;
export type TypingIndicator = typeof typingIndicators.$inferSelect;
