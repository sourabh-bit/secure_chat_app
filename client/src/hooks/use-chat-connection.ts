import { useState, useEffect, useRef, useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';

interface Message {
  id: string;
  text: string;
  sender: 'me' | 'them';
  timestamp: Date;
  type: 'text' | 'image' | 'video' | 'audio';
  mediaUrl?: string;
  senderName?: string;
  status?: 'sending' | 'sent' | 'delivered' | 'read';
  replyTo?: {
    id: string;
    text: string;
    sender: 'me' | 'them';
  };
}

interface UserProfile {
  name: string;
  avatar: string;
  lastSeen: Date | null;
  isTyping: boolean;
}

const FIXED_ROOM_ID = 'secure-room-001';

const fetchChatHistory = async (userType: 'admin' | 'friend'): Promise<Message[]> => {
  try {
    const response = await fetch(`/api/messages/${FIXED_ROOM_ID}?userType=${userType}`);
    if (response.ok) {
      const data = await response.json();
      if (data.messages && Array.isArray(data.messages)) {
        return data.messages.map((m: any) => ({
          ...m,
          timestamp: new Date(m.timestamp)
        }));
      }
    }
  } catch (error) {
    console.error('Failed to fetch chat history:', error);
  }
  return [];
};

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
    { urls: 'stun:global.stun.twilio.com:3478' },
    {
      urls: 'turn:openrelay.metered.ca:80',
      username: 'openrelayproject',
      credential: 'openrelayproject'
    },
    {
      urls: 'turn:openrelay.metered.ca:443',
      username: 'openrelayproject',
      credential: 'openrelayproject'
    },
    {
      urls: 'turn:openrelay.metered.ca:443?transport=tcp',
      username: 'openrelayproject',
      credential: 'openrelayproject'
    }
  ],
  iceCandidatePoolSize: 10
};

let swRegistration: ServiceWorkerRegistration | null = null;

const registerServiceWorker = async () => {
  if ('serviceWorker' in navigator) {
    try {
      swRegistration = await navigator.serviceWorker.register('/sw.js');
      return swRegistration;
    } catch (err) {
      console.log('Service Worker registration failed:', err);
      return null;
    }
  }
  return null;
};

const subscribeToPush = async (registration: ServiceWorkerRegistration) => {
  try {
    const response = await fetch('/api/push/vapid-key');
    const { publicKey } = await response.json();

    const urlBase64ToUint8Array = (base64String: string) => {
      const padding = '='.repeat((4 - base64String.length % 4) % 4);
      const base64 = (base64String + padding)
        .replace(/-/g, '+')
        .replace(/_/g, '/');
      const rawData = window.atob(base64);
      const outputArray = new Uint8Array(rawData.length);
      for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
      }
      return outputArray;
    };

    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey)
    });

    await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subscription: subscription.toJSON(),
        userType: 'admin'
      })
    });
  } catch (err) {
    console.error('Push subscription failed:', err);
  }
};

const requestNotificationPermission = async () => {
  if (!('Notification' in window)) return;

  if (Notification.permission === 'default') {
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      const registration = await registerServiceWorker();
      if (registration) await subscribeToPush(registration);
    }
  } else if (Notification.permission === 'granted') {
    const registration = await registerServiceWorker();
    if (registration) await subscribeToPush(registration);
  }
};

const showBrowserNotification = (title: string, body: string, icon?: string) => {
  if (!('Notification' in window) || Notification.permission !== 'granted') {
    return;
  }

  if (swRegistration) {
    swRegistration.showNotification(title, {
      body,
      icon: icon || '/favicon.png',
      tag: 'chat-notification',
      vibrate: [200, 100, 200]
    } as NotificationOptions);
  } else if (document.hidden) {
    new Notification(title, {
      body,
      icon: icon || '/favicon.png',
      tag: 'chat-notification'
    });
  }
};

const migrateLocalStorage = (userType: 'admin' | 'friend') => {
  const oldKeys = ['profile_admin', 'profile_friend'];
  oldKeys.forEach((key) => {
    if (localStorage.getItem(key)) {
      localStorage.removeItem(key);
    }
  });
};

const logConnectionEvent = (user: string, action: string) => {
  const logs = JSON.parse(localStorage.getItem('connection_logs') || '[]');
  logs.push({
    timestamp: new Date().toISOString(),
    user,
    action
  });
  localStorage.setItem('connection_logs', JSON.stringify(logs.slice(-100)));
};

export function useChatConnection(userType: 'admin' | 'friend') {
  const { toast } = useToast();

  useEffect(() => {
    migrateLocalStorage(userType);
  }, [userType]);

  const [isConnected, setIsConnected] = useState(false);
  const [peerConnected, setPeerConnected] = useState(false);

  const defaultPeerName = userType === 'admin' ? 'Friend' : 'Admin';

  const [myProfile, setMyProfile] = useState<UserProfile>(() => {
    const saved = localStorage.getItem(`chat_my_profile_${userType}`);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return { ...parsed, lastSeen: null, isTyping: false };
      } catch {
        localStorage.removeItem(`chat_my_profile_${userType}`);
      }
    }
    return {
      name: userType === 'admin' ? 'Admin' : 'Friend',
      avatar: '',
      lastSeen: null,
      isTyping: false
    };
  });

  const [peerProfile, setPeerProfile] = useState<UserProfile>(() => {
    const saved = localStorage.getItem(`chat_peer_profile_${userType}`);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return {
          ...parsed,
          lastSeen: parsed.lastSeen ? new Date(parsed.lastSeen) : null,
          isTyping: false
        };
      } catch {
        localStorage.removeItem(`chat_peer_profile_${userType}`);
      }
    }
    return {
      name: defaultPeerName,
      avatar: '',
      lastSeen: null,
      isTyping: false
    };
  });

  useEffect(() => {
    if (userType === 'admin') {
      requestNotificationPermission();
    }
  }, [userType]);

  const [messages, setMessages] = useState<Message[]>(() => {
    const saved = localStorage.getItem(`chat_messages_${userType}`);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return parsed.map((m: any) => ({
            ...m,
            timestamp: new Date(m.timestamp)
          }));
        }
      } catch {
        localStorage.removeItem(`chat_messages_${userType}`);
      }
    }
    return [];
  });

  const [activeCall, setActiveCall] = useState<'voice' | 'video' | null>(null);
  const [incomingCall, setIncomingCall] = useState<{
    type: 'voice' | 'video';
    from: string;
  } | null>(null);
  const [callStatus, setCallStatus] = useState<
    'idle' | 'calling' | 'ringing' | 'connected'
  >('idle');
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const pendingCandidates = useRef<RTCIceCandidateInit[]>([]);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const currentCallType = useRef<'voice' | 'video' | null>(null);
  const processedMessageIds = useRef<Set<string>>(new Set());
  const isDocumentVisible = useRef<boolean>(!document.hidden);
  const offlineQueue = useRef<any[]>([]);

  const deviceId = useRef<string>(
    localStorage.getItem('device_id') ||
      (() => {
        const id = `${Date.now()}-${Math.random()
          .toString(36)
          .substr(2, 9)}`;
        localStorage.setItem('device_id', id);
        return id;
      })()
  );
  const sessionId = useRef<string>(
    `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  );

  const myProfileRef = useRef(myProfile);
  const peerProfileRef = useRef(peerProfile);
  const messagesRef = useRef(messages);
  const peerConnectedRef = useRef(peerConnected);

  useEffect(() => {
    myProfileRef.current = myProfile;
  }, [myProfile]);

  useEffect(() => {
    peerProfileRef.current = peerProfile;
  }, [peerProfile]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    peerConnectedRef.current = peerConnected;
  }, [peerConnected]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      isDocumentVisible.current = !document.hidden;
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  useEffect(() => {
    localStorage.setItem(
      `chat_messages_${userType}`,
      JSON.stringify(messages)
    );
  }, [messages, userType]);

  useEffect(() => {
    localStorage.setItem(
      `chat_my_profile_${userType}`,
      JSON.stringify({
        name: myProfile.name,
        avatar: myProfile.avatar
      })
    );
  }, [myProfile.name, myProfile.avatar, userType]);

  useEffect(() => {
    if (peerProfile.name !== defaultPeerName || peerProfile.avatar) {
      localStorage.setItem(
        `chat_peer_profile_${userType}`,
        JSON.stringify({
          name: peerProfile.name,
          avatar: peerProfile.avatar,
          lastSeen: peerProfile.lastSeen
        })
      );
    }
  }, [
    peerProfile.name,
    peerProfile.avatar,
    peerProfile.lastSeen,
    defaultPeerName,
    userType
  ]);

  const getWebSocketUrl = () => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}/ws`;
  };

  const sendSignal = useCallback((data: any, queueIfOffline = false) => {
    const payload = { ...data, roomId: FIXED_ROOM_ID };
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(payload));
    } else if (queueIfOffline) {
      offlineQueue.current.push(payload);
    }
  }, []);

  const flushOfflineQueue = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN && offlineQueue.current.length > 0) {
      offlineQueue.current.forEach((payload) => {
        wsRef.current!.send(JSON.stringify(payload));
      });
      offlineQueue.current = [];
    }
  }, []);

  const updateMyProfile = useCallback((updates: Partial<UserProfile>) => {
    setMyProfile((prev) => {
      const updated = { ...prev, ...updates };
      sendSignal({
        type: 'profile-update',
        profile: { name: updated.name, avatar: updated.avatar }
      });
      return updated;
    });
  }, [sendSignal]);

  const cleanupCall = useCallback(() => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        track.stop();
      });
    }

    if (peerRef.current) {
      peerRef.current.close();
      peerRef.current = null;
    }

    setLocalStream(null);
    setRemoteStream(null);
    setActiveCall(null);
    setIncomingCall(null);
    setCallStatus('idle');
    setIsMuted(false);
    setIsVideoOff(false);
    currentCallType.current = null;
    pendingCandidates.current = [];
  }, []);

  const getMediaConstraints = (mode: 'voice' | 'video') => {
    return {
      audio: {
        echoCancellation: { ideal: true },
        noiseSuppression: { ideal: true },
        autoGainControl: { ideal: true },
        sampleRate: { ideal: 48000 },
        channelCount: { ideal: 1 },
        latency: { ideal: 0.01 }
      },
      video:
        mode === 'video'
          ? {
              width: { ideal: 1280, max: 1920 },
              height: { ideal: 720, max: 1080 },
              frameRate: { ideal: 30, max: 30 },
              facingMode: 'user'
            }
          : false
    };
  };

  const createPeerConnection = useCallback((stream: MediaStream) => {
    const peer = new RTCPeerConnection(ICE_SERVERS);

    const existingSenders = peer.getSenders();
    stream.getTracks().forEach((track) => {
      const alreadyAdded = existingSenders.some(s => s.track?.id === track.id);
      if (!alreadyAdded) {
        peer.addTrack(track, stream);
      }
    });

    peer.onicecandidate = (event) => {
      if (event.candidate) {
        sendSignal({
          type: 'ice-candidate',
          candidate: {
            candidate: event.candidate.candidate,
            sdpMLineIndex: event.candidate.sdpMLineIndex,
            sdpMid: event.candidate.sdpMid
          }
        });
      }
    };

    peer.ontrack = (event) => {
      if (event.streams && event.streams[0]) {
        setRemoteStream(event.streams[0]);
      }
    };

    peer.oniceconnectionstatechange = () => {
      if (peer.iceConnectionState === 'connected') {
        setCallStatus('connected');
      } else if (
        peer.iceConnectionState === 'disconnected' ||
        peer.iceConnectionState === 'failed'
      ) {
        toast({
          title: 'Call connection lost',
          variant: 'destructive'
        });
        cleanupCall();
      }
    };

    return peer;
  }, [sendSignal, toast, cleanupCall]);

  const initiateWebRTC = useCallback(async (mode: 'voice' | 'video') => {
    try {
      const constraints = getMediaConstraints(mode);
      const stream = await navigator.mediaDevices.getUserMedia(constraints);

      setLocalStream(stream);
      localStreamRef.current = stream;

      const peer = createPeerConnection(stream);
      peerRef.current = peer;

      const offer = await peer.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: mode === 'video'
      });
      await peer.setLocalDescription(offer);
      sendSignal({ type: 'offer', sdp: offer });
      setCallStatus('connected');
    } catch (err) {
      console.error('Media error:', err);
      toast({
        variant: 'destructive',
        title: 'Could not access camera/microphone'
      });
      cleanupCall();
    }
  }, [createPeerConnection, sendSignal, toast, cleanupCall]);

  const handleOffer = useCallback(async (sdp: RTCSessionDescriptionInit) => {
    try {
      const mode = currentCallType.current || 'voice';
      const constraints = getMediaConstraints(mode);
      const stream = await navigator.mediaDevices.getUserMedia(constraints);

      setLocalStream(stream);
      localStreamRef.current = stream;

      const peer = createPeerConnection(stream);
      peerRef.current = peer;

      await peer.setRemoteDescription(new RTCSessionDescription(sdp));

      for (const candidate of pendingCandidates.current) {
        try {
          await peer.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (e) {
          console.error('Error adding pending candidate:', e);
        }
      }
      pendingCandidates.current = [];

      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);
      sendSignal({ type: 'answer', sdp: answer });
      setCallStatus('connected');
    } catch (e) {
      console.error('Error handling offer:', e);
      toast({ variant: 'destructive', title: 'Failed to connect call' });
      cleanupCall();
    }
  }, [createPeerConnection, sendSignal, toast, cleanupCall]);

  const handleAnswer = useCallback(async (sdp: RTCSessionDescriptionInit) => {
    if (!peerRef.current) return;
    try {
      await peerRef.current.setRemoteDescription(
        new RTCSessionDescription(sdp)
      );

      for (const candidate of pendingCandidates.current) {
        try {
          await peerRef.current.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (e) {
          console.error('Error adding pending candidate:', e);
        }
      }
      pendingCandidates.current = [];
    } catch (e) {
      console.error('Error handling answer:', e);
    }
  }, []);

  const handleIceCandidate = useCallback(async (candidate: RTCIceCandidateInit) => {
    if (!candidate) return;

    if (peerRef.current?.remoteDescription) {
      try {
        await peerRef.current.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (e) {
        console.error('Error adding ICE candidate:', e);
      }
    } else {
      pendingCandidates.current.push(candidate);
    }
  }, []);

  const handleMessage = useCallback(async (data: any) => {
    // Prevent processing duplicate messages
    if (data.id && processedMessageIds.current.has(data.id)) {
      return;
    }
    switch (data.type) {
      case 'joined': {
        if (data.peerProfile) {
          setPeerProfile((prev) => ({
            ...prev,
            ...data.peerProfile,
            lastSeen: data.peerOnline ? null : prev.lastSeen,
            isTyping: false
          }));
        }
        setPeerConnected(Boolean(data.peerOnline));

        if (data.peerOnline) {
          setMessages((prev) =>
            prev.map((m) =>
              m.sender === 'me' && (m.status === 'sent' || m.status === 'sending')
                ? { ...m, status: 'delivered' as const }
                : m
            )
          );
        }
        break;
      }

      case 'peer-joined': {
        setPeerConnected(true);
        const peerName = data.profile?.name || defaultPeerName;
        setPeerProfile((prev) => ({
          ...prev,
          name: data.profile?.name || prev.name,
          avatar: data.profile?.avatar || prev.avatar,
          lastSeen: null,
          isTyping: false
        }));
        toast({ title: `${peerName} is online!` });

        if (userType === 'admin') {
          logConnectionEvent(peerName, 'Came online');
          showBrowserNotification(
            '💚 Friend Online',
            `${peerName} just came online!`,
            data.profile?.avatar
          );
        }

        sendSignal({
          type: 'profile-update',
          profile: { name: myProfileRef.current.name, avatar: myProfileRef.current.avatar }
        });

        setMessages((prev) =>
          prev.map((m) =>
            m.sender === 'me' && (m.status === 'sent' || m.status === 'sending')
              ? { ...m, status: 'delivered' as const }
              : m
          )
        );
        break;
      }

      case 'peer-left': {
        setPeerConnected(false);
        const leftPeerName = peerProfileRef.current.name || defaultPeerName;
        setPeerProfile((prev) => ({
          ...prev,
          lastSeen: new Date(),
          isTyping: false
        }));
        toast({ title: `${leftPeerName} went offline` });
        if (userType === 'admin') {
          logConnectionEvent(leftPeerName, 'Went offline');
        }
        cleanupCall();
        break;
      }

      case 'profile-update': {
        // Update peer profile (when peer updates their profile)
        if (data.profile) {
          setPeerProfile((prev) => ({
            ...prev,
            name: data.profile.name,
            avatar: data.profile.avatar
          }));
        }
        break;
      }

      case 'profile_updated': {
        // Update own profile (when user updates profile on another device)
        if (data.profile && data.userType === userType) {
          setMyProfile((prev) => ({
            ...prev,
            name: data.profile.name,
            avatar: data.profile.avatar
          }));
        }
        break;
      }

      case 'typing': {
        setPeerProfile((prev) => ({
          ...prev,
          isTyping: Boolean(data.isTyping)
        }));
        break;
      }

      case 'chat-message': {
        const msgId = data.id || `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        
        // Prevent duplicate message processing
        if (processedMessageIds.current.has(msgId)) {
          return;
        }
        processedMessageIds.current.add(msgId);
        
        // Clean up old message IDs to prevent memory leak
        if (processedMessageIds.current.size > 1000) {
          const idsArray = Array.from(processedMessageIds.current);
          processedMessageIds.current = new Set(idsArray.slice(-500));
        }

        const msgSenderName = data.senderName || defaultPeerName;
        const incomingSender: 'me' | 'them' =
          data.sender === 'me' ? 'me' : 'them';

        const newMsg: Message = {
          id: msgId,
          text: data.text || '',
          sender: incomingSender,
          timestamp: new Date(
            typeof data.timestamp === 'number'
              ? data.timestamp
              : data.timestamp || Date.now()
          ),
          type: data.messageType || 'text',
          mediaUrl: data.mediaUrl,
          senderName: msgSenderName,
          status: (data.status as Message['status']) || 'delivered',
          replyTo: data.replyTo
        };

        setMessages((prev) => {
          if (prev.some((m) => m.id === newMsg.id)) return prev;
          return [...prev, newMsg];
        });

        setPeerProfile((prev) => ({ ...prev, isTyping: false }));

        if (incomingSender === 'them' && isDocumentVisible.current) {
          sendSignal({ type: 'message-read', ids: [newMsg.id] });
        }

        if (userType === 'admin' && incomingSender === 'them') {
          const msgPreview =
            newMsg.type === 'text'
              ? newMsg.text.length > 50
                ? newMsg.text.substring(0, 50) + '...'
                : newMsg.text
              : newMsg.type === 'image'
              ? '📷 Photo'
              : newMsg.type === 'video'
              ? '🎥 Video'
              : newMsg.type === 'audio'
              ? '🎤 Voice message'
              : 'New message';

          showBrowserNotification(`💬 ${msgSenderName}`, msgPreview);
        }
        break;
      }

      case 'call-request': {
        currentCallType.current = data.callType;
        setIncomingCall({ type: data.callType, from: data.from });
        setCallStatus('ringing');
        break;
      }

      case 'call-accepted': {
        currentCallType.current = data.callType;
        await initiateWebRTC(data.callType);
        break;
      }

      case 'call-rejected': {
        toast({ title: 'Call declined' });
        setCallStatus('idle');
        setActiveCall(null);
        currentCallType.current = null;
        break;
      }

      case 'offer': {
        await handleOffer(data.sdp);
        break;
      }

      case 'answer': {
        await handleAnswer(data.sdp);
        break;
      }

      case 'ice-candidate': {
        await handleIceCandidate(data.candidate);
        break;
      }

      case 'call-end': {
        toast({ title: 'Call ended' });
        cleanupCall();
        break;
      }

      case 'message-queued': {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === data.id ? { ...m, status: 'sent' as const } : m
          )
        );
        break;
      }

      case 'message-status': {
        setMessages((prev) =>
          prev.map((m) =>
            data.ids.includes(m.id) && m.sender === 'me'
              ? {
                  ...m,
                  status: data.status as 'sent' | 'delivered' | 'read'
                }
              : m
          )
        );
        break;
      }

      case 'emergency-wipe': {
        setMessages([]);
        localStorage.removeItem(`chat_messages_${userType}`);
        processedMessageIds.current.clear();
        toast({
          title: '🚨 All messages wiped',
          variant: 'destructive'
        });
        break;
      }

      case 'sync-request': {
        const currentMessages = JSON.parse(
          localStorage.getItem(`chat_messages_${userType}`) || '[]'
        );
        sendSignal({
          type: 'sync-response',
          targetDeviceId: data.targetDeviceId,
          messages: currentMessages
        });
        break;
      }

      case 'sync-messages': {
        if (data.messages && Array.isArray(data.messages)) {
          setMessages((prev) => {
            const existingIds = new Set(prev.map((m) => m.id));
            const newMessages: Message[] = data.messages
              .filter((m: any) => !existingIds.has(m.id))
              .map((m: any) => ({
                ...m,
                timestamp: new Date(m.timestamp),
                replyTo: m.replyTo ? {
                  id: m.replyTo.id,
                  text: m.replyTo.text || '',
                  sender: m.replyTo.sender
                } : undefined
              }));

            if (newMessages.length > 0) {
              newMessages.forEach(m => processedMessageIds.current.add(m.id));
              const merged = [...prev, ...newMessages].sort(
                (a, b) =>
                  new Date(a.timestamp).getTime() -
                  new Date(b.timestamp).getTime()
              );
              return merged;
            }
            return prev;
          });
        }
        break;
      }

      case 'message-deleted': {
        setMessages((prev) => prev.filter((m) => m.id !== data.id));
        break;
      }
    }
  }, [
    defaultPeerName,
    userType,
    sendSignal,
    toast,
    cleanupCall,
    initiateWebRTC,
    handleOffer,
    handleAnswer,
    handleIceCandidate
  ]);

  const connect = useCallback(() => {
    // Prevent duplicate connections
    if (wsRef.current?.readyState === WebSocket.OPEN || wsRef.current?.readyState === WebSocket.CONNECTING) {
      return;
    }

    // Clean up any existing connection
    if (wsRef.current) {
      try {
        wsRef.current.onopen = null;
        wsRef.current.onmessage = null;
        wsRef.current.onerror = null;
        wsRef.current.onclose = null;
        wsRef.current.close();
      } catch (e) {
        // Ignore cleanup errors
      }
    }

    const ws = new WebSocket(getWebSocketUrl());
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(
        JSON.stringify({
          type: 'join',
          roomId: FIXED_ROOM_ID,
          profile: { name: myProfileRef.current.name, avatar: myProfileRef.current.avatar },
          userType,
          deviceId: deviceId.current,
          sessionId: sessionId.current
        })
      );
      setIsConnected(true);
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      flushOfflineQueue();
    };

    ws.onmessage = async (event) => {
      try {
        const data = JSON.parse(event.data);
        await handleMessage(data);
      } catch (err) {
        console.error('WebSocket message parse error:', err);
      }
    };

    ws.onerror = () => console.error('WebSocket error');

    ws.onclose = () => {
      setIsConnected(false);
      setPeerConnected(false);
      setPeerProfile((prev) => ({
        ...prev,
        lastSeen: new Date(),
        isTyping: false
      }));
      
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      reconnectTimeoutRef.current = setTimeout(connect, 3000);
    };
  }, [userType, handleMessage, flushOfflineQueue]);

  const sendTyping = useCallback((isTyping: boolean) => {
    sendSignal({ type: 'typing', isTyping });
  }, [sendSignal]);

  const handleTyping = useCallback(() => {
    sendTyping(true);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => sendTyping(false), 2000);
  }, [sendTyping]);

  const sendMessage = useCallback((msg: Partial<Message>) => {
    // Sanitize input
    const sanitizedText = typeof msg.text === 'string' 
      ? msg.text.trim().slice(0, 10000) // Max 10k chars
      : '';
    
    if (!sanitizedText && !msg.mediaUrl && msg.type === 'text') {
      return; // Don't send empty messages
    }

    const now = new Date();
    const newMsg: Message = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      text: sanitizedText,
      sender: 'me',
      timestamp: now,
      type: msg.type || 'text',
      mediaUrl: msg.mediaUrl ? String(msg.mediaUrl).slice(0, 2048) : undefined, // Max URL length
      senderName: myProfileRef.current.name.slice(0, 100), // Max name length
      status: 'sending',
      replyTo: msg.replyTo ? {
        id: String(msg.replyTo.id).slice(0, 100),
        text: String(msg.replyTo.text || '').slice(0, 500),
        sender: msg.replyTo.sender
      } : undefined
    };

    processedMessageIds.current.add(newMsg.id);
    setMessages((prev) => {
      // Prevent duplicate messages in state
      if (prev.some(m => m.id === newMsg.id)) {
        return prev;
      }
      return [...prev, newMsg];
    });
    sendTyping(false);

    sendSignal({
      type: 'chat-message',
      id: newMsg.id,
      text: newMsg.text,
      messageType: newMsg.type,
      mediaUrl: newMsg.mediaUrl,
      timestamp: now.toISOString(),
      senderName: myProfileRef.current.name,
      replyTo: newMsg.replyTo
    }, true);

    return newMsg;
  }, [sendSignal, sendTyping]);

  const emergencyWipe = useCallback(() => {
    sendSignal({ type: 'emergency-wipe' });
    setMessages([]);
    localStorage.removeItem(`chat_messages_${userType}`);
    processedMessageIds.current.clear();
  }, [sendSignal, userType]);

  const deleteMessage = useCallback((msgId: string) => {
    setMessages((prev) => prev.filter((m) => m.id !== msgId));
  }, []);

  const deleteMessages = useCallback(
    (msgIds: string[]) => {
      const idSet = new Set(msgIds);
      setMessages((prev) => prev.filter((m) => !idSet.has(m.id)));
      msgIds.forEach((id) => sendSignal({ type: 'message-delete', id }));
    },
    [sendSignal]
  );

  const startCall = useCallback(async (mode: 'voice' | 'video') => {
    if (!peerConnectedRef.current) {
      toast({ variant: 'destructive', title: 'Friend not online' });
      return;
    }
    currentCallType.current = mode;
    setActiveCall(mode);
    setCallStatus('calling');
    sendSignal({ type: 'call-request', callType: mode, from: myProfileRef.current.name });
  }, [sendSignal, toast]);

  const acceptCall = useCallback(async () => {
    if (!incomingCall) return;
    const callType = incomingCall.type;
    currentCallType.current = callType;
    setActiveCall(callType);
    setIncomingCall(null);
    setCallStatus('connected');
    sendSignal({ type: 'call-accepted', callType });
  }, [incomingCall, sendSignal]);

  const rejectCall = useCallback(() => {
    sendSignal({ type: 'call-rejected' });
    setIncomingCall(null);
    setCallStatus('idle');
    currentCallType.current = null;
  }, [sendSignal]);

  const endCall = useCallback(() => {
    sendSignal({ type: 'call-end' });
    cleanupCall();
  }, [sendSignal, cleanupCall]);

  const toggleMute = useCallback(() => {
    if (localStreamRef.current) {
      const audioTracks = localStreamRef.current.getAudioTracks();
      audioTracks.forEach((track) => {
        track.enabled = !track.enabled;
      });
      setIsMuted((prev) => !prev);
    }
  }, []);

  const toggleVideo = useCallback(() => {
    if (localStreamRef.current) {
      const videoTracks = localStreamRef.current.getVideoTracks();
      videoTracks.forEach((track) => {
        track.enabled = !track.enabled;
      });
      setIsVideoOff((prev) => !prev);
    }
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([]);
    localStorage.removeItem(`chat_messages_${userType}`);
    processedMessageIds.current.clear();
    sendSignal({ type: 'emergency-wipe' });
  }, [userType, sendSignal]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden && messagesRef.current.length > 0) {
        const unreadMessageIds = messagesRef.current
          .filter(m => m.sender === 'them' && m.status !== 'read')
          .map(m => m.id);
        
        if (unreadMessageIds.length > 0 && wsRef.current?.readyState === WebSocket.OPEN) {
          sendSignal({ type: 'message-read', ids: unreadMessageIds });
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [sendSignal]);

  useEffect(() => {
    const loadHistory = async () => {
      const serverMessages = await fetchChatHistory(userType);
      if (serverMessages.length > 0) {
        setMessages((prev) => {
          const existingIds = new Set(prev.map((m) => m.id));
          const newMessages = serverMessages.filter((m) => !existingIds.has(m.id));
          if (newMessages.length > 0) {
            newMessages.forEach(m => processedMessageIds.current.add(m.id));
            const merged = [...prev, ...newMessages].sort(
              (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
            );
            return merged;
          }
          return prev;
        });
      }
    };

    loadHistory();
  }, [userType]);

  useEffect(() => {
    connect();
    return () => {
      cleanupCall();
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = null;
      }
      if (wsRef.current) {
        try {
          wsRef.current.onopen = null;
          wsRef.current.onmessage = null;
          wsRef.current.onerror = null;
          wsRef.current.onclose = null;
          wsRef.current.close();
        } catch (e) {
          // Ignore cleanup errors
        }
        wsRef.current = null;
      }
    };
  }, [connect, cleanupCall]);

  return {
    isConnected,
    peerConnected,
    myProfile,
    peerProfile,
    updateMyProfile,
    messages,
    sendMessage,
    deleteMessage,
    deleteMessages,
    clearMessages,
    emergencyWipe,
    handleTyping,
    startCall,
    acceptCall,
    rejectCall,
    endCall,
    toggleMute,
    toggleVideo,
    activeCall,
    incomingCall,
    callStatus,
    localStream,
    remoteStream,
    isMuted,
    isVideoOff,
    deviceId: deviceId.current,
    sessionId: sessionId.current
  };
}
