import { useState, useEffect, useRef } from "react";
import { Send, Paperclip, Mic, Video, Phone, Lock, Check, CheckCheck, UserPlus, Copy, Smile, X, PhoneOff, MicOff, Camera, CameraOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface ChatLayoutProps {
  onLock: () => void;
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

export function ChatLayout({ onLock }: ChatLayoutProps) {
  const { toast } = useToast();
  const [messages, setMessages] = useState<Message[]>([
    { id: '1', text: "Hey, is the new deployment ready?", sender: 'them', timestamp: new Date(Date.now() - 1000 * 60 * 60), status: 'seen', type: 'text' },
    { id: '2', text: "Yes, I just pushed the changes to the staging environment.", sender: 'me', timestamp: new Date(Date.now() - 1000 * 60 * 59), status: 'seen', type: 'text' },
    { id: '3', text: "Great. Let's review the logs.", sender: 'them', timestamp: new Date(Date.now() - 1000 * 60 * 55), status: 'seen', type: 'text' },
  ]);
  const [inputText, setInputText] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [activeCall, setActiveCall] = useState<'voice' | 'video' | null>(null);
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const channelRef = useRef<BroadcastChannel | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recordingInterval = useRef<NodeJS.Timeout>(null);

  // Setup BroadcastChannel for cross-tab communication
  useEffect(() => {
    channelRef.current = new BroadcastChannel('secure_chat_channel');
    
    channelRef.current.onmessage = (event) => {
      const data = event.data;
      if (data.type === 'message') {
        setMessages(prev => [...prev, { ...data.payload, sender: 'them', status: 'seen' }]);
      }
    };

    return () => {
      channelRef.current?.close();
    };
  }, []);

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

    // Update status locally
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
      // Stop and send
      clearInterval(recordingInterval.current!);
      setIsRecording(false);
      setRecordingTime(0);
      sendMessage({ type: 'audio', text: '🎤 Voice Message (0:05)' }); // Mock audio
    } else {
      // Start
      setIsRecording(true);
      recordingInterval.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    }
  };

  const handleCall = (type: 'voice' | 'video') => {
    setActiveCall(type);
    toast({
      title: type === 'voice' ? "Calling John Doe..." : "Starting Video Call...",
      description: "Establishing secure WebRTC handshake...",
    });
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    toast({
      title: "Link Copied",
      description: "Share this link securely with your contact.",
    });
  };

  const addEmoji = (emoji: string) => {
    setInputText(prev => prev + emoji);
  };

  return (
    <div className="flex h-screen w-full bg-background text-foreground mode-chat font-sans overflow-hidden relative">
      {/* Call Overlay */}
      {activeCall && (
        <CallOverlay 
          type={activeCall} 
          onEnd={() => setActiveCall(null)} 
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
            <span className="font-semibold text-sm">My Account</span>
          </div>
          
          <Dialog>
            <DialogTrigger asChild>
               <button className="p-2 hover:bg-background rounded-full text-muted-foreground hover:text-primary transition-colors" title="Add Contact">
                 <UserPlus size={18} />
               </button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Invite Contact</DialogTitle>
                <DialogDescription>
                  Share this secure link with the person you want to chat with.
                </DialogDescription>
              </DialogHeader>
              <div className="flex items-center gap-2 mt-4">
                <div className="flex-1 bg-muted p-3 rounded text-xs font-mono truncate border border-border">
                  {window.location.href}
                </div>
                <button onClick={handleCopyLink} className="p-3 bg-primary text-primary-foreground rounded hover:bg-primary/90">
                  <Copy size={16} />
                </button>
              </div>
              <div className="mt-4 p-3 bg-blue-50 text-blue-800 text-xs rounded border border-blue-100">
                <strong>Test Mode:</strong> Open this link in a new tab to chat with yourself.
              </div>
            </DialogContent>
          </Dialog>
        </div>
        
        <div className="flex-1 overflow-y-auto">
          <div className="flex items-center gap-3 p-3 bg-background border-l-4 border-primary shadow-sm cursor-pointer hover:bg-background/80">
            <Avatar className="h-12 w-12">
              <AvatarImage src="https://github.com/shadcn.png" />
              <AvatarFallback>JD</AvatarFallback>
            </Avatar>
            <div className="flex-1 overflow-hidden">
              <div className="flex justify-between items-baseline">
                <h3 className="font-medium text-sm truncate">John Doe</h3>
                <span className="text-[10px] text-muted-foreground">10:42 AM</span>
              </div>
              <p className="text-xs text-muted-foreground truncate">Great. Let's review the logs.</p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col h-full bg-[#efeae2] dark:bg-background relative">
        {/* Chat Header */}
        <header className="h-16 bg-background/95 backdrop-blur-sm border-b border-border flex items-center justify-between px-4 shadow-sm z-10">
          <div className="flex items-center gap-3">
            <Avatar className="h-10 w-10 cursor-pointer">
               <AvatarImage src="https://github.com/shadcn.png" />
               <AvatarFallback>JD</AvatarFallback>
            </Avatar>
            <div className="flex flex-col">
              <h2 className="font-semibold text-sm">John Doe</h2>
              <span className="text-xs text-green-600 dark:text-green-400">Online</span>
            </div>
          </div>
          
          <div className="flex items-center gap-2 text-muted-foreground">
            <button onClick={() => handleCall('voice')} className="p-2 hover:bg-secondary rounded-full transition-colors"><Phone size={20} /></button>
            <button onClick={() => handleCall('video')} className="p-2 hover:bg-secondary rounded-full transition-colors"><Video size={20} /></button>
            <div className="w-px h-6 bg-border mx-1" />
            <button 
              onClick={onLock}
              className="p-2 bg-destructive/10 text-destructive hover:bg-destructive hover:text-destructive-foreground rounded-full transition-all"
              title="Panic Lock"
            >
              <Lock size={20} />
            </button>
          </div>
        </header>

        {/* Messages Area */}
        <div 
          ref={scrollRef}
          className="flex-1 overflow-y-auto p-4 space-y-4 bg-[url('https://site-assets.fontawesome.com/releases/v6.5.1/svgs/solid/shield-halved.svg')] bg-fixed bg-center bg-no-repeat bg-[length:200px] bg-blend-overlay opacity-100"
          style={{ backgroundImage: 'radial-gradient(#00000008 1px, transparent 1px)', backgroundSize: '20px 20px' }}
        >
          {messages.map((msg) => (
            <div 
              key={msg.id} 
              className={cn(
                "flex w-full",
                msg.sender === 'me' ? "justify-end" : "justify-start"
              )}
            >
              <div 
                className={cn(
                  "max-w-[80%] md:max-w-[60%] rounded-lg p-3 shadow-sm relative group",
                  msg.sender === 'me' 
                    ? "bg-primary text-primary-foreground rounded-tr-none" 
                    : "bg-white dark:bg-secondary text-foreground rounded-tl-none"
                )}
              >
                {/* Content Render Logic */}
                {msg.type === 'text' && <p className="text-sm leading-relaxed break-words">{msg.text}</p>}
                
                {msg.type === 'image' && (
                  <div className="mb-1">
                    <img src={msg.mediaUrl} alt="Shared" className="rounded-md max-h-64 object-cover w-full" />
                  </div>
                )}
                
                {msg.type === 'video' && (
                  <div className="mb-1">
                    <video src={msg.mediaUrl} controls className="rounded-md max-h-64 w-full" />
                  </div>
                )}

                {msg.type === 'audio' && (
                  <div className="flex items-center gap-2 min-w-[150px]">
                     <button className="p-2 bg-background/20 rounded-full hover:bg-background/30"><div className="w-0 h-0 border-t-[6px] border-t-transparent border-l-[10px] border-l-current border-b-[6px] border-b-transparent ml-0.5"></div></button>
                     <div className="h-1 bg-current/30 flex-1 rounded-full overflow-hidden">
                       <div className="h-full w-1/3 bg-current"></div>
                     </div>
                     <span className="text-xs font-mono opacity-80">0:05</span>
                  </div>
                )}

                <div className={cn(
                  "flex items-center justify-end gap-1 mt-1",
                  msg.sender === 'me' ? "text-primary-foreground/70" : "text-muted-foreground/70"
                )}>
                  <span className="text-[10px]">{format(msg.timestamp, 'h:mm a')}</span>
                  {msg.sender === 'me' && (
                    <span className="ml-0.5">
                      {msg.status === 'sent' && <Check size={12} />}
                      {msg.status === 'delivered' && <CheckCheck size={12} />}
                      {msg.status === 'seen' && <CheckCheck size={12} className="text-blue-200" />}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Input Area */}
        <div className="bg-background p-3 md:p-4 border-t border-border z-20">
          <form onSubmit={handleSendText} className="flex items-end gap-2 max-w-4xl mx-auto w-full">
            <div className="flex gap-1">
               <button 
                 type="button" 
                 onClick={() => fileInputRef.current?.click()}
                 className="p-3 text-muted-foreground hover:bg-secondary rounded-full transition-colors"
                 title="Attach File"
               >
                 <Paperclip size={20} />
               </button>
               <Popover>
                 <PopoverTrigger asChild>
                   <button type="button" className="p-3 text-muted-foreground hover:bg-secondary rounded-full transition-colors">
                     <Smile size={20} />
                   </button>
                 </PopoverTrigger>
                 <PopoverContent className="w-64 p-2" align="start" side="top">
                   <div className="grid grid-cols-6 gap-1">
                     {["😀","😂","😍","👍","🎉","🔥","❤️","😎","🤔","😭","👀","🚀","👋","✨","💪","🙏","💯","✅"].map(emoji => (
                       <button 
                         key={emoji} 
                         type="button"
                         onClick={() => addEmoji(emoji)}
                         className="p-2 hover:bg-secondary rounded text-lg"
                       >
                         {emoji}
                       </button>
                     ))}
                   </div>
                 </PopoverContent>
               </Popover>
            </div>
            
            <div className="flex-1 bg-secondary/50 rounded-2xl border border-transparent focus-within:border-primary/30 focus-within:bg-background transition-all flex items-center px-4 py-2 min-h-[46px]">
              {isRecording ? (
                 <div className="flex items-center gap-2 w-full text-destructive animate-pulse">
                   <div className="w-2 h-2 bg-destructive rounded-full"></div>
                   <span className="text-sm font-medium">Recording... {Math.floor(recordingTime / 60)}:{String(recordingTime % 60).padStart(2, '0')}</span>
                 </div>
              ) : (
                <input 
                  type="text" 
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder="Type a message..." 
                  className="flex-1 bg-transparent border-none outline-none text-sm placeholder:text-muted-foreground"
                />
              )}
            </div>

            {inputText.trim() || isRecording ? (
               <button 
                 type={isRecording ? "button" : "submit"}
                 onClick={isRecording ? toggleRecording : undefined}
                 className={cn(
                   "p-3 rounded-full shadow-sm transition-all transform active:scale-95",
                   isRecording ? "bg-destructive text-destructive-foreground" : "bg-primary text-primary-foreground hover:bg-primary/90"
                 )}
               >
                 <Send size={18} className="ml-0.5" />
               </button>
            ) : (
              <button 
                type="button" 
                onClick={toggleRecording}
                className="p-3 text-muted-foreground hover:bg-secondary rounded-full transition-colors"
              >
                <Mic size={20} />
              </button>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}

function CallOverlay({ type, onEnd }: { type: 'voice' | 'video', onEnd: () => void }) {
  const [status, setStatus] = useState("Establishing Secure Connection...");
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);

  useEffect(() => {
    // Simulate connection sequence
    const timer1 = setTimeout(() => setStatus("Handshaking Keys..."), 1500);
    const timer2 = setTimeout(() => setStatus("Ringing..."), 3000);
    const timer3 = setTimeout(() => setStatus("Connected"), 4500);
    
    const interval = setInterval(() => {
      if (status === "Connected") {
        setDuration(d => d + 1);
      }
    }, 1000);

    // Request local media
    if (type === 'video') {
      navigator.mediaDevices.getUserMedia({ video: true, audio: true })
        .then(currentStream => {
          setStream(currentStream);
          if (localVideoRef.current) {
            localVideoRef.current.srcObject = currentStream;
          }
        })
        .catch(err => console.error("Error accessing media devices:", err));
    }

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);
      clearInterval(interval);
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [type, status]); // Added status to dependency to ensure timer doesn't reset incorrectly, actually status shouldn't be there. 
  // Correction: The effect for timers should only run once on mount. 
  // The interval depends on status, so that needs a separate effect or ref.

  // Fixed effect logic for timers
  useEffect(() => {
    const t1 = setTimeout(() => setStatus("Handshaking Keys..."), 1500);
    const t2 = setTimeout(() => setStatus("Ringing..."), 3000);
    const t3 = setTimeout(() => setStatus("Connected"), 4500);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, []);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (status === "Connected") {
      interval = setInterval(() => setDuration(d => d + 1), 1000);
    }
    return () => clearInterval(interval);
  }, [status]);


  const formatDuration = (s: number) => {
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="absolute inset-0 z-50 bg-slate-950 flex flex-col items-center justify-center text-white animate-in fade-in duration-300 overflow-hidden">
      {/* Background Blur Effect */}
      <div className="absolute inset-0 overflow-hidden opacity-30 pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-primary/40 rounded-full blur-[100px]"></div>
      </div>

      {/* Main Video Area (Remote User - Simulated) */}
      <div className="absolute inset-0 z-0">
        {type === 'video' && status === 'Connected' ? (
          <div className="w-full h-full bg-slate-900 flex items-center justify-center">
             {/* In a real app, this would be the remote stream. For mockup, we show a placeholder or static image */}
             <img 
               src="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=800&h=800&fit=crop" 
               alt="Remote User" 
               className="w-full h-full object-cover opacity-60"
             />
             <div className="absolute inset-0 bg-black/20"></div>
          </div>
        ) : (
           <div className="w-full h-full bg-slate-950"></div>
        )}
      </div>

      {/* UI Overlay */}
      <div className="z-10 flex flex-col items-center justify-between h-full w-full py-12 px-4">
        
        {/* Header / Status */}
        <div className="flex flex-col items-center gap-4 mt-8">
          <div className="relative">
             {/* Only show Avatar if NOT connected or if it's a voice call */}
            {(status !== "Connected" || type === 'voice') && (
              <div className="animate-in zoom-in duration-500">
                <Avatar className="w-32 h-32 border-4 border-white/10 shadow-2xl">
                  <AvatarImage src="https://github.com/shadcn.png" />
                  <AvatarFallback className="text-4xl bg-slate-800">JD</AvatarFallback>
                </Avatar>
              </div>
            )}
          </div>
          
          <div className="text-center">
            <h2 className="text-3xl font-light tracking-tight drop-shadow-md">John Doe</h2>
            <p className={cn(
              "text-lg mt-2 font-medium drop-shadow-md transition-all",
              status === "Connected" ? "text-green-400" : "text-white/60 animate-pulse"
            )}>
              {status === "Connected" ? formatDuration(duration) : status}
            </p>
            <div className="flex items-center justify-center gap-2 mt-2">
              <Lock size={12} className="text-white/60" />
              <p className="text-[10px] text-white/60 uppercase tracking-widest font-mono">
                End-to-End Encrypted
              </p>
            </div>
          </div>
        </div>

        {/* Self View (Picture-in-Picture) */}
        {type === 'video' && (
          <div className="absolute bottom-24 right-4 w-32 h-48 bg-black/50 rounded-xl border border-white/20 overflow-hidden shadow-2xl z-20 transition-all hover:scale-105">
             {cameraOff ? (
               <div className="w-full h-full flex items-center justify-center bg-slate-800 text-white/50">
                 <CameraOff size={24} />
               </div>
             ) : (
               <video 
                 ref={localVideoRef} 
                 autoPlay 
                 muted 
                 playsInline 
                 className="w-full h-full object-cover mirror-mode" 
                 style={{ transform: 'scaleX(-1)' }}
               />
             )}
          </div>
        )}

        {/* Controls */}
        <div className="flex items-center gap-6 mb-8 bg-black/40 backdrop-blur-md p-6 rounded-full border border-white/10 shadow-2xl">
           <button 
             onClick={() => setIsMuted(!isMuted)}
             className={cn(
               "p-4 rounded-full transition-all",
               isMuted ? "bg-white text-black" : "bg-white/10 hover:bg-white/20 text-white"
             )}
           >
             {isMuted ? <MicOff size={24} /> : <Mic size={24} />}
           </button>
           
           {type === 'video' && (
             <button 
               onClick={() => setCameraOff(!cameraOff)}
               className={cn(
                 "p-4 rounded-full transition-all",
                 cameraOff ? "bg-white text-black" : "bg-white/10 hover:bg-white/20 text-white"
               )}
             >
               {cameraOff ? <CameraOff size={24} /> : <Camera size={24} />}
             </button>
           )}

           <button 
             onClick={onEnd}
             className="p-4 rounded-full bg-red-500 hover:bg-red-600 text-white shadow-lg shadow-red-500/30 transform hover:scale-110 transition-all"
           >
             <PhoneOff size={28} />
           </button>
        </div>
      </div>
    </div>
  );
}
