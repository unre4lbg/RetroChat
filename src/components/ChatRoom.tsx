import React, { useState, useEffect, useRef } from 'react';
import { useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { UserProfile } from '../types/supabase';
import { Send, LogOut, Terminal, Users as UsersIcon, ArrowLeft, MessageCircle, MessageSquare } from 'lucide-react';
import { RealtimeChannel } from '@supabase/supabase-js';
import OnlineStatus from './OnlineStatus';

// Extended Message interface to support optimistic updates
interface Message {
  id: string;
  user_id: string;
  username: string;
  content: string;
  created_at: string;
  receiver_id?: string | null;
  isOptimistic?: boolean;
}

interface ChatRoomProps {
  onLogout: () => void;
  isAuthenticated: boolean;
}

const ChatRoom: React.FC<ChatRoomProps> = ({ onLogout, isAuthenticated }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(new Set());
  const [newMessage, setNewMessage] = useState('');
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [realtimeStatus, setRealtimeStatus] = useState('Connecting...');
  const [subscriptionDetails, setSubscriptionDetails] = useState('');
  
  // Direct messaging states
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [isDirectMessage, setIsDirectMessage] = useState(false);
  const [unreadMessages, setUnreadMessages] = useState<Map<string, number>>(new Map());
  const [activeChats, setActiveChats] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState('');
  const [activeMobilePanel, setActiveMobilePanel] = useState<'chat' | 'users' | 'activeChats'>('chat');
  
  // Load active chats from localStorage on component mount
  useEffect(() => {
    if (currentUser) {
      const savedChats = localStorage.getItem(`activeChats_${currentUser.user_id}`);
      if (savedChats) {
        try {
          const chatArray = JSON.parse(savedChats);
          setActiveChats(new Set(chatArray));
        } catch (error) {
          console.error('Error loading active chats:', error);
        }
      }
    }
  }, [currentUser]);

  // Save active chats to localStorage whenever they change
  useEffect(() => {
    if (currentUser && activeChats.size > 0) {
      const chatArray = Array.from(activeChats);
      localStorage.setItem(`activeChats_${currentUser.user_id}`, JSON.stringify(chatArray));
    }
  }, [activeChats, currentUser]);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Refs to store channel instances for proper cleanup
  const messageChannelRef = useRef<RealtimeChannel | null>(null);
  const userChannelRef = useRef<RealtimeChannel | null>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastEventTimeRef = useRef<string>(new Date().toISOString());

  // Refs to store current state values for use in realtime callbacks
  const isDirectMessageRef = useRef(isDirectMessage);
  const selectedUserRef = useRef(selectedUser);

  // Update refs when state changes
  useEffect(() => {
    isDirectMessageRef.current = isDirectMessage;
    selectedUserRef.current = selectedUser;
  }, [isDirectMessage, selectedUser]);

  // ICQ sound effect function
  const playICQSound = () => {
    try {
      // Create audio context for better browser compatibility
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      
      // ICQ "Uh Oh!" sound frequencies and timing
      const playTone = (frequency: number, duration: number, delay: number = 0) => {
        setTimeout(() => {
          const oscillator = audioContext.createOscillator();
          const gainNode = audioContext.createGain();
          
          oscillator.connect(gainNode);
          gainNode.connect(audioContext.destination);
          
          oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime);
          oscillator.type = 'sine';
          
          gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
          gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + duration);
          
          oscillator.start(audioContext.currentTime);
          oscillator.stop(audioContext.currentTime + duration);
        }, delay);
      };
      
      // Play ICQ-like "Uh Oh!" sound sequence
      playTone(800, 0.15, 0);     // First tone
      playTone(600, 0.15, 150);   // Second tone (lower)
      playTone(400, 0.2, 300);    // Third tone (even lower)
    } catch (error) {
      console.log('Audio not supported or blocked:', error);
    }
  };

  // Filter online users based on search term
  const filteredOnlineUsers = useMemo(() => {
    const onlineUsers = users.filter(user => onlineUserIds.has(user.user_id));
    if (!searchTerm.trim()) {
      return onlineUsers;
    }
    return onlineUsers.filter(user => 
      user.username.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [users, onlineUserIds, searchTerm]);

  // Handle user double click for direct messaging
  const handleUserDoubleClick = (user: UserProfile) => {
    if (user.user_id === currentUser?.user_id) return; // Can't message yourself

    // Add user to active chats when starting a conversation
    setActiveChats(prev => new Set([...prev, user.user_id]));

    setSelectedUser(user);
    setIsDirectMessage(true);
    setMessages([]); // Clear current messages
    // Clear unread count for this user
    setUnreadMessages(prev => {
      const newMap = new Map(prev);
      newMap.delete(user.user_id);
      return newMap;
    });

    // Switch to chat panel on mobile when opening direct message
    setActiveMobilePanel('chat');

    fetchDirectMessages(user.user_id);
  };

  // Return to lobby
  const returnToLobby = () => {
    setSelectedUser(null);
    setIsDirectMessage(false);
    setMessages([]);
    // Clear unread count for all users when returning to lobby
    setUnreadMessages(new Map());
    fetchMessages(); // Fetch lobby messages
  };

  // Remove active chat function
  const removeActiveChat = (userId: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent triggering the chat open
    setActiveChats(prev => {
      const newSet = new Set(prev);
      newSet.delete(userId);
      
      // Save to localStorage immediately after removal
      if (currentUser) {
        const chatArray = Array.from(newSet);
        if (chatArray.length === 0) {
          localStorage.removeItem(`activeChats_${currentUser.user_id}`);
        } else {
          localStorage.setItem(`activeChats_${currentUser.user_id}`, JSON.stringify(chatArray));
        }
      }
      
      return newSet;
    });
    
    // If this was the currently selected user, return to lobby
    if (selectedUser?.user_id === userId) {
      returnToLobby();
    }
    
    // Clear unread messages for this user
    setUnreadMessages(prev => {
      const newMap = new Map(prev);
      newMap.delete(userId);
      return newMap;
    });
  };

  // Fallback polling mechanism
  const pollForNewEvents = async () => {
    if (!currentUser) return;
    
    try {
      console.log(`[${currentUser.username}] === POLLING FOR NEW MESSAGES ===`);
      console.log(`[${currentUser.username}] Polling since:`, lastEventTimeRef.current);

      const { data: newMessages, error } = await supabase
        .from('messages')
        .select('*')
        .gt('created_at', lastEventTimeRef.current)
        .order('created_at', { ascending: true });

      if (error) {
        console.error(`[${currentUser.username}] Polling error:`, error);
        return;
      }

      if (newMessages && newMessages.length > 0) {
        console.log(`[${currentUser.username}] Found ${newMessages.length} new messages via polling`);

        newMessages.forEach(newMessage => {
          console.log(`[${currentUser.username}] === POLLING MESSAGE RECEIVED ===`);
          console.log(`[${currentUser.username}] Message:`, newMessage);
          console.log(`[${currentUser.username}] POLLING receiver_id VALUE:`, newMessage.receiver_id);
          console.log(`[${currentUser.username}] POLLING receiver_id TYPE:`, typeof newMessage.receiver_id);

            
            // STRICT message filtering for polling - use refs for current values
            let shouldShowMessage = false;

            if (isDirectMessageRef.current && selectedUserRef.current) {
              // DIRECT MESSAGE VIEW: Show ONLY messages between current user and selected user
              const isFromSelectedToMe = (
                newMessage.user_id === selectedUserRef.current.user_id &&
                newMessage.receiver_id === currentUser.user_id
              );
              const isFromMeToSelected = (
                newMessage.user_id === currentUser.user_id &&
                newMessage.receiver_id === selectedUserRef.current.user_id
              );
              shouldShowMessage = isFromSelectedToMe || isFromMeToSelected;
            } else {
              // LOBBY VIEW: Show ONLY public messages (receiver_id must be null/undefined)
              shouldShowMessage = newMessage.receiver_id === null;
            }
            
            if (shouldShowMessage) {
              setMessages(prev => {
                const updatedMessages = [
                  ...prev.filter(msg => 
                    msg.id !== newMessage.id && 
                    !(msg.isOptimistic && msg.content === newMessage.content && msg.user_id === newMessage.user_id)
                  ),
                  newMessage
                ];
                updatedMessages.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
                return updatedMessages;
              });
              
              // Update lastEventTimeRef to track the newest message we've seen
              if (newMessage.created_at && new Date(newMessage.created_at).getTime() > new Date(lastEventTimeRef.current).getTime()) {
                lastEventTimeRef.current = newMessage.created_at;
                console.log(`[${currentUser.username}] Updated lastEventTimeRef from polling to:`, lastEventTimeRef.current);
              }
              
              // Play ICQ sound for incoming messages via polling (not from current user)
              if (newMessage.user_id !== currentUser.user_id) {
                playICQSound();
              }
              
              setRealtimeStatus(`Message received via polling from ${newMessage.username}!`);
            } else if (!isDirectMessageRef.current && newMessage.receiver_id === currentUser.user_id) {
              // User is in lobby but received a private message - increment unread count
              const senderId = newMessage.user_id;
              
              // Play ICQ sound for private messages received via polling while in lobby
              playICQSound();
              
              // Add sender to active chats when receiving a private message via polling
              setActiveChats(prev => new Set([...prev, senderId]));
              
              setUnreadMessages(prev => {
                const newMap = new Map(prev);
                newMap.set(senderId, (newMap.get(senderId) || 0) + 1);
                return newMap;
              });
            }
        });

        // Update last event time to the newest message
        lastEventTimeRef.current = newMessages[newMessages.length - 1].created_at;
        console.log(`[${currentUser.username}] Updated lastEventTimeRef from polling to:`, lastEventTimeRef.current);
      }
    } catch (error) {
      console.error(`[${currentUser.username}] Polling error:`, error);
    }
  };

  useEffect(() => {
    getCurrentUser();
  }, []);

  // Set up real-time subscriptions after currentUser is available
  useEffect(() => {
    if (!currentUser) return;

    console.log(`[${currentUser.username}] === USEEFFECT SUBSCRIPTION SETUP ===`);
    console.log(`[${currentUser.username}] isDirectMessage:`, isDirectMessage);
    console.log(`[${currentUser.username}] selectedUser:`, selectedUser?.username || 'none');

    console.log(`[${currentUser.username}] === SETTING UP REAL-TIME SUBSCRIPTIONS ===`);
    console.log(`[${currentUser.username}] User ID:`, currentUser.user_id);
    
    setRealtimeStatus('Setting up subscriptions...');
    setSubscriptionDetails(`User: ${currentUser.username}`);
    
    // Clean up any existing channels
    if (messageChannelRef.current) {
      console.log(`[${currentUser.username}] Cleaning up existing message channel...`);
      supabase.removeChannel(messageChannelRef.current);
      messageChannelRef.current = null;
    }
    if (userChannelRef.current) {
      console.log(`[${currentUser.username}] Cleaning up existing user channel...`);
      supabase.removeChannel(userChannelRef.current);
      userChannelRef.current = null;
    }
    
    // Create and store message channel
    console.log(`[${currentUser.username}] Creating shared message channel`);
    const messageChannel = supabase
      .channel('public:messages')
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'messages' },
        (payload) => {
          console.log(`[${currentUser.username}] === REALTIME MESSAGE RECEIVED ===`);
          console.log(`[${currentUser.username}] Payload:`, payload);
          console.log(`[${currentUser.username}] Event type:`, payload.eventType);
          console.log(`[${currentUser.username}] New data:`, payload.new);
          console.log(`[${currentUser.username}] === REALTIME DEBUG INFO ===`);
          console.log(`[${currentUser.username}] Current user ID:`, currentUser.user_id);
          console.log(`[${currentUser.username}] Message user_id:`, payload.new?.user_id);
          console.log(`[${currentUser.username}] Message receiver_id:`, payload.new?.receiver_id);
          console.log(`[${currentUser.username}] Message receiver_id type:`, typeof payload.new?.receiver_id);
          
          if (payload.eventType === 'INSERT' && payload.new) {
            console.log('RAW REALTIME PAYLOAD.NEW:', payload.new);
            console.log(`[${currentUser.username}] REALTIME receiver_id VALUE:`, payload.new.receiver_id);
            console.log(`[${currentUser.username}] REALTIME receiver_id TYPE:`, typeof payload.new.receiver_id);
            console.log(`[${currentUser.username}] Adding message to state...`);
            const newMessage = payload.new as Message;
            
            console.log(`[${currentUser.username}] === REAL-TIME CONTEXT CHECK ===`);
            console.log(`[${currentUser.username}] Current isDirectMessage:`, isDirectMessage);
            console.log(`[${currentUser.username}] Current selectedUser:`, selectedUser?.username || 'none');
            console.log(`[${currentUser.username}] Current user ID:`, currentUser.user_id);
            
            console.log(`[${currentUser.username}] === POLLING MESSAGE FILTERING DEBUG ===`);
            console.log(`[${currentUser.username}] Message from:`, newMessage.username);
            console.log(`[${currentUser.username}] Message user_id:`, newMessage.user_id);
            console.log(`[${currentUser.username}] Message receiver_id:`, newMessage.receiver_id);
            console.log(`[${currentUser.username}] Current view - isDirectMessage:`, isDirectMessage);
            console.log(`[${currentUser.username}] Selected user:`, selectedUser?.username);
            
            let shouldShowMessage = false;

            if (isDirectMessageRef.current && selectedUserRef.current) {
              // DIRECT MESSAGE VIEW: Show only messages between current user and selected user
              const messageIsFromSelectedToMe = (
                newMessage.user_id === selectedUserRef.current.user_id &&
                newMessage.receiver_id === currentUser.user_id
              );
              const messageIsFromMeToSelected = (
                newMessage.user_id === currentUser.user_id &&
                newMessage.receiver_id === selectedUserRef.current.user_id
              );

              shouldShowMessage = messageIsFromSelectedToMe || messageIsFromMeToSelected;
              
              console.log(`[${currentUser.username}] POLLING DIRECT CHAT FILTER:`, {
                messageIsFromSelectedToMe,
                messageIsFromMeToSelected,
                finalDecision: shouldShowMessage
              });
              
              console.log(`[${currentUser.username}] Direct message check:`, {
                messageIsFromSelectedToMe,
                messageIsFromMeToSelected,
                shouldShow: shouldShowMessage,
                messageUserId: newMessage.user_id,
                messageReceiverId: newMessage.receiver_id,
                selectedUserId: selectedUserRef.current?.user_id,
                currentUserId: currentUser.user_id
              });
            } else {
              // LOBBY VIEW: Show ONLY public messages (receiver_id must be null)
              const isPublicMessage = newMessage.receiver_id === null;
              shouldShowMessage = isPublicMessage;
              
              console.log(`[${currentUser.username}] POLLING LOBBY FILTER:`, {
                receiverIdValue: newMessage.receiver_id,
                receiverIdType: typeof newMessage.receiver_id,
                isNull: newMessage.receiver_id === null,
                isUndefined: newMessage.receiver_id === undefined,
                isPublicMessage,
                finalDecision: shouldShowMessage
              });
              
              console.log(`[${currentUser.username}] Lobby message check:`, {
                shouldShow: shouldShowMessage,
                hasReceiverId: !!newMessage.receiver_id,
                receiverId: newMessage.receiver_id
              });
            }
            
            console.log(`[${currentUser.username}] POLLING FINAL DECISION: ${shouldShowMessage ? 'SHOW' : 'HIDE'} message`);
            
            if (shouldShowMessage) {
              console.log(`[${currentUser.username}] === ADDING MESSAGE TO STATE (REAL-TIME) ===`);
              console.log(`[${currentUser.username}] Reason: shouldShowMessage = true`);
              
              // Play ICQ sound for incoming messages (not from current user)
              if (newMessage.user_id !== currentUser.user_id) {
                playICQSound();
              }
              
              setMessages(prev => {
                console.log(`[${currentUser.username}] Processing message from:`, newMessage.username);
                // Filter out duplicates and optimistic messages that match this real message
                const updatedMessages = [
                  ...prev.filter(msg => 
                    msg.id !== newMessage.id && // Remove exact ID matches
                    !(msg.isOptimistic && msg.content === newMessage.content && msg.user_id === newMessage.user_id) // Remove matching optimistic messages
                  ),
                  newMessage
                ];
                // Sort all messages by creation time to maintain chronological order
                updatedMessages.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
                console.log(`[${currentUser.username}] Updated messages count:`, updatedMessages.length);
                return updatedMessages;
              });
              
              // Update lastEventTimeRef to track the newest message we've seen
              if (newMessage.created_at && new Date(newMessage.created_at).getTime() > new Date(lastEventTimeRef.current).getTime()) {
                lastEventTimeRef.current = newMessage.created_at;
                console.log(`[${currentUser.username}] Updated lastEventTimeRef from real-time to:`, lastEventTimeRef.current);
              }

              setRealtimeStatus(`Message received from ${payload.new.username}!`);
            } else if (!isDirectMessageRef.current && newMessage.receiver_id === currentUser.user_id) {
              console.log(`[${currentUser.username}] === INCREMENTING UNREAD COUNT (REAL-TIME) ===`);
              console.log(`[${currentUser.username}] Reason: Private message received while in lobby`);
              
              // Play ICQ sound for private messages received while in lobby
              playICQSound();
              
              // User is in lobby but received a private message - increment unread count
              const senderId = newMessage.user_id;
              
              // Add sender to active chats when receiving a private message
              setActiveChats(prev => new Set([...prev, senderId]));
              
              setUnreadMessages(prev => {
                const newMap = new Map(prev);
                newMap.set(senderId, (newMap.get(senderId) || 0) + 1);
                return newMap;
              });
              
              setRealtimeStatus(`New private message from ${newMessage.username}!`);
            }
          }
        }
      )
      .subscribe(async (status) => {
        console.log(`[${currentUser.username}] === MESSAGE SUBSCRIPTION STATUS ===`);
        console.log(`[${currentUser.username}] Status:`, status);
        
        if (status === 'SUBSCRIBED') {
          setRealtimeStatus(`Connected - Messages (${currentUser.username})`);
          setSubscriptionDetails(prev => prev + ' | Messages: Connected');
          console.log(`[${currentUser.username}] Fetching initial messages...`);
          if (isDirectMessageRef.current && selectedUserRef.current) {
            fetchDirectMessages(selectedUserRef.current.user_id);
          } else {
            fetchMessages();
          }
        } else if (status === 'CHANNEL_ERROR') {
          setRealtimeStatus(`ERROR - Messages failed (${currentUser.username})`);
          setSubscriptionDetails(prev => prev + ' | Messages: ERROR');
        } else if (status === 'TIMED_OUT') {
          setRealtimeStatus(`TIMEOUT - Messages (${currentUser.username})`);
          setSubscriptionDetails(prev => prev + ' | Messages: TIMEOUT');
        } else if (status === 'CLOSED') {
          setRealtimeStatus(`CLOSED - Messages (${currentUser.username})`);
          setSubscriptionDetails(prev => prev + ' | Messages: CLOSED');
        } else {
          setRealtimeStatus(`Messages: ${status} (${currentUser.username})`);
          setSubscriptionDetails(prev => prev + ` | Messages: ${status}`);
        }
      });

    // Store the message channel reference
    messageChannelRef.current = messageChannel;
    console.log(`[${currentUser.username}] Message channel stored in ref`);

    // Create and store user profiles channel
    console.log(`[${currentUser.username}] Creating shared user profiles channel`);
    const userChannel = supabase
      .channel('public:user_profiles')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'user_profiles' },
        (payload) => {
          console.log(`[${currentUser.username}] === USER PROFILE CHANGE DETECTED ===`);
          console.log(`[${currentUser.username}] Payload:`, payload);
          fetchUsers();
        }
      )
      .on('presence', { event: 'sync' }, () => {
        console.log(`[${currentUser.username}] === PRESENCE SYNC ===`);
        const newState = userChannel.presenceState();
        console.log(`[${currentUser.username}] Presence state:`, newState);
        
        const onlineIds = new Set<string>();
        Object.values(newState).forEach((presences: any) => {
          presences.forEach((presence: any) => {
            if (presence.user_id) {
              onlineIds.add(presence.user_id);
            }
          });
        });
        
        console.log(`[${currentUser.username}] Online user IDs:`, Array.from(onlineIds));
        setOnlineUserIds(onlineIds);
      })
      .on('presence', { event: 'join' }, ({ key, newPresences }) => {
        console.log(`[${currentUser.username}] === USER JOINED ===`);
        console.log(`[${currentUser.username}] Key:`, key);
        console.log(`[${currentUser.username}] New presences:`, newPresences);
        
        newPresences.forEach((presence: any) => {
          if (presence.user_id) {
            setOnlineUserIds(prev => new Set([...prev, presence.user_id]));
          }
        });
      })
      .on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
        console.log(`[${currentUser.username}] === USER LEFT ===`);
        console.log(`[${currentUser.username}] Key:`, key);
        console.log(`[${currentUser.username}] Left presences:`, leftPresences);
        
        leftPresences.forEach((presence: any) => {
          if (presence.user_id) {
            setOnlineUserIds(prev => {
              const newSet = new Set(prev);
              newSet.delete(presence.user_id);
              return newSet;
            });
          }
        });
      })
      .subscribe(async (status) => {
        console.log(`[${currentUser.username}] === USER SUBSCRIPTION STATUS ===`);
        console.log(`[${currentUser.username}] Status:`, status);
        
        if (status === 'SUBSCRIBED') {
          setSubscriptionDetails(prev => prev + ` | Users: Connected (${currentUser.username})`);
          console.log(`[${currentUser.username}] Fetching initial users...`);
          fetchUsers();
          
          // Track user presence
          console.log(`[${currentUser.username}] === TRACKING PRESENCE ===`);
          await userChannel.track({
            user_id: currentUser.user_id,
            username: currentUser.username,
            online_at: new Date().toISOString(),
          });
        } else if (status === 'CHANNEL_ERROR') {
          setSubscriptionDetails(prev => prev + ` | Users: ERROR (${currentUser.username})`);
        } else if (status === 'TIMED_OUT') {
          setSubscriptionDetails(prev => prev + ` | Users: TIMEOUT (${currentUser.username})`);
        } else if (status === 'CLOSED') {
          setSubscriptionDetails(prev => prev + ` | Users: CLOSED (${currentUser.username})`);
        } else {
          setSubscriptionDetails(prev => prev + ` | Users: ${status} (${currentUser.username})`);
        }
      });

    // Store the user channel reference
    userChannelRef.current = userChannel;
    console.log(`[${currentUser.username}] User channel stored in ref`);

    // Start polling as fallback (every 2 seconds)
    console.log(`[${currentUser.username}] Starting fallback polling...`);
    pollIntervalRef.current = setInterval(pollForNewEvents, 2000);

    return () => {
      console.log(`[${currentUser.username}] === CLEANING UP REAL-TIME SUBSCRIPTIONS ===`);
      setRealtimeStatus('Disconnected');
      setSubscriptionDetails('');
      
      // Clear polling interval
      if (pollIntervalRef.current) {
        console.log(`[${currentUser.username}] Clearing polling interval`);
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      
      // Clean up channels using stored references
      if (messageChannelRef.current) {
        console.log(`[${currentUser.username}] Removing message channel from cleanup`);
        supabase.removeChannel(messageChannelRef.current);
        messageChannelRef.current = null;
      }
      if (userChannelRef.current) {
        console.log(`[${currentUser.username}] Removing user channel from cleanup`);
        // Untrack presence before removing channel
        userChannelRef.current.untrack();
        supabase.removeChannel(userChannelRef.current);
        userChannelRef.current = null;
      }
    };
  }, [currentUser, currentUser?.user_id]);

  // Fetch messages when switching between lobby and direct messages
  useEffect(() => {
    if (!currentUser) return;

    console.log(`[${currentUser.username}] === VIEW CHANGED ===`);
    console.log(`[${currentUser.username}] isDirectMessage:`, isDirectMessage);
    console.log(`[${currentUser.username}] selectedUser:`, selectedUser?.username);

    if (isDirectMessage && selectedUser) {
      fetchDirectMessages(selectedUser.user_id);
    } else {
      fetchMessages();
    }
  }, [currentUser, isDirectMessage, selectedUser]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const getCurrentUser = async () => {
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      
      if (userError) {
        console.error('Error getting user:', userError);
        handleLogout();
        return;
      }
      
      if (user) {
        console.log('Current authenticated user:', user.id);
        const { data: profile, error: profileError } = await supabase
          .from('user_profiles')
          .select('*')
          .eq('user_id', user.id)
          .single();
          
        if (profileError) {
          console.error('Error getting user profile:', profileError);
          handleLogout();
          return;
        }
        
        if (profile) {
          console.log('User profile loaded:', profile.username);
          setCurrentUser(profile);
        } else {
          console.error('No user profile found');
          handleLogout();
        }
      } else {
        console.log('No authenticated user found');
        handleLogout();
      }
    } catch (error) {
      console.error('Error in getCurrentUser:', error);
      handleLogout();
    }
    setLoading(false);
  };

  const fetchMessages = async () => {
    if (!currentUser?.user_id) return;
    
    try {
      // Fetch both public messages and private messages for current user
      const { data: publicMessages, error: publicError } = await supabase
        .from('messages')
        .select('*')
        .is('receiver_id', null)
        .order('created_at', { ascending: true });
      
      if (publicError) {
        console.error('Error fetching public messages:', publicError);
        return;
      }
      
      const { data: privateMessages, error: privateError } = await supabase
        .from('messages')
        .select('*')
        .or(`receiver_id.eq.${currentUser.user_id},user_id.eq.${currentUser.user_id}`)
        .not('receiver_id', 'is', null)
        .order('created_at', { ascending: true });
      
      if (privateError) {
        console.error('Error fetching private messages:', privateError);
        return;
      }
      
      if (publicMessages && privateMessages) {
        // Combine and sort all messages
        const allMessages = [...publicMessages, ...privateMessages].sort((a, b) =>
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        );
        setMessages(allMessages);

        // Update lastEventTimeRef to the newest message's timestamp
        if (allMessages.length > 0) {
          const newestMessage = allMessages[allMessages.length - 1]; // Last message (newest due to ascending order)
          lastEventTimeRef.current = newestMessage.created_at;
          console.log(`[${currentUser.username}] Updated lastEventTimeRef from fetchMessages to:`, lastEventTimeRef.current);
        }
      }
    } catch (error) {
      console.error('Error in fetchMessages:', error);
    }
  };

  const fetchDirectMessages = async (otherUserId: string) => {
    if (!currentUser) return;
    
    console.log(`[${currentUser.username}] === FETCHING DIRECT MESSAGES WITH ${otherUserId} ===`);
    const { data } = await supabase
      .from('messages')
      .select('*')
      .or(`and(user_id.eq.${currentUser.user_id},receiver_id.eq.${otherUserId}),and(user_id.eq.${otherUserId},receiver_id.eq.${currentUser.user_id})`)
      .order('created_at', { ascending: true });
    
    console.log(`[${currentUser.username}] DIRECT MESSAGES FROM DB:`, data);
    console.log(`[${currentUser.username}] DIRECT MESSAGES COUNT:`, data?.length || 0);
    if (data) {
      data.forEach((msg, index) => {
        console.log(`[${currentUser.username}] DIRECT MSG ${index}:`, {
          from: msg.username,
          content: msg.content.substring(0, 20) + '...',
          receiver_id: msg.receiver_id,
          receiver_id_type: typeof msg.receiver_id
        });
      });
      setMessages(data);
      
      // Update lastEventTimeRef to the newest message's timestamp
      if (data.length > 0) {
        const newestMessage = data[data.length - 1]; // Last message (newest due to ascending order)
        lastEventTimeRef.current = newestMessage.created_at;
        console.log(`[${currentUser.username}] Updated lastEventTimeRef to:`, lastEventTimeRef.current);
      }
    }
  };

  const fetchUsers = async () => {
    const { data } = await supabase
      .from('user_profiles')
      .select('*')
      .order('username');
    if (data) setUsers(data);
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !currentUser) return;

    console.log(`[${currentUser.username}] === SEND MESSAGE DEBUG START ===`);
    console.log(`[${currentUser.username}] isDirectMessage:`, isDirectMessage);
    console.log(`[${currentUser.username}] selectedUser:`, selectedUser);
    console.log(`[${currentUser.username}] selectedUser?.user_id:`, selectedUser?.user_id);
    console.log(`[${currentUser.username}] selectedUser?.username:`, selectedUser?.username);

    console.log(`[${currentUser.username}] === SENDING MESSAGE ===`);
    console.log(`[${currentUser.username}] Message content:`, newMessage.trim());
    console.log(`[${currentUser.username}] Is direct message:`, isDirectMessage);
    console.log(`[${currentUser.username}] Selected user:`, selectedUser?.username);
    console.log(`[${currentUser.username}] Selected user ID:`, selectedUser?.user_id);
    
    setRealtimeStatus('Sending message...');

    // Determine receiver_id with explicit logging
    let receiverId = null;
    if (isDirectMessage && selectedUser && selectedUser.user_id) {
      receiverId = selectedUser.user_id;
      console.log(`[${currentUser.username}] DIRECT MESSAGE: receiverId set to:`, receiverId);
    } else {
      receiverId = null;
      console.log(`[${currentUser.username}] PUBLIC MESSAGE: receiverId set to null`);
      console.log(`[${currentUser.username}] Reason - isDirectMessage:`, isDirectMessage, 'selectedUser exists:', !!selectedUser, 'selectedUser.user_id exists:', !!selectedUser?.user_id);
    }
    
    console.log(`[${currentUser.username}] === RECEIVER ID CALCULATION ===`);
    console.log(`[${currentUser.username}] isDirectMessage:`, isDirectMessage);
    console.log(`[${currentUser.username}] selectedUser exists:`, !!selectedUser);
    console.log(`[${currentUser.username}] selectedUser.user_id:`, selectedUser?.user_id);
    console.log(`[${currentUser.username}] Final receiverId:`, receiverId);
    console.log(`[${currentUser.username}] Final receiverId type:`, typeof receiverId);

    // Create optimistic message for immediate UI feedback
    const tempMessage: Message = {
      id: `temp-${Date.now()}-${Math.random()}`, // Temporary client-side ID
      user_id: currentUser.user_id,
      username: currentUser.username,
      content: newMessage.trim(),
      created_at: new Date().toISOString(),
      receiver_id: receiverId,
      isOptimistic: true
    };

    console.log(`[${currentUser.username}] === OPTIMISTIC MESSAGE ===`);
    console.log(`[${currentUser.username}] Optimistic message receiver_id:`, tempMessage.receiver_id);

    // Add optimistic message immediately to UI ONLY if it belongs to current view
    const shouldAddOptimistic = isDirectMessage 
      ? (selectedUser && tempMessage.receiver_id === selectedUser.user_id) // Direct chat: only if sending to selected user
      : !tempMessage.receiver_id; // Lobby: only if public message

    if (shouldAddOptimistic) {
      setMessages(prev => [...prev, tempMessage]);
    }

    try {
      const { data, error } = await supabase
        .from('messages')
        .insert({
          user_id: currentUser.user_id,
          username: currentUser.username,
          content: newMessage.trim(),
          receiver_id: receiverId
        })
        .select()
        .single();

      if (error) {
        console.error(`[${currentUser.username}] Error sending message:`, error);
        setRealtimeStatus(`Error sending message: ${error.message}`);
        
        // Remove optimistic message on error
        if (shouldAddOptimistic) {
          setMessages(prev => prev.filter(msg => msg.id !== tempMessage.id));
        }
        return;
      }

      console.log(`[${currentUser.username}] Message sent successfully:`, data);
      setRealtimeStatus(`Message sent successfully!`);

      // Immediately replace optimistic message with real one as fallback
      // (realtime subscription should also handle this, but this ensures it happens)
      if (shouldAddOptimistic && data) {
        setMessages(prev => {
          const filtered = prev.filter(msg => msg.id !== tempMessage.id);
          return [...filtered, data as Message].sort((a, b) =>
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
          );
        });
      }

      setNewMessage('');
      
    } catch (error) {
      console.error(`[${currentUser.username}] Error in sendMessage:`, error);
      setRealtimeStatus(`Error: ${error}`);
      
      // Remove optimistic message on error
      if (shouldAddOptimistic) {
        setMessages(prev => prev.filter(msg => msg.id !== tempMessage.id));
      }
    }
  };

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
      onLogout();
    } catch (error) {
      console.error('Error logging out:', error);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-green-400 text-xl">Loading chat...</div>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-red-400 text-xl">Error loading user profile</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen xp-login-bg font-win98 flex flex-col">
      {/* Header - Fixed on mobile */}
      <div className="win98-window md:relative z-50 border-b-0 md:border-b-2">
        <div className="win98-titlebar flex items-center justify-between px-2 py-1">
          <div className="flex items-center">
            <Terminal className="h-4 w-4 mr-1" />
            <span>
              {isDirectMessage && selectedUser 
                ? `Частен чат с ${selectedUser.username}`
                : 'RetroChat - Главно лоби'
              }
            </span>
          </div>
          <div className="flex">
            <button className="xp-titlebar-button mr-1">
              <span>_</span>
            </button>
            <button className="xp-titlebar-button mr-1">
              <span>□</span>
            </button>
            <button 
              onClick={handleLogout}
              className="xp-titlebar-button xp-close-button"
            >
              <span>×</span>
            </button>
          </div>
        </div>

        <div className="win98-panel p-2 md:mb-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            {isDirectMessage && selectedUser ? (
              <button
                onClick={returnToLobby}
                className="win98-button py-1 px-2 text-xs font-bold text-black flex items-center"
              >
                <ArrowLeft className="w-4 h-4" />
                <span className="hidden md:inline">Назад към лобито</span>
                <span className="md:hidden">Назад</span>
              </button>
            ) : (
              <div className="flex items-center space-x-2">
                <Terminal className="w-6 h-6" />
                <h1 className="text-sm font-bold text-black">RetroChat v1.0</h1>
              </div>
            )}
          </div>

          <div className="flex items-center space-x-4">
            <span className="text-xs text-black hidden md:inline">
              {isDirectMessage && selectedUser
                ? `Чат с ${selectedUser.username}`
                : `Добре дошъл, ${currentUser.username}`
              }
            </span>
            <button
              onClick={handleLogout}
              className="win98-button py-1 px-2 text-xs font-bold text-black flex items-center"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden md:inline">Изход</span>
            </button>
          </div>
        </div>
        </div>
      </div>

      {/* Mobile Panel Selector - Fixed under header */}
      <div className="md:hidden  win98-panel flex z-40 border-t-2 border-win98-light-gray">
        <button
          onClick={() => setActiveMobilePanel('chat')}
          className={`flex-1 py-2 px-1 text-center text-xs ${activeMobilePanel === 'chat' ? 'win98-inset bg-win98-light-gray' : 'win98-button'}`}
        >
          <MessageCircle className="w-5 h-5 mx-auto mb-1" />
          <span>Чат</span>
        </button>
        <button
          onClick={() => setActiveMobilePanel('users')}
          className={`flex-1 py-2 px-1 text-center text-xs ${activeMobilePanel === 'users' ? 'win98-inset bg-win98-light-gray' : 'win98-button'}`}
        >
          <UsersIcon className="w-5 h-5 mx-auto mb-1" />
          <span>Потребители ({filteredOnlineUsers.length})</span>
        </button>
        <button
          onClick={() => setActiveMobilePanel('activeChats')}
          className={`flex-1 py-2 px-1 text-center text-xs ${activeMobilePanel === 'activeChats' ? 'win98-inset bg-win98-light-gray' : 'win98-button'}`}
        >
          <MessageSquare className="w-5 h-5 mx-auto mb-1" />
          <span>Чатове ({activeChats.size})</span>
        </button>
      </div>

      {/* Main content with proper spacing for fixed header and tabs on mobile */}
      <div className="md:flex md:h-full h-full flex-1">

        {/* Chat Area */}
        <div className={`w-full md:flex-1 flex flex-col win98-window chat-window h-full ${activeMobilePanel === 'chat' ? 'block' : 'hidden md:flex'}`}>
          {/* Messages - Extra padding on mobile for fixed input */}
          <div className="flex-1 overflow-y-auto irc-chat-container p-2 pb-20 md:pb-4 bg-white">
            {messages.map((message) => {
              const timestamp = new Date(message.created_at);
              const day = String(timestamp.getDate()).padStart(2, '0');
              const month = String(timestamp.getMonth() + 1).padStart(2, '0');
              const year = timestamp.getFullYear();
              const hours = String(timestamp.getHours()).padStart(2, '0');
              const minutes = String(timestamp.getMinutes()).padStart(2, '0');
              const seconds = String(timestamp.getSeconds()).padStart(2, '0');
              const dateStr = `${day}.${month}.${year}`;
              const timeStr = `${hours}:${minutes}:${seconds}`;

              const isOwnMessage = message.user_id === currentUser.user_id;

              return (
                <div key={message.id} className="irc-message mb-1">
                  <div>
                    <span className={isOwnMessage ? "irc-username-own" : "irc-username"}>{message.username}</span>
                    <span className="irc-message-content"> {message.content}</span>
                    {message.isOptimistic && <span className="irc-timestamp"> • Изпраща се...</span>}
                  </div>
                  <div className="irc-timestamp text-xs ml-4">{dateStr} {timeStr}</div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>

          {/* Message Input - Fixed at bottom on mobile */}
          <div className="win98-panel p-3 border-t-2 border-win98-dark-gray md:relative sticky bottom-0">
            <form onSubmit={sendMessage} className="flex space-x-2">
              <input
                type="text"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder={
                  isDirectMessage && selectedUser
                    ? `Съобщение до ${selectedUser.username}...`
                    : "Напиши съобщение..."
                }
                className="flex-1 win98-input px-3 py-2 text-sm"
                disabled={!currentUser}
              />
              <button
                type="submit"
                disabled={!newMessage.trim() || !currentUser}
                className="win98-button py-2 px-4 text-sm font-bold text-black disabled:opacity-50 flex items-center space-x-2"
              >
                <Send className="w-4 h-4 text-blue-600" />
                <span>Изпрати</span>
              </button>
            </form>
          </div>
        </div>

        {/* Right Sidebar with Both Panels */}
        <div className="w-full md:w-80 flex flex-col h-full">
          {/* Show users panel only on Users tab in mobile, always visible on desktop */}
          <div className={`${activeMobilePanel === 'users' ? 'flex flex-col h-full' : 'hidden'} md:block md:h-auto`}>
            {/* Online Users Panel */}
            <div className={`flex flex-col flex-1 mb-2 h-full md:h-auto ${activeMobilePanel === 'users' ? '' : 'md:win98-window md:border-l-2 border-win98-dark-gray'}`}>
          <div className="win98-titlebar">
            <span className="flex items-center">
              <UsersIcon className="w-4 h-4 mr-1" />
              Потребители на линия ({filteredOnlineUsers.length})
            </span>
          </div>
          <div className="win98-panel p-2">
            <div className="text-xs mb-2 text-gray-700">
              Двоен клик за директен чат
            </div>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Търси потребител..."
              className="w-full win98-input text-xs"
            />
          </div>
          <div className="flex-1 overflow-y-auto win98-inset bg-white p-2">
            <div className="space-y-1">
              {filteredOnlineUsers.map((user) => (
                <div
                  key={user.id}
                  onDoubleClick={() => handleUserDoubleClick(user)}
                  className={`px-2 py-1 cursor-pointer flex items-center ${
                    selectedUser?.user_id === user.user_id
                      ? 'bg-blue-700 text-white'
                      : 'hover:bg-blue-100'
                  }`}
                >
                  <div className="online-dot mr-2"></div>
                  <span className="text-xs">{user.username}</span>
                  {user.user_id === currentUser?.user_id && (
                    <span className="text-xs ml-1">(вие)</span>
                  )}
                  {unreadMessages.has(user.user_id) && (
                    <span className="ml-auto bg-red-600 text-white text-xs px-1 rounded">
                      {unreadMessages.get(user.user_id)}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
            </div>
          </div>

          {/* Show active chats panel only on Chats tab in mobile, always visible on desktop */}
          <div className={`${activeMobilePanel === 'activeChats' ? 'flex flex-col h-full' : 'hidden'} md:block md:h-auto`}>
            {/* Active Chats Panel */}
            <div className={`flex flex-col flex-1 h-full md:h-auto ${activeMobilePanel === 'activeChats' ? '' : 'md:win98-window md:border-l-2 border-win98-dark-gray'}`}>
          <div className="win98-titlebar">
            <span className="flex items-center">
              <MessageSquare className="w-4 h-4 mr-1" />
              Активни чатове ({activeChats.size})
            </span>
          </div>
          <div className="win98-panel p-2">
            <div className="text-xs text-gray-700">
              Клик за отваряне на чат
            </div>
          </div>
          <div className="flex-1 overflow-y-auto win98-inset bg-white p-2">
            <div className="space-y-1">
              {Array.from(activeChats).map((userId) => {
                const user = users.find(u => u.user_id === userId);
                if (!user) return null;

                return (
                  <div
                    key={userId}
                    onClick={() => handleUserDoubleClick(user)}
                    className={`px-2 py-1 cursor-pointer flex items-center ${
                      selectedUser?.user_id === userId
                        ? 'bg-blue-700 text-white'
                        : 'hover:bg-blue-100'
                    }`}
                  >
                    <div className={`mr-2 ${
                      onlineUserIds.has(userId) ? 'online-dot' : 'w-2 h-2 rounded-full bg-gray-400'
                    }`}></div>
                    <span className="text-xs">{user.username}</span>
                    {unreadMessages.has(userId) && (
                      <span className="ml-auto bg-red-600 text-white text-xs px-1 rounded mr-1">
                        {unreadMessages.get(userId)}
                      </span>
                    )}
                    <button
                      onClick={(e) => removeActiveChat(userId, e)}
                      className="ml-auto text-xs hover:bg-red-500 hover:text-white px-1"
                    >
                      ×
                    </button>
                  </div>
                );
              })}
              {activeChats.size === 0 && (
                <div className="text-center text-gray-500 py-8">
                  <MessageSquare className="w-8 h-8 mx-auto mb-2" />
                  <p className="text-xs">Няма активни чатове</p>
                </div>
              )}
            </div>
          </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChatRoom;