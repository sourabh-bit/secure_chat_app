import type { Express } from "express";
import { type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import webpush from "web-push";
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import bcrypt from 'bcrypt';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq, and, isNotNull, lt, or, inArray, sql } from 'drizzle-orm';
import * as schema from '../shared/schema';

const FIXED_ROOM_ID = 'secure-room-001';

// Cloudinary configuration
const CLOUDINARY_CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME;
const CLOUDINARY_API_KEY = process.env.CLOUDINARY_API_KEY;
const CLOUDINARY_API_SECRET = process.env.CLOUDINARY_API_SECRET;

const hasCloudinary = !!(CLOUDINARY_CLOUD_NAME && CLOUDINARY_API_KEY && CLOUDINARY_API_SECRET);

async function uploadToCloudinary(base64Data: string, resourceType: 'image' | 'video' | 'raw' = 'image'): Promise<string | null> {
  if (!hasCloudinary) {
    console.error('Cloudinary not configured');
    return null;
  }

  try {
    const timestamp = Math.floor(Date.now() / 1000);
    const folder = 'pyqmaster-chat';
    
    // Generate signature
    const signatureString = `folder=${folder}&timestamp=${timestamp}${CLOUDINARY_API_SECRET}`;
    const signature = crypto.createHash('sha1').update(signatureString).digest('hex');

    const formData = new URLSearchParams();
    formData.append('file', base64Data);
    formData.append('timestamp', timestamp.toString());
    formData.append('folder', folder);
    formData.append('api_key', CLOUDINARY_API_KEY!);
    formData.append('signature', signature);

    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/${resourceType}/upload`,
      {
        method: 'POST',
        body: formData,
      }
    );

    if (!response.ok) {
      const error = await response.text();
      console.error('Cloudinary upload failed:', error);
      return null;
    }

    const result = await response.json();
    return result.secure_url;
  } catch (error) {
    console.error('Cloudinary upload error:', error);
    return null;
  }
}

interface ClientData {
  ws: WebSocket;
  profile?: { name: string; avatar: string };
  userId?: string;
  sessionId?: string;
  deviceId?: string;
  userType?: string;
}

interface RoomData {
  clients: Map<WebSocket, ClientData>;
  createdAt: Date;
}

// Database connection (optional)
let db: any = null;
let hasDatabase = false;

// Global user IDs (initialized on startup)
let adminUserId: string;
let friendUserId: string;

// Initialize database connection (optional)
async function initializeDatabase() {
  if (!process.env.DATABASE_URL) {
    hasDatabase = false;
    adminUserId = 'admin-temp-id';
    friendUserId = 'friend-temp-id';
    return;
  }

  try {
    const client = postgres(process.env.DATABASE_URL);
    db = drizzle(client, { schema });
    hasDatabase = true;

    // Create admin user if not exists
    let adminUser = await db.query.users.findFirst({
      where: eq(schema.users.username, 'admin')
    });

    if (!adminUser) {
      adminUser = await db.insert(schema.users).values({
        username: 'admin',
        password: await hashPassword('admin123'),
      }).returning().then((rows: any[]) => rows[0]);
    }

    // Create friend user if not exists
    let friendUser = await db.query.users.findFirst({
      where: eq(schema.users.username, 'friend')
    });

    if (!friendUser) {
      friendUser = await db.insert(schema.users).values({
        username: 'friend',
        password: await hashPassword('friend123'),
      }).returning().then((rows: any[]) => rows[0]);
    }

    adminUserId = adminUser.id;
    friendUserId = friendUser.id;

    // Database connected and users initialized
  } catch (error) {
    console.error('Failed to connect to database, falling back to memory-only mode:', error);
    hasDatabase = false;
    adminUserId = 'admin-temp-id';
    friendUserId = 'friend-temp-id';
  }
}

interface PasswordData {
  gatekeeper_key: string;
  admin_pass: string;
  friend_pass: string;
  admin_pass_hash?: string;
  friend_pass_hash?: string;
  admin_pass_changed_at?: string;
  friend_pass_changed_at?: string;
  gatekeeper_changed_at?: string;
  initialized: boolean;
}

interface InMemoryMessage {
  id: string;
  text: string;
  messageType: string;
  mediaUrl?: string;
  timestamp: number;
  senderName: string;
  status?: 'sent' | 'delivered' | 'read';
}

interface PushSubscriptionData {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

const rooms = new Map<string, RoomData>();
const pendingMessages = new Map<string, InMemoryMessage[]>();
const messageStatus = new Map<string, 'sent' | 'delivered' | 'read'>();

const pushSubscriptions = new Map<string, any[]>();

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || 'BLBz8nXqJ3H5VSJgNPaF1N7p0_VfQKZwzPvHRmqIKvE4EHlpjBqeGMx5PaJk9R7VxTkNh3n_WbE2OqK8yXlH8Aw';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || 'dGnKX_4nRqH5VSJgNPaF1N7p0_VfQKZwzPvHRmqIKvE';

webpush.setVapidDetails(
  'mailto:admin@securechat.com',
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY
);

const sendPushNotification = async (userType: string, title: string, body: string) => {
  const subscriptions = pushSubscriptions.get(userType) || [];
  const validSubscriptions: PushSubscriptionData[] = [];
  
  for (const subscription of subscriptions) {
    try {
      await webpush.sendNotification(
        {
          endpoint: subscription.endpoint,
          keys: subscription.keys
        },
        JSON.stringify({ title, body, tag: 'chat-message' })
      );
      validSubscriptions.push(subscription);
    } catch (error: any) {
      if (error.statusCode === 410 || error.statusCode === 404) {
        // Removing invalid push subscription
      } else {
        validSubscriptions.push(subscription);
        console.error('Push notification error:', error.message);
      }
    }
  }
  
  if (validSubscriptions.length > 0) {
    pushSubscriptions.set(userType, validSubscriptions);
  } else {
    pushSubscriptions.delete(userType);
  }
};

const hashPassword = async (password: string): Promise<string> => {
  const saltRounds = 12;
  return await bcrypt.hash(password, saltRounds);
};

const verifyPassword = async (password: string, hash: string): Promise<boolean> => {
  try {
    return await bcrypt.compare(password, hash);
  } catch (error) {
    console.error('Password verification error:', error);
    return false;
  }
};

const DEFAULT_PASSWORDS: PasswordData = {
  gatekeeper_key: 'secret',
  admin_pass: 'admin123',
  friend_pass: 'friend123',
  initialized: false
};

let passwords: PasswordData = { ...DEFAULT_PASSWORDS };

const getPasswordFilePath = (): string => {
  const locations = [
    path.join(process.cwd(), 'data', '.passwords.json'),
    path.join(process.cwd(), '.passwords.json'),
    '/tmp/.passwords.json'
  ];
  
  for (const loc of locations) {
    try {
      if (fs.existsSync(loc)) {
        return loc;
      }
    } catch {}
  }
  
  try {
    const dataDir = path.join(process.cwd(), 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    return path.join(dataDir, '.passwords.json');
  } catch {
    return path.join(process.cwd(), '.passwords.json');
  }
};

let PASSWORD_FILE = getPasswordFilePath();

const loadPasswords = () => {
  try {
    const locations = [
      path.join(process.cwd(), 'data', '.passwords.json'),
      path.join(process.cwd(), '.passwords.json'),
      '/tmp/.passwords.json'
    ];
    
    for (const loc of locations) {
      try {
        if (fs.existsSync(loc)) {
          const data = JSON.parse(fs.readFileSync(loc, 'utf-8')) as Partial<PasswordData>;
          
          if (data.initialized === true) {
            if (data.gatekeeper_key) passwords.gatekeeper_key = data.gatekeeper_key;
            if (data.admin_pass) passwords.admin_pass = data.admin_pass;
            if (data.friend_pass) passwords.friend_pass = data.friend_pass;
            if (data.admin_pass_hash) passwords.admin_pass_hash = data.admin_pass_hash;
            if (data.friend_pass_hash) passwords.friend_pass_hash = data.friend_pass_hash;
            if (data.admin_pass_changed_at) passwords.admin_pass_changed_at = data.admin_pass_changed_at;
            if (data.friend_pass_changed_at) passwords.friend_pass_changed_at = data.friend_pass_changed_at;
            if (data.gatekeeper_changed_at) passwords.gatekeeper_changed_at = data.gatekeeper_changed_at;
            passwords.initialized = true;
            PASSWORD_FILE = loc;
            // Passwords loaded from loc
            // Admin password changed at: passwords.admin_pass_changed_at || 'never'
            // Friend password changed at: passwords.friend_pass_changed_at || 'never'
            return;
          }
        }
      } catch (e) {
        console.error('Error reading password file at', loc, ':', e);
      }
    }
    
    // No saved passwords found, using defaults (first-time setup)
    passwords = { ...DEFAULT_PASSWORDS };
  } catch (err) {
    console.error('Failed to load passwords:', err);
    passwords = { ...DEFAULT_PASSWORDS };
  }
};

const savePasswords = (): boolean => {
  try {
    const dir = path.dirname(PASSWORD_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    passwords.initialized = true;
    
    const dataToSave = {
      gatekeeper_key: passwords.gatekeeper_key,
      admin_pass: passwords.admin_pass,
      friend_pass: passwords.friend_pass,
      admin_pass_hash: passwords.admin_pass_hash,
      friend_pass_hash: passwords.friend_pass_hash,
      admin_pass_changed_at: passwords.admin_pass_changed_at,
      friend_pass_changed_at: passwords.friend_pass_changed_at,
      gatekeeper_changed_at: passwords.gatekeeper_changed_at,
      initialized: true,
      last_saved: new Date().toISOString()
    };
    
    fs.writeFileSync(PASSWORD_FILE, JSON.stringify(dataToSave, null, 2));
    // Passwords saved to PASSWORD_FILE
    return true;
  } catch (err) {
    console.error('Failed to save passwords to', PASSWORD_FILE, ':', err);
    
    const fallbacks = ['/tmp/.passwords.json', path.join(process.cwd(), '.passwords.json')];
    for (const fallback of fallbacks) {
      try {
        const dataToSave = {
          gatekeeper_key: passwords.gatekeeper_key,
          admin_pass: passwords.admin_pass,
          friend_pass: passwords.friend_pass,
          admin_pass_hash: passwords.admin_pass_hash,
          friend_pass_hash: passwords.friend_pass_hash,
          admin_pass_changed_at: passwords.admin_pass_changed_at,
          friend_pass_changed_at: passwords.friend_pass_changed_at,
          gatekeeper_changed_at: passwords.gatekeeper_changed_at,
          initialized: true,
          last_saved: new Date().toISOString()
        };
        fs.writeFileSync(fallback, JSON.stringify(dataToSave, null, 2));
        PASSWORD_FILE = fallback;
        console.log('✓ Passwords saved to fallback:', fallback);
        return true;
      } catch {}
    }
    return false;
  }
};

try {
  loadPasswords();
} catch (err) {
  console.error('Failed to load passwords on startup:', err);
}

const broadcastToUserType = (room: RoomData, userType: string, data: any, excludeWs?: WebSocket) => {
  room.clients.forEach((client, clientWs) => {
    if (client.userType === userType && clientWs.readyState === WebSocket.OPEN && clientWs !== excludeWs) {
      clientWs.send(JSON.stringify(data));
    }
  });
};

const broadcastToAll = (room: RoomData, data: any, excludeWs?: WebSocket) => {
  room.clients.forEach((client, clientWs) => {
    if (clientWs.readyState === WebSocket.OPEN && clientWs !== excludeWs) {
      clientWs.send(JSON.stringify(data));
    }
  });
};

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Media upload route using Cloudinary
  app.post('/api/upload', async (req, res) => {
    try {
      const { data, type } = req.body;
      
      if (!data) {
        return res.status(400).json({ success: false, error: 'No data provided' });
      }

      if (!hasCloudinary) {
        return res.status(500).json({ 
          success: false, 
          error: 'Cloudinary not configured. Please set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET environment variables.' 
        });
      }

      // Validate file type from base64 data
      const mimeMatch = data.match(/^data:(image|video|audio)\/([\w+-]+);base64,/);
      if (!mimeMatch) {
        return res.status(400).json({ success: false, error: 'Invalid file format' });
      }

      const mediaCategory = mimeMatch[1]; // 'image', 'video', or 'audio'
      const mimeType = mimeMatch[2];

      // Validate allowed types
      const allowedImageTypes = ['png', 'jpg', 'jpeg', 'gif', 'webp'];
      const allowedVideoTypes = ['mp4', 'mov', 'webm', 'quicktime', 'mpeg'];
      const allowedAudioTypes = ['webm', 'mp3', 'wav', 'ogg', 'mpeg'];

      let resourceType: 'image' | 'video' | 'raw' = 'image';
      
      if (mediaCategory === 'image') {
        if (!allowedImageTypes.includes(mimeType.toLowerCase())) {
          return res.status(400).json({ success: false, error: `Image type ${mimeType} not allowed` });
        }
        resourceType = 'image';
      } else if (mediaCategory === 'video') {
        if (!allowedVideoTypes.includes(mimeType.toLowerCase())) {
          return res.status(400).json({ success: false, error: `Video type ${mimeType} not allowed` });
        }
        resourceType = 'video';
      } else if (mediaCategory === 'audio') {
        if (!allowedAudioTypes.includes(mimeType.toLowerCase())) {
          return res.status(400).json({ success: false, error: `Audio type ${mimeType} not allowed` });
        }
        resourceType = 'video'; // Cloudinary treats audio as video resource type
      }

      // Check file size (approximate from base64 - base64 is ~1.37x larger than binary)
      const base64Data = data.split(',')[1];
      const fileSizeBytes = Math.ceil((base64Data.length * 3) / 4);
      const maxSizeBytes = 20 * 1024 * 1024; // 20MB limit

      if (fileSizeBytes > maxSizeBytes) {
        return res.status(400).json({ success: false, error: 'File size exceeds 20MB limit' });
      }

      const mediaUrl = await uploadToCloudinary(data, resourceType);
      
      if (!mediaUrl) {
        return res.status(500).json({ success: false, error: 'Failed to upload to Cloudinary' });
      }

      res.json({ success: true, mediaUrl });
    } catch (error) {
      console.error('Upload error:', error);
      res.status(500).json({ success: false, error: 'Internal server error during upload' });
    }
  });
  
  app.get('/api/auth/passwords', (req, res) => {
    res.json({
      gatekeeper_key: passwords.gatekeeper_key,
      admin_pass: passwords.admin_pass,
      friend_pass: passwords.friend_pass,
      admin_pass_changed_at: passwords.admin_pass_changed_at || null,
      friend_pass_changed_at: passwords.friend_pass_changed_at || null,
      gatekeeper_changed_at: passwords.gatekeeper_changed_at || null
    });
  });
  
  app.post('/api/auth/passwords', async (req, res) => {
    const { gatekeeper_key, admin_pass, friend_pass, current_password } = req.body;
    
    const isValidPassword = current_password === passwords.admin_pass || 
                            current_password === passwords.friend_pass;
    
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid current password' });
    }
    
    const now = new Date().toISOString();
    let changed = false;
    
    if (gatekeeper_key && gatekeeper_key !== passwords.gatekeeper_key) {
      passwords.gatekeeper_key = gatekeeper_key;
      passwords.gatekeeper_changed_at = now;
      changed = true;
    }
    
    if (admin_pass && admin_pass !== passwords.admin_pass) {
      passwords.admin_pass = admin_pass;
      passwords.admin_pass_hash = await hashPassword(admin_pass);
      passwords.admin_pass_changed_at = now;
      changed = true;
    }

    if (friend_pass && friend_pass !== passwords.friend_pass) {
      passwords.friend_pass = friend_pass;
      passwords.friend_pass_hash = await hashPassword(friend_pass);
      passwords.friend_pass_changed_at = now;
      changed = true;
    }
    
    if (changed) {
      const saved = savePasswords();
      if (!saved) {
        return res.status(500).json({ error: 'Failed to save passwords to disk' });
      }
    }
    
    res.json({ 
      success: true, 
      passwords: {
        gatekeeper_key: passwords.gatekeeper_key,
        admin_pass: passwords.admin_pass,
        friend_pass: passwords.friend_pass,
        admin_pass_changed_at: passwords.admin_pass_changed_at,
        friend_pass_changed_at: passwords.friend_pass_changed_at,
        gatekeeper_changed_at: passwords.gatekeeper_changed_at
      }
    });
  });

  app.get('/api/push/vapid-key', (req, res) => {
    res.json({ publicKey: VAPID_PUBLIC_KEY });
  });

  app.post('/api/push/subscribe', (req, res) => {
    const { subscription, userType } = req.body;
    
    if (!subscription || !userType) {
      return res.status(400).json({ error: 'Missing subscription or userType' });
    }
    
    if (userType !== 'admin') {
      return res.status(403).json({ error: 'Push notifications only available for admin' });
    }
    
    const existing = pushSubscriptions.get('admin') || [];
    
    const isDuplicate = existing.some(s => s.endpoint === subscription.endpoint);
    if (!isDuplicate) {
      existing.push({
        endpoint: subscription.endpoint,
        keys: subscription.keys
      });
      pushSubscriptions.set('admin', existing);
    }
    
    res.json({ success: true });
  });

  app.post('/api/push/unsubscribe', (req, res) => {
    const { endpoint, userType } = req.body;

    if (!endpoint || !userType) {
      return res.status(400).json({ error: 'Missing endpoint or userType' });
    }

    const existing = pushSubscriptions.get(userType) || [];
    const filtered = existing.filter(s => s.endpoint !== endpoint);

    if (filtered.length > 0) {
      pushSubscriptions.set(userType, filtered);
    } else {
      pushSubscriptions.delete(userType);
    }

    res.json({ success: true });
  });

  // Media upload endpoint (Cloudinary)
  app.post('/api/upload', async (req, res) => {
    try {
      const { data, type } = req.body;
      
      if (!data) {
        return res.status(400).json({ error: 'No data provided' });
      }

      if (!hasCloudinary) {
        return res.status(503).json({ 
          error: 'Media uploads not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET environment variables.' 
        });
      }

      const resourceType = type === 'video' ? 'video' : type === 'audio' ? 'raw' : 'image';
      const url = await uploadToCloudinary(data, resourceType);

      if (!url) {
        return res.status(500).json({ success: false, error: 'Upload failed' });
      }

      res.json({ success: true, mediaUrl: url });
    } catch (error) {
      console.error('Upload error:', error);
      res.status(500).json({ error: 'Upload failed' });
    }
  });

  // Fetch chat history from database
  app.get('/api/messages/:roomId', async (req, res) => {
    const { roomId } = req.params;
    const { userType } = req.query;

    if (!userType || (userType !== 'admin' && userType !== 'friend')) {
      return res.status(400).json({ error: 'Invalid userType' });
    }

    if (!hasDatabase || !db) {
      return res.json({ messages: [] });
    }

    try {
      const dbMessages = await db.query.messages.findMany({
        where: and(
          eq(schema.messages.roomId, roomId),
          eq(schema.messages.isDeleted, false)
        ),
        orderBy: schema.messages.timestamp,
      });

      const userId = userType === 'admin' ? adminUserId : friendUserId;

      // Fetch reply information for messages that have replies
      const replyIds = dbMessages
        .filter((msg: any) => msg.replyToId)
        .map((msg: any) => msg.replyToId);
      
      const replyMessages = replyIds.length > 0 ? await db.query.messages.findMany({
        where: and(
          eq(schema.messages.roomId, roomId),
          inArray(schema.messages.id, replyIds)
        )
      }) : [];

      const replyMap = new Map(replyMessages.map((r: any) => [r.id, r]));

      const formattedMessages = dbMessages.map((msg: any) => {
        const isSender = msg.senderId === userId;
        const replyTo = msg.replyToId && replyMap.has(msg.replyToId) 
          ? (() => {
              const replyMsg = replyMap.get(msg.replyToId);
              return {
                id: replyMsg.id,
                text: replyMsg.text || '',
                sender: replyMsg.senderId === userId ? 'me' : 'them'
              };
            })()
          : undefined;

        return {
          id: msg.id,
          text: msg.text,
          sender: isSender ? 'me' : 'them',
          timestamp: msg.timestamp.getTime(),
          type: msg.messageType,
          mediaUrl: msg.mediaUrl,
          senderName: msg.senderId === adminUserId ? 'Admin' : 'Friend',
          status: msg.delivered ? 'delivered' : 'sent',
          replyTo,
        };
      });

      res.json({ messages: formattedMessages });
    } catch (error) {
      console.error('Failed to fetch messages:', error);
      res.status(500).json({ error: 'Failed to fetch messages' });
    }
  });

  // Message retention settings API
  app.get('/api/retention/:roomId', async (req, res) => {
    if (!hasDatabase) {
      return res.json({
        retentionMode: 'forever' // Always forever for in-memory storage
      });
    }

    try {
      const { roomId } = req.params;
      const retention = await db.query.messageRetention.findFirst({
        where: eq(schema.messageRetention.roomId, roomId)
      });

      res.json({
        retentionMode: retention?.retentionMode || 'forever'
      });
    } catch (error) {
      console.error('Failed to get retention settings:', error);
      res.status(500).json({ error: 'Failed to get retention settings' });
    }
  });

  app.post('/api/retention/:roomId', async (req, res) => {
    if (!hasDatabase) {
      return res.json({ success: true, retentionMode: 'forever' });
    }

    try {
      const { roomId } = req.params;
      const { retentionMode } = req.body;

      if (!['forever', 'after_seen', '1h', '24h'].includes(retentionMode)) {
        return res.status(400).json({ error: 'Invalid retention mode' });
      }

      // For demo purposes, we'll use admin as the setter
      const setByUserId = adminUserId;

      await db.insert(schema.messageRetention).values({
        roomId,
        retentionMode,
        setByUserId,
        updatedAt: new Date(),
      }).onConflictDoUpdate({
        target: schema.messageRetention.roomId,
        set: {
          retentionMode,
          setByUserId,
          updatedAt: new Date(),
        }
      });

      res.json({ success: true, retentionMode });
    } catch (error) {
      console.error('Failed to update retention settings:', error);
      res.status(500).json({ error: 'Failed to update retention settings' });
    }
  });

  const wss = new WebSocketServer({ 
    server: httpServer, 
    path: "/ws",
    // Increase ping interval for Render stability
    perMessageDeflate: false,
    clientTracking: true
  });

  // WebSocket keepalive ping every 30 seconds to prevent Render timeout
  const keepAliveInterval = setInterval(() => {
    wss.clients.forEach((ws: WebSocket & { isAlive?: boolean }) => {
      if (ws.isAlive === false) {
        return ws.terminate();
      }
      ws.isAlive = false;
      ws.ping();
    });
  }, 30000);

  // Cleanup interval on server shutdown
  httpServer.on('close', () => {
    clearInterval(keepAliveInterval);
  });

  wss.on("connection", (ws: WebSocket & { isAlive?: boolean }) => {
    // Set up keepalive for this connection
    ws.isAlive = true;
    ws.on('pong', () => {
      ws.isAlive = true;
    });
    let currentRoom: string | null = null;
    let myProfile: { name: string; avatar: string } | undefined;
    let myUserType: string | undefined;
    let myDeviceId: string | undefined;

  ws.on("message", async (message: string) => {
      try {
        const data = JSON.parse(message.toString());
        const { type, roomId } = data;

        if (type === "join") {
          currentRoom = roomId;
          myProfile = data.profile;
          myUserType = data.userType;
          myDeviceId = data.deviceId || Date.now().toString();
          
          if (!rooms.has(roomId)) {
            rooms.set(roomId, {
              clients: new Map(),
              createdAt: new Date()
            });
          }
          
          const room = rooms.get(roomId)!;
          room.clients.set(ws, { ws, profile: myProfile, userType: myUserType, deviceId: myDeviceId });
          
          const peerUserType = myUserType === 'admin' ? 'friend' : 'admin';
          
          let peerProfile: { name: string; avatar: string } | undefined;
          let peerOnline = false;
          room.clients.forEach((client, clientWs) => {
            if (client.userType === peerUserType && clientWs.readyState === WebSocket.OPEN) {
              peerOnline = true;
              if (client.profile) {
                peerProfile = client.profile;
              }
            }
          });
          
          const onlineUserTypes = new Set<string>();
          room.clients.forEach((client) => {
            if (client.userType) onlineUserTypes.add(client.userType);
          });
          
          ws.send(JSON.stringify({ 
            type: "joined", 
            roomId, 
            isInitiator: onlineUserTypes.size === 1,
            peerCount: room.clients.size,
            peerProfile: peerProfile,
            peerOnline: peerOnline
          }));
          
          room.clients.forEach((client, clientWs) => {
            if (client.userType === myUserType && clientWs !== ws && clientWs.readyState === WebSocket.OPEN) {
              clientWs.send(JSON.stringify({ 
                type: "sync-request",
                targetDeviceId: myDeviceId
              }));
            }
          });
          
          // Fetch and sync ALL messages from database for this user
          const myUserId = myUserType === 'admin' ? adminUserId : friendUserId;
          if (hasDatabase && db) {
            try {
              // Fetch all messages in the room (both sent and received)
              const allDbMessages = await db.query.messages.findMany({
                where: and(
                  eq(schema.messages.roomId, currentRoom),
                  eq(schema.messages.isDeleted, false),
                  // Messages where user is sender OR receiver
                  or(
                    eq(schema.messages.senderId, myUserId),
                    eq(schema.messages.receiverId, myUserId)
                  )
                ),
                orderBy: schema.messages.timestamp,
              });

              // Fetch reply information
              const replyIds = allDbMessages
                .filter((msg: any) => msg.replyToId)
                .map((msg: any) => msg.replyToId);
              
              const replyMessages = replyIds.length > 0 ? await db.query.messages.findMany({
                where: and(
                  eq(schema.messages.roomId, currentRoom),
                  inArray(schema.messages.id, replyIds)
                )
              }) : [];

              const replyMap = new Map(replyMessages.map((r: any) => [r.id, r]));

              // Send all messages to the client for sync
              if (allDbMessages.length > 0) {
                ws.send(JSON.stringify({
                  type: "sync-messages",
                  messages: allDbMessages.map((msg: any) => {
                    const isSender = msg.senderId === myUserId;
                    const replyTo = msg.replyToId && replyMap.has(msg.replyToId) 
                      ? (() => {
                          const replyMsg = replyMap.get(msg.replyToId);
                          return {
                            id: replyMsg.id,
                            text: replyMsg.text || '',
                            sender: replyMsg.senderId === myUserId ? 'me' : 'them'
                          };
                        })()
                      : undefined;

                    return {
                      id: msg.id,
                      text: msg.text,
                      sender: isSender ? 'me' : 'them',
                      timestamp: msg.timestamp.getTime(),
                      type: msg.messageType,
                      mediaUrl: msg.mediaUrl,
                      senderName: msg.senderId === adminUserId ? 'Admin' : 'Friend',
                      status: msg.delivered ? 'delivered' : 'sent',
                      replyTo,
                    };
                  })
                }));
              }

              // Fetch and deliver pending messages (undelivered messages)
              const pendingDbMessages = allDbMessages.filter((msg: any) => 
                msg.receiverId === myUserId && !msg.delivered
              );

              if (pendingDbMessages.length > 0) {
                const messageIds: string[] = [];
                for (const msg of pendingDbMessages) {
                  const replyTo = msg.replyToId && replyMap.has(msg.replyToId) 
                    ? (() => {
                        const replyMsg = replyMap.get(msg.replyToId);
                        return {
                          id: replyMsg.id,
                          text: replyMsg.text || '',
                          sender: replyMsg.senderId === myUserId ? 'me' : 'them'
                        };
                      })()
                    : undefined;

                  ws.send(JSON.stringify({
                    type: "chat-message",
                    id: msg.id,
                    text: msg.text,
                    messageType: msg.messageType,
                    mediaUrl: msg.mediaUrl,
                    timestamp: msg.timestamp.getTime(),
                    senderName: msg.senderId === adminUserId ? 'Admin' : 'Friend',
                    sender: 'them',
                    status: 'delivered',
                    replyTo,
                  }));
                  messageIds.push(msg.id);
                }

                // Mark only these pending messages as delivered in database
                for (const msgId of messageIds) {
                  await db.update(schema.messages)
                    .set({ delivered: true })
                    .where(eq(schema.messages.id, msgId));
                }

                // Notify sender(s) that messages were delivered - broadcast to ALL devices of sender
                const senderType = myUserType === 'admin' ? 'friend' : 'admin';
                const deliveryStatusUpdate = {
                  type: 'message-status',
                  ids: messageIds,
                  status: 'delivered' as const
                };
                
                // Broadcast to ALL devices of the sender (all admin devices if friend received, all friend devices if admin received)
                room.clients.forEach((client, clientWs) => {
                  if (client.userType === senderType && clientWs.readyState === WebSocket.OPEN) {
                    clientWs.send(JSON.stringify(deliveryStatusUpdate));
                  }
                });
              }
            } catch (error) {
              console.error('Failed to fetch messages from database:', error);
            }
          }

          // Fallback to in-memory pending messages
          const roomPendingKey = `${roomId}_${myUserType}`;
          const pending = pendingMessages.get(roomPendingKey);
          if (pending && pending.length > 0) {
            const messageIds: string[] = [];
            pending.forEach(msg => {
              ws.send(JSON.stringify({
                type: "chat-message",
                id: msg.id,
                text: msg.text,
                messageType: msg.messageType,
                mediaUrl: msg.mediaUrl,
                timestamp: msg.timestamp,
                senderName: msg.senderName,
                sender: 'them',
                status: 'delivered'
              }));
              messageIds.push(msg.id);
            });
            pendingMessages.delete(roomPendingKey);
            
            // Broadcast delivery status to ALL devices of sender
            const senderType = myUserType === 'admin' ? 'friend' : 'admin';
            const deliveryStatusUpdate = {
              type: 'message-status',
              ids: messageIds,
              status: 'delivered' as const
            };
            
            // Broadcast to ALL devices of the sender
            room.clients.forEach((client, clientWs) => {
              if (client.userType === senderType && clientWs.readyState === WebSocket.OPEN) {
                clientWs.send(JSON.stringify(deliveryStatusUpdate));
              }
            });
          }
          
          let isFirstDeviceOfType = true;
          room.clients.forEach((client, clientWs) => {
            if (client.userType === myUserType && clientWs !== ws) {
              isFirstDeviceOfType = false;
            }
          });
          
          if (isFirstDeviceOfType) {
            room.clients.forEach((client, clientWs) => {
              if (client.userType !== myUserType && clientWs.readyState === WebSocket.OPEN) {
                clientWs.send(JSON.stringify({ 
                  type: "peer-joined", 
                  roomId,
                  profile: myProfile 
                }));
              }
            });
          }

        } else if (type === "chat-message" && currentRoom) {
          const room = rooms.get(currentRoom);
          if (!room) return;

          // Validate message data
          if (!data.id || typeof data.id !== 'string' || data.id.length > 100) {
            ws.send(JSON.stringify({ type: 'error', message: 'Invalid message ID' }));
            return;
          }

          // Sanitize message content
          const sanitizedText = typeof data.text === 'string' 
            ? data.text.trim().slice(0, 10000) 
            : '';
          const sanitizedMediaUrl = typeof data.mediaUrl === 'string'
            ? data.mediaUrl.slice(0, 2048)
            : undefined;

          if (!sanitizedText && !sanitizedMediaUrl && (!data.messageType || data.messageType === 'text')) {
            ws.send(JSON.stringify({ type: 'error', message: 'Message cannot be empty' }));
            return;
          }

          // Validate user type
          if (!myUserType || (myUserType !== 'admin' && myUserType !== 'friend')) {
            ws.send(JSON.stringify({ type: 'error', message: 'Invalid user type' }));
            return;
          }

          // Validate room ID
          if (currentRoom !== FIXED_ROOM_ID) {
            ws.send(JSON.stringify({ type: 'error', message: 'Invalid room ID' }));
            return;
          }

          try {
            // Update data with sanitized values
            const sanitizedData = {
              ...data,
              text: sanitizedText,
              mediaUrl: sanitizedMediaUrl
            };
            // Save message to database if available
            if (hasDatabase) {
              // Get current retention settings
              const retention = await db.query.messageRetention.findFirst({
                where: eq(schema.messageRetention.roomId, currentRoom)
              });

              const retentionMode = retention?.retentionMode || 'forever';
              let expiresAt: Date | null = null;

              // Only set expiresAt for disappearing modes, not for "forever"
              if (retentionMode === '1h') {
                expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
              } else if (retentionMode === '24h') {
                expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
              }
              // For 'after_seen' and 'forever', expiresAt remains null initially

              // Check if peer is online
              let peerOnlineForDb = false;
              const peerUserTypeForDb = myUserType === 'admin' ? 'friend' : 'admin';
              room.clients.forEach((client, clientWs) => {
                if (client.userType === peerUserTypeForDb && clientWs.readyState === WebSocket.OPEN) {
                  peerOnlineForDb = true;
                }
              });

              // Save message to database
              const senderId = myUserType === 'admin' ? adminUserId : friendUserId;
              const receiverId = myUserType === 'admin' ? friendUserId : adminUserId;
              
              // Prevent duplicate message insertion
              const existingMessage = await db.query.messages.findFirst({
                where: eq(schema.messages.id, sanitizedData.id)
              });

              if (!existingMessage) {
                const messageData = {
                  id: sanitizedData.id,
                  roomId: currentRoom,
                  senderId,
                  receiverId,
                  messageType: sanitizedData.messageType || 'text',
                  text: sanitizedText,
                  mediaUrl: sanitizedMediaUrl,
                  replyToId: typeof sanitizedData.replyToId === 'string' && sanitizedData.replyToId.length <= 100 ? sanitizedData.replyToId : null,
                  expiresAt,
                  timestamp: new Date(sanitizedData.timestamp || Date.now()),
                  delivered: peerOnlineForDb,
                };

                await db.insert(schema.messages).values(messageData);
              }
            }

            // STEP 1: IMMEDIATELY send 'sent' status to ALL sender devices (including current device)
            // This ensures the sender device removes the pending timer right away
            const sentStatusUpdate = {
              type: 'message-status',
              ids: [sanitizedData.id],
              status: 'sent' as const
            };
            
            // Send to sender's current device FIRST
            ws.send(JSON.stringify(sentStatusUpdate));
            
            // Send to ALL other devices of the same user
            room.clients.forEach((client, clientWs) => {
              if (client.userType === myUserType && clientWs !== ws && clientWs.readyState === WebSocket.OPEN) {
                clientWs.send(JSON.stringify(sentStatusUpdate));
              }
            });

            // STEP 2: Check if peer is online and broadcast message to peer
            let peerOnline = false;
            room.clients.forEach((client, clientWs) => {
              if (client.userType !== myUserType && clientWs.readyState === WebSocket.OPEN) {
                peerOnline = true;
                // Send to peer - explicitly set sender to 'them' so it appears on left side
                clientWs.send(JSON.stringify({ 
                  type: 'chat-message',
                  ...sanitizedData, 
                  sender: 'them',
                  status: 'delivered' 
                }));
              }
            });

            // STEP 3: If peer is online, immediately update status to 'delivered' on ALL sender devices
            if (peerOnline) {
              const deliveredStatusUpdate = {
                type: 'message-status',
                ids: [sanitizedData.id],
                status: 'delivered' as const
              };
              
              // Send to sender's current device
              ws.send(JSON.stringify(deliveredStatusUpdate));
              
              // Send to ALL other devices of the same user
              room.clients.forEach((client, clientWs) => {
                if (client.userType === myUserType && clientWs !== ws && clientWs.readyState === WebSocket.OPEN) {
                  clientWs.send(JSON.stringify(deliveredStatusUpdate));
                }
              });
            }

            // STEP 4: Sync message to sender's other devices (for multi-device sync)
            room.clients.forEach((client, clientWs) => {
              if (client.userType === myUserType && clientWs !== ws && clientWs.readyState === WebSocket.OPEN) {
                // Mark as 'me' so it appears on the right side for the sender's other devices
                clientWs.send(JSON.stringify({ 
                  type: 'chat-message',
                  ...sanitizedData, 
                  sender: 'me', 
                  status: peerOnline ? 'delivered' : 'sent' 
                }));
              }
            });
            
            if (!peerOnline) {
              // Send push notification for offline messages
              if (myUserType === 'friend') {
                const msgPreview = sanitizedData.messageType === 'text'
                  ? (sanitizedText.length > 50 ? sanitizedText.substring(0, 50) + '...' : sanitizedText)
                  : sanitizedData.messageType === 'image' ? '📷 Photo'
                  : sanitizedData.messageType === 'video' ? '🎥 Video'
                  : sanitizedData.messageType === 'audio' ? '🎤 Voice message'
                  : 'New message';
                sendPushNotification('admin', `💬 ${sanitizedData.senderName || 'Friend'}`, msgPreview);
              }

              // Store pending message for offline user (only if no database)
              if (!hasDatabase) {
                const pendingKey = `${currentRoom}_${myUserType === 'admin' ? 'friend' : 'admin'}`;
                const pending = pendingMessages.get(pendingKey) || [];
                pending.push({
                  id: sanitizedData.id,
                  text: sanitizedText,
                  messageType: sanitizedData.messageType || 'text',
                  mediaUrl: sanitizedMediaUrl,
                  timestamp: Date.now(),
                  senderName: sanitizedData.senderName || myProfile?.name || 'Unknown',
                  status: 'sent'
                });
                pendingMessages.set(pendingKey, pending);
              }

            }
          } catch (error) {
            console.error('Failed to save message:', error);
            // Still try to relay the message even if database fails
            // Use sanitizedData if it exists, otherwise use original data
            const messageData = sanitizedData || data;
            let peerOnline = false;
            room.clients.forEach((client, clientWs) => {
              if (client.userType !== myUserType && clientWs.readyState === WebSocket.OPEN) {
                peerOnline = true;
                clientWs.send(JSON.stringify({ 
                  type: 'chat-message',
                  ...messageData, 
                  sender: 'them',
                  status: 'delivered' 
                }));
              }
            });
            
            // Also sync to other devices of same user
            room.clients.forEach((client, clientWs) => {
              if (client.userType === myUserType && clientWs !== ws && clientWs.readyState === WebSocket.OPEN) {
                clientWs.send(JSON.stringify({ 
                  type: 'chat-message',
                  ...messageData, 
                  sender: 'me', 
                  status: peerOnline ? 'delivered' : 'sent' 
                }));
              }
            });
            
            // STEP 1: IMMEDIATELY send 'sent' status to ALL sender devices
            const sentStatusUpdate = {
              type: 'message-status',
              ids: [messageData.id],
              status: 'sent' as const
            };
            
            // Send to sender's current device FIRST
            ws.send(JSON.stringify(sentStatusUpdate));
            
            // Send to ALL other devices of the same user
            room.clients.forEach((client, clientWs) => {
              if (client.userType === myUserType && clientWs !== ws && clientWs.readyState === WebSocket.OPEN) {
                clientWs.send(JSON.stringify(sentStatusUpdate));
              }
            });
            
            // STEP 2: If peer is online, update to 'delivered' on ALL sender devices
            if (peerOnline) {
              const deliveredStatusUpdate = {
                type: 'message-status',
                ids: [messageData.id],
                status: 'delivered' as const
              };
              
              // Send to sender's current device
              ws.send(JSON.stringify(deliveredStatusUpdate));
              
              // Send to ALL other devices of the same user
              room.clients.forEach((client, clientWs) => {
                if (client.userType === myUserType && clientWs !== ws && clientWs.readyState === WebSocket.OPEN) {
                  clientWs.send(JSON.stringify(deliveredStatusUpdate));
                }
              });
            }
          }

        } else if (type === "message-read" && currentRoom) {
          const room = rooms.get(currentRoom);
          if (!room) return;

          try {
            // Mark messages as read in database if available
            if (hasDatabase && db) {
              const userId = myUserType === 'admin' ? adminUserId : friendUserId;
              for (const messageId of data.ids) {
                await db.insert(schema.messageReads).values({
                  messageId,
                  userId,
                  readAt: new Date(),
                }).onConflictDoNothing();
              }

              // Check for "after_seen" retention mode and mark messages for deletion
              const retention = await db.query.messageRetention.findFirst({
                where: eq(schema.messageRetention.roomId, currentRoom)
              });

              if (retention?.retentionMode === 'after_seen') {
                // Check if both users have read the message
                for (const messageId of data.ids) {
                  const message = await db.query.messages.findFirst({
                    where: eq(schema.messages.id, messageId)
                  });

                  if (message && !message.expiresAt) {
                    // Check if both users have read this message
                    const adminRead = await db.query.messageReads.findFirst({
                      where: and(
                        eq(schema.messageReads.messageId, messageId),
                        eq(schema.messageReads.userId, adminUserId)
                      )
                    });

                    const friendRead = await db.query.messageReads.findFirst({
                      where: and(
                        eq(schema.messageReads.messageId, messageId),
                        eq(schema.messageReads.userId, friendUserId)
                      )
                    });

                    if (adminRead && friendRead) {
                      // Both users have read, set expiresAt to now
                      await db.update(schema.messages)
                        .set({ expiresAt: new Date() })
                        .where(eq(schema.messages.id, messageId));
                    }
                  }
                }
              }
            } else {
              // Mark messages as read in memory
              for (const messageId of data.ids) {
                messageStatus.set(messageId, 'read');
              }
            }

            // Broadcast read status to ALL sessions (including sender's devices for sync)
            const readStatusUpdate = {
              type: 'message-status',
              ids: data.ids,
              status: 'read' as const
            };
            
            // Send to ALL devices in the room (peer and sender's devices)
            room.clients.forEach((client, clientWs) => {
              if (clientWs.readyState === WebSocket.OPEN) {
                clientWs.send(JSON.stringify(readStatusUpdate));
              }
            });
          } catch (error) {
            console.error('Failed to mark messages as read:', error);
          }

        } else if (type === "sync-response" && currentRoom) {
          const room = rooms.get(currentRoom);
          if (!room) return;
          
          room.clients.forEach((client, clientWs) => {
            if (client.deviceId === data.targetDeviceId && clientWs.readyState === WebSocket.OPEN) {
              clientWs.send(JSON.stringify({
                type: "sync-messages",
                messages: data.messages
              }));
            }
          });

        } else if (type === "message-delete" && currentRoom) {
          const room = rooms.get(currentRoom);
          if (!room) return;

          try {
            // Mark message as deleted in database
            if (hasDatabase && db) {
              const userId = myUserType === 'admin' ? adminUserId : friendUserId;
              await db.update(schema.messages)
                .set({
                  isDeleted: true,
                  deletedAt: new Date(),
                  deletedById: userId,
                })
                .where(eq(schema.messages.id, data.id));
            }

            // Broadcast delete to all sessions
            room.clients.forEach((client, clientWs) => {
              if (clientWs.readyState === WebSocket.OPEN) {
                clientWs.send(JSON.stringify({
                  type: 'message-deleted',
                  id: data.id,
                }));
              }
            });
          } catch (error) {
            console.error('Failed to delete message:', error);
          }

        } else if (type === "emergency-wipe" && currentRoom) {
          const room = rooms.get(currentRoom);
          if (!room) return;

          try {
            // Mark all messages as deleted in database
            if (hasDatabase && db) {
              const userId = myUserType === 'admin' ? adminUserId : friendUserId;
              await db.update(schema.messages)
                .set({
                  isDeleted: true,
                  deletedAt: new Date(),
                  deletedById: userId,
                })
                .where(eq(schema.messages.roomId, currentRoom));
            }

            broadcastToAll(room, { type: 'emergency-wipe' });
          } catch (error) {
            console.error('Failed to wipe messages:', error);
          }

        } else if (currentRoom && rooms.has(currentRoom)) {
          const room = rooms.get(currentRoom)!;
          const targetUserType = myUserType === 'admin' ? 'friend' : 'admin';
          
          if (type === "typing") {
            // Broadcast typing status to peer only (not to own devices)
            broadcastToUserType(room, targetUserType, data);
          } else if (type === "profile-update") {
            // Broadcast profile update to peer
            broadcastToUserType(room, targetUserType, data);
            
            // Also sync to ALL devices of the same user (including current device) for consistency
            // Send as 'profile_updated' event so frontend can update own profile
            const profileUpdatedEvent = {
              type: 'profile_updated',
              profile: data.profile,
              userType: myUserType
            };
            
            room.clients.forEach((client, clientWs) => {
              if (client.userType === myUserType && clientWs.readyState === WebSocket.OPEN) {
                // Send to all devices of same user (including sender)
                clientWs.send(JSON.stringify(profileUpdatedEvent));
              }
            });
          } else {
            broadcastToAll(room, data, ws);
          }
        }
      } catch (e) {
        console.error("WebSocket message error:", e);
      }
    });

    ws.on("close", () => {
      if (currentRoom && rooms.has(currentRoom)) {
        const room = rooms.get(currentRoom)!;
        room.clients.delete(ws);
        
        let sameUserTypeStillOnline = false;
        room.clients.forEach((client) => {
          if (client.userType === myUserType) {
            sameUserTypeStillOnline = true;
          }
        });
        
        if (!sameUserTypeStillOnline) {
          room.clients.forEach((client, clientWs) => {
            if (client.userType !== myUserType && clientWs.readyState === WebSocket.OPEN) {
              clientWs.send(JSON.stringify({ type: "peer-left", roomId: currentRoom }));
            }
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

  // Cleanup scheduler for expired messages (only for disappearing modes and when database is available)
  const cleanupExpiredMessages = async () => {
    if (!hasDatabase) return;

    try {
      const now = new Date();
      const expiredMessages = await db.query.messages.findMany({
        where: and(
          isNotNull(schema.messages.expiresAt),
          lt(schema.messages.expiresAt, now),
          eq(schema.messages.isDeleted, false)
        )
      });

      if (expiredMessages.length > 0) {
        // Cleaning up expiredMessages.length expired messages

        // Mark messages as deleted
        await db.update(schema.messages)
          .set({
            isDeleted: true,
            deletedAt: now,
          })
          .where(and(
            isNotNull(schema.messages.expiresAt),
            lt(schema.messages.expiresAt, now),
            eq(schema.messages.isDeleted, false)
          ));

        // Broadcast deletion to connected clients
        for (const message of expiredMessages) {
          const room = rooms.get(message.roomId);
          if (room) {
            broadcastToAll(room, {
              type: 'message-deleted',
              id: message.id,
            });
          }
        }
      }
    } catch (error) {
      console.error('Error during message cleanup:', error);
    }
  };

  // Initialize database and start cleanup scheduler
  initializeDatabase().then(() => {
    if (hasDatabase) {
      // Run cleanup every 5 minutes
      setInterval(cleanupExpiredMessages, 5 * 60 * 1000);

      // Run cleanup on startup
      cleanupExpiredMessages();
    }
  });

  return httpServer;
}
