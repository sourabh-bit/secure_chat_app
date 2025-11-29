import type { Express, Request } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertUserSchema, insertMessageSchema } from "@shared/schema";
import { z } from "zod";

// Extend Express Request type to include session
declare global {
  namespace Express {
    interface Request {
      session?: { userId?: string; destroy?: (cb: (err?: any) => void) => void };
    }
  }
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // User registration and login
  app.post("/api/auth/register", async (req: Request, res) => {
    try {
      const body = insertUserSchema.parse(req.body);
      const existingUser = await storage.getUserByUsername(body.username);
      
      if (existingUser) {
        return res.status(400).json({ error: "Username already exists" });
      }

      const user = await storage.createUser(body);
      if (req.session) req.session.userId = user.id;
      res.status(201).json(user);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ error: err.errors });
      }
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // User login
  app.post("/api/auth/login", async (req: Request, res) => {
    try {
      const { username, password } = req.body;
      
      if (!username || !password) {
        return res.status(400).json({ error: "Username and password required" });
      }

      const user = await storage.getUserByUsername(username);
      
      if (!user || user.password !== password) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

      if (req.session) req.session.userId = user.id;
      res.json(user);
    } catch (err) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Get current user
  app.get("/api/auth/me", async (req: Request, res) => {
    try {
      if (!req.session?.userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const user = await storage.getUser(req.session.userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      res.json(user);
    } catch (err) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Logout
  app.post("/api/auth/logout", (req: Request, res) => {
    if (req.session?.destroy) {
      req.session.destroy((err) => {
        if (err) {
          return res.status(500).json({ error: "Could not logout" });
        }
        res.json({ success: true });
      });
    } else {
      res.json({ success: true });
    }
  });

  // Send message
  app.post("/api/messages", async (req: Request, res) => {
    try {
      if (!req.session?.userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const body = insertMessageSchema.parse({
        ...req.body,
        fromUserId: req.session.userId,
      });

      const message = await storage.createMessage(body);
      res.status(201).json(message);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ error: err.errors });
      }
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Get messages with another user
  app.get("/api/messages/:userId", async (req: Request, res) => {
    try {
      if (!req.session?.userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const otherUserId = req.params.userId;
      const messages = await storage.getMessages(req.session.userId, otherUserId);
      res.json(messages);
    } catch (err) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Mark message as viewed
  app.patch("/api/messages/:messageId/view", async (req: Request, res) => {
    try {
      if (!req.session?.userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const message = await storage.markMessageAsViewed(req.params.messageId);
      res.json(message);
    } catch (err) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Admin: Delete all messages (emergency wipe)
  app.delete("/api/admin/messages", async (req: Request, res) => {
    try {
      if (!req.session?.userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const user = await storage.getUser(req.session.userId);
      if (user?.role !== 'admin') {
        return res.status(403).json({ error: "Only admin can perform this action" });
      }

      await storage.deleteAllMessages();
      res.json({ success: true, message: "All messages deleted" });
    } catch (err) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  return httpServer;
}
