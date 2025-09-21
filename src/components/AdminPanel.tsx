import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { UserProfile } from '../types/supabase';
import { Shield, Users, Trash2, Edit, Plus, ArrowLeft, MessageSquare, X, Minimize2 } from 'lucide-react';

interface AdminPanelProps {
  onBack: () => void;
}

const AdminPanel: React.FC<AdminPanelProps> = ({ onBack }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUsername, setNewUsername] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);

  useEffect(() => {
    if (!isAuthenticated || showCreateForm) {
      setError('');
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (isAuthenticated) {
      fetchUsers();
    }
  }, [isAuthenticated]);

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    if (username === 'adminadmin' && password === 'testtest') {
      try {
        const { error: supabaseAuthError } = await supabase.auth.signInWithPassword({
          email: 'admin@admin.com',
          password: 'adminpassword123'
        });

        if (supabaseAuthError) {
          setError(`Supabase Admin Login Failed: ${supabaseAuthError.message}`);
          setIsAuthenticated(false);
        } else {
          setIsAuthenticated(true);
          fetchUsers();
        }
      } catch (err: any) {
        setError(`An unexpected error occurred during Supabase login: ${err.message}`);
        setIsAuthenticated(false);
      } finally {
        setLoading(false);
      }
    } else {
      setError('Invalid local admin credentials');
      setLoading(false);
    }
  };

  const fetchUsers = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setError('No active Supabase session. Please re-authenticate.');
        setIsAuthenticated(false);
        return;
      }

      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) {
        console.error('Error fetching users:', error);
        setError(`Failed to fetch users: ${error.message}`);
        return;
      }
      
      if (data) {
        setUsers(data);
        setError('');
      }
    } catch (error: any) {
      console.error('Error fetching users:', error);
      setError(`Failed to fetch users: ${error.message}`);
    }
  };

  const deleteUser = async (userId: string, userProfileId: string) => {
    if (!confirm('Are you sure you want to delete this user?')) return;
    
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      setError('No active Supabase session. Please re-authenticate.');
      setIsAuthenticated(false);
      return;
    }

    setLoading(true);
    try {
      const { error: messagesError } = await supabase
        .from('messages')
        .delete()
        .eq('user_id', userId);
      
      if (messagesError) {
        console.error('Error deleting user messages:', messagesError);
      }
      
      const { error: profileError } = await supabase
        .from('user_profiles')
        .delete()
        .eq('id', userProfileId);
      
      if (profileError) {
        console.error('Error deleting user profile:', profileError);
        throw profileError;
      }
      
      await fetchUsers();
      setError('');
    } catch (error: any) {
      console.error('Delete user error:', error);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const updateUser = async (userProfileId: string, newUsername: string) => {
    setLoading(true);

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      setError('No active Supabase session. Please re-authenticate.');
      setIsAuthenticated(false);
      return;
    }
    try {
      const { error } = await supabase
        .from('user_profiles')
        .update({ username: newUsername })
        .eq('id', userProfileId);
      
      if (error) throw error;
      
      setEditingUser(null);
      fetchUsers();
    } catch (error: any) {
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const createUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUserEmail || !newUserPassword || !newUsername) {
      setError('All fields are required');
      return;
    }
    
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      setError('No active Supabase session. Please re-authenticate.');
      setIsAuthenticated(false);
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email: newUserEmail,
        password: newUserPassword
      });
      
      if (error) throw error;
      
      if (data.user) {
        const { error: profileError } = await supabase
          .from('user_profiles')
          .insert({
            user_id: data.user.id,
            username: newUsername
          });
        
        if (profileError) throw profileError;
      }
      
      setNewUserEmail('');
      setNewUserPassword('');
      setNewUsername('');
      setShowCreateForm(false);
      setError('');
      
      await fetchUsers();
      alert('User created successfully!');
    } catch (error: any) {
      console.error('Create user error:', error);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const clearChatHistory = async () => {
    if (!confirm('Are you sure you want to clear all chat history? This cannot be undone.')) return;
    
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      setError('No active Supabase session. Please re-authenticate.');
      setIsAuthenticated(false);
      return;
    }

    setLoading(true);
    try {
      const { count: messageCount } = await supabase
        .from('messages')
        .select('*', { count: 'exact', head: true });
      
      if (messageCount === 0) {
        alert('No messages to delete');
        return;
      }
      
      const { error } = await supabase
        .from('messages')
        .delete()
        .gte('created_at', '1900-01-01');
      
      if (error) {
        console.error('Error clearing chat history:', error);
        throw error;
      }
      
      alert(`Chat history cleared successfully! Deleted ${messageCount} messages.`);
      setError('');
    } catch (error: any) {
      console.error('Clear chat history error:', error);
      setError(error.message);
      alert(`Failed to clear chat history: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen xp-login-bg flex items-center justify-center p-4 font-xp">
        <div className="w-full max-w-md">
          <div className="xp-welcome-panel xp-fade-in">
            {/* Title Bar */}
            <div className="xp-titlebar">
              <div className="flex items-center">
                <Shield className="h-4 w-4 mr-2 xp-icon" />
                <span>Administrator Access</span>
              </div>
              <div className="flex">
                <button className="w-5 h-4 xp-button text-xs mr-1">
                  <Minimize2 className="h-2 w-2" />
                </button>
                <button 
                  onClick={onBack}
                  className="xp-titlebar-button xp-close-btn"
                >
                  ×
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="p-4">
              <div className="text-center mb-4">
                <Shield className="h-12 w-12 text-red-600 mx-auto mb-2 xp-icon" />
                <h1 className="text-lg font-bold text-red-600 mb-1">
                  RESTRICTED AREA
                </h1>
                <p className="text-xs text-black">
                  Administrator credentials required
                </p>
              </div>

              <form onSubmit={handleAdminLogin} className="space-y-3">
                <div>
                  <label className="block text-black text-xs font-bold mb-1">
                    Username:
                  </label>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full xp-input text-xs"
                    placeholder="Admin username"
                    required
                  />
                </div>

                <div>
                  <label className="block text-black text-xs font-bold mb-1">
                    Password:
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full xp-input text-xs"
                    placeholder="Password"
                    required
                  />
                </div>

                {error && (
                  <div className="xp-panel-inset p-2 text-xs text-red-600">
                    Error: {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full xp-button-blue py-2 px-4 text-xs font-bold disabled:opacity-50"
                >
                  {loading ? 'Authenticating...' : 'Access Admin Panel'}
                </button>
              </form>

              <button
                onClick={onBack}
                className="w-full mt-3 xp-button py-2 px-4 text-xs font-bold text-black flex items-center justify-center"
              >
                <ArrowLeft className="h-3 w-3 mr-1" />
                Back to Login
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen xp-login-bg font-xp p-2">
      <div className="xp-window h-full">
        {/* Title Bar */}
        <div className="xp-titlebar">
          <div className="flex items-center">
            <Shield className="h-4 w-4 mr-2 xp-icon" />
            <span>Administrator Control Panel</span>
          </div>
          <div className="flex">
            <button className="xp-titlebar-button xp-minimize-btn">−</button>
            <button className="xp-titlebar-button xp-maximize-btn">□</button>
            <button
              onClick={onBack}
              className="xp-titlebar-button xp-close-btn"
            >
              ×
            </button>
          </div>
        </div>

        <div className="p-4 space-y-4 overflow-y-auto">
          {/* Chat Management */}
          <div className="xp-panel p-3">
            <h2 className="text-sm font-bold text-black mb-3 flex items-center">
              <MessageSquare className="h-4 w-4 mr-2 xp-icon" />
              Chat Management
            </h2>
            <button
              onClick={clearChatHistory}
              disabled={loading}
              className="xp-button py-2 px-3 text-xs font-bold text-black disabled:opacity-50"
            >
              Clear Chat History
            </button>
          </div>

          {/* User Management */}
          <div className="xp-panel p-3">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-bold text-black flex items-center">
                <Users className="h-4 w-4 mr-2 xp-icon" />
                User Management ({users.length})
              </h2>
              <button
                onClick={() => setShowCreateForm(!showCreateForm)}
                className="xp-button py-2 px-3 text-xs font-bold text-black flex items-center"
              >
                <Plus className="h-3 w-3 mr-2" />
                Create User
              </button>
            </div>

            {/* Create User Form */}
            {showCreateForm && (
              <div className="xp-panel-inset p-3 mb-3">
                <h3 className="text-xs font-bold text-black mb-2">Create New User</h3>
                <form onSubmit={createUser} className="space-y-2">
                  <input
                    type="email"
                    value={newUserEmail}
                    onChange={(e) => setNewUserEmail(e.target.value)}
                    className="w-full xp-input text-xs"
                    placeholder="Email"
                    required
                  />
                  <input
                    type="password"
                    value={newUserPassword}
                    onChange={(e) => setNewUserPassword(e.target.value)}
                    className="w-full xp-input text-xs"
                    placeholder="Password"
                    required
                  />
                  <input
                    type="text"
                    value={newUsername}
                    onChange={(e) => setNewUsername(e.target.value)}
                    className="w-full xp-input text-xs"
                    placeholder="Username"
                    required
                  />
                  <div className="flex space-x-2">
                    <button
                      type="submit"
                      disabled={loading}
                      className="xp-button-blue py-2 px-3 text-xs font-bold disabled:opacity-50"
                    >
                      Create
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowCreateForm(false)}
                      className="xp-button py-2 px-3 text-xs font-bold text-black"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* Users List */}
            <div className="xp-panel-inset p-2 max-h-64 overflow-y-auto">
              {users.length === 0 ? (
                <div className="text-center text-black py-4">
                  <p className="text-xs">No users found</p>
                  <button
                    onClick={fetchUsers}
                    className="mt-2 xp-button py-2 px-3 text-xs font-bold text-black"
                  >
                    Refresh
                  </button>
                </div>
              ) : (
                <div className="space-y-1">
                  {users.map((user) => (
                    <div key={user.id} className="xp-panel-outset p-2 flex items-center justify-between">
                      <div>
                        {editingUser?.id === user.id ? (
                          <input
                            type="text"
                            value={newUsername}
                            onChange={(e) => setNewUsername(e.target.value)}
                            className="xp-input text-xs"
                            onKeyPress={(e) => {
                              if (e.key === 'Enter') {
                                updateUser(user.id, newUsername);
                              }
                            }}
                          />
                        ) : (
                          <div>
                            <div className="text-xs font-bold text-black">{user.username}</div>
                            <div className="text-xs text-xp-offline">
                              ID: {user.user_id.substring(0, 8)}... | {new Date(user.created_at).toLocaleDateString()}
                            </div>
                          </div>
                        )}
                      </div>
                      <div className="flex space-x-1">
                        {editingUser?.id === user.id ? (
                          <>
                            <button
                              onClick={() => updateUser(user.id, newUsername)}
                              disabled={loading}
                              className="xp-button py-1 px-2 text-xs disabled:opacity-50"
                            >
                              Save
                            </button>
                            <button
                              onClick={() => {
                                setEditingUser(null);
                                setNewUsername('');
                              }}
                              className="xp-button py-1 px-2 text-xs"
                            >
                              Cancel
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={() => {
                                setEditingUser(user);
                                setNewUsername(user.username);
                              }}
                              className="xp-button p-1"
                            >
                              <Edit className="h-3 w-3" />
                            </button>
                            <button
                              onClick={() => deleteUser(user.user_id, user.id)}
                              disabled={loading}
                              className="xp-button p-1 disabled:opacity-50"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {error && (
            <div className="xp-panel-inset p-2 text-xs text-red-600">
              Error: {error}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminPanel;