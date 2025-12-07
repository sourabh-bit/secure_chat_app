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

// Fetch user profile from server (source of truth)
const fetchServerProfile = async (userType: 'admin' | 'friend'): Promise<{ name: string; avatar: string } | null> => {
  try {
    const response = await fetch(`/api/profile?userType=${userType}`);
    if (response.ok) {
      const data = await response.json();
      console.log(`[PROFILE] Fetched ${userType} profile from server:`, data.name);
      return { name: data.name, avatar: data.avatar || '' };
    }
  } catch (error) {
    console.error('Failed to fetch profile from server:', error);
  }
  return null;
};

// Save profile to server
const saveServerProfile = async (userType: 'admin' | 'friend', name: string, avatar: string): Promise<boolean> => {
  try {
    const response = await fetch('/api/profile/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userType, name, avatar })
    });
    if (response.ok) {
      console.log(`[PROFILE] Saved ${userType} profile to server: name="${name}"`);
      return true;
    }
  } catch (error) {
    console.error('Failed to save profile to server:', error);
  }
  return false;
};

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

const subscribeToPush = async (registration: ServiceWorkerRegistration, userType: 'admin' | 'friend') => {
  try {
    // Check if already subscribed
    let subscription = await registration.pushManager.getSubscription();

    if (subscription) {
      console.log('Already subscribed to push notifications');
      return;
    }

    const response = await fetch('/api/push/vapid-key');
    if (!response.ok) {
      console.log('Push notifications not configured on server');
      return;
    }

    const { publicKey } = await response.json();
    if (!publicKey) {
      console.log('No VAPID public key available');
      return;
    }

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

    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey)
    });

    const subscribeResponse = await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subscription: {
          endpoint: subscription.endpoint,
          keys: {
            p256dh: arrayBufferToBase64(subscription.getKey('p256dh')!),
            auth: arrayBufferToBase64(subscription.getKey('auth')!)
          }
        },
        userType: userType
      })
    });

    if (subscribeResponse.ok) {
      console.log('Successfully subscribed to push notifications');
    } else {
      console.error('Failed to subscribe on server');
    }
  } catch (err) {
    console.error('Push subscription failed:', err);
  }
};

const arrayBufferToBase64 = (buffer: ArrayBuffer) => {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
};

const toBase64Url = (base64: string) =>
  base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

const requestNotificationPermission = async (userType: 'admin' | 'friend') => {
  if (!('Notification' in window)) return;

  if (Notification.permission === 'default') {
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      const registration = await registerServiceWorker();
      if (registration) await subscribeToPush(registration, userType);
    }
  } else if (Notification.permission === 'granted') {
    const registration = await registerServiceWorker();
    if (registration) await subscribeToPush(registration, userType);
  }
};

const showBrowserNotification = (title: string, body: string, icon?: string, userType?: 'admin' | 'friend') => {
  // Completely disable notifications for friend user
  if (userType === 'friend') {
    return;
  }

  if (!('Notification' in window) || Notification.permission !== 'granted') {
    return;
  }

  if (swRegistration) {
    swRegistration.showNotification(title, {
      body,
      icon: icon || "/favicon.png",
      tag: "chat-notification",
      vibrate: [300, 120, 300],
      renotify: true,
      sound: "default"
    } as any);
  } else if (document.hidden) {
    new Notification(title, {
      body,
      icon: icon || "/favicon.png",
      tag: "chat-notification"
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
  const [isPeerOnline, setIsPeerOnline] = useState(false);

  const defaultPeerName = ""; // no fallback name anymore

  // Initialize profiles with defaults - server will update these on mount
  const [myProfile, setMyProfile] = useState<UserProfile>({
    name: '',
    avatar: '',
    lastSeen: null,
    isTyping: false
  });

  const [peerProfile, setPeerProfile] = useState<UserProfile>({
    name: '',
    avatar: '',
    lastSeen: null,
    isTyping: false
  });
  
  const [isLoadingProfiles, setIsLoadingProfiles] = useState(true);

  useEffect(() => {
    if (userType === 'admin') {
      requestNotificationPermission(userType);
    } else if (userType === 'friend') {
      // Explicitly disable notifications for friend user
      if ('Notification' in window && Notification.permission === 'default') {
        // Deny permission request for friend
        console.log('Notifications disabled for friend user');
      }
    }
  }, [userType]);

  // Fetch BOTH own profile AND peer profile from server on mount (source of truth)
  useEffect(() => {
    const peerType = userType === 'admin' ? 'friend' : 'admin';
    
    const loadProfiles = async () => {
      console.log(`[CLIENT] Loading profiles for userType=${userType}`);
      
      // Fetch own profile
      const serverProfile = await fetchServerProfile(userType);
      if (serverProfile) {
        console.log(`[PROFILE] Loaded own profile (${userType}):`, serverProfile.name);
        setMyProfile(prev => ({
          ...prev,
          name: serverProfile.name,
          avatar: serverProfile.avatar
        }));
        localStorage.setItem(`chat_my_profile_${userType}`, JSON.stringify({
          name: serverProfile.name,
          avatar: serverProfile.avatar
        }));
      }
      
      // Fetch peer profile
      const peerServerProfile = await fetchServerProfile(peerType);
      if (peerServerProfile) {
        console.log(`[PROFILE] Loaded peer profile (${peerType}):`, peerServerProfile.name);
        setPeerProfile(prev => ({
          ...prev,
          name: peerServerProfile.name,
          avatar: peerServerProfile.avatar
        }));
        localStorage.setItem(`chat_peer_profile_${userType}`, JSON.stringify({
          name: peerServerProfile.name,
          avatar: peerServerProfile.avatar
        }));
      }
      
      setIsLoadingProfiles(false);
    };
    loadProfiles();
  }, [userType]);

  // Initialize messages as empty - server is the source of truth
  // localStorage is only used as a cache, not as initial state
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoadingMessages, setIsLoadingMessages] = useState(true);

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
  const lastSyncTimestamp = useRef<number>(
    parseInt(localStorage.getItem(`lastSyncTimestamp_${userType}`) || '0', 10)
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

  // Trigger a read receipt for a single message if chat is visible
  function tryMarkAsRead(message: Message) {
    if (message.sender !== 'them') return;
    if (!isDocumentVisible.current) return;
    if (!wsRef.current) return;

    sendSignal({
      type: "message-read",
      ids: [message.id],
    });
  }

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
    const WS_URL =
      window.location.origin.startsWith("http")
        ? window.location.origin.replace("http", "ws")
        : `wss://${window.location.host}`;
    return `${WS_URL}/ws`;
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

  const updateMyProfile = useCallback(async (updates: Partial<UserProfile>) => {
    const newProfile = { ...myProfile, ...updates };
    
    // Save to server first (source of truth)
    const saved = await saveServerProfile(userType, newProfile.name, newProfile.avatar);
    
    if (saved) {
      // Update local state
      setMyProfile(prev => ({ ...prev, ...updates }));
      
      // Also broadcast via socket for real-time update
      sendSignal({
        type: 'profile-update',
        profile: { name: newProfile.name, avatar: newProfile.avatar }
      });
    }
  }, [myProfile, userType, sendSignal]);

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
    // Note: We do NOT skip messages based on processedMessageIds here.
    // Individual handlers (chat-message, sync-messages, etc.) do proper merging
    // to update status and fields even for existing messages.
    switch (data.type) {
      case 'joined':
      case 'room-joined': {
        if (data.peerProfile) {
          setPeerProfile((prev) => ({
            ...prev,
            ...data.peerProfile,
            lastSeen: data.peerOnline ? null : prev.lastSeen,
            isTyping: false
          }));
        }
        setPeerConnected(Boolean(data.peerOnline));
        setIsPeerOnline(Boolean(data.peerOnline));
        break;
      }

      case 'peer-joined': {
        setPeerConnected(true);
        setIsPeerOnline(true);
        const peerName = data.profile?.name || defaultPeerName;
        setPeerProfile((prev) => ({
          ...prev,
          name: data.profile?.name || '',
          avatar: data.profile?.avatar || '',
          lastSeen: null,
          isTyping: false
        }));
        toast({ title: `${peerName} is online!` });

        if (userType === 'admin') {
          logConnectionEvent(peerName, 'Came online');
          showBrowserNotification(
            '💚 Friend Online',
            `${peerName} just came online!`,
            data.profile?.avatar,
            userType
          );
        }

        sendSignal({
          type: 'profile-update',
          profile: { name: myProfileRef.current.name, avatar: myProfileRef.current.avatar }
        });
        break;
      }

      case 'peer-left': {
        setPeerConnected(false);
        setIsPeerOnline(false);
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

      case 'profile-update':
      case 'profile_updated':
      case 'peer_profile_updated':
      case 'peer-profile-update':
      case 'self-profile-update': {
        if (!data.profile || !data.userType) break;

        const profileUserType = data.userType;   // ONLY trust server-defined userType
        const peerType = userType === 'admin' ? 'friend' : 'admin';

        console.log(`[PROFILE UPDATE] Received: type=${data.type}, profileUserType=${profileUserType}, myType=${userType}`);

        if (profileUserType === userType) {
          // MY profile updated (from another device)
          setMyProfile(prev => ({
            ...prev,
            name: data.profile.name,
            avatar: data.profile.avatar
          }));
          localStorage.setItem(`chat_my_profile_${userType}`, JSON.stringify({
            name: data.profile.name,
            avatar: data.profile.avatar
          }));
        }

        else if (profileUserType === peerType) {
          // PEER profile updated
          setPeerProfile(prev => ({
            ...prev,
            name: data.profile.name,
            avatar: data.profile.avatar
          }));
          localStorage.setItem(`chat_peer_profile_${userType}`, JSON.stringify({
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

      case 'password-changed': {
        // Password was changed (either on this device or another)
        if (data.userType === userType) {
          toast({
            title: '🔐 Password Changed',
            description: 'Your password has been updated. Use the new password for future logins.'
          });
        }
        break;
      }

      case 'chat-message': {
        const msgId = data.id || `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        const msgSenderName = data.senderName || '';
        const incomingSender: 'me' | 'them' =
          data.sender === 'me' ? 'me' : 'them';

        const incomingMsg: Message = {
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

        // Always merge: update existing or insert new
        setMessages((prev) => {
          const existingIndex = prev.findIndex((m) => m.id === msgId);
          
          if (existingIndex >= 0) {
            // Update existing message (merge fields, preserve higher status)
            const existing = prev[existingIndex];
            const statusPriority: Record<string, number> = {
              'sent': 1, 'delivered': 2, 'read': 3
            };
            const existingPriority = statusPriority[existing.status || 'sent'] ?? 1;
            const incomingPriority = statusPriority[incomingMsg.status || 'sent'] ?? 1;
            
            const updated = [...prev];
            updated[existingIndex] = {
              ...existing,
              ...incomingMsg,
              // Keep higher status (don't downgrade)
              status: incomingPriority >= existingPriority ? incomingMsg.status : existing.status
            };
            return updated;
          }
          
          // Insert new message
          return [...prev, incomingMsg].sort(
            (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
          );
        });

        // Clean up old message IDs to prevent memory leak
        if (processedMessageIds.current.size > 1000) {
          const idsArray = Array.from(processedMessageIds.current);
          processedMessageIds.current = new Set(idsArray.slice(-500));
        }

        // Update lastSyncTimestamp
        const msgTimestamp = incomingMsg.timestamp.getTime();
        if (msgTimestamp > lastSyncTimestamp.current) {
          lastSyncTimestamp.current = msgTimestamp;
          localStorage.setItem(`lastSyncTimestamp_${userType}`, msgTimestamp.toString());
        }

        setPeerProfile((prev) => ({ ...prev, isTyping: false }));

        // Auto-mark incoming messages as read instantly
        if (incomingSender === 'them') {
          tryMarkAsRead(incomingMsg);
        }

        if (userType === 'admin' && incomingSender === 'them') {
          const msgPreview =
            incomingMsg.type === 'text'
              ? incomingMsg.text.length > 50
                ? incomingMsg.text.substring(0, 50) + '...'
                : incomingMsg.text
              : incomingMsg.type === 'image'
              ? '📷 Photo'
              : incomingMsg.type === 'video'
              ? '🎥 Video'
              : incomingMsg.type === 'audio'
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

      case 'message_update': {
        // Unified message status update event
        // { type: 'message_update', ids: [...], status: 'sent' | 'delivered' | 'read' }

        if (!Array.isArray(data.ids) || !data.status) break;

        const statusPriority: Record<string, number> = {
          'sending': 0,
          'sent': 1,
          'delivered': 2,
          'read': 3
        };
        const newStatusPriority = statusPriority[data.status] ?? 1;

        setMessages(prev =>
          prev.map(m => {
            if (!data.ids.includes(m.id)) return m;

            const currentPriority = statusPriority[m.status || 'sending'] ?? 0;
            // Update if new status is higher or equal priority (ensure status is set)
            if (newStatusPriority >= currentPriority) {
              return { ...m, status: data.status as 'sent' | 'delivered' | 'read' };
            }
            return m;
          })
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
          console.log(`[SYNC] Received ${data.messages.length} messages from server, current local: ${messagesRef.current.length}`);
          
          const statusPriority: Record<string, number> = {
            'sending': 0, 'sent': 1, 'delivered': 2, 'read': 3
          };

          // Convert incoming messages to Message format
          const incomingMessages: Message[] = data.messages.map((m: any) => ({
            id: m.id,
            text: m.text || '',
            sender: m.sender as 'me' | 'them',
            timestamp: new Date(m.timestamp),
            type: m.type || m.messageType || 'text',
            mediaUrl: m.mediaUrl,
            senderName: m.senderName || defaultPeerName,
            status: m.status || 'delivered',
            replyTo: m.replyTo ? {
              id: m.replyTo.id,
              text: m.replyTo.text || '',
              sender: m.replyTo.sender
            } : undefined
          }));

          setMessages((prev) => {
            // Build a map of existing messages by ID
            const messageMap = new Map<string, Message>();
            prev.forEach(m => messageMap.set(m.id, m));

            // Merge incoming messages
            for (const incoming of incomingMessages) {
              const existing = messageMap.get(incoming.id);
              
              if (existing) {
                // Update existing: merge fields, preserve higher status
                const existingPriority = statusPriority[existing.status || 'sending'] ?? 0;
                const incomingPriority = statusPriority[incoming.status || 'sent'] ?? 1;
                
                messageMap.set(incoming.id, {
                  ...existing,
                  ...incoming,
                  status: incomingPriority >= existingPriority ? incoming.status : existing.status
                });
              } else {
                // Insert new message
                messageMap.set(incoming.id, incoming);
              }
            }

            // Convert back to array and sort by timestamp
            const merged = Array.from(messageMap.values()).sort(
              (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
            );

            // Update lastSyncTimestamp
            if (merged.length > 0) {
              const latestTimestamp = Math.max(
                ...merged.map(m => new Date(m.timestamp).getTime())
              );
              lastSyncTimestamp.current = latestTimestamp;
              localStorage.setItem(`lastSyncTimestamp_${userType}`, latestTimestamp.toString());
            }

            console.log(`[SYNC] After merge: ${merged.length} total messages`);
            return merged;
          });

          const unread = incomingMessages
            .filter(m => m.sender === 'them' && m.status !== 'read')
            .map(m => m.id);

          if (unread.length > 0 && isDocumentVisible.current) {
            sendSignal({ type: "message-read", ids: unread });
          }
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
      console.log("[CLIENT] socket connected as", userType, "deviceId=", deviceId.current);
      ws.send(
        JSON.stringify({
          type: 'join',
          roomId: FIXED_ROOM_ID,
          profile: { name: myProfileRef.current.name, avatar: myProfileRef.current.avatar },
          userType,
          deviceId: deviceId.current,
          sessionId: sessionId.current,
          lastSyncTimestamp: lastSyncTimestamp.current
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
      status: 'sent',
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
      type: 'send-message',
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
          sendSignal({ type: 'message-read', ids: unreadMessageIds.filter(id => id) });
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
      console.log(`[HYDRATION] Loading messages from server for userType=${userType}`);
      const serverMessages = await fetchChatHistory(userType);
      console.log(`[HYDRATION] Loaded ${serverMessages.length} messages from server (source of truth)`);

      const statusPriority: Record<string, number> = {
        'sent': 1, 'delivered': 2, 'read': 3
      };

      setMessages((prev) => {
        // Build a map of existing messages by ID
        const messageMap = new Map<string, Message>();
        prev.forEach(m => messageMap.set(m.id, m));

        // Merge incoming messages
        for (const incoming of serverMessages) {
          const existing = messageMap.get(incoming.id);

          if (existing) {
            // Update existing: merge fields, preserve higher status
            const existingPriority = statusPriority[existing.status || 'sent'] ?? 1;
            const incomingPriority = statusPriority[incoming.status || 'sent'] ?? 1;

            messageMap.set(incoming.id, {
              ...existing,
              ...incoming,
              status: incomingPriority >= existingPriority ? incoming.status : existing.status
            });
          } else {
            // Insert new message
            messageMap.set(incoming.id, incoming);
          }
        }

        // Convert back to array and sort by timestamp
        const merged = Array.from(messageMap.values()).sort(
          (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        );

        // Update localStorage cache with merged data
        localStorage.setItem(`chat_messages_${userType}`, JSON.stringify(merged));

        // Update sync timestamp
        if (merged.length > 0) {
          const latestTimestamp = Math.max(
            ...merged.map(m => new Date(m.timestamp).getTime())
          );
          lastSyncTimestamp.current = latestTimestamp;
          localStorage.setItem(`lastSyncTimestamp_${userType}`, latestTimestamp.toString());
        }

        console.log(`[HYDRATION] After merge: ${merged.length} total messages`);
        return merged;
      });

      setIsLoadingMessages(false);
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

  useEffect(() => {
    const handler = () => {
      if (document.visibilityState === "visible") {
        const unread = messagesRef.current
          .filter(m => m.sender === "them" && m.status !== "read")
          .map(m => m.id);

        if (unread.length > 0) {
          sendSignal({ type: "message-read", ids: unread });
        }
      }
    };

    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, []);

  return {
    isConnected,
    peerConnected,
    isPeerOnline,
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
    sessionId: sessionId.current,
    isLoadingMessages,
    isLoadingProfiles
  };
}
