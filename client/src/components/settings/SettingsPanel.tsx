import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Key, Lock, Eye, EyeOff, Save, Check, RotateCcw, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

interface SettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  userType: 'admin' | 'friend';
}

export function SettingsPanel({ isOpen, onClose, userType }: SettingsPanelProps) {
  const { toast } = useToast();
  const [showPasswords, setShowPasswords] = useState(false);
  const [loading, setLoading] = useState(false);
  
  const [secretKey, setSecretKey] = useState('');
  const [myPassword, setMyPassword] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [saved, setSaved] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  // Load passwords from server
  useEffect(() => {
    if (isOpen) {
      fetch('/api/auth/passwords')
        .then(res => res.json())
        .then(data => {
          setSecretKey(data.gatekeeper_key || 'secret');
          setMyPassword(userType === 'admin' ? data.admin_pass : data.friend_pass);
        })
        .catch(() => {
          setSecretKey('secret');
          setMyPassword(userType === 'admin' ? 'admin123' : 'friend123');
        });
    }
  }, [isOpen, userType]);

  const handleResetApp = () => {
    localStorage.clear();
    toast({ title: "App reset! Refreshing...", variant: "destructive" });
    setTimeout(() => window.location.reload(), 1000);
  };

  const handleSave = async () => {
    if (myPassword.length < 4) {
      toast({ variant: "destructive", title: "Password must be at least 4 characters" });
      return;
    }

    if (secretKey.length < 4) {
      toast({ variant: "destructive", title: "Secret key must be at least 4 characters" });
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/auth/passwords', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gatekeeper_key: secretKey,
          [userType === 'admin' ? 'admin_pass' : 'friend_pass']: myPassword,
          current_password: currentPassword
        })
      });
      
      if (!response.ok) {
        const data = await response.json();
        toast({ variant: "destructive", title: data.error || "Failed to save" });
        return;
      }
      
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      toast({ title: "Settings saved - works on all devices!" });
      setCurrentPassword('');
    } catch {
      toast({ variant: "destructive", title: "Failed to save settings" });
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="w-full max-w-md bg-background border border-border rounded-2xl shadow-2xl overflow-hidden"
        >
          {/* Header */}
          <div className="p-4 flex items-center justify-between border-b border-border">
            <div className="flex items-center gap-2">
              <Key size={18} className="text-primary" />
              <span className="font-semibold">Security Settings</span>
            </div>
            <button 
              onClick={onClose} 
              className="p-2 hover:bg-secondary rounded-full transition-colors"
            >
              <X size={18} />
            </button>
          </div>

          {/* Body */}
          <div className="p-6 space-y-6">
            {/* Current Password */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Lock size={14} />
                Current Password (to confirm changes)
              </label>
              <div className="relative">
                <input
                  type={showPasswords ? "text" : "password"}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="w-full bg-secondary/50 border border-border rounded-lg px-4 py-3 pr-12 focus:outline-none focus:ring-2 focus:ring-primary/50"
                  placeholder="Enter current password"
                />
              </div>
            </div>

            <div className="border-t border-border pt-4">
              <div className="flex items-center justify-between mb-4">
                <span className="text-sm font-medium">Edit Credentials</span>
                <button
                  onClick={() => setShowPasswords(!showPasswords)}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showPasswords ? <EyeOff size={14} /> : <Eye size={14} />}
                  {showPasswords ? 'Hide' : 'Show'}
                </button>
              </div>

              {/* Secret Key */}
              <div className="space-y-2 mb-4">
                <label className="text-sm text-muted-foreground">
                  Shared Secret Key
                </label>
                <input
                  type={showPasswords ? "text" : "password"}
                  value={secretKey}
                  onChange={(e) => setSecretKey(e.target.value)}
                  className="w-full bg-secondary/50 border border-border rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary/50"
                  placeholder="Shared secret key"
                />
                <p className="text-xs text-muted-foreground">
                  This key is shared between you and your partner
                </p>
              </div>

              {/* Personal Password */}
              <div className="space-y-2">
                <label className="text-sm text-muted-foreground">
                  Your Password ({userType === 'admin' ? 'Admin' : 'Friend'})
                </label>
                <input
                  type={showPasswords ? "text" : "password"}
                  value={myPassword}
                  onChange={(e) => setMyPassword(e.target.value)}
                  className="w-full bg-secondary/50 border border-border rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary/50"
                  placeholder="Your personal password"
                />
                <p className="text-xs text-muted-foreground">
                  Only you use this password to login
                </p>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="p-4 border-t border-border bg-secondary/30 space-y-3">
            <button
              onClick={handleSave}
              disabled={!currentPassword}
              className={cn(
                "w-full py-3 rounded-lg font-medium flex items-center justify-center gap-2 transition-all",
                saved 
                  ? "bg-green-500 text-white" 
                  : "bg-primary text-primary-foreground hover:bg-primary/90",
                !currentPassword && "opacity-50 cursor-not-allowed"
              )}
            >
              {saved ? (
                <>
                  <Check size={18} />
                  Saved!
                </>
              ) : (
                <>
                  <Save size={18} />
                  Save Changes
                </>
              )}
            </button>
            
            {/* Reset App Button */}
            {!showResetConfirm ? (
              <button
                onClick={() => setShowResetConfirm(true)}
                className="w-full py-2.5 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-secondary flex items-center justify-center gap-2 transition-all"
              >
                <RotateCcw size={14} />
                Reset App Data
              </button>
            ) : (
              <div className="flex gap-2">
                <button
                  onClick={() => setShowResetConfirm(false)}
                  className="flex-1 py-2.5 rounded-lg text-sm bg-secondary hover:bg-secondary/80 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleResetApp}
                  className="flex-1 py-2.5 rounded-lg text-sm bg-destructive text-destructive-foreground hover:bg-destructive/90 flex items-center justify-center gap-2 transition-colors"
                >
                  <Trash2 size={14} />
                  Confirm Reset
                </button>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
