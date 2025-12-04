# TODO: Fix ChatLayout and Message Sending

## 1. Fix Mobile Layout in ChatLayout.tsx
- [x] Change main container to `flex flex-col h-screen w-full overflow-hidden`
- [x] Make header fixed: `fixed top-0 left-0 right-0 h-14 z-50`
- [x] Make messages area scrollable: `flex-1 overflow-y-auto pt-14 pb-20`
- [x] Make input bar fixed: `fixed bottom-0 left-0 right-0 h-auto z-50`

## 2. Fix Message Sending in use-chat-connection.ts
- [x] Change FIXED_ROOM_ID to "secure-room-001"
- [x] Add BroadcastChannel for tab sync
- [x] Re-enable WebRTC DataChannel message listener
- [x] Re-enable sending messages via DataChannel
- [x] Ensure messages state updates on receive
- [x] Broadcast new messages to other tabs via BroadcastChannel
- [x] Receive messages from other tabs via BroadcastChannel

## 3. Testing and Verification
- [x] Start development server to test changes
