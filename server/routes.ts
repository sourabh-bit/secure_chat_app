import type { Express } from "express";
import { type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import webpush from "web-push";

interface ClientData {
  ws: WebSocket;
  profile?: { name: string; avatar: string };
  userType?: string;
  deviceId?: string;
}

interface RoomData {
  clients: Map<WebSocket, ClientData>;
  createdAt: Date;
}

interface PendingMessage {
  id: string;
  text: string;
  messageType: string;
  mediaUrl?: string;
  timestamp: string;
  senderName: string;
  targetUserType: string;
  status: 'sent' | 'delivered' | 'read';
}

interface PushSubscriptionData {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

const rooms = new Map<string, RoomData>();
const pendingMessages = new Map<string, PendingMessage[]>();
const messageStatus = new Map<string, 'sent' | 'delivered' | 'read'>();

// Store push subscriptions by user type
const pushSubscriptions = new Map<string, PushSubscriptionData[]>();

// VAPID keys for web push (generate your own for production)
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || 'BLBz8nXqJ3H5VSJgNPaF1N7p0_VfQKZwzPvHRmqIKvE4EHlpjBqeGMx5PaJk9R7VxTkNh3n_WbE2OqK8yXlH8Aw';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || 'dGnKX_4nRqH5VSJgNPaF1N7p0_VfQKZwzPvHRmqIKvE';

// Configure web-push
webpush.setVapidDetails(
  'mailto:admin@securechat.com',
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY
);

// Send push notification to offline users
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
        // Subscription expired or invalid, don't keep it
        console.log('Removing invalid push subscription');
      } else {
        validSubscriptions.push(subscription);
        console.error('Push notification error:', error.message);
      }
    }
  }
  
  // Update with only valid subscriptions
  if (validSubscriptions.length > 0) {
    pushSubscriptions.set(userType, validSubscriptions);
  } else {
    pushSubscriptions.delete(userType);
  }
};

// Server-side password storage (synced across all devices)
// Uses environment variables or defaults - persists in env for production
const passwords = {
  gatekeeper_key: process.env.GATEKEEPER_KEY || 'secret',
  admin_pass: process.env.ADMIN_PASS || 'admin123',
  friend_pass: process.env.FRIEND_PASS || 'friend123'
};

// File-based persistence for passwords (survives restarts)
import * as fs from 'fs';
import * as path from 'path';

const PASSWORD_FILE = path.join(process.cwd(), '.passwords.json');

// Load passwords from file on startup
const loadPasswords = () => {
  try {
    if (fs.existsSync(PASSWORD_FILE)) {
      const data = JSON.parse(fs.readFileSync(PASSWORD_FILE, 'utf-8'));
      if (data.gatekeeper_key) passwords.gatekeeper_key = data.gatekeeper_key;
      if (data.admin_pass) passwords.admin_pass = data.admin_pass;
      if (data.friend_pass) passwords.friend_pass = data.friend_pass;
      console.log('Passwords loaded from file');
    }
  } catch (err) {
    console.log('No saved passwords found, using defaults');
  }
};

// Save passwords to file
const savePasswords = () => {
  try {
    fs.writeFileSync(PASSWORD_FILE, JSON.stringify(passwords, null, 2));
    console.log('Passwords saved to file');
  } catch (err) {
    console.error('Failed to save passwords:', err);
  }
};

// Load on startup
loadPasswords();

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
  
  // API endpoints for password management
  app.get('/api/auth/passwords', (req, res) => {
    res.json(passwords);
  });
  
  app.post('/api/auth/passwords', (req, res) => {
    const { gatekeeper_key, admin_pass, friend_pass, current_password } = req.body;
    
    // Verify current password before allowing changes
    // Allow if current_password matches either admin or friend password
    const isValidPassword = current_password === passwords.admin_pass || 
                            current_password === passwords.friend_pass;
    
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid current password' });
    }
    
    // Update passwords
    if (gatekeeper_key) passwords.gatekeeper_key = gatekeeper_key;
    if (admin_pass) passwords.admin_pass = admin_pass;
    if (friend_pass) passwords.friend_pass = friend_pass;
    
    // Save to file for persistence
    savePasswords();
    
    res.json({ success: true, passwords });
  });

  // Push notification endpoints
  app.get('/api/push/vapid-key', (req, res) => {
    res.json({ publicKey: VAPID_PUBLIC_KEY });
  });

  app.post('/api/push/subscribe', (req, res) => {
    const { subscription, userType } = req.body;
    
    if (!subscription || !userType) {
      return res.status(400).json({ error: 'Missing subscription or userType' });
    }
    
    // Only allow admin to subscribe for push notifications
    if (userType !== 'admin') {
      return res.status(403).json({ error: 'Push notifications only available for admin' });
    }
    
    const existing = pushSubscriptions.get('admin') || [];
    
    // Avoid duplicate subscriptions
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

  // WebSocket signaling server
  const wss = new WebSocketServer({ server: httpServer, path: "/ws" });

  wss.on("connection", (ws: WebSocket) => {
    let currentRoom: string | null = null;
    let myProfile: { name: string; avatar: string } | undefined;
    let myUserType: string | undefined;
    let myDeviceId: string | undefined;

    ws.on("message", (message: string) => {
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
          
          // Get the opposite user type
          const peerUserType = myUserType === 'admin' ? 'friend' : 'admin';
          
          // Check if any peer (opposite user type) is online
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
          
          // Count unique user types online (for initiator logic)
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
          
          // Deliver pending messages
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
                status: 'delivered'
              }));
              messageIds.push(msg.id);
            });
            pendingMessages.delete(roomPendingKey);
            
            // Notify sender that messages were delivered
            const senderType = myUserType === 'admin' ? 'friend' : 'admin';
            broadcastToUserType(room, senderType, {
              type: 'message-status',
              ids: messageIds,
              status: 'delivered'
            });
          }
          
          // Check if this is the first device of this user type to join
          let isFirstDeviceOfType = true;
          room.clients.forEach((client, clientWs) => {
            if (client.userType === myUserType && clientWs !== ws) {
              isFirstDeviceOfType = false;
            }
          });
          
          // Only notify opposite user type if this is the first device of this user type
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
          
          // Find if peer (opposite user type) is online
          let peerOnline = false;
          const targetUserType = myUserType === 'admin' ? 'friend' : 'admin';
          
          room.clients.forEach((client, clientWs) => {
            if (client.userType === targetUserType && clientWs.readyState === WebSocket.OPEN) {
              peerOnline = true;
              clientWs.send(JSON.stringify({ ...data, status: 'delivered' }));
            }
          });
          
          // Also send to other devices of same user type
          room.clients.forEach((client, clientWs) => {
            if (client.userType === myUserType && clientWs !== ws && clientWs.readyState === WebSocket.OPEN) {
              clientWs.send(JSON.stringify({ ...data, sender: 'me', status: peerOnline ? 'delivered' : 'sent' }));
            }
          });
          
          if (peerOnline) {
            // Send delivered status back to sender
            ws.send(JSON.stringify({
              type: 'message-status',
              ids: [data.id],
              status: 'delivered'
            }));
          } else {
            // Queue message
            const roomPendingKey = `${currentRoom}_${targetUserType}`;
            if (!pendingMessages.has(roomPendingKey)) {
              pendingMessages.set(roomPendingKey, []);
            }
            
            pendingMessages.get(roomPendingKey)!.push({
              id: data.id,
              text: data.text,
              messageType: data.messageType || 'text',
              mediaUrl: data.mediaUrl,
              timestamp: data.timestamp,
              senderName: data.senderName,
              targetUserType,
              status: 'sent'
            });
            
            // Send push notification to admin only (when friend sends message and admin is offline)
            if (targetUserType === 'admin') {
              const msgPreview = data.messageType === 'text' 
                ? (data.text?.length > 50 ? data.text.substring(0, 50) + '...' : data.text)
                : data.messageType === 'image' ? '📷 Photo'
                : data.messageType === 'video' ? '🎥 Video'
                : data.messageType === 'audio' ? '🎤 Voice message'
                : 'New message';
              sendPushNotification('admin', `💬 ${data.senderName || 'Friend'}`, msgPreview);
            }
            
            ws.send(JSON.stringify({
              type: "message-queued",
              id: data.id,
              status: 'sent'
            }));
          }

        } else if (type === "message-read" && currentRoom) {
          // Handle read receipts
          const room = rooms.get(currentRoom);
          if (!room) return;
          
          const senderType = myUserType === 'admin' ? 'friend' : 'admin';
          broadcastToUserType(room, senderType, {
            type: 'message-status',
            ids: data.ids,
            status: 'read'
          });

        } else if (type === "emergency-wipe" && currentRoom) {
          // Emergency wipe - clear all messages for everyone
          const room = rooms.get(currentRoom);
          if (!room) return;
          
          // Clear pending messages
          pendingMessages.delete(`${currentRoom}_admin`);
          pendingMessages.delete(`${currentRoom}_friend`);
          
          // Broadcast wipe to ALL clients in room
          broadcastToAll(room, { type: 'emergency-wipe' });

        } else if (currentRoom && rooms.has(currentRoom)) {
          // Relay other signaling messages to opposite user type
          const room = rooms.get(currentRoom)!;
          const targetUserType = myUserType === 'admin' ? 'friend' : 'admin';
          
          if (type === "typing" || type === "profile-update") {
            broadcastToUserType(room, targetUserType, data);
          } else {
            // For calls etc, broadcast to all except sender
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
        
        // Check if there are still other connections of the same user type
        let sameUserTypeStillOnline = false;
        room.clients.forEach((client) => {
          if (client.userType === myUserType) {
            sameUserTypeStillOnline = true;
          }
        });
        
        // Only notify peers if this was the last connection of this user type
        if (!sameUserTypeStillOnline) {
          room.clients.forEach((client, clientWs) => {
            // Only notify the opposite user type that this user went offline
            if (client.userType !== myUserType && clientWs.readyState === WebSocket.OPEN) {
              clientWs.send(JSON.stringify({ type: "peer-left", roomId: currentRoom }));
            }
          });
        }
        
        // Cleanup
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

  return httpServer;
}
