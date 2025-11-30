import type { Express } from "express";
import { type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";

interface ClientData {
  ws: WebSocket;
  profile?: { name: string; avatar: string };
  userType?: string;
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
}

const rooms = new Map<string, RoomData>();
const pendingMessages = new Map<string, PendingMessage[]>(); // roomId -> messages for offline users

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

    ws.on("message", (message: string) => {
      try {
        const data = JSON.parse(message.toString());
        const { type, roomId } = data;

        if (type === "join") {
          currentRoom = roomId;
          myProfile = data.profile;
          myUserType = data.userType;
          
          // Create room if it doesn't exist
          if (!rooms.has(roomId)) {
            rooms.set(roomId, {
              clients: new Map(),
              createdAt: new Date()
            });
          }
          
          const room = rooms.get(roomId)!;
          room.clients.set(ws, { ws, profile: myProfile, userType: myUserType });
          
          const roomSize = room.clients.size;
          
          // Get peer profile if exists
          let peerProfile: { name: string; avatar: string } | undefined;
          room.clients.forEach((client, clientWs) => {
            if (clientWs !== ws && client.profile) {
              peerProfile = client.profile;
            }
          });
          
          // Send joined confirmation
          ws.send(JSON.stringify({ 
            type: "joined", 
            roomId, 
            isInitiator: roomSize === 1,
            peerCount: roomSize,
            peerProfile: peerProfile
          }));
          
          // Deliver any pending messages for this user
          const roomPendingKey = `${roomId}_${myUserType}`;
          const pending = pendingMessages.get(roomPendingKey);
          if (pending && pending.length > 0) {
            pending.forEach(msg => {
              ws.send(JSON.stringify({
                type: "chat-message",
                id: msg.id,
                text: msg.text,
                messageType: msg.messageType,
                mediaUrl: msg.mediaUrl,
                timestamp: msg.timestamp,
                senderName: msg.senderName
              }));
            });
            pendingMessages.delete(roomPendingKey);
          }
          
          // Notify existing peers
          if (roomSize >= 2) {
            room.clients.forEach((client, clientWs) => {
              if (clientWs !== ws && clientWs.readyState === WebSocket.OPEN) {
                clientWs.send(JSON.stringify({ 
                  type: "peer-joined", 
                  roomId,
                  profile: myProfile 
                }));
              }
            });
          }

        } else if (type === "chat-message" && currentRoom) {
          // Handle chat messages - store if peer offline
          const room = rooms.get(currentRoom);
          if (!room) return;
          
          let peerOnline = false;
          let peerUserType: string | undefined;
          
          room.clients.forEach((client, clientWs) => {
            if (clientWs !== ws && clientWs.readyState === WebSocket.OPEN) {
              peerOnline = true;
              clientWs.send(JSON.stringify(data));
            }
            if (clientWs !== ws) {
              peerUserType = client.userType;
            }
          });
          
          // If peer is offline, store the message
          if (!peerOnline) {
            // Determine target user type (the opposite of sender)
            const targetUserType = myUserType === 'admin' ? 'friend' : 'admin';
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
              targetUserType
            });
            
            // Confirm to sender that message was queued
            ws.send(JSON.stringify({
              type: "message-queued",
              id: data.id
            }));
          }

        } else if (currentRoom && rooms.has(currentRoom)) {
          // Relay other signaling messages
          const room = rooms.get(currentRoom)!;
          room.clients.forEach((client, clientWs) => {
            if (clientWs !== ws && clientWs.readyState === WebSocket.OPEN) {
              clientWs.send(JSON.stringify(data));
            }
          });
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
