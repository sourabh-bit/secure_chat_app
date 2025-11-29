import { useState, useEffect, useRef } from "react";
import { Send, Paperclip, Mic, Video, Phone, Lock, Check, CheckCheck, UserPlus, Copy, Smile, PhoneOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useWebRTC } from "@/hooks/use-webrtc";
import { ActiveCallOverlay } from "./ActiveCallOverlay";

interface ChatLayoutProps {
  onLock: () => void;
  currentUser: 'admin' | 'friend';
}

interface Message {
  id: string;
  text: string;
  sender: 'me' | 'them';
  timestamp: Date;
  status: 'sent' | 'delivered' | 'seen';
  type: 'text' | 'image' | 'video' | 'audio';
  mediaUrl?: string;
}

export function ChatLayout({ onLock, currentUser }: ChatLayoutProps) {
  const { toast } = useToast();
  const [messages, setMessages] = useState<Message[]>([
    { id: '1', text: "Hey, is the new deployment ready?", sender: 'them', timestamp: new Date(Date.now() - 1000 * 60 * 60), status: 'seen', type: 'text' },
    { id: '2', text: "Yes, I just pushed the changes to the staging environment.", sender: 'me', timestamp: new Date(Date.now() - 1000 * 60 * 59), status: 'seen', type: 'text' },
    { id: '3', text: "Great. Let's review the logs.", sender: 'them', timestamp: new Date(Date.now() - 1000 * 60 * 55), status: 'seen', type: 'text' },
  ]);
  const [inputText, setInputText] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);

  // WebRTC Hook
  const {
    startCall,
    acceptCall,
    rejectCall,
    endCall,
    toggleMute,
    toggleVideo,
    activeCall,
    incomingCall,
    localStream,
    remoteStream,
    isMuted,
    isVideoOff
  } = useWebRTC();

  const scrollRef = useRef<HTMLDivElement>(null);
  const channelRef = useRef<BroadcastChannel | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recordingInterval = useRef<NodeJS.Timeout>(null);

  // Setup BroadcastChannel for Chat Messages (Separate from WebRTC Signaling)
  useEffect(() => {
    channelRef.current = new BroadcastChannel('secure_chat_messages');
    channelRef.current.onmessage = (event) => {
      const data = event.data;
      if (data.type === 'message') {
        setMessages(prev => [...prev, { ...data.payload, sender: 'them', status: 'seen' }]);
      } else if (data.type === 'nuke') {
        setMessages([]);
        toast({ title: "Chat Cleared", description: "All messages have been wiped by admin." });
      }
    };
    return () => channelRef.current?.close();
  }, [toast]);

  // Check for expiry (Mocked logic)
  useEffect(() => {
    const expiryMode = localStorage.getItem('message_expiry') || '24h';
    const now = Date.now();
    
    let expiryMs = 24 * 60 * 60 * 1000; // 24h default
    if (expiryMode === '1h') expiryMs = 60 * 60 * 1000;
    if (expiryMode === 'view') expiryMs = 0; // Immediate (handled differently usually, but lets say 10s for demo)

    if (expiryMode === 'view') {
       // logic for delete after view would go here (e.g. delete once seen status set)
    } else {
       const filtered = messages.filter(m => (now - new Date(m.timestamp).getTime()) < expiryMs);
       if (filtered.length !== messages.length) {
         setMessages(filtered);
       }
    }
  }, [messages]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isRecording]);

  const sendMessage = (msg: Partial<Message>) => {
    const newMsg: Message = {
      id: Date.now().toString(),
      text: "",
      sender: 'me',
      timestamp: new Date(),
      status: 'sent',
      type: 'text',
      ...msg
    };
    
    setMessages(prev => [...prev, newMsg]);
    channelRef.current?.postMessage({ type: 'message', payload: newMsg });

    setTimeout(() => {
      setMessages(prev => prev.map(m => m.id === newMsg.id ? { ...m, status: 'delivered' } : m));
    }, 500);
    
    setTimeout(() => {
      setMessages(prev => prev.map(m => m.id === newMsg.id ? { ...m, status: 'seen' } : m));
    }, 1000);
  };

  const handleSendText = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!inputText.trim()) return;
    sendMessage({ text: inputText, type: 'text' });
    setInputText("");
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      const type = file.type.startsWith('video/') ? 'video' : 'image';
      sendMessage({ 
        type: type, 
        mediaUrl: result,
        text: type === 'video' ? '🎥 Video' : '📷 Image'
      });
    };
    reader.readAsDataURL(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const toggleRecording = () => {
    if (isRecording) {
      clearInterval(recordingInterval.current!);
      setIsRecording(false);
      setRecordingTime(0);
      sendMessage({ type: 'audio', text: '🎤 Voice Message (0:05)' });
    } else {
      setIsRecording(true);
      recordingInterval.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    }
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    toast({ title: "Link Copied", description: "Share this link securely with your contact." });
  };

  const addEmoji = (emoji: string) => {
    setInputText(prev => prev + emoji);
  };

  return (
    <div className="flex h-screen w-full bg-background text-foreground mode-chat font-sans overflow-hidden relative">
      
      {/* Incoming Call Dialog */}
      <Dialog open={!!incomingCall} onOpenChange={(open) => !open && rejectCall()}>
        <DialogContent className="sm:max-w-md border-none bg-slate-900 text-white shadow-2xl">
          <DialogHeader className="flex flex-col items-center gap-4">
            <Avatar className="w-24 h-24 border-4 border-white/10 shadow-xl animate-pulse">
              <AvatarImage src="https://github.com/shadcn.png" />
              <AvatarFallback>JD</AvatarFallback>
            </Avatar>
            <DialogTitle className="text-2xl font-light">
              Incoming {incomingCall === 'video' ? 'Video' : 'Voice'} Call
            </DialogTitle>
            <DialogDescription className="text-white/60">
              Secure call from {currentUser === 'admin' ? 'Friend' : 'Admin'}...
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center justify-center gap-8 mt-6">
             <button 
               onClick={rejectCall}
               className="p-4 bg-red-500 rounded-full hover:bg-red-600 transition-all shadow-lg shadow-red-500/20"
             >
               <PhoneOff size={24} />
             </button>
             <button 
               onClick={acceptCall}
               className="p-4 bg-green-500 rounded-full hover:bg-green-600 transition-all shadow-lg shadow-green-500/20 animate-bounce"
             >
               <Phone size={24} />
             </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Active Call Overlay (Real WebRTC) */}
      {activeCall && (
        <ActiveCallOverlay 
          localStream={localStream}
          remoteStream={remoteStream}
          isMuted={isMuted}
          isVideoOff={isVideoOff}
          onToggleMute={toggleMute}
          onToggleVideo={toggleVideo}
          onEndCall={endCall}
        />
      )}

      {/* Hidden File Input */}
      <input 
        type="file" 
        ref={fileInputRef} 
        className="hidden" 
        accept="image/*,video/*" 
        onChange={handleFileUpload}
      />

      {/* Contact List (Sidebar) */}
      <div className="w-80 border-r border-border hidden md:flex flex-col bg-secondary/30">
        <div className="p-4 border-b border-border flex justify-between items-center">
          <div className="flex items-center gap-3">
            <Avatar className="h-10 w-10 border border-border">
              <AvatarFallback className="bg-primary text-primary-foreground">ME</AvatarFallback>
            </Avatar>
            <span className="font-semibold text-sm">{currentUser === 'admin' ? 'Admin' : 'Friend'}</span>
          </div>
          <button onClick={handleCopyLink} className="p-2 hover:bg-background rounded-full text-muted-foreground hover:text-primary transition-colors">
            <UserPlus size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
           <div className="flex items-center gap-3 p-3 bg-background border-l-4 border-primary shadow-sm cursor-pointer hover:bg-background/80">
            <Avatar className="h-12 w-12">
              <AvatarImage src="https://github.com/shadcn.png" />
              <AvatarFallback>JD</AvatarFallback>
            </Avatar>
            <div className="flex-1 overflow-hidden">
              <div className="flex justify-between items-baseline">
                <h3 className="font-medium text-sm truncate">
                   {currentUser === 'admin' ? 'Friend' : 'Admin'}
                </h3>
                <span className="text-[10px] text-muted-foreground">Online</span>
              </div>
              <p className="text-xs text-muted-foreground truncate">Tap to chat</p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col h-full bg-[#efeae2] dark:bg-background relative">
        <header className="h-16 bg-background/95 backdrop-blur-sm border-b border-border flex items-center justify-between px-4 shadow-sm z-10">
          <div className="flex items-center gap-3">
            <Avatar className="h-10 w-10 cursor-pointer">
               <AvatarImage src="https://github.com/shadcn.png" />
               <AvatarFallback>JD</AvatarFallback>
            </Avatar>
            <div className="flex flex-col">
              <h2 className="font-semibold text-sm">{currentUser === 'admin' ? 'Friend' : 'Friend'}</h2>
              <span className="text-xs text-green-600 dark:text-green-400">Online</span>
            </div>
          </div>
          
          <div className="flex items-center gap-2 text-muted-foreground">
            <button onClick={() => startCall('voice')} className="p-2 hover:bg-secondary rounded-full transition-colors"><Phone size={20} /></button>
            <button onClick={() => startCall('video')} className="p-2 hover:bg-secondary rounded-full transition-colors"><Video size={20} /></button>
            <div className="w-px h-6 bg-border mx-1" />
            <button onClick={onLock} className="p-2 bg-destructive/10 text-destructive hover:bg-destructive hover:text-destructive-foreground rounded-full transition-all"><Lock size={20} /></button>
          </div>
        </header>

        {/* Messages Area */}
        <div 
          ref={scrollRef}
          className="flex-1 overflow-y-auto p-4 space-y-4 bg-[url('https://site-assets.fontawesome.com/releases/v6.5.1/svgs/solid/shield-halved.svg')] bg-fixed bg-center bg-no-repeat bg-[length:200px] bg-blend-overlay opacity-100"
          style={{ backgroundImage: 'radial-gradient(#00000008 1px, transparent 1px)', backgroundSize: '20px 20px' }}
        >
          {messages.map((msg) => (
            <div key={msg.id} className={cn("flex w-full", msg.sender === 'me' ? "justify-end" : "justify-start")}>
              <div className={cn(
                "max-w-[80%] md:max-w-[60%] rounded-lg p-3 shadow-sm relative group",
                msg.sender === 'me' ? "bg-primary text-primary-foreground rounded-tr-none" : "bg-white dark:bg-secondary text-foreground rounded-tl-none"
              )}>
                {msg.type === 'text' && <p className="text-sm leading-relaxed break-words">{msg.text}</p>}
                {msg.type === 'image' && <img src={msg.mediaUrl} alt="Shared" className="rounded-md max-h-64 object-cover w-full mb-1" />}
                {msg.type === 'video' && <video src={msg.mediaUrl} controls className="rounded-md max-h-64 w-full mb-1" />}
                {msg.type === 'audio' && (
                   <div className="flex items-center gap-2 min-w-[150px]">
                     <div className="p-2 bg-background/20 rounded-full"><div className="w-0 h-0 border-t-[6px] border-t-transparent border-l-[10px] border-l-current border-b-[6px] border-b-transparent ml-0.5"></div></div>
                     <span className="text-xs font-mono opacity-80">Voice Message</span>
                   </div>
                )}
                <div className={cn("flex items-center justify-end gap-1 mt-1", msg.sender === 'me' ? "text-primary-foreground/70" : "text-muted-foreground/70")}>
                  <span className="text-[10px]">{format(msg.timestamp, 'h:mm a')}</span>
                  {msg.sender === 'me' && <span className="ml-0.5"><CheckCheck size={12} /></span>}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Input Area */}
        <div className="bg-background p-3 md:p-4 border-t border-border z-20">
          <form onSubmit={handleSendText} className="flex items-end gap-2 max-w-4xl mx-auto w-full">
            <div className="flex gap-1">
               <button type="button" onClick={() => fileInputRef.current?.click()} className="p-3 text-muted-foreground hover:bg-secondary rounded-full"><Paperclip size={20} /></button>
               <Popover>
                 <PopoverTrigger asChild><button type="button" className="p-3 text-muted-foreground hover:bg-secondary rounded-full"><Smile size={20} /></button></PopoverTrigger>
                 <PopoverContent className="w-64 p-2"><div className="grid grid-cols-6 gap-1">{["😀","😂","😍","👍","🎉","🔥"].map(emoji => <button key={emoji} type="button" onClick={() => addEmoji(emoji)} className="p-2 hover:bg-secondary rounded">{emoji}</button>)}</div></PopoverContent>
               </Popover>
            </div>
            <div className="flex-1 bg-secondary/50 rounded-2xl border border-transparent focus-within:border-primary/30 focus-within:bg-background transition-all flex items-center px-4 py-2 min-h-[46px]">
              {isRecording ? <span className="text-destructive animate-pulse">Recording... {recordingTime}s</span> : <input type="text" value={inputText} onChange={(e) => setInputText(e.target.value)} placeholder="Type a message..." className="flex-1 bg-transparent border-none outline-none text-sm" />}
            </div>
            {inputText.trim() || isRecording ? <button type={isRecording ? "button" : "submit"} onClick={isRecording ? toggleRecording : undefined} className={cn("p-3 rounded-full", isRecording ? "bg-destructive" : "bg-primary")}><Send size={18} className="text-white" /></button> : <button type="button" onClick={toggleRecording} className="p-3 text-muted-foreground hover:bg-secondary rounded-full"><Mic size={20} /></button>}
          </form>
        </div>
      </div>
    </div>
  );
}
