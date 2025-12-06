import React, {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
  useLayoutEffect,
} from "react";
import {
  Send,
  Paperclip,
  Mic,
  Video,
  Phone,
  Lock,
  Smile,
  PhoneOff,
  Menu,
  X,
  Trash2,
  Square,
  Settings,
  Reply,
  Shield,
  MoreVertical,
  Camera,
  Image,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useChatConnection } from "@/hooks/use-chat-connection";
import { useAudioRecorder } from "@/hooks/use-audio-recorder";
import { useToast } from "@/hooks/use-toast";
import { ActiveCallOverlay } from "./ActiveCallOverlay";
import { EmojiPicker } from "./EmojiPicker";
import { ProfileEditor } from "./ProfileEditor";
import { MediaViewer } from "./MediaViewer";


import { SettingsPanel } from "@/components/settings/SettingsPanel";
import ChatMessage from "./ChatMessage";

const FIXED_ROOM_ID = "secure-room-001";

interface ChatLayoutProps {
  onLock: () => void;
  currentUser: "admin" | "friend";
  showAdminPanel: boolean;
  onAdminPanelToggle: () => void;
}

interface Message {
  id: string;
  text: string;
  sender: "me" | "them";
  timestamp: Date;
  type: "text" | "image" | "video" | "audio";
  mediaUrl?: string;
  status?: "sending" | "sent" | "delivered" | "read";
  replyTo?: {
    id: string;
    text: string;
    sender: "me" | "them";
  };
}

export function ChatLayout({
  onLock,
  currentUser,
  showAdminPanel,
  onAdminPanelToggle,
}: ChatLayoutProps) {
  const { toast } = useToast();

  // text + UI
  const [inputText, setInputText] = useState("");
  const [showProfileEditor, setShowProfileEditor] = useState(false);
  const [showSidebar, setShowSidebar] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [retentionMode, setRetentionMode] = useState<
    "forever" | "after_seen" | "1h" | "24h"
  >("forever");
  const [showRetentionSettings, setShowRetentionSettings] = useState(false);
  const [selectedMedia, setSelectedMedia] = useState<{
    url: string;
    type: "image" | "video";
  } | null>(null);
  const [showMediaOptions, setShowMediaOptions] = useState(false);

  // selection / reply
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedMessages, setSelectedMessages] = useState<Set<string>>(
    new Set()
  );
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);

  // refs
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // recorder
  const {
    isRecording,
    recordingTime,
    startRecording,
    stopRecording,
    cancelRecording,
  } = useAudioRecorder();

  // chat connection
  const {
    isConnected,
    peerConnected,
    isPeerOnline,
    myProfile,
    peerProfile,
    updateMyProfile,
    messages,
    sendMessage,
    deleteMessages,
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
  } = useChatConnection(currentUser);

  // safe wrapper so TS is happy even if hook returns undefined for deleteMessages
  const safeDeleteMessages = useCallback(
    (ids: string[]) => {
      if (deleteMessages) {
        deleteMessages(ids);
      } else {
        toast({
          title: `${ids.length} message${ids.length !== 1 ? "s" : ""} deleted`,
        });
      }
    },
    [deleteMessages, toast]
  );

  // nuke listener
  useEffect(() => {
    const channel = new BroadcastChannel("secure_chat_messages");
    channel.onmessage = (event) => {
      if (event.data.type === "nuke") {
        emergencyWipe();
      }
    };
    return () => channel.close();
  }, [emergencyWipe]);

  // retention
  useEffect(() => {
    const loadRetentionSettings = async () => {
      try {
        const response = await fetch(`/api/retention/${FIXED_ROOM_ID}`);
        if (response.ok) {
          const data = await response.json();
          setRetentionMode(data.retentionMode);
        }
      } catch (error) {
        console.error("Failed to load retention settings:", error);
      }
    };
    loadRetentionSettings();
  }, []);

  // scroll bottom
  const scrollToBottom = useCallback(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, []);

  // Optimize scroll to bottom - only scroll if user is near bottom
  useEffect(() => {
    if (!scrollRef.current || !messagesEndRef.current) return;
    
    const container = scrollRef.current;
    const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 200;
    
    if (isNearBottom || messages.length === 0) {
      // Use requestAnimationFrame for smooth scroll
      requestAnimationFrame(() => {
        scrollToBottom();
      });
    }
  }, [messages.length, scrollToBottom]); // Only depend on length, not full array

  // exit select mode if nothing selected
  useEffect(() => {
    if (isSelectMode && selectedMessages.size === 0) {
      setIsSelectMode(false);
    }
  }, [selectedMessages, isSelectMode]);

  // Handle mobile keyboard visibility
  useLayoutEffect(() => {
    const handleResize = () => {
      if (window.visualViewport) {
        const viewport = window.visualViewport;
        const isKeyboardOpen = viewport.height < window.innerHeight * 0.75;
        
        if (isKeyboardOpen) {
          document.body.classList.add("keyboard-open");
        } else {
          document.body.classList.remove("keyboard-open");
        }
        
        // Scroll to bottom when keyboard opens
        if (isKeyboardOpen) {
          setTimeout(scrollToBottom, 100);
        }
      }
    };

    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", handleResize);
      return () => window.visualViewport?.removeEventListener("resize", handleResize);
    }
  }, [scrollToBottom]);

  // input change with WhatsApp-style growth (max 6 lines)
  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const el = e.target;
      setInputText(el.value);
      handleTyping();

      // Reset height to auto to get accurate scrollHeight
      el.style.height = "auto";
      
      // Calculate line height (approximately 24px per line)
      const lineHeight = 24;
      const maxLines = 6;
      const maxHeight = lineHeight * maxLines;
      
      const scrollHeight = el.scrollHeight;
      const newHeight = Math.min(Math.max(scrollHeight, lineHeight), maxHeight);
      
      el.style.height = `${newHeight}px`;
      el.style.overflowY = scrollHeight > maxHeight ? "auto" : "hidden";
    },
    [handleTyping]
  );

  // send text
  const handleSendText = useCallback(
    (e?: React.FormEvent) => {
      e?.preventDefault();
      if (!inputText.trim()) return;

      sendMessage({
        text: inputText,
        type: "text",
        replyTo: replyingTo
          ? {
              id: replyingTo.id,
              text: replyingTo.text,
              sender: replyingTo.sender,
            }
          : undefined,
      });

      setInputText("");
      setReplyingTo(null);
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
      }
    },
    [inputText, sendMessage, replyingTo]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSendText();
      }
    },
    [handleSendText]
  );

  const handleReply = useCallback((msg: Message) => {
    setReplyingTo(msg);
    textareaRef.current?.focus();
  }, []);

  // media send handler for MediaPreviewSender
  const handleMediaSend = useCallback(
    (data: { type: "image" | "video"; mediaUrl: string; text: string }) => {
      sendMessage(data);
    },
    [sendMessage]
  );

  const uploadToCloudinary = useCallback(async (file: File): Promise<string | null> => {
    try {
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
      });
      reader.readAsDataURL(file);
      const base64Data = await base64Promise;

      const mediaType = file.type.startsWith('video/') ? 'video' : file.type.startsWith('audio/') ? 'audio' : 'image';
      
      const response = await fetch('/api/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: base64Data, type: mediaType }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Upload failed');
      }

      const result = await response.json();
      return result.mediaUrl;
    } catch (error) {
      console.error('Upload error:', error);
      toast({ variant: 'destructive', title: 'Failed to upload media' });
      return null;
    }
  }, [toast]);

  const handleCamera = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.capture = 'environment';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        toast({ title: 'Uploading image...' });
        const url = await uploadToCloudinary(file);
        if (url) {
          sendMessage({ type: 'image', mediaUrl: url, text: '' });
        }
      }
    };
    input.click();
    setShowMediaOptions(false);
  }, [sendMessage, uploadToCloudinary, toast]);

  const handleGallery = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*,video/*';
    input.multiple = true;
    input.onchange = async (e) => {
      const files = (e.target as HTMLInputElement).files;
      if (files && files.length > 0) {
        toast({ title: `Uploading ${files.length} file(s)...` });
        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          const url = await uploadToCloudinary(file);
          if (url) {
            const type = file.type.startsWith('image/') ? 'image' : 'video';
            sendMessage({ type, mediaUrl: url, text: '' });
          }
        }
      }
    };
    input.click();
    setShowMediaOptions(false);
  }, [sendMessage, uploadToCloudinary, toast]);



  // recorder
  const handleStartRecording = useCallback(async () => {
    try {
      await startRecording();
    } catch {
      toast({ variant: "destructive", title: "Microphone access denied" });
    }
  }, [startRecording, toast]);

  const handleStopRecording = useCallback(async () => {
    const audioBlob = await stopRecording();
    if (audioBlob) {
      toast({ title: 'Uploading voice message...' });
      const audioFile = new File([audioBlob], 'voice.webm', { type: 'audio/webm' });
      const url = await uploadToCloudinary(audioFile);
      if (url) {
        sendMessage({
          type: "audio",
          mediaUrl: url,
          text: `🎤 Voice (0:${recordingTime.toString().padStart(2, "0")})`,
        });
      }
    }
  }, [stopRecording, sendMessage, recordingTime, uploadToCloudinary, toast]);

  // long press -> select mode (with haptic feedback on supported devices)
  const handleMessageLongPress = useCallback((msgId: string) => {
    setIsSelectMode(true);
    setSelectedMessages(new Set([msgId]));
  }, []);

  const handleMediaClick = useCallback(
    (url: string, type: "image" | "video") => {
      setSelectedMedia({ url, type });
    },
    []
  );

  // Handle reply action
  const handleReplyAction = useCallback((msg: Message) => {
    if (isSelectMode) return;
    if ((msg.type === "image" || msg.type === "video") && msg.mediaUrl) {
      handleMediaClick(msg.mediaUrl, msg.type);
    } else {
      handleReply(msg);
    }
  }, [isSelectMode, handleMediaClick, handleReply]);

  const handleSelectMessage = useCallback((msgId: string) => {
    setSelectedMessages((prev) => {
      const next = new Set(prev);
      if (next.has(msgId)) next.delete(msgId);
      else next.add(msgId);
      return next;
    });
  }, []);

  const handleDeleteSelected = useCallback(() => {
    if (selectedMessages.size === 0) return;
    const ids = Array.from(selectedMessages);
    safeDeleteMessages(ids);
    setSelectedMessages(new Set());
    setIsSelectMode(false);
  }, [selectedMessages, safeDeleteMessages]);

  const handleCancelSelect = useCallback(() => {
    setSelectedMessages(new Set());
    setIsSelectMode(false);
  }, []);

  // last seen
  const getLastSeenText = useMemo(() => {
    if (isPeerOnline) return "Online";
    const lastSeen = (peerProfile as any).lastSeen;
    if (lastSeen) {
      return `Last seen ${formatDistanceToNow(lastSeen, { addSuffix: true })}`;
    }
    return "Offline";
  }, [isPeerOnline, (peerProfile as any).lastSeen]);

  // double tap header -> lock
  const [tapCount, setTapCount] = useState(0);
  const handleHeaderDoubleTap = useCallback(() => {
    setTapCount((prev) => prev + 1);
    setTimeout(() => setTapCount(0), 300);
    if (tapCount === 1) {
      onLock();
    }
  }, [tapCount, onLock]);

  // render messages - memoized to prevent re-renders
  const messagesList = useMemo(
    () =>
      messages.map((msg) => (
        <ChatMessage
          key={msg.id}
          message={msg as Message}
          isSelected={selectedMessages.has(msg.id)}
          isSelectMode={isSelectMode}
          onSelect={handleSelectMessage}
          onLongPress={handleMessageLongPress}
          onReply={handleReplyAction}
          onSwipeReply={handleReply}
        />
      )),
    [
      messages.length, // Only depend on length to reduce re-renders
      selectedMessages.size,
      isSelectMode,
      handleSelectMessage,
      handleMessageLongPress,
      handleReplyAction,
      handleReply,
    ]
  );

  // Handle click outside messages to deselect
  const handleContainerClick = useCallback(
    (e: React.MouseEvent) => {
      if (isSelectMode && e.target === e.currentTarget) {
        setSelectedMessages(new Set());
        setIsSelectMode(false);
      }
    },
    [isSelectMode]
  );

  return (
    <div className="w-full h-full flex items-center justify-center bg-[#0a1014]">
      <div className="w-full h-dvh md:h-[94vh] md:my-3 max-w-6xl flex bg-[#0A1014] md:rounded-2xl shadow-2xl overflow-hidden md:overflow-visible">
        {/* MOBILE SIDEBAR OVERLAY */}
        {showSidebar && (
          <div
            className="fixed inset-0 bg-black/50 z-30 md:hidden"
            onClick={(e) => {
              e.stopPropagation();
              setShowSidebar(false);
            }}
          />
        )}

        {/* MOBILE SIDEBAR */}
        <div
          className={cn(
            "fixed inset-y-0 left-0 z-40 w-[78%] max-w-xs bg-[#111b21] text-white shadow-2xl transform transition-transform duration-300 ease-out md:hidden",
            showSidebar ? "translate-x-0" : "-translate-x-full"
          )}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex flex-col h-full">
            <div className="p-3 border-b border-white/10">
              <div className="flex justify-between items-center mb-3">
                <h2 className="text-sm font-semibold">Menu</h2>
                <button
                  onClick={() => setShowSidebar(false)}
                  className="p-2 rounded-full hover:bg-white/10 transition-colors"
                >
                  <X size={20} />
                </button>
              </div>
              <div
                className="flex items-center gap-3 cursor-pointer p-2 rounded-lg hover:bg:white/5 hover:bg-white/5"
                onClick={() => {
                  setShowProfileEditor(true);
                  setShowSidebar(false);
                }}
              >
                <Avatar className="h-10 w-10 border border-white/10">
                  <AvatarImage src={myProfile.avatar} />
                  <AvatarFallback className="bg-emerald-600 text-white text-sm">
                    {myProfile.name.charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-sm truncate">
                    {myProfile.name}
                  </p>
                  <p className="text-xs text-zinc-400 flex items-center gap-2">
                    <span
                      className={cn(
                        "w-2 h-2 rounded-full",
                        isConnected ? "bg-emerald-500" : "bg-yellow-500"
                      )}
                    />
                    <span className="truncate">
                      {isConnected ? "Connected" : "Connecting..."}
                    </span>
                  </p>
                </div>
              </div>
            </div>

            <div className="p-2 space-y-1">
              <button
                onClick={() => {
                  setShowSettings(true);
                  setShowSidebar(false);
                }}
                className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-white/10 transition-colors text-left"
              >
                <Settings size={20} className="text-zinc-400" />
                <span className="text-sm">Settings</span>
              </button>
              {currentUser === "admin" && (
                <button
                  onClick={() => {
                    onAdminPanelToggle();
                    setShowSidebar(false);
                  }}
                  className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-white/10 transition-colors text-left"
                >
                  <Shield size={20} className="text-zinc-400" />
                  <span className="text-sm">Admin Panel</span>
                </button>
              )}

            </div>

            <div className="flex-1 overflow-y-auto">
              <div className="flex items-center gap-3 p-3 bg-[#202c33] border-l-4 border-emerald-500">
                <Avatar className="h-11 w-11">
                  <AvatarImage src={peerProfile.avatar} />
                  <AvatarFallback className="bg-emerald-700 text-white">
                    {peerProfile.name.charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-center gap-2">
                    <h3 className="font-medium text-sm truncate">
                      {peerProfile.name}
                    </h3>
                    <span
                      className={cn(
                        "w-2 h-2 rounded-full",
                        isPeerOnline ? "bg-emerald-500" : "bg-zinc-500"
                      )}
                    />
                  </div>
                  <p className="text-xs text-zinc-400 truncate">
                    {peerProfile.isTyping ? (
                      <span className="text-emerald-400">typing…</span>
                    ) : (
                      getLastSeenText
                    )}
                  </p>
                </div>
              </div>
            </div>

            <div className="p-3 border-t border-white/10 text-[11px] text-center text-zinc-500">
              Double tap header to lock • Long press message to select
            </div>
          </div>
        </div>

        {/* DESKTOP SIDEBAR */}
        <div className="hidden md:flex md:w-[340px] bg-[#111b21] text-white flex-col border-r border-black/40">
          <div className="p-3 border-b border-black/40 flex justify-between items-center">
            <div
              className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer"
              onClick={() => setShowProfileEditor(true)}
            >
              <Avatar className="h-10 w-10 border border-white/10">
                <AvatarImage src={myProfile.avatar} />
                <AvatarFallback className="bg-emerald-600 text-white text-sm">
                  {myProfile.name.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="font-semibold text-sm truncate">
                  {myProfile.name}
                </p>
                <p className="text-xs text-zinc-400 flex items-center gap-2">
                  <span
                    className={cn(
                      "w-2 h-2 rounded-full",
                      isConnected ? "bg-emerald-500" : "bg-yellow-500"
                    )}
                  />
                  <span className="truncate">
                    {isConnected ? "Connected" : "Connecting..."}
                  </span>
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {currentUser === "admin" && (
                <button
                  onClick={onAdminPanelToggle}
                  className="p-2 rounded-full hover:bg-white/10 transition-colors"
                  title="Admin Panel"
                >
                  <Shield size={18} />
                </button>
              )}
              <button
                onClick={() => setShowSettings(true)}
                className="p-2 rounded-full hover:bg-white/10 transition-colors"
                title="Settings"
              >
                <Settings size={18} />
              </button>

            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            <div className="flex items-center gap-3 p-3 bg-[#202c33] border-l-4 border-emerald-500">
              <Avatar className="h-11 w-11">
                <AvatarImage src={peerProfile.avatar} />
                <AvatarFallback className="bg-emerald-700 text-white">
                  {peerProfile.name.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-center gap-2">
                  <h3 className="font-medium text-sm truncate">
                    {peerProfile.name}
                  </h3>
                  <span
                    className={cn(
                      "w-2 h-2 rounded-full",
                      isPeerOnline ? "bg-emerald-500" : "bg-zinc-500"
                    )}
                  />
                </div>
                <p className="text-xs text-zinc-400 truncate">
                  {peerProfile.isTyping ? (
                    <span className="text-emerald-400">typing…</span>
                  ) : (
                    getLastSeenText
                  )}
                </p>
              </div>
            </div>
          </div>

          <div className="p-3 border-t border-black/40 text-[11px] text-center text-zinc-500">
            Double tap header to lock • Long press message to select
          </div>
        </div>

        {/* MAIN CHAT AREA */}
        <div className="flex-1 flex flex-col bg-[#0B141A] h-dvh md:h-auto overflow-hidden chat-container md:overflow-visible">
          {/* Incoming Call Dialog */}
          <Dialog
            open={!!incomingCall}
            onOpenChange={(open) => !open && rejectCall()}
          >
            <DialogContent className="w-[90vw] max-w-md border-none bg-slate-900 text-white shadow-2xl mx-auto">
              <DialogHeader className="flex flex-col items-center gap-4">
                <Avatar className="w-20 h-20 sm:w-24 sm:h-24 border-4 border-white/10 animate-pulse">
                  <AvatarImage src={peerProfile.avatar} />
                  <AvatarFallback className="text-2xl bg-emerald-600 text-white">
                    {peerProfile.name.charAt(0)}
                  </AvatarFallback>
                </Avatar>
                <DialogTitle className="text-xl sm:text-2xl font-light">
                  {incomingCall?.type === "video" ? "Video" : "Voice"} Call
                </DialogTitle>
                <DialogDescription className="text-white/60">
                  {peerProfile.name} is calling...
                </DialogDescription>
              </DialogHeader>
              <div className="flex items-center justify-center gap-6 sm:gap-8 mt-4 sm:mt-6">
                <button
                  onClick={rejectCall}
                  className="p-3 sm:p-4 bg-red-500 rounded-full hover:bg-red-600 transition-colors"
                >
                  <PhoneOff size={20} className="sm:w-6 sm:h-6" />
                </button>
                <button
                  onClick={acceptCall}
                  className="p-3 sm:p-4 bg-green-500 rounded-full hover:bg-green-600 transition-colors"
                >
                  <Phone size={20} className="sm:w-6 sm:h-6" />
                </button>
              </div>
            </DialogContent>
          </Dialog>

          {/* Active Call Overlay */}
          {activeCall && (
            <ActiveCallOverlay
              peerName={peerProfile.name}
              peerAvatar={peerProfile.avatar}
              callStatus={callStatus}
              localStream={localStream}
              remoteStream={remoteStream}
              isMuted={isMuted}
              isVideoOff={isVideoOff}
              onToggleMute={toggleMute}
              onToggleVideo={toggleVideo}
              onEndCall={endCall}
            />
          )}

          {/* Profile Editor */}
          <ProfileEditor
            isOpen={showProfileEditor}
            onClose={() => setShowProfileEditor(false)}
            currentName={myProfile.name}
            currentAvatar={myProfile.avatar}
            onSave={(name, avatar) => updateMyProfile({ name, avatar })}
          />

          {/* Settings Panel */}
          <SettingsPanel
            isOpen={showSettings}
            onClose={() => setShowSettings(false)}
            userType={currentUser}
          />

          {/* Media Viewer */}
          <MediaViewer
            isOpen={!!selectedMedia}
            mediaUrl={selectedMedia?.url || ""}
            mediaType={selectedMedia?.type || "image"}
            onClose={() => setSelectedMedia(null)}
          />



          {/* Retention Settings */}
          <Dialog
            open={showRetentionSettings}
            onOpenChange={setShowRetentionSettings}
          >
            <DialogContent className="w-[90vw] max-w-md mx-auto">
              <DialogHeader>
                <DialogTitle>Message Retention</DialogTitle>
                <DialogDescription>
                  Choose how long messages should be kept.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Retention Mode</label>
                  <select
                    value={retentionMode}
                    onChange={(e) =>
                      setRetentionMode(e.target.value as any)
                    }
                    className="w-full px-3 py-2 border border-input bg-background rounded-md"
                  >
                    <option value="forever">
                      Off (keep messages forever)
                    </option>
                    <option value="after_seen">After seen</option>
                    <option value="1h">1 hour</option>
                    <option value="24h">24 hours</option>
                  </select>
                </div>
                <div className="text-sm text-muted-foreground">
                  {retentionMode === "forever" &&
                    "Messages will never disappear."}
                  {retentionMode === "after_seen" &&
                    "Messages disappear after both users have seen them."}
                  {retentionMode === "1h" &&
                    "Messages disappear 1 hour after being sent."}
                  {retentionMode === "24h" &&
                    "Messages disappear 24 hours after being sent."}
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setShowRetentionSettings(false)}
                  className="px-4 py-2 text-sm border border-input rounded-md hover:bg-secondary"
                >
                  Cancel
                </button>
                <button
                  onClick={async () => {
                    try {
                      const response = await fetch(
                        `/api/retention/${FIXED_ROOM_ID}`,
                        {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ retentionMode }),
                        }
                      );
                      if (response.ok) {
                        setShowRetentionSettings(false);
                        toast({ title: "Retention setting updated" });
                      } else {
                        throw new Error("Failed to update retention");
                      }
                    } catch (error) {
                      console.error("Error updating retention:", error);
                      toast({
                        variant: "destructive",
                        title: "Failed to update retention setting",
                      });
                    }
                  }}
                  className="px-4 py-2 text-sm bg-emerald-600 text-white rounded-md hover:bg-emerald-700"
                >
                  Save
                </button>
              </div>
            </DialogContent>
          </Dialog>

          

          {/* HEADER */}
          <header
            className={cn(
              "h-14 sm:h-16 flex items-center justify-between px-2 sm:px-4 border-b border-black/40 z-50 shrink-0 safe-area-top selection-header md:relative fixed top-0 left-0 right-0 md:top-auto md:left-auto md:right-auto",
              isSelectMode ? "bg-emerald-900/90" : "bg-[#202c33]"
            )}
            onClick={!isSelectMode ? handleHeaderDoubleTap : undefined}
          >
            {isSelectMode ? (
              <>
                <div className="flex items-center gap-3">
                  <button
                    onClick={handleCancelSelect}
                    className="p-2 rounded-full hover:bg-white/10 text-zinc-100"
                  >
                    <X size={20} />
                  </button>
                  <span className="font-medium text-sm text-zinc-100">
                    {selectedMessages.size} selected
                  </span>
                </div>
                <button
                  onClick={handleDeleteSelected}
                  className="flex items-center gap-2 px-4 py-2 rounded-full bg-red-500 text-white text-sm hover:bg-red-600"
                >
                  <Trash2 size={16} />
                  Delete
                </button>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                  {/* Mobile 3-dot menu button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      setShowSidebar((prev) => !prev);
                    }}
                    className="p-2 rounded-full hover:bg-white/5 md:hidden text-zinc-100 z-50"
                    type="button"
                  >
                    <MoreVertical size={20} />
                  </button>
                  <Avatar className="h-9 w-9 sm:h-10 sm:w-10">
                    <AvatarImage src={peerProfile.avatar} />
                    <AvatarFallback className="bg-emerald-700 text-white">
                      {peerProfile.name.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <h2 className="font-semibold text-sm truncate text-zinc-100">
                      {peerProfile.name}
                    </h2>
                    <span
                      className={cn(
                        "text-xs truncate block",
                        isPeerOnline
                          ? "text-emerald-400"
                          : "text-zinc-400"
                      )}
                    >
                      {peerProfile.isTyping ? (
                        <span className="text-emerald-400">typing…</span>
                      ) : (
                        getLastSeenText
                      )}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      peerConnected && startCall("voice");
                    }}
                    disabled={!peerConnected}
                    className={cn(
                      "p-2.5 rounded-full text-zinc-100",
                      peerConnected
                        ? "hover:bg-white/5"
                        : "opacity-40 cursor-default"
                    )}
                  >
                    <Phone size={20} />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      peerConnected && startCall("video");
                    }}
                    disabled={!peerConnected}
                    className={cn(
                      "p-2.5 rounded-full text-zinc-100",
                      peerConnected
                        ? "hover:bg-white/5"
                        : "opacity-40 cursor-default"
                    )}
                  >
                    <Video size={20} />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onLock();
                    }}
                    className="p-2.5 rounded-full bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white transition-colors"
                  >
                    <Lock size={20} />
                  </button>
                </div>
              </>
            )}
          </header>

          {/* MESSAGES */}
          <div
            ref={scrollRef}
            className="flex-1 min-h-0 overflow-y-auto px-2 sm:px-4 pt-[72px] md:pt-4 pb-[calc(env(safe-area-inset-bottom,0px)+80px+16px)] sm:pb-[calc(env(safe-area-inset-bottom,0px)+96px+16px)] bg-[#0B141A] overscroll-contain"
            style={{
              WebkitOverflowScrolling: "touch",
              touchAction: isSelectMode ? "none" : "pan-y",
            }}
            onClick={handleContainerClick}
          >
            {messages.length === 0 && (
              <div className="flex items-center justify-center py-8">
                <div className="text-xs sm:text-sm text-zinc-100/80 bg-black/20 rounded-full px-4 py-2">
                  Start a conversation with {peerProfile.name}
                </div>
              </div>
            )}

            {messagesList}

            {peerProfile.isTyping && (
              <div className="flex justify-start px-4 mt-1">
                <div className="bg-[#202c33] rounded-2xl px-3 py-2 shadow-sm border border-black/40">
                  <div className="flex gap-1 items-end">
                    <span
                      className="w-2 h-2 bg-zinc-300 rounded-full animate-bounce"
                      style={{ animationDelay: "0ms" }}
                    />
                    <span
                      className="w-2 h-2 bg-zinc-300 rounded-full animate-bounce"
                      style={{ animationDelay: "150ms" }}
                    />
                    <span
                      className="w-2 h-2 bg-zinc-300 rounded-full animate-bounce"
                      style={{ animationDelay: "300ms" }}
                    />
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} className="h-1" />
          </div>

          {/* INPUT */}
          <div className="bg-[#202c33] border-t border-black/40 shrink-0 safe-area-bottom md:relative fixed bottom-0 left-0 right-0 md:bottom-auto md:left-auto md:right-auto z-40 md:z-auto pt-4 md:pt-0">
            {replyingTo && (
              <div className="px-3 pt-2">
                <div className="flex items-center gap-2 px-3 py-2 bg-[#18252f] rounded-xl border-l-2 border-emerald-500">
                  <Reply size={16} className="text-emerald-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-emerald-400">
                      Reply to{" "}
                      {replyingTo.sender === "me"
                        ? "yourself"
                        : peerProfile.name}
                    </p>
                    <p className="text-xs text-zinc-300 truncate">
                      {replyingTo.text}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setReplyingTo(null)}
                    className="p-1 rounded-full hover:bg-white/10 text-zinc-300"
                  >
                    <X size={14} />
                  </button>
                </div>
              </div>
            )}

            <div className="px-2 sm:px-3 py-2 sm:py-3">
              <form onSubmit={handleSendText}>
                <div className="flex items-end gap-1.5 sm:gap-2 rounded-3xl bg-[#2a3942] px-2 sm:px-3 py-1.5">
                  {!isRecording && (
                    <>
                      <Popover open={showMediaOptions} onOpenChange={setShowMediaOptions}>
                        <PopoverTrigger asChild>
                          <button
                            type="button"
                            onClick={() => setShowMediaOptions(true)}
                            disabled={!isConnected}
                            className="p-1.5 sm:p-2 text-zinc-300 hover:bg-white/10 rounded-full disabled:opacity-40 shrink-0 mb-0.5"
                          >
                            <Paperclip size={18} />
                          </button>
                        </PopoverTrigger>
                        <PopoverContent className="w-48 p-2" align="start" side="top">
                          <div className="space-y-1">
                            <button
                              onClick={handleCamera}
                              className="w-full flex items-center gap-2 p-2 rounded hover:bg-white/10 text-left"
                            >
                              <Camera size={16} /> Camera
                            </button>
                            <button
                              onClick={handleGallery}
                              className="w-full flex items-center gap-2 p-2 rounded hover:bg-white/10 text-left"
                            >
                              <Image size={16} /> Gallery
                            </button>
                          </div>
                        </PopoverContent>
                      </Popover>

                      <Popover>
                        <PopoverTrigger asChild>
                          <button
                            type="button"
                            className="p-1.5 sm:p-2 text-zinc-300 hover:bg-white/10 rounded-full shrink-0 mb-0.5"
                          >
                            <Smile size={18} />
                          </button>
                        </PopoverTrigger>
                        <PopoverContent
                          className="w-auto p-0"
                          align="start"
                          side="top"
                        >
                          <EmojiPicker
                            onSelect={(emoji) =>
                              setInputText((prev) => prev + emoji)
                            }
                          />
                        </PopoverContent>
                      </Popover>
                    </>
                  )}

                  <div className="flex-1 flex items-end min-h-9 sm:min-h-10 min-w-0">
                    {isRecording ? (
                      <div className="flex items-center gap-2 w-full py-1">
                        <div className="w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse" />
                        <span className="text-red-400 text-sm font-mono flex-1">
                          Recording {Math.floor(recordingTime / 60)}:
                          {(recordingTime % 60).toString().padStart(2, "0")}
                        </span>
                        <button
                          type="button"
                          onClick={cancelRecording}
                          className="p-1.5 rounded-full hover:bg-red-500/20"
                        >
                          <X size={18} className="text-red-400" />
                        </button>
                      </div>
                    ) : (
                      <textarea
                        ref={textareaRef}
                        value={inputText}
                        onChange={handleInputChange}
                        onKeyDown={handleKeyDown}
                        placeholder={
                          isConnected ? "Message" : "Connecting..."
                        }
                        disabled={!isConnected}
                        rows={1}
                        className={cn(
                          "flex-1 bg-transparent text-[15px] leading-[1.5] text-zinc-100",
                          "w-full resize-none overflow-x-hidden chat-textarea",
                          "placeholder:text-zinc-500",
                          "py-1.5",
                          "border-none outline-none ring-0",
                          "focus:outline-none focus:ring-0 focus:border-none focus:shadow-none"
                        )}
                        style={{ 
                          height: "24px",
                          minHeight: "24px",
                          maxHeight: "144px",
                          border: "none",
                          boxShadow: "none",
                        }}
                      />
                    )}
                  </div>

                  {isRecording ? (
                    <button
                      type="button"
                      onClick={handleStopRecording}
                      className="p-2 sm:p-2.5 rounded-full bg-red-500 shrink-0 hover:bg-red-600"
                    >
                      <Square size={18} className="text-white" fill="white" />
                    </button>
                  ) : inputText.trim() ? (
                    <button
                      type="submit"
                      disabled={!isConnected}
                      className="p-2 sm:p-2.5 rounded-full bg-emerald-600 shrink-0 hover:bg-emerald-700 disabled:opacity-40"
                    >
                      <Send size={18} className="text-white" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleStartRecording}
                      disabled={!isConnected}
                      className="p-2 sm:p-2.5 text-zinc-300 hover:bg-white/10 rounded-full disabled:opacity-40 shrink-0"
                    >
                      <Mic size={18} />
                    </button>
                  )}
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
