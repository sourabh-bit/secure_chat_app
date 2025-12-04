import { useState, useEffect } from "react";
import { PYQView } from "@/components/disguise/PYQView";
import { CalculatorView } from "@/components/disguise/CalculatorView";
import { LoginOverlay } from "@/components/auth/LoginOverlay";
import { ChatLayout } from "@/components/chat/ChatLayout";
import { AdminPanel } from "@/components/admin/AdminPanel";
import { Toaster } from "@/components/ui/toaster";
import { Shield } from "lucide-react";

type AppMode = 'disguise' | 'chat';
type DisguiseType = 'pyq' | 'calc';

export default function Home() {
  const [mode, setMode] = useState<AppMode>('disguise');
  const [disguiseType, setDisguiseType] = useState<DisguiseType>('pyq'); 
  const [showLogin, setShowLogin] = useState(false);
  const [currentUser, setCurrentUser] = useState<'admin' | 'friend'>('friend');
  const [showAdminPanel, setShowAdminPanel] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('mode') === 'calc') {
      setDisguiseType('calc');
    }
  }, []);

  // Auto-lock after inactivity
  useEffect(() => {
    let timeout: NodeJS.Timeout;
    
    const resetTimer = () => {
      clearTimeout(timeout);
      if (mode === 'chat') {
        timeout = setTimeout(() => {
          setMode('disguise');
          setShowLogin(false);
        }, 1000 * 60 * 5);
      }
    };

    window.addEventListener('mousemove', resetTimer);
    window.addEventListener('keypress', resetTimer);
    window.addEventListener('touchstart', resetTimer);
    
    return () => {
      clearTimeout(timeout);
      window.removeEventListener('mousemove', resetTimer);
      window.removeEventListener('keypress', resetTimer);
      window.removeEventListener('touchstart', resetTimer);
    };
  }, [mode]);

  const handleUnlockTrigger = () => {
    setShowLogin(true);
  };

  const handleLoginSuccess = (userType: 'admin' | 'friend') => {
    setCurrentUser(userType);
    setShowAdminPanel(false);
    setShowLogin(false);
    setMode('chat');
    
    const logs = JSON.parse(localStorage.getItem('connection_logs') || '[]');
    logs.push({ timestamp: new Date().toISOString(), event: 'Logged in', user: userType });
    localStorage.setItem('connection_logs', JSON.stringify(logs.slice(-100)));
  };

  const handlePanicLock = () => {
    setMode('disguise');
    setShowLogin(false);
    setShowAdminPanel(false);
    setCurrentUser('friend');
  };

  // Keyboard shortcut for Admin Panel
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (mode === 'chat' && currentUser === 'admin' && e.ctrlKey && e.shiftKey && e.key === 'A') {
        setShowAdminPanel(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mode, currentUser]);

  return (
    <div className="min-h-screen w-full overflow-hidden relative">
      {/* Disguise Layer */}
      {mode === 'disguise' && (
        <>
          {disguiseType === 'pyq' ? (
            <PYQView onUnlock={handleUnlockTrigger} />
          ) : (
            <CalculatorView onUnlock={handleUnlockTrigger} />
          )}
        </>
      )}

      {/* Login Overlay */}
      <LoginOverlay 
        isOpen={showLogin} 
        onSuccess={handleLoginSuccess} 
        onClose={() => setShowLogin(false)}
      />

      {/* Chat Layer */}
      {mode === 'chat' && (
        <>
          <ChatLayout
            onLock={handlePanicLock}
            currentUser={currentUser}
            showAdminPanel={showAdminPanel}
            onAdminPanelToggle={() => setShowAdminPanel(!showAdminPanel)}
          />

          {/* Admin Panel */}
          {currentUser === 'admin' && (
            <AdminPanel
              isOpen={showAdminPanel}
              onClose={() => setShowAdminPanel(false)}
            />
          )}
        </>
      )}
      
      <Toaster />
    </div>
  );
}
