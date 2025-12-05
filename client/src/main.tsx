import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// Register Service Worker for PWA with auto-update (PRODUCTION ONLY)
// Disable in development to prevent auto-refresh loops
const isDevelopment = import.meta.env.DEV || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

if ('serviceWorker' in navigator && !isDevelopment) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js?v=' + Date.now())
      .then((registration) => {
        console.log('SW registered:', registration.scope);
        
        // Check for updates every 60 seconds (only in production)
        const checkForUpdates = () => {
          registration.update();
          // Also check version via service worker message
          if (registration.active) {
            const currentVersion = (window as any).__APP_VERSION__ || '1.0.0';
            registration.active.postMessage({ 
              type: 'CHECK_VERSION', 
              currentVersion 
            });
          }
        };
        
        // Don't check immediately on load, wait 5 seconds
        setTimeout(() => {
          checkForUpdates();
          setInterval(checkForUpdates, 60000);
        }, 5000);
        
        // Auto-update when new SW is available
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (newWorker) {
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                // New SW ready - tell it to take over immediately
                newWorker.postMessage({ type: 'SKIP_WAITING' });
              }
            });
          }
        });
        
        // Listen for messages from service worker
        navigator.serviceWorker.addEventListener('message', (event) => {
          if (event.data && event.data.type === 'SW_UPDATED') {
            // Service worker updated - reload to get new version
            window.location.reload();
          } else if (event.data && event.data.type === 'NEW_VERSION_AVAILABLE') {
            // New version detected - reload to get it
            window.location.reload();
          }
        });
      })
      .catch((error) => {
        console.log('SW registration failed:', error);
      });
  });
  
  // Reload page when new SW takes control (only in production)
  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!refreshing && !isDevelopment) {
      refreshing = true;
      window.location.reload();
    }
  });
} else if (isDevelopment) {
  // Unregister any existing service workers in development
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      registrations.forEach((registration) => {
        registration.unregister();
      });
    });
  }
}

createRoot(document.getElementById("root")!).render(<App />);
