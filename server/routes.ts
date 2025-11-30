import type { Express } from "express";
import { type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";

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

const rooms = new Map<string, RoomData>();
const pendingMessages = new Map<string, PendingMessage[]>();
const messageStatus = new Map<string, 'sent' | 'delivered' | 'read'>();

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
          
          // Count unique user types online
          const onlineUserTypes = new Set<string>();
          room.clients.forEach((client) => {
            if (client.userType) onlineUserTypes.add(client.userType);
          });
          
          // Get peer profile (opposite user type)
          let peerProfile: { name: string; avatar: string } | undefined;
          let peerOnline = false;
          room.clients.forEach((client, clientWs) => {
            if (client.userType !== myUserType && client.profile) {
              peerProfile = client.profile;
              peerOnline = clientWs.readyState === WebSocket.OPEN;
            }
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
          
          // Notify peers about new connection
          room.clients.forEach((client, clientWs) => {
            if (client.userType !== myUserType && clientWs.readyState === WebSocket.OPEN) {
              clientWs.send(JSON.stringify({ 
                type: "peer-joined", 
                roomId,
                profile: myProfile 
              }));
            }
          });

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
        
        // Notify peers
        room.clients.forEach((client, clientWs) => {
          if (clientWs.readyState === WebSocket.OPEN) {
            clientWs.send(JSON.stringify({ type: "peer-left", roomId: currentRoom }));
          }
        });
        
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
