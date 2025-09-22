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
      async (event, session) => {
        if (!session && event !== 'SIGNED_OUT') {
          // Clear any invalid refresh tokens from local storage
          await supabase.auth.signOut();
        }
        setIsAuthenticated(!!session);
        setLoading(false);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const checkAuthState = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        // Clear any invalid refresh tokens from local storage
        await supabase.auth.signOut();
      }
      setIsAuthenticated(!!session);
    } catch (error) {
      // If there's an error getting the session, clear the auth state
      await supabase.auth.signOut();
      setIsAuthenticated(false);
    }
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
      <div className="min-h-screen xp-login-bg flex items-center justify-center font-xp">
        <div className="xp-welcome-panel p-4 xp-fade-in">
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
        <ChatRoom onLogout={handleLogout} isAuthenticated={isAuthenticated} />
      ) : (
        <LandingPage onLogin={handleLogin} onAdminLogin={handleAdminLogin} />
      )}
    </>
  );
}

export default App;