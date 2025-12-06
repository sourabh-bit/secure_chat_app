import * as dotenv from "dotenv";
dotenv.config();

import type { Express } from "express";
import type { Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import * as crypto from "crypto";
import * as bcrypt from "bcrypt";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import {
  eq,
  and,
  or,
  inArray,
  isNotNull,
  lt,
  gt,
} from "drizzle-orm";
import * as schema from "../shared/schema";

const FIXED_ROOM_ID = "secure-room-001";

// Gatekeeper key from environment or fallback
const GATEKEEPER_KEY = process.env.GATEKEEPER_KEY || "secret";

const hasDatabase = !!process.env.DATABASE_URL;
let db: any = null;

let adminUserId: string;
let friendUserId: string;

// ---------- PASSWORD HELPERS ----------

const hashPassword = async (password: string): Promise<string> => {
  const saltRounds = 12;
  return await bcrypt.hash(password, saltRounds);
};

const verifyPassword = async (
  password: string,
  hash: string
): Promise<boolean> => {
  try {
    return await bcrypt.compare(password, hash);
  } catch (error) {
    console.error("Password verification error:", error);
    return false;
  }
};

// ---------- DB INIT ----------

async function initializeDatabase() {
  if (!hasDatabase || !process.env.DATABASE_URL) {
    adminUserId = "admin-temp-id";
    friendUserId = "friend-temp-id";
    return;
  }

  try {
    const client = postgres(process.env.DATABASE_URL);
    db = drizzle(client, { schema });

    let adminUser = await db.query.users.findFirst({
      where: eq(schema.users.username, "admin"),
    });

    if (!adminUser) {
      adminUser = await db
        .insert(schema.users)
        .values({
          username: "admin",
          password: await hashPassword("admin123"),
          displayName: "Admin",
        })
        .returning()
        .then((rows: any[]) => rows[0]);
    }

    let friendUser = await db.query.users.findFirst({
      where: eq(schema.users.username, "friend"),
    });

    if (!friendUser) {
      friendUser = await db
        .insert(schema.users)
        .values({
          username: "friend",
          password: await hashPassword("friend123"),
          displayName: "Friend",
        })
        .returning()
        .then((rows: any[]) => rows[0]);
    }

    adminUserId = adminUser.id;
    friendUserId = friendUser.id;
  } catch (error) {
    console.error(
      "Failed to connect to database, falling back to memory-only mode:",
      error
    );
    adminUserId = "admin-temp-id";
    friendUserId = "friend-temp-id";
    db = null;
  }
}

// ---------- IN-MEMORY STRUCTURES ----------

interface ClientData {
  ws: WebSocket;
  profile?: { name: string; avatar: string };
  userId?: string;
  deviceId?: string;
  userType?: "admin" | "friend";
  lastSyncTimestamp?: number;
}

interface RoomData {
  clients: Map<WebSocket, ClientData>;
  createdAt: Date;
}

// Per-user socket sets (multi-device)
const userSockets = new Map<string, Set<WebSocket>>();

// For no-DB fallback pending msgs (optional)
interface InMemoryMessage {
  id: string;
  text: string;
  messageType: string;
  mediaUrl?: string;
  timestamp: number;
  senderName: string;
  senderId: string;
  receiverId: string;
}

const rooms = new Map<string, RoomData>();
const pendingMessages = new Map<string, InMemoryMessage[]>();

// ---------- USER HELPERS ----------

const getUserIdFromType = (userType: string): string => {
  return userType === "admin" ? adminUserId : friendUserId;
};

const getUserTypeFromId = (userId: string): "admin" | "friend" => {
  return userId === adminUserId ? "admin" : "friend";
};

const getUserRoomKey = (userId: string): string => {
  return `user:${userId}`;
};

const joinUserRoom = (userId: string, ws: WebSocket) => {
  const roomKey = getUserRoomKey(userId);
  if (!userSockets.has(roomKey)) {
    userSockets.set(roomKey, new Set());
  }
  userSockets.get(roomKey)!.add(ws);
};

const leaveUserRoom = (userId: string, ws: WebSocket) => {
  const roomKey = getUserRoomKey(userId);
  const sockets = userSockets.get(roomKey);
  if (sockets) {
    sockets.delete(ws);
    if (sockets.size === 0) {
      userSockets.delete(roomKey);
    }
  }
};

const broadcastToUser = (
  userId: string,
  data: any,
  excludeWs?: WebSocket
) => {
  const roomKey = getUserRoomKey(userId);
  const sockets = userSockets.get(roomKey);
  if (!sockets) return;

  const payload = JSON.stringify(data);
  sockets.forEach((ws) => {
    if (ws !== excludeWs && ws.readyState === WebSocket.OPEN) {
      ws.send(payload);
    }
  });
};

const broadcastToUserAll = (userId: string, data: any) => {
  const roomKey = getUserRoomKey(userId);
  const sockets = userSockets.get(roomKey);
  if (!sockets) return;

  const payload = JSON.stringify(data);
  sockets.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(payload);
    }
  });
};

const isUserOnline = (userId: string): boolean => {
  const roomKey = getUserRoomKey(userId);
  const sockets = userSockets.get(roomKey);
  if (!sockets || sockets.size === 0) return false;

  for (const ws of sockets) {
    if (ws.readyState === WebSocket.OPEN) return true;
  }
  return false;
};

const getOnlineDeviceCount = (userId: string): number => {
  const roomKey = getUserRoomKey(userId);
  const sockets = userSockets.get(roomKey);
  if (!sockets) return 0;

  let count = 0;
  sockets.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) count++;
  });
  return count;
};

// ---------- SYNC HELPERS ----------

async function getUnsyncedMessages(
  userId: string,
  lastSyncTimestamp: number,
  roomId: string
): Promise<typeof schema.messages.$inferSelect[]> {
  if (!hasDatabase || !db) return [];
  try {
    const syncDate = new Date(lastSyncTimestamp);

    const messages = await db.query.messages.findMany({
      where: and(
        eq(schema.messages.roomId, roomId),
        eq(schema.messages.isDeleted, false),
        or(
          eq(schema.messages.senderId, userId),
          eq(schema.messages.receiverId, userId)
        ),
        gt(schema.messages.timestamp, syncDate)
      ),
      orderBy: schema.messages.timestamp,
    });

    return messages;
  } catch (error) {
    console.error("Failed to fetch unsynced messages:", error);
    return [];
  }
}

// Helper to get message status including read receipts
async function getMessageStatus(
  msg: any,
  viewerUserId: string,
  peerUserId: string
): Promise<"sent" | "delivered" | "read"> {
  if (!hasDatabase || !db) {
    return msg.delivered ? "delivered" : "sent";
  }

  const isSender = msg.senderId === viewerUserId;

  try {
    // Check if the relevant party has read it
    const targetUserId = isSender ? peerUserId : viewerUserId;
    const readReceipt = await db.query.messageReads.findFirst({
      where: and(
        eq(schema.messageReads.messageId, msg.id),
        eq(schema.messageReads.userId, targetUserId)
      ),
    });

    if (readReceipt) {
      return "read";
    }
  } catch (err) {
    console.error("Failed to check read status:", err);
  }

  return msg.delivered ? "delivered" : "sent";
}

// ---------- MAIN REGISTER ROUTES ----------

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // -------- HEALTH --------
  app.get("/health", (req, res) => {
    res
      .status(200)
      .json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // -------- AUTH + GATEKEEPER --------

  let currentGatekeeperKey = GATEKEEPER_KEY;
  let gatekeeperChangedAt: string | null = null;

  app.post("/api/auth/gatekeeper/verify", (req, res) => {
    const { key } = req.body;
    if (!key) {
      return res
        .status(400)
        .json({ success: false, error: "Key is required" });
    }
    const success = key === currentGatekeeperKey;
    res.json({ success });
  });

  app.post("/api/auth/gatekeeper/update", async (req, res) => {
    const { currentPassword, newKey } = req.body;

    if (!newKey || newKey.length < 4) {
      return res.status(400).json({
        success: false,
        error: "New key must be at least 4 characters",
      });
    }

    try {
      if (hasDatabase && db) {
        const adminUser = await db.query.users.findFirst({
          where: eq(schema.users.id, adminUserId),
        });

        if (adminUser && currentPassword) {
          const isValid = await verifyPassword(
            currentPassword,
            adminUser.password
          );
          if (!isValid) {
            return res
              .status(401)
              .json({ success: false, error: "Invalid admin password" });
          }
        }
      }

      currentGatekeeperKey = newKey;
      gatekeeperChangedAt = new Date().toISOString();
      res.json({ success: true, changedAt: gatekeeperChangedAt });
    } catch (error) {
      console.error("Gatekeeper update error:", error);
      res
        .status(500)
        .json({ success: false, error: "Failed to update gatekeeper key" });
    }
  });

  app.get("/api/auth/passwords/metadata", async (req, res) => {
    try {
      if (hasDatabase && db) {
        const adminUser = await db.query.users.findFirst({
          where: eq(schema.users.id, adminUserId),
        });
        const friendUser = await db.query.users.findFirst({
          where: eq(schema.users.id, friendUserId),
        });

        return res.json({
          admin_pass_changed_at:
            adminUser?.updatedAt?.toISOString() || null,
          friend_pass_changed_at:
            friendUser?.updatedAt?.toISOString() || null,
          gatekeeper_changed_at: gatekeeperChangedAt,
        });
      }

      res.json({
        admin_pass_changed_at: null,
        friend_pass_changed_at: null,
        gatekeeper_changed_at: gatekeeperChangedAt,
      });
    } catch (error) {
      console.error("Failed to get password metadata:", error);
      res.status(500).json({ error: "Failed to get password metadata" });
    }
  });

  app.post("/api/auth/admin/reset-password", async (req, res) => {
    const { adminPassword, targetUserType, newPassword } = req.body;

    if (!targetUserType || !newPassword) {
      return res.status(400).json({
        success: false,
        error: "targetUserType and newPassword are required",
      });
    }

    if (targetUserType !== "friend") {
      return res.status(400).json({
        success: false,
        error: "Can only reset friend password via this endpoint",
      });
    }

    if (newPassword.length < 4) {
      return res.status(400).json({
        success: false,
        error: "New password must be at least 4 characters",
      });
    }

    try {
      if (!hasDatabase || !db) {
        return res
          .status(503)
          .json({ success: false, error: "Database not available" });
      }

      const adminUser = await db.query.users.findFirst({
        where: eq(schema.users.id, adminUserId),
      });

      if (!adminUser) {
        return res
          .status(404)
          .json({ success: false, error: "Admin user not found" });
      }

      if (adminPassword) {
        const isValid = await verifyPassword(
          adminPassword,
          adminUser.password
        );
        if (!isValid) {
          return res
            .status(401)
            .json({ success: false, error: "Invalid admin password" });
        }
      }

      const newHash = await hashPassword(newPassword);
      const now = new Date();

      await db
        .update(schema.users)
        .set({ password: newHash, updatedAt: now })
        .where(eq(schema.users.id, friendUserId));

      broadcastToUserAll(friendUserId, {
        type: "password-changed",
        userType: "friend",
        timestamp: Date.now(),
      });

      res.json({ success: true, changedAt: now.toISOString() });
    } catch (error) {
      console.error("Password reset error:", error);
      res
        .status(500)
        .json({ success: false, error: "Failed to reset password" });
    }
  });

  app.post("/api/auth/verify", async (req, res) => {
    const { userType, password } = req.body;

    if (!password) {
      return res
        .status(400)
        .json({ success: false, error: "password is required" });
    }

    try {
      if (!hasDatabase || !db) {
        const defaults: Record<string, string> = {
          admin: "admin123",
          friend: "friend123",
        };

        if (userType) {
          const success = password === defaults[userType];
          return res.json({
            success,
            userType: success ? userType : null,
          });
        }

        if (password === defaults.admin) {
          return res.json({ success: true, userType: "admin" });
        }
        if (password === defaults.friend) {
          return res.json({ success: true, userType: "friend" });
        }
        return res.json({ success: false, userType: null });
      }

      if (userType) {
        if (userType !== "admin" && userType !== "friend") {
          return res
            .status(400)
            .json({ success: false, error: "Invalid userType" });
        }

        const userId = getUserIdFromType(userType);
        const user = await db.query.users.findFirst({
          where: eq(schema.users.id, userId),
        });

        if (!user) {
          return res.json({ success: false, userType: null });
        }

        const isValid = await verifyPassword(password, user.password);
        return res.json({
          success: isValid,
          userType: isValid ? userType : null,
        });
      }

      const adminUser = await db.query.users.findFirst({
        where: eq(schema.users.id, adminUserId),
      });
      if (adminUser && (await verifyPassword(password, adminUser.password))) {
        return res.json({ success: true, userType: "admin" });
      }

      const friendUser = await db.query.users.findFirst({
        where: eq(schema.users.id, friendUserId),
      });
      if (
        friendUser &&
        (await verifyPassword(password, friendUser.password))
      ) {
        return res.json({ success: true, userType: "friend" });
      }

      res.json({ success: false, userType: null });
    } catch (error) {
      console.error("Password verification error:", error);
      res
        .status(500)
        .json({ success: false, error: "Verification failed" });
    }
  });

  app.post("/api/auth/password", async (req, res) => {
    const { userType, currentPassword, newPassword } = req.body;

    if (!userType || !currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        error: "userType, currentPassword, and newPassword are required",
      });
    }

    if (userType !== "admin" && userType !== "friend") {
      return res
        .status(400)
        .json({ success: false, error: "Invalid userType" });
    }

    if (newPassword.length < 4) {
      return res.status(400).json({
        success: false,
        error: "New password must be at least 4 characters",
      });
    }

    try {
      if (!hasDatabase || !db) {
        return res.status(503).json({
          success: false,
          error: "Database not available for password changes",
        });
      }

      const userId = getUserIdFromType(userType);
      const user = await db.query.users.findFirst({
        where: eq(schema.users.id, userId),
      });

      if (!user) {
        return res
          .status(404)
          .json({ success: false, error: "User not found" });
      }

      const isValid = await verifyPassword(
        currentPassword,
        user.password
      );
      if (!isValid) {
        return res
          .status(401)
          .json({ success: false, error: "Current password is incorrect" });
      }

      const newHash = await hashPassword(newPassword);
      const now = new Date();
      await db
        .update(schema.users)
        .set({ password: newHash, updatedAt: now })
        .where(eq(schema.users.id, userId));

      broadcastToUserAll(userId, {
        type: "password-changed",
        userType,
        timestamp: Date.now(),
      });

      res.json({ success: true, changedAt: now.toISOString() });
    } catch (error) {
      console.error("Password change error:", error);
      res
        .status(500)
        .json({ success: false, error: "Failed to change password" });
    }
  });

  // -------- PROFILE --------

  app.get("/api/profile", async (req, res) => {
    const userType = req.query.userType as string;

    if (!userType || (userType !== "admin" && userType !== "friend")) {
      return res.status(400).json({ error: "Invalid userType" });
    }

    try {
      if (hasDatabase && db) {
        const userId =
          userType === "admin" ? adminUserId : friendUserId;
        const user = await db.query.users.findFirst({
          where: eq(schema.users.id, userId),
        });

        if (user) {
          return res.json({
            userType,
            name: user.displayName || "",
            avatar: user.avatar || "",
          });
        }

        return res.json({ userType, name: "", avatar: "" });
      }

      return res.json({
        userType,
        name: userType === "admin" ? "admin" : "friend",
        avatar: "",
      });
    } catch (error) {
      console.error("Failed to fetch profile:", error);
      res.status(500).json({ error: "Failed to fetch profile" });
    }
  });

  app.post("/api/profile/update", async (req, res) => {
    const { userType, name, avatar } = req.body;

    if (!userType || (userType !== "admin" && userType !== "friend")) {
      return res.status(400).json({ error: "Invalid userType" });
    }

    try {
      const userId =
        userType === "admin" ? adminUserId : friendUserId;
      const peerUserId =
        userType === "admin" ? friendUserId : adminUserId;

      if (hasDatabase && db) {
        await db
          .update(schema.users)
          .set({
            displayName: name,
            avatar: avatar,
            updatedAt: new Date(),
          })
          .where(eq(schema.users.id, userId));
      }

      broadcastToUserAll(userId, {
        type: "self-profile-update",
        profile: { name, avatar },
        userType,
      });

      broadcastToUserAll(peerUserId, {
        type: "peer-profile-update",
        profile: { name, avatar },
        userType,
      });

      res.json({ success: true, name, avatar });
    } catch (error) {
      console.error("Failed to update profile:", error);
      res.status(500).json({ error: "Failed to update profile" });
    }
  });

  app.get("/api/profile/peer", async (req, res) => {
    const userType = req.query.userType as string;

    if (!userType || (userType !== "admin" && userType !== "friend")) {
      return res.status(400).json({ error: "Invalid userType" });
    }

    try {
      const peerUserType = userType === "admin" ? "friend" : "admin";

      if (hasDatabase && db) {
        const peerUserId =
          userType === "admin" ? friendUserId : adminUserId;
        const user = await db.query.users.findFirst({
          where: eq(schema.users.id, peerUserId),
        });

        if (user) {
          return res.json({
            userType: peerUserType,
            name: user.displayName || user.username,
            avatar: user.avatar || "",
          });
        }
      }

      return res.json({
        userType: peerUserType,
        name: peerUserType === "admin" ? "admin" : "friend",
        avatar: "",
      });
    } catch (error) {
      console.error("Failed to fetch peer profile:", error);
      res.status(500).json({ error: "Failed to fetch peer profile" });
    }
  });

  // -------- UPLOAD (CLOUDINARY) --------

  app.post("/api/upload", async (req, res) => {
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    const apiKey = process.env.CLOUDINARY_API_KEY;
    const apiSecret = process.env.CLOUDINARY_API_SECRET;

    if (!cloudName || !apiKey || !apiSecret) {
      console.error("Cloudinary not configured:", { cloudName: !!cloudName, apiKey: !!apiKey, apiSecret: !!apiSecret });
      return res.status(503).json({
        success: false,
        error: "Media upload is disabled (Cloudinary not configured).",
      });
    }

    try {
      const { data, type } = req.body;

      if (!data || typeof data !== "string") {
        return res.status(400).json({ success: false, error: "No data provided" });
      }

      console.log(`[UPLOAD] Starting ${type} upload, data length: ${data.length}`);

      // Generate signature for signed upload
      const timestamp = Math.floor(Date.now() / 1000);
      const folder = "pyqmaster";
      const resourceType = type === "video" ? "video" : type === "audio" ? "video" : "image";

      // Create signature string (params must be in alphabetical order)
      const signatureString = `folder=${folder}&timestamp=${timestamp}${apiSecret}`;
      const crypto = await import("crypto");
      const signature = crypto.createHash("sha1").update(signatureString).digest("hex");

      // Upload to Cloudinary - use JSON body which supports base64 data URLs
      const uploadUrl = `https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/upload`;

      const uploadResponse = await fetch(uploadUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          file: data,
          api_key: apiKey,
          timestamp: timestamp,
          signature: signature,
          folder: folder,
        }),
      });

      const responseText = await uploadResponse.text();
      
      if (!uploadResponse.ok) {
        console.error("Cloudinary upload failed:", responseText);
        return res.status(500).json({ success: false, error: "Upload failed" });
      }

      const result = JSON.parse(responseText);
      console.log(`[UPLOAD] Success: ${result.secure_url}`);

      return res.json({
        success: true,
        mediaUrl: result.secure_url,
      });
    } catch (error) {
      console.error("Upload error:", error);
      return res.status(500).json({ success: false, error: "Upload failed" });
    }
  });

  // -------- PUSH (STUBBED – NO REAL NOTIFICATIONS) --------

  app.get("/api/push/vapid-key", (req, res) => {
    // Frontend expects { publicKey }, we'll give empty string so subscription simply fails.
    res.json({ publicKey: "" });
  });

  app.post("/api/push/subscribe", (req, res) => {
    // No-op stub
    res.json({ success: false, message: "Push disabled on server" });
  });

  app.post("/api/push/unsubscribe", (req, res) => {
    // No-op stub
    res.json({ success: true });
  });

  // -------- MESSAGE HISTORY API --------

  app.get("/api/messages/:roomId", async (req, res) => {
    const { roomId } = req.params;
    const { userType } = req.query;

    if (!userType || (userType !== "admin" && userType !== "friend")) {
      return res.status(400).json({ error: "Invalid userType" });
    }

    if (!hasDatabase || !db) {
      return res.json({ messages: [], syncTimestamp: Date.now() });
    }

    try {
      const userId =
        userType === "admin" ? adminUserId : friendUserId;
      const peerId =
        userType === "admin" ? friendUserId : adminUserId;

      const dbMessages = await db.query.messages.findMany({
        where: and(
          eq(schema.messages.roomId, roomId),
          eq(schema.messages.isDeleted, false)
        ),
        orderBy: schema.messages.timestamp,
      });

      const replyIds = dbMessages
        .filter((msg: any) => msg.replyToId)
        .map((msg: any) => msg.replyToId);

      const replyMessages =
        replyIds.length > 0
          ? await db.query.messages.findMany({
              where: and(
                eq(schema.messages.roomId, roomId),
                inArray(schema.messages.id, replyIds)
              ),
            })
          : [];

      const replyMap = new Map(
        replyMessages.map((r: any) => [r.id, r])
      );

      // Fetch all read receipts for messages in this room
      const messageIds = dbMessages.map((msg: any) => msg.id);
      const readReceipts =
        messageIds.length > 0
          ? await db.query.messageReads.findMany({
              where: inArray(schema.messageReads.messageId, messageIds),
            })
          : [];

      // Build a map: messageId -> Set of userIds who read it
      const readByMap = new Map<string, Set<string>>();
      for (const receipt of readReceipts) {
        if (!readByMap.has(receipt.messageId)) {
          readByMap.set(receipt.messageId, new Set());
        }
        readByMap.get(receipt.messageId)!.add(receipt.userId);
      }

      const formatted = dbMessages.map((msg: any) => {
        const isSender = msg.senderId === userId;
        const replyTo =
          msg.replyToId && replyMap.has(msg.replyToId)
            ? (() => {
                const r = replyMap.get(msg.replyToId) as any;
                return {
                  id: r.id,
                  text: r.text || "",
                  sender: r.senderId === userId ? "me" : "them",
                };
              })()
            : undefined;

        // Determine status: read > delivered > sent
        // For my messages: "read" if peer has read it
        // For their messages: "read" if I have read it
        let status: "sent" | "delivered" | "read" = "sent";
        const readers = readByMap.get(msg.id);

        if (isSender) {
          // My message: check if peer read it
          if (readers?.has(peerId)) {
            status = "read";
          } else if (msg.delivered) {
            status = "delivered";
          }
        } else {
          // Their message: check if I read it
          if (readers?.has(userId)) {
            status = "read";
          } else if (msg.delivered) {
            status = "delivered";
          }
        }

        return {
          id: msg.id,
          text: msg.text || "",
          sender: isSender ? "me" : "them",
          timestamp: msg.timestamp.getTime(),
          type: msg.messageType || "text",
          mediaUrl: msg.mediaUrl,
          senderName: msg.senderId === adminUserId ? "Admin" : "Friend",
          status,
          replyTo,
        };
      });

      res.json({
        messages: formatted,
        syncTimestamp: Date.now(),
      });
    } catch (error) {
      console.error("Failed to fetch messages:", error);
      res.status(500).json({ error: "Failed to fetch messages" });
    }
  });

  // -------- RETENTION API --------

  app.get("/api/retention/:roomId", async (req, res) => {
    if (!hasDatabase || !db) {
      return res.json({ retentionMode: "forever" });
    }

    try {
      const { roomId } = req.params;
      const retention = await db.query.messageRetention.findFirst({
        where: eq(schema.messageRetention.roomId, roomId),
      });

      res.json({
        retentionMode: retention?.retentionMode || "forever",
      });
    } catch (error) {
      console.error("Failed to fetch retention settings:", error);
      res.status(500).json({ error: "Failed to fetch retention settings" });
    }
  });

  app.post("/api/retention/:roomId", async (req, res) => {
    if (!hasDatabase || !db) {
      return res.status(503).json({ error: "Database not available" });
    }

    try {
      const { roomId } = req.params;
      const { retentionMode } = req.body;

      if (!["forever", "24h", "1h", "after_seen"].includes(retentionMode)) {
        return res.status(400).json({ error: "Invalid retention mode" });
      }

      const existing = await db.query.messageRetention.findFirst({
        where: eq(schema.messageRetention.roomId, roomId),
      });

      if (existing) {
        await db
          .update(schema.messageRetention)
          .set({ retentionMode, updatedAt: new Date() })
          .where(eq(schema.messageRetention.roomId, roomId));
      } else {
        // setByUserId is required; use admin by default
        await db.insert(schema.messageRetention).values({
          roomId,
          retentionMode,
          setByUserId: adminUserId,
        });
      }

      res.json({ success: true, retentionMode });
    } catch (error) {
      console.error("Failed to update retention settings:", error);
      res.status(500).json({ error: "Failed to update retention settings" });
    }
  });

  // -------- WEBSOCKET --------

  const wss = new WebSocketServer({
    server: httpServer,
    path: "/ws",
  });

  wss.on("connection", (ws: WebSocket) => {
    let currentRoom: string | null = null;
    let myProfile: { name: string; avatar: string } | null = null;
    let myUserId: string | null = null;
    let myUserType: "admin" | "friend" | null = null;
    let myDeviceId: string | null = null;
    let lastSyncTimestamp = 0;

    ws.on("message", async (message) => {
      try {
        const data = JSON.parse(message.toString());
        const { type } = data;

        // ---------- JOIN ----------
        if (type === "join") {
          currentRoom = FIXED_ROOM_ID;
          myProfile = data.profile || null;
          myUserType = data.userType;
          myDeviceId = data.deviceId || crypto.randomUUID();
          lastSyncTimestamp = data.lastSyncTimestamp || 0;

          if (!myUserType || (myUserType !== "admin" && myUserType !== "friend")) {
            ws.send(
              JSON.stringify({ type: "error", message: "Invalid userType" })
            );
            return;
          }

          myUserId = getUserIdFromType(myUserType);

          console.log("[SOCKET] join", {
            userType: myUserType,
            userId: myUserId,
            deviceId: myDeviceId,
          });

          const peerUserType =
            myUserType === "admin" ? "friend" : "admin";
          const peerUserId = getUserIdFromType(peerUserType);

          if (!rooms.has(currentRoom)) {
            rooms.set(currentRoom, {
              clients: new Map(),
              createdAt: new Date(),
            });
          }

          const room = rooms.get(currentRoom)!;
          room.clients.set(ws, {
            ws,
            profile: myProfile || undefined,
            userId: myUserId || undefined,
            deviceId: myDeviceId || undefined,
            userType: myUserType || undefined,
            lastSyncTimestamp,
          });

          const wasUserOnline = isUserOnline(myUserId);
          joinUserRoom(myUserId, ws);
          const isUserNowOnline = isUserOnline(myUserId);

          const peerOnline = isUserOnline(peerUserId);
          const myDevices = getOnlineDeviceCount(myUserId);

          ws.send(
            JSON.stringify({
              type: "room-joined",
              roomId: currentRoom,
              peerOnline,
              myDevices,
              deviceId: myDeviceId,
              syncTimestamp: Date.now(),
            })
          );

          // Peer profile (from DB if available)
          let peerProfile = { name: "", avatar: "" };
          if (hasDatabase && db) {
            try {
              const peerUser = await db.query.users.findFirst({
                where: eq(schema.users.id, peerUserId),
              });
              if (peerUser) {
                peerProfile = {
                  name: peerUser.displayName || "",
                  avatar: peerUser.avatar || "",
                };
              }
            } catch (err) {
              console.error("Failed to fetch peer profile:", err);
            }
          }

          // If peer already online, notify ME
          if (peerOnline) {
            broadcastToUserAll(myUserId, {
              type: "peer-joined",
              roomId: currentRoom,
              profile: peerProfile,
              userType: peerUserType,
            });
          }

          // If this is my first device, notify PEER that I came online
          if (!wasUserOnline && isUserNowOnline) {
            let myPublicProfile = { name: "", avatar: "" };
            if (hasDatabase && db) {
              try {
                const myUser = await db.query.users.findFirst({
                  where: eq(schema.users.id, myUserId),
                });
                if (myUser) {
                  myPublicProfile = {
                    name: myUser.displayName || "",
                    avatar: myUser.avatar || "",
                  };
                }
              } catch (err) {
                console.error("Failed to fetch my profile:", err);
              }
            }

            broadcastToUserAll(peerUserId, {
              type: "peer-joined",
              roomId: currentRoom,
              profile: myPublicProfile,
              userType: myUserType,
            });
          }

          // SYNC: messages since lastSyncTimestamp + deliver undelivered
          if (hasDatabase && db) {
            try {
              if (lastSyncTimestamp > 0) {
                const unsynced = await getUnsyncedMessages(
                  myUserId,
                  lastSyncTimestamp,
                  currentRoom
                );

                for (const msg of unsynced) {
                  const isSender = msg.senderId === myUserId;
                  const status = await getMessageStatus(msg, myUserId, peerUserId);

                  ws.send(
                    JSON.stringify({
                      type: "chat-message",
                      id: msg.id,
                      text: msg.text || "",
                      messageType: msg.messageType || "text",
                      mediaUrl: msg.mediaUrl,
                      timestamp: msg.timestamp.getTime(),
                      senderName:
                        msg.senderId === adminUserId ? "Admin" : "Friend",
                      sender: isSender ? "me" : "them",
                      status,
                      replyToId: msg.replyToId,
                    })
                  );
                }
              }

              // deliver undelivered messages to this user
              const undelivered = await db.query.messages.findMany({
                where: and(
                  eq(schema.messages.roomId, currentRoom),
                  eq(schema.messages.receiverId, myUserId),
                  eq(schema.messages.delivered, false),
                  eq(schema.messages.isDeleted, false)
                ),
              });

              if (undelivered.length > 0) {
                const ids = undelivered.map((m: any) => m.id);

                await db
                  .update(schema.messages)
                  .set({ delivered: true })
                  .where(inArray(schema.messages.id, ids));

                // push them as chat-message to this device
                for (const msg of undelivered) {
                  ws.send(
                    JSON.stringify({
                      type: "chat-message",
                      id: msg.id,
                      text: msg.text || "",
                      messageType: msg.messageType || "text",
                      mediaUrl: msg.mediaUrl,
                      timestamp: msg.timestamp.getTime(),
                      senderName:
                        msg.senderId === adminUserId ? "Admin" : "Friend",
                      sender: "them",
                      status: "delivered",
                      replyToId: msg.replyToId,
                    })
                  );
                }

                // notify sender that they became delivered
                broadcastToUserAll(peerUserId, {
                  type: "message_update",
                  ids,
                  status: "delivered",
                });
              }
            } catch (err) {
              console.error("Failed to sync messages on join:", err);
            }
          } else {
            // No DB: send pending in-memory messages
            const pendingKey = `${currentRoom}_${myUserType}`;
            const pending = pendingMessages.get(pendingKey) || [];
            if (pending.length > 0) {
              for (const msg of pending) {
                ws.send(
                  JSON.stringify({
                    type: "chat-message",
                    id: msg.id,
                    text: msg.text,
                    messageType: msg.messageType,
                    mediaUrl: msg.mediaUrl,
                    timestamp: msg.timestamp,
                    senderName: msg.senderName,
                    sender: "them",
                    status: "delivered",
                  })
                );
              }
              pendingMessages.delete(pendingKey);

              const ids = pending.map((m) => m.id);
              broadcastToUser(peerUserId, {
                type: "message_update",
                ids,
                status: "delivered",
              });
            }
          }

        // ---------- SEND MESSAGE ----------
        } else if (type === "send-message" && currentRoom) {
          if (!myUserType || !myUserId) return;

          const peerUserType =
            myUserType === "admin" ? "friend" : "admin";
          const peerUserId = getUserIdFromType(peerUserType);
          const peerOnline = isUserOnline(peerUserId);

          const sanitizedText =
            typeof data.text === "string"
              ? data.text.trim().slice(0, 10000)
              : "";

          const sanitizedMediaUrl =
            typeof data.mediaUrl === "string"
              ? data.mediaUrl.slice(0, 2048)
              : undefined;

          // skip empty pure text
          if (
            !sanitizedText &&
            !sanitizedMediaUrl &&
            (data.messageType === "text" || !data.messageType)
          ) {
            return;
          }

          const msgId: string =
            typeof data.id === "string" && data.id.length <= 64
              ? data.id
              : `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;

          const timestampMs =
            typeof data.timestamp === "number"
              ? data.timestamp
              : Date.now();

          const senderName: string =
            typeof data.senderName === "string" && data.senderName.length > 0
              ? data.senderName.slice(0, 100)
              : myProfile?.name || getUserTypeFromId(myUserId) === "admin"
              ? "Admin"
              : "Friend";

          const messageType: string = data.messageType || "text";

          let expiresAt: Date | null = null;

          if (hasDatabase && db) {
            try {
              const retention =
                await db.query.messageRetention.findFirst({
                  where: eq(schema.messageRetention.roomId, currentRoom),
                });

              const retentionMode =
                retention?.retentionMode || "forever";

              if (retentionMode === "1h") {
                expiresAt = new Date(Date.now() + 60 * 60 * 1000);
              } else if (retentionMode === "24h") {
                expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
              }

              const existing = await db.query.messages.findFirst({
                where: eq(schema.messages.id, msgId),
              });

              if (!existing) {
                await db.insert(schema.messages).values({
                  id: msgId,
                  roomId: currentRoom,
                  senderId: myUserId,
                  receiverId: peerUserId,
                  messageType,
                  text: sanitizedText,
                  mediaUrl: sanitizedMediaUrl,
                  replyToId:
                    typeof data.replyToId === "string" &&
                    data.replyToId.length <= 100
                      ? data.replyToId
                      : null,
                  timestamp: new Date(timestampMs),
                  delivered: peerOnline,
                  isDeleted: false,
                  expiresAt,
                });
              }
            } catch (err) {
              console.error("Failed to save message:", err);
            }
          } else {
            // memory-only fallback
            const pendingKey = `${currentRoom}_${peerUserType}`;
            const pending = pendingMessages.get(pendingKey) || [];
            pending.push({
              id: msgId,
              text: sanitizedText,
              messageType,
              mediaUrl: sanitizedMediaUrl,
              timestamp: timestampMs,
              senderName,
              senderId: myUserId,
              receiverId: peerUserId,
            });
            pendingMessages.set(pendingKey, pending);
          }

          // base payload for realtime
          const basePayload = {
            type: "chat-message" as const,
            id: msgId,
            text: sanitizedText,
            messageType,
            mediaUrl: sanitizedMediaUrl,
            timestamp: timestampMs,
            senderName,
            replyTo: data.replyTo || undefined,
          };

          // 1) SENT tick (only to sender devices)
          broadcastToUserAll(myUserId, {
            type: "message_update",
            ids: [msgId],
            status: "sent",
          });

          // 2) Deliver to peer if online
          if (peerOnline) {
            // Peer sees as "them" with delivered
            broadcastToUserAll(peerUserId, {
              ...basePayload,
              sender: "them",
              status: "delivered",
            });

            if (hasDatabase && db) {
              try {
                await db
                  .update(schema.messages)
                  .set({ delivered: true })
                  .where(eq(schema.messages.id, msgId));
              } catch (err) {
                console.error(
                  "Failed to mark delivered in DB:",
                  err
                );
              }
            }

            // Sender devices get DELIVERED update
            broadcastToUserAll(myUserId, {
              type: "message_update",
              ids: [msgId],
              status: "delivered",
            });
          }

          // 3) Echo to my other devices except current
          broadcastToUser(
            myUserId,
            {
              ...basePayload,
              sender: "me",
              status: peerOnline ? "delivered" : "sent",
            },
            ws
          );

          // 4) Echo to current device
          ws.send(
            JSON.stringify({
              ...basePayload,
              sender: "me",
              status: peerOnline ? "delivered" : "sent",
            })
          );

          console.log("[MSG] send", {
            id: msgId,
            from: myUserId,
            to: peerUserId,
          });

        // ---------- SYNC RESPONSE (DEVICE-TO-DEVICE) ----------
        } else if (type === "sync-response" && currentRoom) {
          const room = rooms.get(currentRoom);
          if (!room) return;

          room.clients.forEach((client, clientWs) => {
            if (
              client.deviceId === data.targetDeviceId &&
              clientWs.readyState === WebSocket.OPEN
            ) {
              clientWs.send(
                JSON.stringify({
                  type: "sync-messages",
                  messages: data.messages,
                  syncTimestamp: Date.now(),
                })
              );
            }
          });

        // ---------- DELETE MESSAGE ----------
        } else if (type === "message-delete" && currentRoom) {
          if (!myUserType || !myUserId) return;

          const peerUserType =
            myUserType === "admin" ? "friend" : "admin";
          const peerUserId = getUserIdFromType(peerUserType);

          try {
            if (hasDatabase && db) {
              await db
                .update(schema.messages)
                .set({
                  isDeleted: true,
                  deletedAt: new Date(),
                  deletedById: myUserId,
                })
                .where(eq(schema.messages.id, data.id));
            }

            const evt = { type: "message-deleted", id: data.id };
            broadcastToUserAll(myUserId, evt);
            broadcastToUserAll(peerUserId, evt);
          } catch (err) {
            console.error("Failed to delete message:", err);
          }

        // ---------- EMERGENCY WIPE ----------
        } else if (type === "emergency-wipe" && currentRoom) {
          if (!myUserType || !myUserId) return;

          const peerUserType =
            myUserType === "admin" ? "friend" : "admin";
          const peerUserId = getUserIdFromType(peerUserType);

          try {
            if (hasDatabase && db) {
              await db
                .update(schema.messages)
                .set({
                  isDeleted: true,
                  deletedAt: new Date(),
                  deletedById: myUserId,
                })
                .where(eq(schema.messages.roomId, currentRoom));
            }

            const evt = { type: "emergency-wipe" };
            broadcastToUserAll(myUserId, evt);
            broadcastToUserAll(peerUserId, evt);
          } catch (err) {
            console.error("Failed to wipe messages:", err);
          }

        // ---------- MESSAGE READ (✓✓ blue) ----------
        } else if (type === "message-read" && currentRoom) {
          if (!myUserType || !myUserId) return;

          const peerUserType =
            myUserType === "admin" ? "friend" : "admin";
          const peerUserId = getUserIdFromType(peerUserType);

          try {
            if (hasDatabase && db) {
              if (Array.isArray(data.ids) && data.ids.length > 0) {
                // Insert read rows (idempotent via onConflictDoNothing)
                for (const messageId of data.ids) {
                  await db
                    .insert(schema.messageReads)
                    .values({
                      messageId,
                      userId: myUserId,
                      readAt: new Date(),
                    })
                    .onConflictDoNothing();
                }

                // "after_seen" retention → set expiresAt once BOTH have read
                const retention =
                  await db.query.messageRetention.findFirst({
                    where: eq(schema.messageRetention.roomId, currentRoom),
                  });

                if (retention?.retentionMode === "after_seen") {
                  for (const messageId of data.ids) {
                    const msg = await db.query.messages.findFirst({
                      where: eq(schema.messages.id, messageId),
                    });

                    if (msg && !msg.expiresAt) {
                      const adminRead =
                        await db.query.messageReads.findFirst({
                          where: and(
                            eq(schema.messageReads.messageId, messageId),
                            eq(schema.messageReads.userId, adminUserId)
                          ),
                        });

                      const friendRead =
                        await db.query.messageReads.findFirst({
                          where: and(
                            eq(schema.messageReads.messageId, messageId),
                            eq(schema.messageReads.userId, friendUserId)
                          ),
                        });

                      if (adminRead && friendRead) {
                        await db
                          .update(schema.messages)
                          .set({ expiresAt: new Date() })
                          .where(eq(schema.messages.id, messageId));
                      }
                    }
                  }
                }
              }
            }

            if (Array.isArray(data.ids) && data.ids.length > 0) {
              console.log("[STATUS] update", {
                ids: data.ids,
                status: "read",
              });
              const readUpdate = {
                type: "message_update",
                ids: data.ids,
                status: "read" as const,
              };

              broadcastToUserAll(peerUserId, readUpdate);
              broadcastToUserAll(myUserId!, readUpdate);
            }
          } catch (err) {
            console.error("Failed to process message-read:", err);
          }

        // ---------- OTHER WS EVENTS (typing, profile-update, calls, etc.) ----------
        } else if (currentRoom && rooms.has(currentRoom)) {
          const room = rooms.get(currentRoom)!;
          if (!myUserType || !myUserId) return;

          const peerUserType =
            myUserType === "admin" ? "friend" : "admin";
          const peerUserId = getUserIdFromType(peerUserType);

          if (type === "typing") {
            broadcastToUserAll(peerUserId, data);
          } else if (type === "profile-update") {
            console.log("[PROFILE] update", {
              userType: myUserType,
              userId: myUserId,
              newName: data.profile?.name,
            });

            if (hasDatabase && db && data.profile) {
              await db
                .update(schema.users)
                .set({
                  displayName: data.profile.name,
                  avatar: data.profile.avatar,
                  updatedAt: new Date(),
                })
                .where(eq(schema.users.id, myUserId));
            }

            broadcastToUserAll(peerUserId, {
              type: "peer-profile-update",
              profile: data.profile,
              userType: myUserType,
            });

            broadcastToUserAll(myUserId!, {
              type: "self-profile-update",
              profile: data.profile,
              userType: myUserType,
            });
          } else {
            // Calls, misc events → just fan out to room (except sender)
            room.clients.forEach((client, clientWs) => {
              if (
                clientWs.readyState === WebSocket.OPEN &&
                clientWs !== ws
              ) {
                clientWs.send(JSON.stringify(data));
              }
            });
          }
        }
      } catch (err) {
        console.error("WebSocket message error:", err);
      }
    });

    ws.on("close", () => {
      if (currentRoom && rooms.has(currentRoom) && myUserId) {
        const room = rooms.get(currentRoom)!;
        room.clients.delete(ws);

        const wasOnline = isUserOnline(myUserId);
        leaveUserRoom(myUserId, ws);
        const stillOnline = isUserOnline(myUserId);

        // Only notify peer when last device goes offline
        if (wasOnline && !stillOnline) {
          const peerUserType =
            myUserType === "admin" ? "friend" : "admin";
          const peerUserId = getUserIdFromType(peerUserType);

          broadcastToUserAll(peerUserId, {
            type: "peer-left",
            roomId: currentRoom,
          });
        }

        if (room.clients.size === 0) {
          setTimeout(() => {
            const r = rooms.get(currentRoom!);
            if (r && r.clients.size === 0) {
              rooms.delete(currentRoom!);
            }
          }, 60000);
        }
      }
    });

    ws.on("error", (error) => {
      console.error("WebSocket error:", error);
    });
  });

  // -------- CLEANUP EXPIRED MESSAGES --------

  const cleanupExpiredMessages = async () => {
    if (!hasDatabase || !db) return;

    try {
      const now = new Date();
      const expired = await db.query.messages.findMany({
        where: and(
          isNotNull(schema.messages.expiresAt),
          lt(schema.messages.expiresAt, now),
          eq(schema.messages.isDeleted, false)
        ),
      });

      if (expired.length > 0) {
        await db
          .update(schema.messages)
          .set({ isDeleted: true, deletedAt: now })
          .where(
            and(
              isNotNull(schema.messages.expiresAt),
              lt(schema.messages.expiresAt, now),
              eq(schema.messages.isDeleted, false)
            )
          );

        for (const msg of expired) {
          broadcastToUserAll(adminUserId, {
            type: "message-deleted",
            id: msg.id,
          });
          broadcastToUserAll(friendUserId, {
            type: "message-deleted",
            id: msg.id,
          });
        }
      }
    } catch (error) {
      console.error("Error during message cleanup:", error);
    }
  };

  // -------- INIT DB + CLEANUP LOOP --------

  initializeDatabase().then(() => {
    console.log(
      "[DB] hasDatabase=",
      hasDatabase,
      "adminUserId=",
      adminUserId,
      "friendUserId=",
      friendUserId
    );
    if (hasDatabase && db) {
      setInterval(cleanupExpiredMessages, 5 * 60 * 1000);
      cleanupExpiredMessages();
    }
  });

  return httpServer;
}
