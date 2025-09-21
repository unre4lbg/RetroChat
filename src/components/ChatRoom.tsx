import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { Message, UserProfile } from '../types/supabase';
import { LogOut, Send, Users, MessageSquare, Search, X, Minimize2, Maximize2 } from 'lucide-react';

interface ChatRoomProps {
  onLogout: () => void;
}

const ChatRoom: React.FC<ChatRoomProps> = ({ onLogout }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [onlineUsers, setOnlineUsers] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [privateChats, setPrivateChats] = useState<{[key: string]: Message[]}>({});
  const [unreadCounts, setUnreadCounts] = useState<{[key: string]: number}>({});
  const [searchTerm, setSearchTerm] = useState('');
  const [activeMobilePanel, setActiveMobilePanel] = useState<'chat' | 'users' | 'private'>('chat');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    initializeUser();
    fetchMessages();
    fetchAllUsers();
    trackOnlineUsers();
    
    const messageSubscription = supabase
      .channel('messages')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
        const newMessage = payload.new as Message;
        
        if (newMessage.receiver_id) {
          if (newMessage.user_id === currentUser?.id || newMessage.receiver_id === currentUser?.id) {
            const chatKey = getChatKey(newMessage.user_id, newMessage.receiver_id);
            setPrivateChats(prev => ({
              ...prev,
              [chatKey]: [...(prev[chatKey] || []), newMessage]
            }));
            
            if (newMessage.user_id !== currentUser?.id) {
              setUnreadCounts(prev => ({
                ...prev,
                [chatKey]: (prev[chatKey] || 0) + 1
              }));
            }
          }
        } else {
          setMessages(prev => [...prev, newMessage]);
        }
      })
      .subscribe();

    return () => {
      messageSubscription.unsubscribe();
    };
  }, [currentUser]);

  useEffect(() => {
    const interval = setInterval(() => {
      updateUserPresence();
    }, 30000); // Update presence every 30 seconds

    return () => clearInterval(interval);
  }, [currentUser]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, privateChats, selectedUser]);

  const initializeUser = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setCurrentUser(user);
        
        const { data: profile } = await supabase
          .from('user_profiles')
          .select('*')
          .eq('user_id', user.id)
          .single();
        
        if (profile) {
          setUserProfile(profile);
        }
      }
    } catch (error) {
      console.error('Error initializing user:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchMessages = async () => {
    try {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .is('receiver_id', null)
        .order('created_at', { ascending: true });
      
      if (error) throw error;
      if (data) setMessages(data);
    } catch (error) {
      console.error('Error fetching messages:', error);
    }
  };

  const fetchAllUsers = async () => {
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .order('username', { ascending: true });
      
      if (error) throw error;
      if (data) setAllUsers(data);
    } catch (error) {
      console.error('Error fetching all users:', error);
    }
  };

  const trackOnlineUsers = async () => {
    if (!currentUser) return;

    // Subscribe to presence changes
    const channel = supabase.channel('online-users', {
      config: {
        presence: {
          key: currentUser.id,
        },
      },
    });

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        const onlineUserIds = Object.keys(state);
        setOnlineUsers(onlineUserIds);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({
            user_id: currentUser.id,
            username: userProfile?.username,
            online_at: new Date().toISOString(),
          });
        }
      });

    return () => {
      channel.unsubscribe();
    };
  };

  const updateUserPresence = async () => {
    if (!currentUser) return;
    
    const channel = supabase.channel('online-users');
    await channel.track({
      user_id: currentUser.id,
      username: userProfile?.username,
      online_at: new Date().toISOString(),
    });
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !currentUser || !userProfile) return;

    try {
      const messageData = {
        user_id: currentUser.id,
        username: userProfile.username,
        content: newMessage.trim(),
        receiver_id: selectedUser?.user_id || null
      };

      const { error } = await supabase
        .from('messages')
        .insert(messageData);

      if (error) throw error;
      setNewMessage('');
    } catch (error) {
      console.error('Error sending message:', error);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    onLogout();
  };

  const startPrivateChat = (user: UserProfile) => {
    if (user.user_id === currentUser?.id) return;
    
    setSelectedUser(user);
    const chatKey = getChatKey(currentUser.id, user.user_id);
    
    if (!privateChats[chatKey]) {
      fetchPrivateMessages(user.user_id);
    }
    
    setUnreadCounts(prev => ({
      ...prev,
      [chatKey]: 0
    }));
    
    setActiveMobilePanel('chat');
  };

  const getChatKey = (userId1: string, userId2: string) => {
    return [userId1, userId2].sort().join('-');
  };

  const fetchPrivateMessages = async (otherUserId: string) => {
    try {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .not('receiver_id', 'is', null)
        .or(`and(user_id.eq.${currentUser.id},receiver_id.eq.${otherUserId}),and(user_id.eq.${otherUserId},receiver_id.eq.${currentUser.id})`)
        .order('created_at', { ascending: true });
      
      if (error) throw error;
      
      const chatKey = getChatKey(currentUser.id, otherUserId);
      setPrivateChats(prev => ({
        ...prev,
        [chatKey]: data || []
      }));
    } catch (error) {
      console.error('Error fetching private messages:', error);
    }
  };

  const removePrivateChat = (user: UserProfile) => {
    const chatKey = getChatKey(currentUser.id, user.user_id);
    setPrivateChats(prev => {
      const newChats = { ...prev };
      delete newChats[chatKey];
      return newChats;
    });
    setUnreadCounts(prev => {
      const newCounts = { ...prev };
      delete newCounts[chatKey];
      return newCounts;
    });
    
    if (selectedUser?.user_id === user.user_id) {
      setSelectedUser(null);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const getCurrentMessages = () => {
    if (selectedUser) {
      const chatKey = getChatKey(currentUser.id, selectedUser.user_id);
      return privateChats[chatKey] || [];
    }
    return messages;
  };

  const getActiveChatUsers = () => {
    return Object.keys(privateChats).map(chatKey => {
      const [userId1, userId2] = chatKey.split('-');
      const otherUserId = userId1 === currentUser.id ? userId2 : userId1;
      return allUsers.find(user => user.user_id === otherUserId);
    }).filter(Boolean) as UserProfile[];
  };

  const getOnlineUsers = () => {
    return allUsers.filter(user => 
      onlineUsers.includes(user.user_id) && 
      user.user_id !== currentUser?.id
    );
  };

  const filteredUsers = getOnlineUsers().filter(user =>
    user.username.toLowerCase().includes(searchTerm.toLowerCase()) &&
    user.user_id !== currentUser?.id
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-xp-desktop flex items-center justify-center font-xp">
        <div className="xp-window p-4">
          <div className="text-black text-sm">Loading chat room...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-xp-desktop font-xp">
      {/* Desktop Layout */}
      <div className="hidden md:flex h-screen">
        {/* Main Chat Area */}
        <div className="flex-1 xp-window m-2 flex flex-col">
          <div className="xp-titlebar">
            <div className="flex items-center">
              <MessageSquare className="h-4 w-4 mr-2" />
              <span>
                {selectedUser ? `Private Chat - ${selectedUser.username}` : 'Public Chat Room'}
              </span>
            </div>
            <div className="flex">
              <button className="xp-titlebar-button xp-minimize-btn">_</button>
              <button className="xp-titlebar-button xp-maximize-btn">□</button>
              <button onClick={handleLogout} className="xp-titlebar-button xp-close-btn">×</button>
            </div>
          </div>

          {selectedUser && (
            <div className="xp-toolbar p-1 border-b border-xp-border">
              <button
                onClick={() => setSelectedUser(null)}
                className="xp-button text-xs px-2 py-1"
              >
                ← Back to Public Chat
              </button>
            </div>
          )}

          <div className="flex-1 p-2 bg-white overflow-y-auto">
            <div className="space-y-1">
              {getCurrentMessages().map((message) => (
                <div
                  key={message.id}
                  className={`p-2 rounded text-xs ${
                    message.user_id === currentUser?.id
                      ? 'xp-message-own ml-8'
                      : 'xp-message-other mr-8'
                  }`}
                >
                  <div className="font-bold text-xp-blue mb-1">
                    {message.username}
                  </div>
                  <div className="text-black">{message.content}</div>
                  <div className="text-xs text-gray-500 mt-1">
                    {new Date(message.created_at).toLocaleTimeString()}
                  </div>
                </div>
              ))}
            </div>
            <div ref={messagesEndRef} />
          </div>

          <div className="xp-toolbar p-2 border-t border-xp-border">
            <form onSubmit={sendMessage} className="flex space-x-2">
              <input
                type="text"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder={selectedUser ? `Message ${selectedUser.username}...` : "Type your message..."}
                className="flex-1 xp-input text-xs"
              />
              <button
                type="submit"
                disabled={!newMessage.trim()}
                className="xp-button-blue px-3 py-1 text-xs font-bold disabled:opacity-50 flex items-center"
              >
                <Send className="h-3 w-3 mr-1" />
                Send
              </button>
            </form>
          </div>
        </div>

        {/* Right Sidebar - Users and Private Chats */}
        <div className="w-64 xp-window m-2 flex flex-col">
          <div className="xp-titlebar">
            <div className="flex items-center">
              <Users className="h-4 w-4 mr-2" />
              <span>Users & Chats</span>
            </div>
            <div className="flex">
              <button className="xp-titlebar-button xp-minimize-btn">_</button>
              <button className="xp-titlebar-button xp-close-btn">×</button>
            </div>
          </div>

          <div className="flex-1 p-2 bg-xp-panel flex flex-col">
            {/* Online Users Section */}
            <div className="mb-3">
              <h3 className="text-xs font-bold text-black mb-2">Online Users ({filteredUsers.length})</h3>
              <div className="mb-2">
                <div className="flex items-center xp-input-container">
                  <Search className="h-3 w-3 text-gray-500 mr-1" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search users..."
                    className="flex-1 xp-input text-xs"
                  />
                </div>
              </div>
              
              <div className="xp-listbox overflow-y-auto max-h-40">
                {filteredUsers.map((user) => (
                  <div
                    key={user.id}
                    onDoubleClick={() => startPrivateChat(user)}
                    className="xp-listitem p-2 cursor-pointer text-xs flex items-center"
                  >
                    <div className="w-2 h-2 bg-green-500 rounded-full mr-2"></div>
                    <span className="text-black">{user.username}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Private Chats Section */}
            <div className="flex-1">
              <h3 className="text-xs font-bold text-black mb-2">Private Chats ({getActiveChatUsers().length})</h3>
              <div className="xp-listbox flex-1 overflow-y-auto">
                {getActiveChatUsers().map((user) => {
                  const chatKey = getChatKey(currentUser.id, user.user_id);
                  const unreadCount = unreadCounts[chatKey] || 0;
                  
                  return (
                    <div
                      key={user.id}
                      onClick={() => startPrivateChat(user)}
                      className="xp-listitem p-2 cursor-pointer text-xs flex items-center justify-between"
                    >
                      <div className="flex items-center">
                        <div className="w-2 h-2 bg-blue-500 rounded-full mr-2"></div>
                        <span className="text-black">{user.username}</span>
                      </div>
                      <div className="flex items-center">
                        {unreadCount > 0 && (
                          <span className="bg-red-500 text-white rounded-full px-1 text-xs mr-1">
                            {unreadCount}
                          </span>
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            removePrivateChat(user);
                          }}
                          className="text-red-500 hover:text-red-700"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile Layout */}
      <div className="md:hidden h-screen flex flex-col">
        <div className="xp-window flex-1 m-1">
          <div className="xp-titlebar">
            <div className="flex items-center">
              <MessageSquare className="h-4 w-4 mr-2" />
              <span>Retro Chat</span>
            </div>
            <button onClick={handleLogout} className="w-5 h-4 xp-button text-xs">
              <LogOut className="h-2 w-2" />
            </button>
          </div>

          {/* Mobile Tabs */}
          <div className="flex bg-xp-panel border-b border-xp-border">
            <button
              onClick={() => setActiveMobilePanel('chat')}
              className={`flex-1 py-2 px-3 text-xs font-bold ${
                activeMobilePanel === 'chat' ? 'xp-tab-active' : 'xp-tab'
              }`}
            >
              Chat
            </button>
            <button
              onClick={() => setActiveMobilePanel('users')}
              className={`flex-1 py-2 px-3 text-xs font-bold ${
                activeMobilePanel === 'users' ? 'xp-tab-active' : 'xp-tab'
              }`}
            >
              Users ({getOnlineUsers().length})
            </button>
            <button
              onClick={() => setActiveMobilePanel('private')}
              className={`flex-1 py-2 px-3 text-xs font-bold ${
                activeMobilePanel === 'private' ? 'xp-tab-active' : 'xp-tab'
              }`}
            >
              Chats ({getActiveChatUsers().length})
            </button>
          </div>

          {/* Mobile Content */}
          <div className="flex-1 flex flex-col">
            {activeMobilePanel === 'chat' && (
              <>
                {selectedUser && (
                  <div className="xp-toolbar p-2 border-b border-xp-border">
                    <button
                      onClick={() => setSelectedUser(null)}
                      className="xp-button text-xs px-2 py-1"
                    >
                      ← Back to Public Chat
                    </button>
                  </div>
                )}
                
                <div className="flex-1 p-2 bg-white overflow-y-auto">
                  <div className="space-y-1">
                    {getCurrentMessages().map((message) => (
                      <div
                        key={message.id}
                        className={`p-2 rounded text-xs ${
                          message.user_id === currentUser?.id
                            ? 'xp-message-own ml-4'
                            : 'xp-message-other mr-4'
                        }`}
                      >
                        <div className="font-bold text-xp-blue mb-1">
                          {message.username}
                        </div>
                        <div className="text-black">{message.content}</div>
                        <div className="text-xs text-gray-500 mt-1">
                          {new Date(message.created_at).toLocaleTimeString()}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div ref={messagesEndRef} />
                </div>

                <div className="xp-toolbar p-2 border-t border-xp-border">
                  <form onSubmit={sendMessage} className="flex space-x-2">
                    <input
                      type="text"
                      value={newMessage}
                      onChange={(e) => setNewMessage(e.target.value)}
                      placeholder={selectedUser ? `Message ${selectedUser.username}...` : "Type your message..."}
                      className="flex-1 xp-input text-xs"
                    />
                    <button
                      type="submit"
                      disabled={!newMessage.trim()}
                      className="xp-button-blue px-3 py-1 text-xs font-bold disabled:opacity-50"
                    >
                      <Send className="h-3 w-3" />
                    </button>
                  </form>
                </div>
              </>
            )}

            {activeMobilePanel === 'users' && (
              <div className="flex-1 p-2 bg-xp-panel">
                <div className="mb-2">
                  <div className="flex items-center xp-input-container">
                    <Search className="h-3 w-3 text-gray-500 mr-1" />
                    <input
                      type="text"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      placeholder="Search users..."
                      className="flex-1 xp-input text-xs"
                    />
                  </div>
                </div>
                
                <div className="xp-listbox flex-1 overflow-y-auto">
                  {filteredUsers.map((user) => (
                    <div
                      key={user.id}
                      onDoubleClick={() => startPrivateChat(user)}
                      className="xp-listitem p-2 cursor-pointer text-xs flex items-center"
                    >
                      <div className="w-2 h-2 bg-green-500 rounded-full mr-2"></div>
                      <span className="text-black">{user.username}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeMobilePanel === 'private' && (
              <div className="flex-1 p-2 bg-xp-panel">
                <div className="xp-listbox flex-1 overflow-y-auto">
                  {getActiveChatUsers().map((user) => {
                    const chatKey = getChatKey(currentUser.id, user.user_id);
                    const unreadCount = unreadCounts[chatKey] || 0;
                    
                    return (
                      <div
                        key={user.id}
                        onClick={() => startPrivateChat(user)}
                        className="xp-listitem p-2 cursor-pointer text-xs flex items-center justify-between"
                      >
                        <div className="flex items-center">
                          <div className="w-2 h-2 bg-blue-500 rounded-full mr-2"></div>
                          <span className="text-black">{user.username}</span>
                        </div>
                        <div className="flex items-center">
                          {unreadCount > 0 && (
                            <span className="bg-red-500 text-white rounded-full px-1 text-xs mr-1">
                              {unreadCount}
                            </span>
                          )}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              removePrivateChat(user);
                            }}
                            className="text-red-500 hover:text-red-700"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChatRoom;