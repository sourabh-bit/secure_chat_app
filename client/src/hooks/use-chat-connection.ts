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
}

interface UserProfile {
  name: string;
  avatar: string;
  lastSeen: Date | null;
  isTyping: boolean;
}

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

const FIXED_ROOM_ID = 'SECURE_CHAT_MAIN';

let swRegistration: ServiceWorkerRegistration | null = null;

const registerServiceWorker = async () => {
  if ('serviceWorker' in navigator) {
    try {
      swRegistration = await navigator.serviceWorker.register('/sw.js');
      console.log('Service Worker registered');
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
    // Get VAPID public key from server
    const response = await fetch('/api/push/vapid-key');
    const { publicKey } = await response.json();
    
    // Convert VAPID key to Uint8Array
    const urlBase64ToUint8Array = (base64String: string) => {
      const padding = '='.repeat((4 - base64String.length % 4) % 4);
      const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
      const rawData = window.atob(base64);
      const outputArray = new Uint8Array(rawData.length);
      for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
      }
      return outputArray;
    };
    
    // Subscribe to push
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey)
    });
    
    // Send subscription to server (admin only)
    await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subscription: subscription.toJSON(),
        userType: 'admin'
      })
    });
    
    console.log('Push subscription successful');
  } catch (err) {
    console.error('Push subscription failed:', err);
  }
};

const requestNotificationPermission = async () => {
  if ('Notification' in window && Notification.permission === 'default') {
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      const registration = await registerServiceWorker();
      if (registration) {
        await subscribeToPush(registration);
      }
    }
  } else if (Notification.permission === 'granted') {
    const registration = await registerServiceWorker();
    if (registration) {
      await subscribeToPush(registration);
    }
  }
};

const showBrowserNotification = (title: string, body: string, icon?: string) => {
  if ('Notification' in window && Notification.permission === 'granted') {
    // Try Service Worker notification first (works in background)
    if (swRegistration) {
      swRegistration.showNotification(title, {
        body,
        icon: icon || '/favicon.png',
        tag: 'chat-notification',
        vibrate: [200, 100, 200]
      } as NotificationOptions);
    } else if (document.hidden) {
      // Fallback to regular notification
      new Notification(title, { body, icon: icon || '/favicon.png', tag: 'chat-notification' });
    }
  }
};

// Migrate old localStorage keys to new format
const migrateLocalStorage = (userType: 'admin' | 'friend') => {
  // Clean up old profile keys that might cause confusion
  const oldKeys = ['profile_admin', 'profile_friend'];
  oldKeys.forEach(key => {
    if (localStorage.getItem(key)) {
      localStorage.removeItem(key);
    }
  });
};

// Log connection events
const logConnectionEvent = (user: string, action: string) => {
  const logs = JSON.parse(localStorage.getItem('connection_logs') || '[]');
  logs.push({
    timestamp: new Date().toISOString(),
    user,
    action
  });
  // Keep only last 100 logs
  localStorage.setItem('connection_logs', JSON.stringify(logs.slice(-100)));
};

export function useChatConnection(userType: 'admin' | 'friend') {
  const { toast } = useToast();
  
  // Run migration on first load
  useState(() => {
    migrateLocalStorage(userType);
  });
  
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
    const saved = localStorage.getItem('chat_messages');
    if (saved) {
      return JSON.parse(saved).map((m: any) => ({ ...m, timestamp: new Date(m.timestamp) }));
    }
    return [];
  });
  
  const [activeCall, setActiveCall] = useState<'voice' | 'video' | null>(null);
  const [incomingCall, setIncomingCall] = useState<{ type: 'voice' | 'video'; from: string } | null>(null);
  const [callStatus, setCallStatus] = useState<'idle' | 'calling' | 'ringing' | 'connected'>('idle');
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

  useEffect(() => {
    localStorage.setItem('chat_messages', JSON.stringify(messages));
  }, [messages]);

  useEffect(() => {
    localStorage.setItem(`chat_my_profile_${userType}`, JSON.stringify({
      name: myProfile.name,
      avatar: myProfile.avatar
    }));
  }, [myProfile.name, myProfile.avatar, userType]);

  useEffect(() => {
    if (peerProfile.name !== defaultPeerName || peerProfile.avatar) {
      localStorage.setItem(`chat_peer_profile_${userType}`, JSON.stringify({
        name: peerProfile.name,
        avatar: peerProfile.avatar,
        lastSeen: peerProfile.lastSeen
      }));
    }
  }, [peerProfile.name, peerProfile.avatar, peerProfile.lastSeen, defaultPeerName, userType]);

  const getWebSocketUrl = () => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}/ws`;
  };

  const sendSignal = useCallback((data: any) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ ...data, roomId: FIXED_ROOM_ID }));
    }
  }, []);

  const updateMyProfile = (updates: Partial<UserProfile>) => {
    setMyProfile(prev => {
      const updated = { ...prev, ...updates };
      sendSignal({ type: 'profile-update', profile: { name: updated.name, avatar: updated.avatar } });
      return updated;
    });
  };

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const ws = new WebSocket(getWebSocketUrl());
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ 
        type: 'join', 
        roomId: FIXED_ROOM_ID,
        profile: { name: myProfile.name, avatar: myProfile.avatar },
        userType: userType
      }));
      setIsConnected(true);
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };

    ws.onmessage = async (event) => {
      const data = JSON.parse(event.data);
      await handleMessage(data);
    };

    ws.onerror = () => console.error('WebSocket error');

    ws.onclose = () => {
      setIsConnected(false);
      setPeerConnected(false);
      setPeerProfile(prev => ({ ...prev, lastSeen: new Date(), isTyping: false }));
      reconnectTimeoutRef.current = setTimeout(connect, 3000);
    };
  }, [myProfile.name, myProfile.avatar]);

  const handleMessage = async (data: any) => {
    switch (data.type) {
      case 'joined':
        if (data.peerOnline && data.peerProfile) {
          setPeerConnected(true);
          setPeerProfile(prev => ({ ...prev, ...data.peerProfile, lastSeen: null, isTyping: false }));
        } else if (data.peerProfile) {
          setPeerProfile(prev => ({ ...prev, ...data.peerProfile }));
        }
        // Mark all sent messages as delivered if peer is online
        if (data.peerOnline) {
          setMessages(prev => prev.map(m => 
            m.sender === 'me' && m.status === 'sent' ? { ...m, status: 'delivered' as const } : m
          ));
        }
        break;

      case 'peer-joined':
        setPeerConnected(true);
        const peerName = data.profile?.name || defaultPeerName;
        setPeerProfile(prev => ({ 
          ...prev, 
          name: data.profile?.name || prev.name,
          avatar: data.profile?.avatar || prev.avatar,
          lastSeen: null, 
          isTyping: false 
        }));
        toast({ title: `${peerName} is online!` });
        
        // Log friend coming online (only admin sees logs)
        if (userType === 'admin') {
          logConnectionEvent(peerName, 'Came online');
          showBrowserNotification(
            '💚 Friend Online',
            `${peerName} just came online!`,
            data.profile?.avatar
          );
        }
        
        sendSignal({ type: 'profile-update', profile: { name: myProfile.name, avatar: myProfile.avatar } });
        break;

      case 'peer-left':
        setPeerConnected(false);
        const leftPeerName = peerProfile.name || defaultPeerName;
        setPeerProfile(prev => ({ ...prev, lastSeen: new Date(), isTyping: false }));
        toast({ title: `${leftPeerName} went offline` });
        
        // Log friend going offline (only admin sees logs)
        if (userType === 'admin') {
          logConnectionEvent(leftPeerName, 'Went offline');
        }
        
        cleanupCall();
        break;

      case 'profile-update':
        if (data.profile) {
          setPeerProfile(prev => ({ ...prev, name: data.profile.name, avatar: data.profile.avatar }));
        }
        break;

      case 'typing':
        setPeerProfile(prev => ({ ...prev, isTyping: data.isTyping }));
        break;

      case 'chat-message':
        const msgSenderName = data.senderName || defaultPeerName;
        const incomingSender = data.sender === 'me' ? 'me' : 'them';
        const newMsg: Message = {
          id: data.id || Date.now().toString(),
          text: data.text,
          sender: incomingSender,
          timestamp: new Date(data.timestamp),
          type: data.messageType || 'text',
          mediaUrl: data.mediaUrl,
          senderName: msgSenderName,
          status: data.status || 'delivered'
        };
        
        // Avoid duplicates
        setMessages(prev => {
          if (prev.some(m => m.id === newMsg.id)) return prev;
          return [...prev, newMsg];
        });
        setPeerProfile(prev => ({ ...prev, isTyping: false }));
        
        // Send read receipt if message is from peer
        if (incomingSender === 'them') {
          sendSignal({ type: 'message-read', ids: [newMsg.id] });
        }
        
        if (userType === 'admin' && incomingSender === 'them') {
          const msgPreview = data.messageType === 'text' 
            ? (data.text?.length > 50 ? data.text.substring(0, 50) + '...' : data.text)
            : data.messageType === 'image' ? '📷 Photo'
            : data.messageType === 'video' ? '🎥 Video'
            : data.messageType === 'audio' ? '🎤 Voice message'
            : 'New message';
          showBrowserNotification(
            `💬 ${msgSenderName}`,
            msgPreview
          );
        }
        break;

      case 'call-request':
        currentCallType.current = data.callType;
        setIncomingCall({ type: data.callType, from: data.from });
        setCallStatus('ringing');
        break;

      case 'call-accepted':
        currentCallType.current = data.callType;
        await initiateWebRTC(data.callType);
        break;

      case 'call-rejected':
        toast({ title: "Call declined" });
        setCallStatus('idle');
        setActiveCall(null);
        currentCallType.current = null;
        break;

      case 'offer':
        await handleOffer(data.sdp);
        break;

      case 'answer':
        await handleAnswer(data.sdp);
        break;

      case 'ice-candidate':
        await handleIceCandidate(data.candidate);
        break;

      case 'call-end':
        toast({ title: "Call ended" });
        cleanupCall();
        break;
      
      case 'message-queued':
        // Update message status to sent
        setMessages(prev => prev.map(m => 
          m.id === data.id ? { ...m, status: 'sent' as const } : m
        ));
        break;
      
      case 'message-status':
        // Update message statuses (delivered/read)
        setMessages(prev => prev.map(m => 
          data.ids.includes(m.id) && m.sender === 'me' 
            ? { ...m, status: data.status as 'delivered' | 'read' } 
            : m
        ));
        break;
      
      case 'emergency-wipe':
        // Emergency wipe from server
        setMessages([]);
        localStorage.removeItem('chat_messages');
        toast({ title: "🚨 All messages wiped", variant: "destructive" });
        break;
    }
  };

  const sendTyping = (isTyping: boolean) => {
    sendSignal({ type: 'typing', isTyping });
  };

  const handleTyping = () => {
    sendTyping(true);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => sendTyping(false), 2000);
  };

  const sendMessage = (msg: Partial<Message>) => {
    const newMsg: Message = {
      id: Date.now().toString(),
      text: msg.text || "",
      sender: 'me',
      timestamp: new Date(),
      type: msg.type || 'text',
      mediaUrl: msg.mediaUrl,
      senderName: myProfile.name,
      status: peerConnected ? 'delivered' : 'sending'
    };

    setMessages(prev => [...prev, newMsg]);
    sendTyping(false);
    
    sendSignal({
      type: 'chat-message',
      id: newMsg.id,
      text: newMsg.text,
      messageType: newMsg.type,
      mediaUrl: newMsg.mediaUrl,
      timestamp: newMsg.timestamp.toISOString(),
      senderName: myProfile.name
    });

    return newMsg;
  };
  
  const emergencyWipe = useCallback(() => {
    sendSignal({ type: 'emergency-wipe' });
    setMessages([]);
    localStorage.removeItem('chat_messages');
  }, [sendSignal]);

  const deleteMessage = useCallback((msgId: string) => {
    setMessages(prev => prev.filter(m => m.id !== msgId));
  }, []);

  const deleteMessages = useCallback((msgIds: string[]) => {
    const idSet = new Set(msgIds);
    setMessages(prev => prev.filter(m => !idSet.has(m.id)));
  }, []);

  const getMediaConstraints = (mode: 'voice' | 'video') => {
    return {
      audio: {
        echoCancellation: { exact: true },
        noiseSuppression: { exact: true },
        autoGainControl: { exact: true },
        sampleRate: { ideal: 48000 },
        channelCount: { exact: 1 },
        latency: { ideal: 0.01 },
        suppressLocalAudioPlayback: true
      },
      video: mode === 'video' ? {
        width: { ideal: 1280, max: 1920 },
        height: { ideal: 720, max: 1080 },
        frameRate: { ideal: 30, max: 30 },
        facingMode: 'user'
      } : false
    };
  };

  const startCall = async (mode: 'voice' | 'video') => {
    if (!peerConnected) {
      toast({ variant: "destructive", title: "Friend not online" });
      return;
    }
    currentCallType.current = mode;
    setActiveCall(mode);
    setCallStatus('calling');
    sendSignal({ type: 'call-request', callType: mode, from: myProfile.name });
  };

  const acceptCall = async () => {
    if (!incomingCall) return;
    const callType = incomingCall.type;
    currentCallType.current = callType;
    setActiveCall(callType);
    setIncomingCall(null);
    setCallStatus('connected');
    sendSignal({ type: 'call-accepted', callType });
  };

  const rejectCall = () => {
    sendSignal({ type: 'call-rejected' });
    setIncomingCall(null);
    setCallStatus('idle');
    currentCallType.current = null;
  };

  const endCall = () => {
    sendSignal({ type: 'call-end' });
    cleanupCall();
  };

  const initiateWebRTC = async (mode: 'voice' | 'video') => {
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
      toast({ variant: "destructive", title: "Could not access camera/microphone" });
      cleanupCall();
    }
  };

  const createPeerConnection = (stream: MediaStream) => {
    const peer = new RTCPeerConnection(ICE_SERVERS);
    
    stream.getTracks().forEach(track => {
      peer.addTrack(track, stream);
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
      console.log('Received remote track:', event.track.kind);
      if (event.streams && event.streams[0]) {
        setRemoteStream(event.streams[0]);
      }
    };

    peer.oniceconnectionstatechange = () => {
      console.log('ICE state:', peer.iceConnectionState);
      if (peer.iceConnectionState === 'connected') {
        setCallStatus('connected');
      } else if (peer.iceConnectionState === 'disconnected' || peer.iceConnectionState === 'failed') {
        toast({ title: "Call connection lost", variant: "destructive" });
        cleanupCall();
      }
    };

    peer.onconnectionstatechange = () => {
      console.log('Connection state:', peer.connectionState);
    };

    return peer;
  };

  const handleOffer = async (sdp: RTCSessionDescriptionInit) => {
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
      toast({ variant: "destructive", title: "Failed to connect call" });
      cleanupCall();
    }
  };

  const handleAnswer = async (sdp: RTCSessionDescriptionInit) => {
    if (!peerRef.current) return;
    try {
      await peerRef.current.setRemoteDescription(new RTCSessionDescription(sdp));
      
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
  };

  const handleIceCandidate = async (candidate: RTCIceCandidateInit) => {
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
  };

  const cleanupCall = useCallback(() => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
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

  const toggleMute = () => {
    if (localStreamRef.current) {
      const audioTracks = localStreamRef.current.getAudioTracks();
      audioTracks.forEach(track => {
        track.enabled = !track.enabled;
      });
      setIsMuted(!isMuted);
    }
  };

  const toggleVideo = () => {
    if (localStreamRef.current) {
      const videoTracks = localStreamRef.current.getVideoTracks();
      videoTracks.forEach(track => {
        track.enabled = !track.enabled;
      });
      setIsVideoOff(!isVideoOff);
    }
  };

  const clearMessages = () => {
    setMessages([]);
    localStorage.removeItem('chat_messages');
  };

  useEffect(() => {
    connect();
    return () => {
      cleanupCall();
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      wsRef.current?.close();
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
    isVideoOff
  };
}
