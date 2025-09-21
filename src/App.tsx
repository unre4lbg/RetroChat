import React, { useState, useEffect } from 'react';
import { supabase } from './lib/supabase';
import LandingPage from './components/LandingPage';
import ChatRoom from './components/ChatRoom';
import AdminPanel from './components/AdminPanel';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check if user is already logged in
    checkAuthState();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setIsAuthenticated(!!session);
        setLoading(false);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const checkAuthState = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    setIsAuthenticated(!!session);
    setLoading(false);
  };

  const handleLogin = () => {
    setIsAuthenticated(true);
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setShowAdminPanel(false);
  };

  const handleAdminLogin = () => {
    setIsAuthenticated(true);
    setShowAdminPanel(true);
  };

  const handleBackToLogin = () => {
    supabase.auth.signOut();
    setIsAuthenticated(false);
    setShowAdminPanel(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-win98-desktop flex items-center justify-center font-win98">
        <div className="win98-panel p-4">
          <div className="text-black text-sm">
            Initializing system...
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      {showAdminPanel && isAuthenticated ? (
        <AdminPanel onBack={handleBackToLogin} />
      ) : isAuthenticated ? (
        <ChatRoom onLogout={handleLogout} />
      ) : (
        <LandingPage onLogin={handleLogin} onAdminLogin={handleAdminLogin} />
      )}
    </>
  );
}

export default App;