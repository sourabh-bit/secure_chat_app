import { useState, useEffect, useRef, useMemo, useCallback, memo } from "react";
import {
  Send,
  Paperclip,
  Mic,
  Video,
  Phone,
  Lock,
  CheckCheck,
  Check,
  Smile,
  PhoneOff,
  Menu,
  X,
  Trash2,
  Square,
  Settings,
  Clock,
  Reply,
  Shield,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format, formatDistanceToNow } from "date-fns";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useChatConnection } from "@/hooks/use-chat-connection";
const FIXED_ROOM_ID = 'SECURE_CHAT_MAIN';
import { useAudioRecorder } from "@/hooks/use-audio-recorder";
import { ActiveCallOverlay } from "./ActiveCallOverlay";
import { EmojiPicker } from "./EmojiPicker";
import { ProfileEditor } from "./ProfileEditor";
import { MediaViewer } from "./MediaViewer";
import { AudioPlayer } from "./AudioPlayer";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { SettingsPanel } from "@/components/settings/SettingsPanel";

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

const MessageItem = memo(
  ({
    msg,
    isSelected,
    isSelectMode,
    onSelect,
    onLongPress,
    onRelease,
    onDelete,
    onMediaClick,
    onReply,
    showMenu,
    onCloseMenu,
  }: {
    msg: Message;
    isSelected: boolean;
    isSelectMode: boolean;
    onSelect: (id: string) => void;
    onLongPress: (id: string, event: React.MouseEvent | React.TouchEvent) => void;
    onRelease: () => void;
    onDelete: (id: string) => void;
    onMediaClick: (url: string, type: "image" | "video") => void;
    onReply: (msg: Message) => void;
    showMenu: boolean;
    onCloseMenu: () => void;
  }) => {
    const [swipeX, setSwipeX] = useState(0);
    const [startX, setStartX] = useState(0);
    const [isSwiping, setIsSwiping] = useState(false);
    const [hasLongPressed, setHasLongPressed] = useState(false);

    const handleClick = useCallback(() => {
      if (isSelectMode) {
        onSelect(msg.id);
      }
    }, [isSelectMode, msg.id, onSelect]);

    const handleTouchStart = useCallback((e: React.TouchEvent) => {
      if (isSelectMode) return;
      setStartX(e.touches[0].clientX);
      setIsSwiping(true);
    }, [isSelectMode]);

    const handleTouchMove = useCallback((e: React.TouchEvent) => {
      if (!isSwiping || isSelectMode) return;
      const diff = e.touches[0].clientX - startX;
      if (Math.abs(diff) > 10) {
        // Cancel long-press if moved more than 10px
        onRelease();
        setHasLongPressed(false);
      }
      const maxSwipe = msg.sender === "me" ? -60 : 60;
      if (msg.sender === "me" && diff < 0) {
        setSwipeX(Math.max(diff, maxSwipe));
      } else if (msg.sender !== "me" && diff > 0) {
        setSwipeX(Math.min(diff, maxSwipe));
      }
    }, [isSwiping, startX, msg.sender, isSelectMode, onRelease]);

    const handleTouchEnd = useCallback(() => {
      if (Math.abs(swipeX) > 50 && !hasLongPressed) {
        onReply(msg);
      }
      setSwipeX(0);
      setIsSwiping(false);
    }, [swipeX, msg, onReply, hasLongPressed]);

    const handleMouseDown = useCallback((e: React.MouseEvent) => {
      if (isSelectMode) return;
      setStartX(e.clientX);
      setIsSwiping(true);
      onLongPress(msg.id, e);
    }, [isSelectMode, msg.id, onLongPress]);

    const handleMouseMove = useCallback((e: React.MouseEvent) => {
      if (!isSwiping || isSelectMode) return;
      const diff = e.clientX - startX;
      if (Math.abs(diff) > 10) {
        // Cancel long-press if moved more than 10px
        onRelease();
      }
      const maxSwipe = msg.sender === "me" ? -60 : 60;
      if (msg.sender === "me" && diff < 0) {
        setSwipeX(Math.max(diff, maxSwipe));
      } else if (msg.sender !== "me" && diff > 0) {
        setSwipeX(Math.min(diff, maxSwipe));
      }
    }, [isSwiping, startX, msg.sender, isSelectMode, onRelease]);

    const handleMouseUp = useCallback(() => {
      if (Math.abs(swipeX) > 50) {
        onReply(msg);
      }
      setSwipeX(0);
      setIsSwiping(false);
    }, [swipeX, msg, onReply]);

    return (
      <div
        className={cn(
          "flex w-full group transition-all duration-150 px-2 sm:px-4 relative",
          msg.sender === "me" ? "justify-end" : "justify-start",
          isSelected && "scale-[0.98]"
        )}
        onClick={handleClick}
        onTouchStart={(e) => {
          handleTouchStart(e);
          !isSelectMode && onLongPress(msg.id, e);
        }}
        onTouchMove={handleTouchMove}
        onTouchEnd={() => {
          handleTouchEnd();
          onRelease();
        }}
        onMouseDown={(e) => {
          handleMouseDown(e);
        }}
        onMouseMove={handleMouseMove}
        onMouseUp={() => {
          handleMouseUp();
          onRelease();
        }}
        onMouseLeave={onRelease}
      >
        {msg.sender !== "me" && swipeX > 0 && (
          <div className="absolute left-4 top-1/2 -translate-y-1/2 opacity-60">
            <Reply size={20} className="text-primary" />
          </div>
        )}
        
        {isSelectMode && (
          <div
            className={cn(
              "flex items-center px-2",
              msg.sender === "me" ? "order-2" : "order-first"
            )}
          >
            <div
              className={cn(
                "w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all",
                isSelected ? "bg-primary border-primary" : "border-muted-foreground/40"
              )}
            >
              {isSelected && (
                <Check size={12} className="text-primary-foreground" />
              )}
            </div>
          </div>
        )}

        <div
          className={cn(
            "max-w-[80%] sm:max-w-[70%] md:max-w-[60%] rounded-2xl px-3 py-2 shadow-sm relative transition-all",
            msg.sender === "me"
              ? "bg-primary text-primary-foreground rounded-br-sm ml-auto"
              : "bg-card dark:bg-zinc-800 text-foreground rounded-bl-sm border border-border/50",
            isSelected && "ring-2 ring-primary ring-offset-2 ring-offset-background"
          )}
          style={{ transform: `translateX(${swipeX}px)` }}
        >
          {showMenu && (
            <div className="absolute -top-8 left-1/2 -translate-x-1/2 z-10 bg-background border border-border rounded-lg shadow-lg p-1">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(msg.id);
                  onCloseMenu();
                }}
                className="flex items-center gap-1 px-2 py-1 text-sm hover:bg-secondary rounded"
              >
                <Trash2 size={14} />
                Delete
              </button>
            </div>
          )}

          {msg.replyTo && (
            <div className={cn(
              "mb-2 px-2 py-1 rounded-lg border-l-2 text-xs",
              msg.sender === "me"
                ? "bg-primary-foreground/10 border-primary-foreground/50"
                : "bg-secondary border-primary"
            )}>
              <p className="font-medium opacity-80">
                {msg.replyTo?.sender === "me" ? "You" : "Them"}
              </p>
              <p className="opacity-70 truncate">{msg.replyTo?.text}</p>
            </div>
          )}

          {msg.type === "text" && (
            <p className="text-[14px] leading-[1.4] break-words whitespace-pre-wrap">
              {msg.text}
            </p>
          )}

          {msg.type === "image" && msg.mediaUrl && (
            <div
              className="cursor-pointer -mx-1 -mt-1"
              onClick={(e) => {
                e.stopPropagation();
                onMediaClick(msg.mediaUrl!, "image");
              }}
            >
              <img
                src={msg.mediaUrl}
                alt=""
                className="rounded-xl max-h-56 sm:max-h-72 object-cover w-full"
                loading="lazy"
              />
            </div>
          )}

          {msg.type === "video" && msg.mediaUrl && (
            <div
              className="cursor-pointer -mx-1 -mt-1"
              onClick={(e) => {
                e.stopPropagation();
                onMediaClick(msg.mediaUrl!, "video");
              }}
            >
              <video
                src={msg.mediaUrl}
                className="rounded-xl max-h-56 sm:max-h-72 w-full"
                preload="metadata"
              />
              <p className="text-xs mt-1.5 opacity-70">Tap to play</p>
            </div>
          )}

          {msg.type === "audio" && msg.mediaUrl && (
            <AudioPlayer audioUrl={msg.mediaUrl} isOwn={msg.sender === "me"} />
          )}

          <div
            className={cn(
              "flex items-center justify-end gap-1 mt-1",
              msg.sender === "me"
                ? "text-primary-foreground/70"
                : "text-muted-foreground"
            )}
          >
            <span className="text-[11px]">
              {format(new Date(msg.timestamp), "h:mm a")}
            </span>
            {msg.sender === "me" && (
              <>
                {msg.status === "sending" ? (
                  <Clock size={12} className="opacity-60" />
                ) : msg.status === "sent" ? (
                  <Check size={12} />
                ) : msg.status === "delivered" ? (
                  <CheckCheck size={12} />
                ) : msg.status === "read" ? (
                  <CheckCheck size={12} className="text-blue-400" />
                ) : (
                  <CheckCheck size={12} />
                )}
              </>
            )}
          </div>
        </div>

        {msg.sender === "me" && swipeX < 0 && (
          <div className="absolute right-4 top-1/2 -translate-y-1/2 opacity-60">
            <Reply size={20} className="text-primary" />
          </div>
        )}
      </div>
    );
  }
);

MessageItem.displayName = "MessageItem";

export function ChatLayout({ onLock, currentUser, showAdminPanel, onAdminPanelToggle }: ChatLayoutProps) {
  const { toast } = useToast();
  const [inputText, setInputText] = useState("");
  const [showProfileEditor, setShowProfileEditor] = useState(false);
  const [showSidebar, setShowSidebar] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [retentionMode, setRetentionMode] = useState<'forever' | 'after_seen' | '1h' | '24h'>('forever');
  const [showRetentionSettings, setShowRetentionSettings] = useState(false);
  const [selectedMedia, setSelectedMedia] = useState<{
    url: string;
    type: "image" | "video";
  } | null>(null);
  const [messageToDelete, setMessageToDelete] = useState<string | null>(null);
  const [longPressTimer, setLongPressTimer] =
    useState<ReturnType<typeof setTimeout> | null>(null);
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedMessages, setSelectedMessages] = useState<Set<string>>(
    new Set()
  );
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [isTextareaFocused, setIsTextareaFocused] = useState(false);
  const [showMenuFor, setShowMenuFor] = useState<string | null>(null);
  const [hasLongPressedFor, setHasLongPressedFor] = useState<string | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const {
    isRecording,
    recordingTime,
    startRecording,
    stopRecording,
    cancelRecording,
  } = useAudioRecorder();

  const {
    isConnected,
    peerConnected,
    myProfile,
    peerProfile,
    updateMyProfile,
    messages,
    sendMessage,
    deleteMessage,
    deleteMessages = (msgIds: string[]) => {
      // Fallback implementation: remove from local state only
      setMessages(prev => prev.filter(m => !msgIds.includes(m.id)));
      toast({ title: "Messages deleted locally" });
    },
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
  } = useChatConnection(currentUser);

  useEffect(() => {
    const channel = new BroadcastChannel("secure_chat_messages");
    channel.onmessage = (event) => {
      if (event.data.type === "nuke") {
        emergencyWipe();
      }
    };
    return () => channel.close();
  }, [emergencyWipe]);

  // Load current retention settings
  useEffect(() => {
    const loadRetentionSettings = async () => {
      try {
        const response = await fetch(`/api/retention/${FIXED_ROOM_ID}`);
        if (response.ok) {
          const data = await response.json();
          setRetentionMode(data.retentionMode);
        }
      } catch (error) {
        console.error('Failed to load retention settings:', error);
      }
    };
    loadRetentionSettings();
  }, []);

  const scrollToBottom = useCallback(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  useEffect(() => {
    if (isSelectMode && selectedMessages.size === 0) {
      setIsSelectMode(false);
    }
  }, [selectedMessages.size, isSelectMode]);

  // WhatsApp-like auto-resize with smooth transitions
  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const el = e.target;
      setInputText(el.value);
      handleTyping();

      // Reset height to auto to get accurate scrollHeight
      el.style.height = "auto";
      const scrollHeight = el.scrollHeight;
      const newHeight = Math.min(Math.max(scrollHeight, 24), 200);
      el.style.height = `${newHeight}px`;

      // Enable scrolling only when at max height
      el.style.overflowY = scrollHeight > 200 ? "auto" : "hidden";
    },
    [handleTyping]
  );

  const handleSendText = useCallback(
    (e?: React.FormEvent) => {
      e?.preventDefault();
      if (!inputText.trim()) return;
      sendMessage({
        text: inputText,
        type: "text",
        replyTo: replyingTo ? {
          id: replyingTo.id,
          text: replyingTo.text,
          sender: replyingTo.sender
        } : undefined
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

  const handleFileUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      if (file.size > 10 * 1024 * 1024) {
        toast({ variant: "destructive", title: "File too large (max 10MB)" });
        return;
      }

      const reader = new FileReader();
      reader.onload = (event) => {
        const result = event.target?.result as string;
        const type = file.type.startsWith("video/") ? "video" : "image";
        sendMessage({
          type,
          mediaUrl: result,
          text: type === "video" ? "🎥 Video" : "📷 Photo",
        });
      };
      reader.readAsDataURL(file);
      if (fileInputRef.current) fileInputRef.current.value = "";
    },
    [sendMessage, toast]
  );

  const handleStartRecording = useCallback(async () => {
    try {
      await startRecording();
    } catch {
      toast({ variant: "destructive", title: "Microphone access denied" });
    }
  }, [startRecording, toast]);

  const handleStopRecording = useCallback(async () => {
    const audioUrl = await stopRecording();
    if (audioUrl) {
      sendMessage({
        type: "audio",
        mediaUrl: audioUrl,
        text: `🎤 Voice (0:${recordingTime
          .toString()
          .padStart(2, "0")})`,
      });
    }
  }, [stopRecording, sendMessage, recordingTime]);

  const handleMessageLongPress = useCallback((msgId: string, event: React.MouseEvent | React.TouchEvent) => {
    const timer = setTimeout(() => {
      setShowMenuFor(msgId);
      setHasLongPressedFor(msgId);
      setIsSelectMode(true);
      setSelectedMessages(new Set([msgId]));
    }, 500);
    setLongPressTimer(timer);
  }, []);

  const handleMessageRelease = useCallback(() => {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      setLongPressTimer(null);
    }
    setShowMenuFor(null);
    setHasLongPressedFor(null);
  }, [longPressTimer]);

  const handleSelectMessage = useCallback((msgId: string) => {
    setSelectedMessages((prev) => {
      const next = new Set(prev);
      if (next.has(msgId)) {
        next.delete(msgId);
      } else {
        next.add(msgId);
      }
      return next;
    });
  }, []);

  const handleDeleteSelected = useCallback(() => {
    deleteMessages(Array.from(selectedMessages));
    toast({
      title: `${selectedMessages.size} message${
        selectedMessages.size > 1 ? "s" : ""
      } deleted`,
    });
    setSelectedMessages(new Set());
    setIsSelectMode(false);
  }, [selectedMessages, deleteMessages, toast]);

  const handleCancelSelect = useCallback(() => {
    setSelectedMessages(new Set());
    setIsSelectMode(false);
  }, []);

  const handleDeleteMessage = useCallback(() => {
    if (messageToDelete) {
      deleteMessage(messageToDelete);
      setMessageToDelete(null);
      toast({ title: "Message deleted" });
    }
  }, [messageToDelete, deleteMessage, toast]);

  const handleMediaClick = useCallback(
    (url: string, type: "image" | "video") => {
      setSelectedMedia({ url, type });
    },
    []
  );

  const getLastSeenText = useMemo(() => {
    if (peerConnected) return "Online";
    if (peerProfile.lastSeen) {
      return `Last seen ${formatDistanceToNow(peerProfile.lastSeen, {
        addSuffix: true,
      })}`;
    }
    return "Offline";
  }, [peerConnected, peerProfile.lastSeen]);

  const [tapCount, setTapCount] = useState(0);
  const handleHeaderDoubleTap = useCallback(() => {
    setTapCount((prev) => prev + 1);
    setTimeout(() => setTapCount(0), 300);
    if (tapCount === 1) {
      onLock();
    }
  }, [tapCount, onLock]);

  const messagesList = useMemo(
    () =>
      messages.map((msg) => (
        <MessageItem
          key={msg.id}
          msg={msg}
          isSelected={selectedMessages.has(msg.id)}
          isSelectMode={isSelectMode}
          onSelect={handleSelectMessage}
          onLongPress={handleMessageLongPress}
          onRelease={handleMessageRelease}
          onDelete={setMessageToDelete}
          onMediaClick={handleMediaClick}
          onReply={handleReply}
          showMenu={showMenuFor === msg.id}
          onCloseMenu={() => setShowMenuFor(null)}
        />
      )),
    [
      messages,
      selectedMessages,
      isSelectMode,
      handleSelectMessage,
      handleMessageLongPress,
      handleMessageRelease,
      handleMediaClick,
      handleReply,
      showMenuFor,
    ]
  );

  return (
    <div className="w-full h-full flex justify-center bg-background overflow-hidden">
      <div className="w-full max-w-[1400px] h-full flex">
        <div className="flex w-full h-full flex-col md:flex-row overflow-hidden">
        {/* Incoming Call Dialog */}
        <Dialog
          open={!!incomingCall}
          onOpenChange={(open) => !open && rejectCall()}
        >
          <DialogContent className="w-[90vw] max-w-md border-none bg-slate-900 text-white shadow-2xl mx-auto">
            <DialogHeader className="flex flex-col items-center gap-4">
              <Avatar className="w-20 h-20 sm:w-24 sm:h-24 border-4 border-white/10 animate-pulse">
                <AvatarImage src={peerProfile.avatar} />
                <AvatarFallback className="text-2xl">
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
                className="p-3 sm:p-4 bg-green-500 rounded-full hover:bg-green-600 animate-bounce"
              >
                <Phone size={20} className="sm:w-6 sm:h-6" />
              </button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Delete Message Dialog */}
        <Dialog
          open={!!messageToDelete}
          onOpenChange={(open) => !open && setMessageToDelete(null)}
        >
          <DialogContent className="w-[85vw] max-w-sm bg-card border-border">
            <DialogHeader>
              <DialogTitle className="text-base">Delete Message?</DialogTitle>
              <DialogDescription className="text-muted-foreground text-sm">
                This message will be deleted for you.
              </DialogDescription>
            </DialogHeader>
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => setMessageToDelete(null)}
                className="flex-1 py-2.5 bg-secondary hover:bg-secondary/80 rounded-lg text-sm transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteMessage}
                className="flex-1 py-2.5 bg-destructive hover:bg-destructive/90 text-destructive-foreground rounded-lg text-sm font-medium transition-colors"
              >
                Delete
              </button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Active Call Overlay */}
        {activeCall && (
          <ActiveCallOverlay
            localStream={localStream}
            remoteStream={remoteStream}
            isMuted={isMuted}
            isVideoOff={isVideoOff}
            onToggleMute={toggleMute}
            onToggleVideo={toggleVideo}
            onEndCall={endCall}
            callStatus={callStatus}
            peerName={peerProfile.name}
            peerAvatar={peerProfile.avatar}
          />
        )}

        {/* Media Viewer */}
        <MediaViewer
          isOpen={!!selectedMedia}
          onClose={() => setSelectedMedia(null)}
          mediaUrl={selectedMedia?.url || ""}
          mediaType={selectedMedia?.type || "image"}
        />

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

        {/* Retention Settings Modal */}
        <Dialog open={showRetentionSettings} onOpenChange={setShowRetentionSettings}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Message Retention</DialogTitle>
              <DialogDescription>
                Choose how long messages should be kept before disappearing.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Retention Mode</label>
                <select
                  value={retentionMode}
                  onChange={(e) => setRetentionMode(e.target.value as any)}
                  className="w-full px-3 py-2 border border-input bg-background rounded-md"
                >
                  <option value="forever">Off (Keep messages forever)</option>
                  <option value="after_seen">After Seen</option>
                  <option value="1h">1 Hour</option>
                  <option value="24h">24 Hours</option>
                </select>
              </div>
              <div className="text-sm text-muted-foreground">
                {retentionMode === 'forever' && 'Messages will never disappear.'}
                {retentionMode === 'after_seen' && 'Messages disappear after both users have seen them.'}
                {retentionMode === '1h' && 'Messages disappear 1 hour after being sent.'}
                {retentionMode === '24h' && 'Messages disappear 24 hours after being sent.'}
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
                    const response = await fetch(`/api/retention/${FIXED_ROOM_ID}`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ retentionMode }),
                    });
                    if (response.ok) {
                      setShowRetentionSettings(false);
                      toast({ title: "Retention setting updated" });
                    } else {
                      throw new Error('Failed to update retention setting');
                    }
                  } catch (error) {
                    console.error('Error updating retention setting:', error);
                    toast({ variant: "destructive", title: "Failed to update retention setting" });
                  }
                }}
                className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
              >
                Save
              </button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Hidden File Input */}
        <input
          type="file"
          ref={fileInputRef}
          className="hidden"
          accept="image/*,video/*"
          onChange={handleFileUpload}
        />

        {/* Mobile Sidebar Overlay */}
        {showSidebar && (
          <div
            className="fixed inset-0 bg-black/50 z-40 md:hidden backdrop-blur-sm"
            onClick={() => setShowSidebar(false)}
          />
        )}

        {/* Sidebar */}
        <div
          className={cn(
            "w-full md:w-[350px] h-full border-r border-border flex flex-col bg-background z-50 transition-transform duration-300 ease-out",
            "fixed md:relative inset-y-0 left-0",
            showSidebar ? "translate-x-0" : "-translate-x-full md:translate-x-0"
          )}
        >
          <div className="p-3 sm:p-4 border-b border-border flex justify-between items-center">
            <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
              <div
                className="flex items-center gap-2 sm:gap-3 cursor-pointer hover:opacity-80 flex-1 min-w-0 transition-opacity"
                onClick={() => {
                  setShowProfileEditor(true);
                  setShowSidebar(false);
                }}
              >
                <div className="relative shrink-0">
                  <Avatar className="h-9 w-9 sm:h-10 sm:w-10 border border-border">
                    <AvatarImage src={myProfile.avatar} />
                    <AvatarFallback
                      className={cn(
                        "text-white text-sm",
                        currentUser === "admin" ? "bg-red-500" : "bg-blue-500"
                      )}
                    >
                      {myProfile.name.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                </div>
                <div className="min-w-0">
                  <span className="font-semibold text-sm truncate block">
                    {myProfile.name}
                  </span>
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <span
                      className={cn(
                        "w-1.5 h-1.5 rounded-full shrink-0 transition-colors",
                        isConnected ? "bg-green-500" : "bg-yellow-500"
                      )}
                    />
                    <span className="truncate">
                      {isConnected ? "Connected" : "Connecting..."}
                    </span>
                  </p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {currentUser === 'admin' && (
                <button
                  onClick={() => {
                    onAdminPanelToggle();
                    setShowSidebar(false);
                  }}
                  className="p-2 hover:bg-secondary rounded-lg transition-all duration-200 ease-out hover:scale-105 active:scale-95"
                  title="Admin Panel"
                >
                  <Shield size={18} />
                </button>
              )}
              <button
                onClick={() => {
                  setShowSettings(true);
                  setShowSidebar(false);
                }}
                className="p-2 hover:bg-secondary rounded-lg transition-all duration-200 ease-out hover:scale-105 active:scale-95"
                title="Settings"
              >
                <Settings size={18} />
              </button>
              <ThemeToggle />
              <button
                onClick={() => setShowSidebar(false)}
                className="p-2 md:hidden hover:bg-secondary rounded-lg transition-all duration-200 ease-out hover:scale-105 active:scale-95"
              >
                <X size={20} />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            <div className="flex items-center gap-3 p-3 bg-secondary/50 border-l-4 border-primary">
              <Avatar className="h-11 w-11 sm:h-12 sm:w-12 shrink-0">
                <AvatarImage src={peerProfile.avatar} />
                <AvatarFallback>
                  {peerProfile.name.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-center gap-2">
                  <h3 className="font-medium text-sm truncate">
                    {peerProfile.name}
                  </h3>
                  <div
                    className={cn(
                      "w-2 h-2 rounded-full shrink-0 transition-colors",
                      peerConnected ? "bg-green-500" : "bg-gray-400"
                    )}
                  />
                </div>
                <p className="text-xs text-muted-foreground truncate">
                  {peerProfile.isTyping ? (
                    <span className="text-green-500">typing...</span>
                  ) : (
                    getLastSeenText
                  )}
                </p>
              </div>
            </div>
          </div>

          <div className="p-3 border-t border-border bg-background/50">
            <p className="text-[10px] text-muted-foreground/50 text-center">
              Double tap header to lock • Long press to select
            </p>
          </div>
        </div>

        {/* Main Chat Area */}
        <div className="flex-1 flex flex-col h-full min-h-0 bg-secondary/30 dark:bg-background">
          {/* Header */}
          <header
            className={cn(
              "h-14 sm:h-16 bg-background/95 backdrop-blur-sm border-b border-border flex items-center justify-between px-2 sm:px-4 shadow-sm z-10 flex-shrink-0 transition-colors",
              isSelectMode && "bg-primary/10"
            )}
            onClick={!isSelectMode ? handleHeaderDoubleTap : undefined}
          >
            {isSelectMode ? (
              <>
                <div className="flex items-center gap-3">
                  <button
                    onClick={handleCancelSelect}
                    className="p-2 hover:bg-secondary rounded-lg transition-colors"
                  >
                    <X size={20} />
                  </button>
                  <span className="font-medium text-sm">
                    {selectedMessages.size} selected
                  </span>
                </div>
                <button
                  onClick={handleDeleteSelected}
                  className="flex items-center gap-2 px-4 py-2 bg-destructive text-destructive-foreground rounded-lg hover:bg-destructive/90 transition-colors"
                >
                  <Trash2 size={16} />
                  <span className="text-sm font-medium">Delete</span>
                </button>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowSidebar(true);
                    }}
                    className="p-2 md:hidden hover:bg-secondary rounded-lg shrink-0 transition-all duration-200 ease-out hover:scale-105 active:scale-95"
                  >
                    <Menu size={20} />
                  </button>
                  <Avatar className="h-9 w-9 sm:h-10 sm:w-10 shrink-0">
                    <AvatarImage src={peerProfile.avatar} />
                    <AvatarFallback>
                      {peerProfile.name.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <h2 className="font-semibold text-sm truncate">
                      {peerProfile.name}
                    </h2>
                    <span
                      className={cn(
                        "text-xs truncate block transition-colors",
                        peerConnected
                          ? "text-green-600 dark:text-green-400"
                          : "text-muted-foreground"
                      )}
                    >
                      {peerProfile.isTyping ? (
                        <span className="text-green-500">typing...</span>
                      ) : (
                        getLastSeenText
                      )}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      peerConnected && startCall("voice");
                    }}
                    disabled={!peerConnected}
                    className={cn(
                      "p-2.5 rounded-full transition-colors",
                      peerConnected ? "hover:bg-secondary" : "opacity-40"
                    )}
                  >
                    <Phone size={22} className="sm:w-6 sm:h-6" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      peerConnected && startCall("video");
                    }}
                    disabled={!peerConnected}
                    className={cn(
                      "p-2.5 rounded-full transition-colors",
                      peerConnected ? "hover:bg-secondary" : "opacity-40"
                    )}
                  >
                    <Video size={22} className="sm:w-6 sm:h-6" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onLock();
                    }}
                    className="p-2.5 bg-destructive/10 text-destructive hover:bg-destructive hover:text-white rounded-full transition-colors"
                  >
                    <Lock size={22} className="sm:w-6 sm:h-6" />
                  </button>
                </div>
              </>
            )}
          </header>

          {/* Messages Area */}
          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto px-4 py-3"
            style={{ WebkitOverflowScrolling: "touch" }}
          >
            {messages.length === 0 && (
              <div className="text-center py-8">
                <div className="inline-flex items-center gap-2 text-muted-foreground px-4 py-2 text-sm">
                  Start a conversation with {peerProfile.name}
                </div>
              </div>
            )}

            {messagesList}

            {peerProfile.isTyping && (
              <div className="flex justify-start px-4">
                <div className="bg-card dark:bg-zinc-800 rounded-2xl px-4 py-3 shadow-sm border border-border/50">
                  <div className="flex gap-1">
                    <span
                      className="w-2 h-2 bg-muted-foreground/60 rounded-full animate-bounce"
                      style={{ animationDelay: "0ms" }}
                    />
                    <span
                      className="w-2 h-2 bg-muted-foreground/60 rounded-full animate-bounce"
                      style={{ animationDelay: "150ms" }}
                    />
                    <span
                      className="w-2 h-2 bg-muted-foreground/60 rounded-full animate-bounce"
                      style={{ animationDelay: "300ms" }}
                    />
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} className="h-1" />
          </div>

          {/* Input Area */}
          <div className="bg-background border-t border-border shrink-0 safe-area-bottom">
            {replyingTo && (
              <div className="px-3 pt-2">
                <div className="flex items-center gap-2 px-3 py-2 bg-secondary/50 rounded-xl border-l-2 border-primary">
                  <Reply size={16} className="text-primary shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-primary">
                      Reply to {replyingTo.sender === "me" ? "yourself" : peerProfile.name}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">{replyingTo.text}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setReplyingTo(null)}
                    className="p-1 hover:bg-secondary rounded-full"
                  >
                    <X size={14} />
                  </button>
                </div>
              </div>
            )}
            <div className="px-2 sm:px-3 py-2 sm:py-3">
              <form onSubmit={handleSendText}>
                <div
                  className="
                    flex items-end gap-1.5 sm:gap-2
                    rounded-3xl bg-secondary/70 dark:bg-zinc-800
                    px-2 sm:px-3 py-1.5
                  "
                >
                  {/* Left icons */}
                  {!isRecording && (
                    <>
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={!isConnected}
                        className="p-1.5 sm:p-2 text-muted-foreground hover:bg-secondary rounded-full disabled:opacity-40 transition-colors shrink-0 mb-0.5"
                      >
                        <Paperclip size={18} />
                      </button>

                      <Popover>
                        <PopoverTrigger asChild>
                          <button
                            type="button"
                            className="p-1.5 sm:p-2 text-muted-foreground hover:bg-secondary rounded-full transition-colors shrink-0 mb-0.5"
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

                  {/* Middle: textarea / recording */}
                  <div className="flex-1 flex items-end min-h-9 sm:min-h-10">
                    {isRecording ? (
                      <div className="flex items-center gap-2 w-full py-1">
                        <div className="w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse" />
                        <span className="text-red-500 text-sm font-mono flex-1">
                          Recording {Math.floor(recordingTime / 60)}:
                          {(recordingTime % 60)
                            .toString()
                            .padStart(2, "0")}
                        </span>
                        <button
                          type="button"
                          onClick={cancelRecording}
                          className="p-1.5 hover:bg-red-500/20 rounded-full transition-colors"
                        >
                          <X size={18} className="text-red-500" />
                        </button>
                      </div>
                    ) : (
                  <textarea
                        ref={textareaRef}
                        value={inputText}
                        onChange={handleInputChange}
                        onKeyDown={handleKeyDown}
                        placeholder={
                          isConnected ? "Message..." : "Connecting..."
                        }
                        disabled={!isConnected}
                        rows={1}
                        className={cn(
                          "flex-1 bg-transparent border-none outline-none",
                          "text-[15px] leading-[1.4] disabled:opacity-50",
                          "w-full resize-none overflow-y-auto overflow-x-hidden",
                          "placeholder:text-muted-foreground/60",
                          "text-foreground break-words whitespace-pre-wrap",
                          "py-1.5 transition-all duration-200 ease-in-out",
                          "focus:outline-none focus:ring-0",
                          "max-h-[150px]"
                        )}
                        style={{
                          height: "auto",
                          minHeight: "24px",
                        }}
                        onFocus={() => setIsTextareaFocused(true)}
                        onBlur={() => setIsTextareaFocused(false)}
                      />
                    )}
                  </div>

                  {/* Right: send / mic / stop */}
                  {isRecording ? (
                    <button
                      type="button"
                      onClick={handleStopRecording}
                      className="p-2 sm:p-2.5 rounded-full bg-red-500 flex-shrink-0 hover:bg-red-600 transition-colors"
                    >
                      <Square
                        size={18}
                        className="text-white"
                        fill="white"
                      />
                    </button>
                  ) : inputText.trim() ? (
                    <button
                      type="submit"
                      disabled={!isConnected}
                      className="p-2 sm:p-2.5 rounded-full bg-primary disabled:opacity-40 flex-shrink-0 hover:bg-primary/90 transition-colors"
                    >
                      <Send size={18} className="text-white" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleStartRecording}
                      disabled={!isConnected}
                      className="p-2 sm:p-2.5 text-muted-foreground hover:bg-secondary rounded-full disabled:opacity-40 flex-shrink-0 transition-colors"
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
    </div>
  );
}
