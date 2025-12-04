import { useState, useEffect } from "react";
import { PYQView } from "@/components/disguise/PYQView";
import { CalculatorView } from "@/components/disguise/CalculatorView";
import { LoginOverlay } from "@/components/auth/LoginOverlay";
import { ChatLayout } from "@/components/chat/ChatLayout";
import { AdminPanel } from "@/components/admin/AdminPanel";
import { Toaster } from "@/components/ui/toaster";

export default function Home() {
  const [mode, setMode] = useState<'disguise' | 'chat'>('disguise');
  const [disguiseType, setDisguiseType] = useState<'pyq' | 'calc'>('pyq');
  const [showLogin, setShowLogin] = useState(false);
  const [currentUser, setCurrentUser] = useState<'admin' | 'friend'>('friend');
  const [showAdminPanel, setShowAdminPanel] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('mode') === 'calc') {
      setDisguiseType('calc');
    }
  }, []);

  // Auto lock on inactivity
  useEffect(() => {
    let timeout: NodeJS.Timeout;

    const resetTimer = () => {
      clearTimeout(timeout);
      if (mode === "chat") {
        timeout = setTimeout(() => {
          setMode("disguise");
          setShowLogin(false);
        }, 1000 * 60 * 5);
      }
    };

    window.addEventListener("mousemove", resetTimer);
    window.addEventListener("keypress", resetTimer);
    window.addEventListener("touchstart", resetTimer);

    return () => {
      clearTimeout(timeout);
      window.removeEventListener("mousemove", resetTimer);
      window.removeEventListener("keypress", resetTimer);
      window.removeEventListener("touchstart", resetTimer);
    };
  }, [mode]);

  const handleUnlockTrigger = () => setShowLogin(true);

  const handleLoginSuccess = (userType: 'admin' | 'friend') => {
    setCurrentUser(userType);
    setMode("chat");
    setShowAdminPanel(false);
    setShowLogin(false);
  };

  const handlePanicLock = () => {
    setMode("disguise");
    setShowLogin(false);
    setShowAdminPanel(false);
    setCurrentUser("friend");
  };

  // Admin shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (mode === "chat" && currentUser === "admin" && e.ctrlKey && e.shiftKey && e.key === "A") {
        setShowAdminPanel(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [mode, currentUser]);

  return (
    <div className="min-h-screen w-full bg-background overflow-hidden relative">

      {/* disguise layer */}
      {mode === "disguise" && (
        disguiseType === "pyq"
          ? <PYQView onUnlock={handleUnlockTrigger} />
          : <CalculatorView onUnlock={handleUnlockTrigger} />
      )}

      {/* login */}
      <LoginOverlay
        isOpen={showLogin}
        onSuccess={handleLoginSuccess}
        onClose={() => setShowLogin(false)}
      />

      {/* CHAT */}
      {mode === "chat" && (
        <div className="w-full h-full flex justify-center">
          <div className="w-full max-w-[1400px] h-full flex overflow-hidden">
            <ChatLayout
              onLock={handlePanicLock}
              currentUser={currentUser}
              showAdminPanel={showAdminPanel}
              onAdminPanelToggle={() => setShowAdminPanel(!showAdminPanel)}
            />
          </div>
        </div>
      )}

      {/* admin panel */}
      {mode === "chat" && currentUser === "admin" && (
        <AdminPanel
          isOpen={showAdminPanel}
          onClose={() => setShowAdminPanel(false)}
        />
      )}

      <Toaster />
    </div>
  );
}
