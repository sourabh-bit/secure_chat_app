import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Lock, ArrowRight, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface LoginOverlayProps {
  isOpen: boolean;
  onSuccess: (userType: 'admin' | 'friend') => void;
  onClose: () => void;
}

export function LoginOverlay({ isOpen, onSuccess, onClose }: LoginOverlayProps) {
  const [password, setPassword] = useState("");
  const [secretKey, setSecretKey] = useState("");
  const [error, setError] = useState(false);
  const [step, setStep] = useState<'gatekeeper' | 'personal'>('gatekeeper');

  useEffect(() => {
    if (!isOpen) {
      setPassword("");
      setSecretKey("");
      setStep('gatekeeper');
      setError(false);
    }
  }, [isOpen]);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (step === 'gatekeeper') {
      const gatekeeperKey = localStorage.getItem('gatekeeper_key') || 'secret';
      if (secretKey === gatekeeperKey) {
        setStep('personal');
        setError(false);
      } else {
        shakeError();
      }
    } else {
      const adminPass = localStorage.getItem('admin_pass') || 'admin123';
      const friendPass = localStorage.getItem('friend_pass') || 'friend123';

      if (password === adminPass) {
        onSuccess('admin');
      } else if (password === friendPass) {
        onSuccess('friend');
      } else {
        shakeError();
      }
    }
  };

  const shakeError = () => {
    setError(true);
    setTimeout(() => setError(false), 500);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="w-full max-w-md bg-[#111] text-white rounded-2xl border border-white/10 shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="p-6 flex items-center justify-between border-b border-white/5">
          <div className="flex items-center gap-2 text-white/70">
            <Lock size={16} />
            <span className="text-sm font-medium tracking-widest uppercase">Secure Access</span>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full text-white/50 hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="p-8 py-12">
          <form onSubmit={handleLogin} className="space-y-6">
            <div className="space-y-2">
              <label className="text-xs font-mono text-white/40 uppercase tracking-widest ml-1">
                {step === 'gatekeeper' ? 'Secret Key' : 'Password'}
              </label>
              <div className={cn("relative transition-transform", error && "animate-shake")}>
                <input
                  type="password"
                  autoFocus
                  autoComplete="off"
                  value={step === 'gatekeeper' ? secretKey : password}
                  onChange={(e) => step === 'gatekeeper' ? setSecretKey(e.target.value) : setPassword(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-4 text-lg tracking-wide placeholder:text-white/20 focus:outline-none focus:border-white/30 focus:bg-white/10 transition-all text-center"
                  placeholder={step === 'gatekeeper' ? "Enter secret key" : "Enter your password"}
                />
              </div>
              {error && (
                <p className="text-red-400 text-xs text-center mt-2">Invalid {step === 'gatekeeper' ? 'key' : 'password'}</p>
              )}
            </div>

            <button 
              type="submit"
              className="w-full bg-white text-black font-medium py-4 rounded-lg flex items-center justify-center gap-2 hover:bg-white/90 transition-colors active:scale-[0.98]"
            >
              {step === 'gatekeeper' ? 'Continue' : 'Login'} 
              <ArrowRight size={18} />
            </button>
          </form>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-white/5 text-center space-y-1">
          <p className="text-[10px] text-white/20 font-mono uppercase tracking-widest">
            End-to-End Encrypted
          </p>
          {step === 'gatekeeper' && (
            <p className="text-[9px] text-white/30">
              Default key: <span className="text-white/50 font-mono">secret</span>
            </p>
          )}
          {step === 'personal' && (
            <p className="text-[9px] text-white/30">
              Defaults: <span className="text-white/50 font-mono">admin123</span> / <span className="text-white/50 font-mono">friend123</span>
            </p>
          )}
        </div>
      </motion.div>
    </div>
  );
}
