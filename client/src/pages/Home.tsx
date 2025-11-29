import { useState, useEffect } from "react";
import { PYQView } from "@/components/disguise/PYQView";
import { CalculatorView } from "@/components/disguise/CalculatorView";
import { LoginOverlay } from "@/components/auth/LoginOverlay";
import { ChatLayout } from "@/components/chat/ChatLayout";
import { AdminPanel } from "@/components/admin/AdminPanel";
import { Toaster } from "@/components/ui/toaster";

type AppMode = 'disguise' | 'chat';
type DisguiseType = 'pyq' | 'calc';

export default function Home() {
  // Initialize state
  const [mode, setMode] = useState<AppMode>('disguise');
  const [disguiseType, setDisguiseType] = useState<DisguiseType>('pyq'); 
  const [showLogin, setShowLogin] = useState(false);
  const [currentUser, setCurrentUser] = useState<'admin' | 'friend'>('friend');
  const [showAdminPanel, setShowAdminPanel] = useState(false);

  // Check URL params for disguise mode preference
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('mode') === 'calc') {
      setDisguiseType('calc');
    }
  }, []);

  // Auto-lock logic
  useEffect(() => {
    let timeout: NodeJS.Timeout;
    
    const resetTimer = () => {
      clearTimeout(timeout);
      if (mode === 'chat') {
        timeout = setTimeout(() => {
          setMode('disguise');
          setShowLogin(false);
        }, 1000 * 60 * 5); // 5 minutes
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
    setShowAdminPanel(false); // Always close admin panel on login
    setShowLogin(false);
    setMode('chat');
  };

  const handlePanicLock = () => {
    setMode('disguise');
    setShowLogin(false);
    setShowAdminPanel(false); // Also close admin panel on lock
    setCurrentUser('friend'); // Reset to friend on lock
  };

  // Keyboard shortcut for Admin Panel (Ctrl+Shift+A or hidden gesture)
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
      {/* Render Disguise Layer */}
      {mode === 'disguise' && (
        <>
          {disguiseType === 'pyq' ? (
            <PYQView onUnlock={handleUnlockTrigger} />
          ) : (
            <CalculatorView onUnlock={handleUnlockTrigger} />
          )}
        </>
      )}

      {/* Render Login Overlay */}
      <LoginOverlay 
        isOpen={showLogin} 
        onSuccess={handleLoginSuccess} 
        onClose={() => setShowLogin(false)}
      />

      {/* Render Chat Layer */}
      {mode === 'chat' && (
        <>
          <ChatLayout 
             onLock={handlePanicLock} 
             currentUser={currentUser} 
          />
          
          {/* Admin Trigger Button (Hidden/Visible for Admin Only) */}
          {currentUser === 'admin' && (
            <button 
              onClick={() => setShowAdminPanel(true)}
              className="fixed bottom-4 right-4 w-8 h-8 rounded-full bg-transparent z-50 opacity-0 hover:opacity-100 transition-opacity"
              title="Admin Panel"
            />
          )}
          
          {/* Admin Panel - Only render for admin users */}
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
