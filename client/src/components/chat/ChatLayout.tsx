import { useState, useEffect, useRef } from "react";
import { Send, Paperclip, Mic, Video, Phone, Lock, MoreVertical, Check, CheckCheck, UserPlus, Copy } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface ChatLayoutProps {
  onLock: () => void;
}

interface Message {
  id: string;
  text: string;
  sender: 'me' | 'them';
  timestamp: Date;
  status: 'sent' | 'delivered' | 'seen';
  type: 'text' | 'image' | 'file';
}

export function ChatLayout({ onLock }: ChatLayoutProps) {
  const { toast } = useToast();
  const [messages, setMessages] = useState<Message[]>([
    { id: '1', text: "Hey, is the new deployment ready?", sender: 'them', timestamp: new Date(Date.now() - 1000 * 60 * 60), status: 'seen', type: 'text' },
    { id: '2', text: "Yes, I just pushed the changes to the staging environment.", sender: 'me', timestamp: new Date(Date.now() - 1000 * 60 * 59), status: 'seen', type: 'text' },
    { id: '3', text: "Great. Let's review the logs.", sender: 'them', timestamp: new Date(Date.now() - 1000 * 60 * 55), status: 'seen', type: 'text' },
  ]);
  const [inputText, setInputText] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!inputText.trim()) return;
    
    const newMsg: Message = {
      id: Date.now().toString(),
      text: inputText,
      sender: 'me',
      timestamp: new Date(),
      status: 'sent',
      type: 'text'
    };
    
    setMessages(prev => [...prev, newMsg]);
    setInputText("");

    // Simulate reply (NOTE: In a real app, this would be a socket event)
    setTimeout(() => {
      setMessages(prev => prev.map(m => m.id === newMsg.id ? { ...m, status: 'delivered' } : m));
    }, 1000);
    
    setTimeout(() => {
      setMessages(prev => prev.map(m => m.id === newMsg.id ? { ...m, status: 'seen' } : m));
    }, 2000);
  };

  const handleCall = (type: 'voice' | 'video') => {
    toast({
      title: type === 'voice' ? "Starting Voice Call..." : "Starting Video Call...",
      description: "Establishing secure WebRTC connection...",
    });
    
    // Simulate call failure due to no backend
    setTimeout(() => {
      toast({
        variant: "destructive",
        title: "Connection Failed",
        description: "Signaling server not reachable. (Backend required for calls)",
      });
    }, 2000);
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    toast({
      title: "Link Copied",
      description: "Share this link securely with your contact.",
    });
  };

  return (
    <div className="flex h-screen w-full bg-background text-foreground mode-chat font-sans overflow-hidden">
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
                  Share this secure link with the person you want to chat with. They will need the shared password to enter.
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
            </DialogContent>
          </Dialog>
        </div>
        
        <div className="flex-1 overflow-y-auto">
          {/* Single Contact Item */}
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
          
          <div className="flex items-center gap-4 text-muted-foreground">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button onClick={() => handleCall('voice')} className="p-2 hover:bg-secondary rounded-full transition-colors"><Phone size={20} /></button>
                </TooltipTrigger>
                <TooltipContent>Voice Call</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button onClick={() => handleCall('video')} className="p-2 hover:bg-secondary rounded-full transition-colors"><Video size={20} /></button>
                </TooltipTrigger>
                <TooltipContent>Video Call</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button 
                    onClick={onLock}
                    className="p-2 bg-destructive/10 text-destructive hover:bg-destructive hover:text-destructive-foreground rounded-full transition-all"
                  >
                    <Lock size={20} />
                  </button>
                </TooltipTrigger>
                <TooltipContent>Panic Lock</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </header>

        {/* Messages Area */}
        <div 
          ref={scrollRef}
          className="flex-1 overflow-y-auto p-4 space-y-4 bg-[url('https://site-assets.fontawesome.com/releases/v6.5.1/svgs/solid/shield-halved.svg')] bg-fixed bg-center bg-no-repeat bg-[length:200px] bg-blend-overlay opacity-100"
          style={{ backgroundImage: 'radial-gradient(#00000008 1px, transparent 1px)', backgroundSize: '20px 20px' }}
        >
          <div className="flex justify-center my-4">
            <span className="bg-secondary/50 text-xs py-1 px-3 rounded-full text-muted-foreground shadow-sm backdrop-blur-sm">
              Messages are end-to-end encrypted. No one outside of this chat, not even the server, can read or listen to them.
            </span>
          </div>

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
                <p className="text-sm leading-relaxed break-words">{msg.text}</p>
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
          <form onSubmit={handleSend} className="flex items-end gap-2 max-w-4xl mx-auto w-full">
            <button type="button" className="p-3 text-muted-foreground hover:bg-secondary rounded-full transition-colors">
              <Paperclip size={20} />
            </button>
            
            <div className="flex-1 bg-secondary/50 rounded-2xl border border-transparent focus-within:border-primary/30 focus-within:bg-background transition-all flex items-center px-4 py-2">
              <input 
                type="text" 
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="Type a message..." 
                className="flex-1 bg-transparent border-none outline-none text-sm placeholder:text-muted-foreground"
              />
            </div>

            {inputText.trim() ? (
               <button 
                 type="submit"
                 className="p-3 bg-primary text-primary-foreground rounded-full hover:bg-primary/90 shadow-sm transition-all transform active:scale-95"
               >
                 <Send size={18} className="ml-0.5" />
               </button>
            ) : (
              <button type="button" className="p-3 text-muted-foreground hover:bg-secondary rounded-full transition-colors">
                <Mic size={20} />
              </button>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}
