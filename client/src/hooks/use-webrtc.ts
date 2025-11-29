import { useState, useEffect, useRef, useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';

// Signaling message types
type SignalMessage = 
  | { type: 'offer'; sdp: RTCSessionDescriptionInit; caller: string }
  | { type: 'answer'; sdp: RTCSessionDescriptionInit; responder: string }
  | { type: 'ice-candidate'; candidate: RTCIceCandidateInit; from: string }
  | { type: 'call-end' }
  | { type: 'call-reject' };

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:global.stun.twilio.com:3478' }
  ]
};

export function useWebRTC() {
  const { toast } = useToast();
  const [activeCall, setActiveCall] = useState<'voice' | 'video' | null>(null);
  const [incomingCall, setIncomingCall] = useState<'voice' | 'video' | null>(null);
  const [callStatus, setCallStatus] = useState<'idle' | 'calling' | 'ringing' | 'connected' | 'ended'>('idle');
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const signalingRef = useRef<BroadcastChannel | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);

  // Helper to serialize ICE candidate for transmission
  const serializeCandidate = (candidate: RTCIceCandidate): RTCIceCandidateInit | null => {
    if (!candidate) return null;
    return {
      candidate: candidate.candidate,
      sdpMLineIndex: candidate.sdpMLineIndex,
      sdpMid: candidate.sdpMid,
      usernameFragment: candidate.usernameFragment
    };
  };

  // Initialize Signaling Channel (Mocking WebSocket with BroadcastChannel for Tab-to-Tab P2P)
  useEffect(() => {
    signalingRef.current = new BroadcastChannel('webrtc_signaling_channel');
    
    signalingRef.current.onmessage = async (event) => {
      const data = event.data as SignalMessage;
      
      if (data.type === 'offer') {
        // Incoming Call
        if (callStatus !== 'idle') return; // Busy
        setIncomingCall('video'); // Default to video capability for now, or infer from SDP
        setCallStatus('ringing');
        // Store the offer to handle later
        (window as any).pendingOffer = data.sdp; 
      } 
      else if (data.type === 'answer') {
        if (peerRef.current) {
          try {
            await peerRef.current.setRemoteDescription(new RTCSessionDescription(data.sdp));
          } catch (e) {
            console.error('Error setting remote description', e);
          }
        }
      } 
      else if (data.type === 'ice-candidate') {
        if (peerRef.current && data.candidate) {
          try {
            await peerRef.current.addIceCandidate(new RTCIceCandidate(data.candidate));
          } catch (e) {
            console.error('Error adding received ice candidate', e);
          }
        }
      }
      else if (data.type === 'call-end' || data.type === 'call-reject') {
        cleanupCall();
        setCallStatus('ended');
        setTimeout(() => setCallStatus('idle'), 2000);
        toast({ title: "Call Ended" });
      }
    };

    return () => {
      signalingRef.current?.close();
    };
  }, [callStatus, toast]);

  const startCall = async (mode: 'voice' | 'video') => {
    try {
      setActiveCall(mode);
      setCallStatus('calling');

      // First close any existing call
      if (peerRef.current) {
        peerRef.current.close();
        peerRef.current = null;
      }

      // 1. Get User Media
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: mode === 'video' ? { width: { ideal: 1280 }, height: { ideal: 720 } } : false
      });
      setLocalStream(stream);
      localStreamRef.current = stream;

      // 2. Create Peer Connection
      const peer = new RTCPeerConnection(ICE_SERVERS);
      peerRef.current = peer;

      // 3. Add Tracks
      stream.getTracks().forEach(track => peer.addTrack(track, stream));

      // 4. Handle ICE Candidates - SERIALIZE BEFORE SENDING
      peer.onicecandidate = (event) => {
        if (event.candidate) {
          const serialized = serializeCandidate(event.candidate);
          signalingRef.current?.postMessage({
            type: 'ice-candidate',
            candidate: serialized,
            from: 'caller'
          });
        }
      };

      // 5. Handle Remote Stream
      peer.ontrack = (event) => {
        setRemoteStream(event.streams[0]);
      };

      // 6. Create Offer
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);

      // 7. Send Offer
      signalingRef.current?.postMessage({
        type: 'offer',
        sdp: offer,
        caller: 'me'
      });

    } catch (err) {
      console.error("Failed to start call:", err);
      cleanupCall();
      toast({ variant: "destructive", title: "Error", description: "Could not access camera/microphone" });
    }
  };

  const acceptCall = async () => {
    try {
      // First close any existing call
      if (peerRef.current) {
        peerRef.current.close();
        peerRef.current = null;
      }

      setIncomingCall(null);
      setActiveCall('video'); // Assuming video for now
      setCallStatus('connected');

      // 1. Get User Media
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: { width: { ideal: 1280 }, height: { ideal: 720 } } // Ideally match the offer
      });
      setLocalStream(stream);
      localStreamRef.current = stream;

      // 2. Create Peer Connection
      const peer = new RTCPeerConnection(ICE_SERVERS);
      peerRef.current = peer;

      // 3. Add Tracks
      stream.getTracks().forEach(track => peer.addTrack(track, stream));

      // 4. Handle ICE Candidates - SERIALIZE BEFORE SENDING
      peer.onicecandidate = (event) => {
        if (event.candidate) {
          const serialized = serializeCandidate(event.candidate);
          signalingRef.current?.postMessage({
            type: 'ice-candidate',
            candidate: serialized,
            from: 'responder'
          });
        }
      };

      // 5. Handle Remote Stream
      peer.ontrack = (event) => {
        setRemoteStream(event.streams[0]);
      };

      // 6. Set Remote Description (Offer)
      const offer = (window as any).pendingOffer;
      await peer.setRemoteDescription(new RTCSessionDescription(offer));

      // 7. Create Answer
      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);

      // 8. Send Answer
      signalingRef.current?.postMessage({
        type: 'answer',
        sdp: answer,
        responder: 'me'
      });

    } catch (err) {
      console.error("Failed to accept call:", err);
      cleanupCall();
    }
  };

  const rejectCall = () => {
    setIncomingCall(null);
    setCallStatus('idle');
    signalingRef.current?.postMessage({ type: 'call-reject' });
  };

  const endCall = () => {
    signalingRef.current?.postMessage({ type: 'call-end' });
    cleanupCall();
  };

  const cleanupCall = useCallback(() => {
    // Stop all tracks
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
    }
    
    // Close peer connection
    if (peerRef.current) {
      peerRef.current.close();
      peerRef.current = null;
    }

    // Reset State
    setLocalStream(null);
    setRemoteStream(null);
    setActiveCall(null);
    setIncomingCall(null);
    setCallStatus('idle');
    setIsMuted(false);
    setIsVideoOff(false);
  }, []);

  const toggleMute = () => {
    if (localStream) {
      localStream.getAudioTracks().forEach(track => track.enabled = !track.enabled);
      setIsMuted(!isMuted);
    }
  };

  const toggleVideo = () => {
    if (localStream) {
      localStream.getVideoTracks().forEach(track => track.enabled = !track.enabled);
      setIsVideoOff(!isVideoOff);
    }
  };

  return {
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
