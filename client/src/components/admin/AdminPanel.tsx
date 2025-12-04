import { useState, useEffect } from "react";
import { Shield, Trash2, Clock, Key, Save, AlertTriangle, Users, Activity, MessageSquare, Eye, EyeOff, CheckCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { format, formatDistanceToNow } from "date-fns";

interface AdminPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onNuke?: () => void;
}

interface Message {
  id: string;
  text: string;
  sender: 'me' | 'them';
  timestamp: string;
  type: string;
}

interface PasswordInfo {
  gatekeeper_key: string;
  admin_pass: string;
  friend_pass: string;
  admin_pass_changed_at: string | null;
  friend_pass_changed_at: string | null;
  gatekeeper_changed_at: string | null;
}

export function AdminPanel({ isOpen, onClose, onNuke }: AdminPanelProps) {
  const { toast } = useToast();
  
  const [activeTab, setActiveTab] = useState<'security' | 'data' | 'logs'>('security');
  const [gatekeeperKey, setGatekeeperKey] = useState('secret');
  const [adminPass, setAdminPass] = useState('admin123');
  const [friendPass, setFriendPass] = useState('friend123');
  const [originalAdminPass, setOriginalAdminPass] = useState('admin123');
  const [expiry, setExpiry] = useState(localStorage.getItem('message_expiry') || '24h');
  const [showNukeConfirm, setShowNukeConfirm] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [connectionLogs, setConnectionLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  
  const [showPasswords, setShowPasswords] = useState(false);
  const [adminPassChangedAt, setAdminPassChangedAt] = useState<string | null>(null);
  const [friendPassChangedAt, setFriendPassChangedAt] = useState<string | null>(null);
  const [gatekeeperChangedAt, setGatekeeperChangedAt] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setMessages(JSON.parse(localStorage.getItem('chat_messages') || '[]'));
      setConnectionLogs(JSON.parse(localStorage.getItem('connection_logs') || '[]'));
      
      fetch('/api/auth/passwords', { cache: 'no-store' })
        .then(res => res.json())
        .then((data: PasswordInfo) => {
          setGatekeeperKey(data.gatekeeper_key || 'secret');
          setAdminPass(data.admin_pass || 'admin123');
          setFriendPass(data.friend_pass || 'friend123');
          setOriginalAdminPass(data.admin_pass || 'admin123');
          setAdminPassChangedAt(data.admin_pass_changed_at);
          setFriendPassChangedAt(data.friend_pass_changed_at);
          setGatekeeperChangedAt(data.gatekeeper_changed_at);
        })
        .catch(err => {
          console.error('Failed to load passwords:', err);
        });
    }
  }, [isOpen]);

  const handleSave = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/auth/passwords', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gatekeeper_key: gatekeeperKey,
          admin_pass: adminPass,
          friend_pass: friendPass
        })
      });
      
      if (!response.ok) {
        const error = await response.json();
        toast({ variant: "destructive", title: error.error || "Failed to save settings" });
        return;
      }
      
      const result = await response.json();
      
      if (result.passwords) {
        setOriginalAdminPass(result.passwords.admin_pass);
        setAdminPassChangedAt(result.passwords.admin_pass_changed_at);
        setFriendPassChangedAt(result.passwords.friend_pass_changed_at);
        setGatekeeperChangedAt(result.passwords.gatekeeper_changed_at);
      }
      
      localStorage.setItem('message_expiry', expiry);
      
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      toast({ title: "Settings saved permanently! Passwords will persist across restarts." });
    } catch (err) {
      toast({ variant: "destructive", title: "Failed to save settings" });
    } finally {
      setLoading(false);
    }
  };

  const handleNuke = () => {
    const channel = new BroadcastChannel('secure_chat_messages');
    channel.postMessage({ type: 'nuke' });
    channel.close();
    
    localStorage.removeItem('chat_messages');
    localStorage.setItem('connection_logs', '[]');
    setMessages([]);
    setConnectionLogs([]);
    setShowNukeConfirm(false);
    toast({ variant: "destructive", title: "All data wiped!" });
    onNuke?.();
    onClose();
  };

  const formatChangedAt = (date: string | null) => {
    if (!date) return 'Never changed (using default)';
    try {
      const d = new Date(date);
      return `${format(d, 'MMM d, yyyy h:mm a')} (${formatDistanceToNow(d, { addSuffix: true })})`;
    } catch {
      return 'Unknown';
    }
  };

  const stats = {
    total: messages.length,
    text: messages.filter(m => m.type === 'text').length,
    media: messages.filter(m => m.type === 'image' || m.type === 'video').length,
    voice: messages.filter(m => m.type === 'audio').length
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="w-[95vw] max-w-2xl bg-zinc-950 text-zinc-100 border-zinc-800 max-h-[90vh] overflow-hidden flex flex-col p-3 sm:p-6">
        <DialogHeader className="pb-2 flex-shrink-0">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="p-1.5 sm:p-2 bg-red-500/10 rounded-full text-red-500">
              <Shield size={20} className="sm:w-6 sm:h-6" />
            </div>
            <div>
              <DialogTitle className="text-base sm:text-xl">Admin Panel</DialogTitle>
              <DialogDescription className="text-xs sm:text-sm text-zinc-400">
                Security & Data Management
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Tabs */}
        <div className="flex gap-1 sm:gap-2 border-b border-zinc-800 pb-2 overflow-x-auto flex-shrink-0">
          {[
            { id: 'security', label: 'Security', icon: Key },
            { id: 'data', label: 'Data', icon: MessageSquare },
            { id: 'logs', label: 'Logs', icon: Activity }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={cn(
                "flex items-center gap-1 sm:gap-2 px-2 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm transition-colors whitespace-nowrap",
                activeTab === tab.id ? "bg-zinc-800 text-white" : "text-zinc-400 hover:text-white"
              )}
            >
              <tab.icon size={14} className="sm:w-4 sm:h-4" />
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto py-3 sm:py-4 space-y-4 sm:space-y-6">
          
          {/* Security Tab */}
          {activeTab === 'security' && (
            <>
              {/* Password Visibility Toggle */}
              <div className="flex justify-end">
                <button
                  onClick={() => setShowPasswords(!showPasswords)}
                  className="flex items-center gap-2 text-xs text-zinc-400 hover:text-white transition-colors px-3 py-1.5 rounded-lg hover:bg-zinc-800"
                >
                  {showPasswords ? <EyeOff size={14} /> : <Eye size={14} />}
                  {showPasswords ? 'Hide Passwords' : 'Show Passwords'}
                </button>
              </div>

              {/* Shared Secret Key */}
              <div className="space-y-3 p-3 sm:p-4 bg-zinc-900/50 rounded-lg border border-zinc-800">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs sm:text-sm font-medium text-zinc-300 flex items-center gap-2">
                    <Key size={14} /> Shared Secret Key
                  </h3>
                  {gatekeeperChangedAt && (
                    <span className="text-[10px] text-green-500 flex items-center gap-1">
                      <CheckCircle size={10} /> Custom
                    </span>
                  )}
                </div>
                <input 
                  type={showPasswords ? "text" : "password"}
                  value={gatekeeperKey}
                  onChange={(e) => setGatekeeperKey(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-2.5 text-sm font-mono focus:border-yellow-500 outline-none"
                />
                <p className="text-[10px] text-zinc-500">
                  Last changed: {formatChangedAt(gatekeeperChangedAt)}
                </p>
              </div>

              {/* User Passwords */}
              <div className="space-y-4 p-3 sm:p-4 bg-zinc-900/50 rounded-lg border border-zinc-800">
                <h3 className="text-xs sm:text-sm font-medium text-zinc-300 flex items-center gap-2">
                  <Users size={14} /> User Passwords
                </h3>
                
                {/* Admin Password */}
                <div className="space-y-2 p-3 bg-zinc-800/50 rounded-lg">
                  <div className="flex items-center justify-between">
                    <label className="text-xs text-zinc-400 flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-red-500"></span>
                      Admin Password
                    </label>
                    {adminPassChangedAt && (
                      <span className="text-[10px] text-green-500 flex items-center gap-1">
                        <CheckCircle size={10} /> Custom
                      </span>
                    )}
                  </div>
                  <input 
                    type={showPasswords ? "text" : "password"}
                    value={adminPass}
                    onChange={(e) => setAdminPass(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-700 rounded px-3 py-2.5 text-sm font-mono focus:border-red-500 outline-none"
                    placeholder="Enter admin password"
                  />
                  <p className="text-[10px] text-zinc-500">
                    Last changed: {formatChangedAt(adminPassChangedAt)}
                  </p>
                </div>

                {/* Friend Password */}
                <div className="space-y-2 p-3 bg-zinc-800/50 rounded-lg">
                  <div className="flex items-center justify-between">
                    <label className="text-xs text-zinc-400 flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                      Friend Password
                    </label>
                    {friendPassChangedAt && (
                      <span className="text-[10px] text-green-500 flex items-center gap-1">
                        <CheckCircle size={10} /> Custom
                      </span>
                    )}
                  </div>
                  <input 
                    type={showPasswords ? "text" : "password"}
                    value={friendPass}
                    onChange={(e) => setFriendPass(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-700 rounded px-3 py-2.5 text-sm font-mono focus:border-blue-500 outline-none"
                    placeholder="Enter friend password"
                  />
                  <p className="text-[10px] text-zinc-500">
                    Last changed: {formatChangedAt(friendPassChangedAt)}
                  </p>
                </div>
              </div>

              {/* Message Retention */}
              <div className="space-y-3 p-3 sm:p-4 bg-zinc-900/50 rounded-lg border border-zinc-800">
                <h3 className="text-xs sm:text-sm font-medium text-zinc-300 flex items-center gap-2">
                  <Clock size={14} /> Message Retention
                </h3>
                <div className="grid grid-cols-3 gap-2">
                  {['view', '1h', '24h'].map((opt) => (
                    <button
                      key={opt}
                      onClick={() => setExpiry(opt)}
                      className={cn(
                        "px-2 sm:px-3 py-2 rounded text-xs sm:text-sm border transition-all",
                        expiry === opt ? "bg-zinc-100 text-zinc-900 border-zinc-100" : "bg-zinc-950 text-zinc-400 border-zinc-800 hover:border-zinc-600"
                      )}
                    >
                      {opt === 'view' ? 'View Once' : opt}
                    </button>
                  ))}
                </div>
              </div>

              {/* Important Notice */}
              <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
                <p className="text-xs text-green-400 flex items-start gap-2">
                  <CheckCircle size={14} className="flex-shrink-0 mt-0.5" />
                  <span>
                    Passwords are saved permanently to the server. They will NOT reset after restart or redeployment.
                  </span>
                </p>
              </div>

              {/* Save Button */}
              <button 
                onClick={handleSave} 
                disabled={loading}
                className={cn(
                  "w-full py-2.5 sm:py-3 rounded-lg font-medium text-sm flex items-center justify-center gap-2 transition-all",
                  saved 
                    ? "bg-green-500 text-white" 
                    : "bg-white text-black hover:bg-zinc-200",
                  loading && "opacity-50 cursor-wait"
                )}
              >
                {saved ? (
                  <>
                    <CheckCircle size={16} /> Saved!
                  </>
                ) : (
                  <>
                    <Save size={16} /> Save All Settings
                  </>
                )}
              </button>
            </>
          )}

          {/* Data Tab */}
          {activeTab === 'data' && (
            <>
              <div className="grid grid-cols-4 gap-2">
                {[
                  { label: 'Total', value: stats.total, color: 'text-white' },
                  { label: 'Text', value: stats.text, color: 'text-blue-400' },
                  { label: 'Media', value: stats.media, color: 'text-green-400' },
                  { label: 'Voice', value: stats.voice, color: 'text-purple-400' }
                ].map(stat => (
                  <div key={stat.label} className="p-2 sm:p-3 bg-zinc-900/50 rounded-lg border border-zinc-800 text-center">
                    <div className={cn("text-lg sm:text-2xl font-bold", stat.color)}>{stat.value}</div>
                    <div className="text-[10px] sm:text-xs text-zinc-500">{stat.label}</div>
                  </div>
                ))}
              </div>

              <div className="space-y-2 p-3 bg-zinc-900/50 rounded-lg border border-zinc-800">
                <h3 className="text-xs font-medium text-zinc-300">Recent Messages</h3>
                <div className="max-h-40 sm:max-h-48 overflow-y-auto space-y-1.5">
                  {messages.length === 0 ? (
                    <p className="text-xs text-zinc-600 italic">No messages</p>
                  ) : (
                    messages.slice(-15).reverse().map((msg, i) => (
                      <div key={i} className="flex items-start gap-2 text-[10px] sm:text-xs p-1.5 bg-zinc-800/30 rounded">
                        <span className={cn(
                          "px-1 py-0.5 rounded text-[9px] sm:text-[10px] font-medium flex-shrink-0",
                          msg.sender === 'me' ? "bg-red-500/20 text-red-400" : "bg-blue-500/20 text-blue-400"
                        )}>
                          {msg.sender === 'me' ? 'Admin' : 'Friend'}
                        </span>
                        <span className="truncate text-zinc-300 flex-1">{msg.text || `[${msg.type}]`}</span>
                        <span className="text-zinc-600 flex-shrink-0">
                          {format(new Date(msg.timestamp), 'h:mm a')}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </>
          )}

          {/* Logs Tab */}
          {activeTab === 'logs' && (
            <div className="space-y-2 p-3 bg-zinc-900/50 rounded-lg border border-zinc-800">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-medium text-zinc-300">Connection Logs</h3>
                <button 
                  onClick={() => { localStorage.setItem('connection_logs', '[]'); setConnectionLogs([]); }}
                  className="text-[10px] text-zinc-500 hover:text-zinc-300"
                >
                  Clear
                </button>
              </div>
              <div className="max-h-52 sm:max-h-64 overflow-y-auto space-y-1">
                {connectionLogs.length === 0 ? (
                  <p className="text-xs text-zinc-600 italic">No logs</p>
                ) : (
                  connectionLogs.slice(-30).reverse().map((log, i) => (
                    <div key={i} className="text-[10px] sm:text-xs flex items-center gap-2 text-zinc-500 p-1">
                      <span className="font-mono text-zinc-600">{format(new Date(log.timestamp), 'MMM d, h:mm a')}</span>
                      <span className={log.user === 'admin' ? 'text-red-400' : 'text-blue-400'}>[{log.user}]</span>
                      <span className="text-zinc-400">{log.event}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* Danger Zone */}
          <div className="pt-3 sm:pt-4 border-t border-zinc-800 flex-shrink-0">
            {!showNukeConfirm ? (
              <button 
                onClick={() => setShowNukeConfirm(true)}
                className="w-full py-2.5 sm:py-3 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-lg border border-red-500/20 flex items-center justify-center gap-2 text-xs sm:text-sm font-medium transition-colors"
              >
                <Trash2 size={16} /> Emergency Wipe
              </button>
            ) : (
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 sm:p-4">
                <div className="flex items-start gap-2 text-red-500 mb-3">
                  <AlertTriangle size={18} className="flex-shrink-0 mt-0.5" />
                  <div className="text-xs sm:text-sm">
                    <p className="font-bold">Delete all message data?</p>
                    <p className="opacity-80">This will NOT affect passwords.</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setShowNukeConfirm(false)} className="flex-1 py-2 bg-zinc-800 text-white rounded text-xs sm:text-sm font-medium">
                    Cancel
                  </button>
                  <button onClick={handleNuke} className="flex-1 py-2 bg-red-600 text-white rounded text-xs sm:text-sm font-bold">
                    WIPE DATA
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
