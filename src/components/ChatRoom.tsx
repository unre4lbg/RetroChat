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
}

const ChatRoom: React.FC<ChatRoomProps> = ({ onLogout }) => {
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
      console.log(`[${currentUser.username}] === POLLING FOR NEW EVENTS ===`);
      
      const { data: events, error } = await supabase
        .from('realtime_events')
        .select('*')
        .eq('table_name', 'messages')
        .gt('created_at', lastEventTimeRef.current)
        .order('created_at', { ascending: true });
      
      if (error) {
        console.error(`[${currentUser.username}] Polling error:`, error);
        return;
      }
      
      if (events && events.length > 0) {
        console.log(`[${currentUser.username}] Found ${events.length} new events via polling`);
        
        events.forEach(event => {
          if (event.event_type === 'INSERT' && event.payload) {
            console.log(`[${currentUser.username}] === POLLING MESSAGE RECEIVED ===`);
            console.log(`[${currentUser.username}] Event payload:`, event.payload);
            console.log(`[${currentUser.username}] POLLING receiver_id VALUE:`, (event.payload as Message).receiver_id);
            console.log(`[${currentUser.username}] POLLING receiver_id TYPE:`, typeof (event.payload as Message).receiver_id);
            
            const newMessage = event.payload as Message;
            
            // STRICT message filtering for polling - same logic as real-time
            let shouldShowMessage = false;
            
            if (isDirectMessage && selectedUser) {
              // DIRECT MESSAGE VIEW: Show ONLY messages between current user and selected user
              const isFromSelectedToMe = (
                newMessage.user_id === selectedUser.user_id && 
                newMessage.receiver_id === currentUser.user_id
              );
              const isFromMeToSelected = (
                newMessage.user_id === currentUser.user_id && 
                newMessage.receiver_id === selectedUser.user_id
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
            } else if (!isDirectMessage && newMessage.receiver_id === currentUser.user_id) {
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
          }
        });
        
        // Update last event time
        lastEventTimeRef.current = events[events.length - 1].created_at;
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
            
            if (isDirectMessage && selectedUser) {
              // DIRECT MESSAGE VIEW: Show only messages between current user and selected user
              const messageIsFromSelectedToMe = (
                newMessage.user_id === selectedUser.user_id && 
                newMessage.receiver_id === currentUser.user_id
              );
              const messageIsFromMeToSelected = (
                newMessage.user_id === currentUser.user_id && 
                newMessage.receiver_id === selectedUser.user_id
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
                selectedUserId: selectedUser.user_id,
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
            } else if (!isDirectMessage && newMessage.receiver_id === currentUser.user_id) {
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
          if (isDirectMessage && selectedUser) {
            fetchDirectMessages(selectedUser.user_id);
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
  }, [currentUser, currentUser?.user_id, isDirectMessage, selectedUser]);

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
    console.log(`[${currentUser?.username}] === FETCHING LOBBY MESSAGES ===`);
    const { data } = await supabase
      .from('messages')
      .select('*')
      .is('receiver_id', null) // Only public messages (lobby)
      .order('created_at', { ascending: true });
    
    console.log(`[${currentUser?.username}] LOBBY MESSAGES FROM DB:`, data);
    console.log(`[${currentUser?.username}] LOBBY MESSAGES COUNT:`, data?.length || 0);
    if (data) {
      data.forEach((msg, index) => {
        console.log(`[${currentUser?.username}] LOBBY MSG ${index}:`, {
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
        console.log(`[${currentUser?.username}] Updated lastEventTimeRef to:`, lastEventTimeRef.current);
      }
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
    
    console.log(`[${currentUser.username}] === OPTIMISTIC MESSAGE DECISION ===`);
    console.log(`[${currentUser.username}] Should add optimistic:`, shouldAddOptimistic);

    if (shouldAddOptimistic) {
      setMessages(prev => [...prev, tempMessage]);
    }
    
    // Clear input field immediately
    setNewMessage('');

    console.log(`[${currentUser.username}] === INSERTING TO DATABASE ===`);
    console.log(`[${currentUser.username}] Database insert receiver_id:`, receiverId);
    console.log(`[${currentUser.username}] Database insert receiver_id type:`, typeof receiverId);
    console.log(`[${currentUser.username}] Database insert payload:`, {
      user_id: currentUser.user_id,
      username: currentUser.username,
      content: newMessage.trim(),
      receiver_id: receiverId,
    });

    const { error } = await supabase
      .from('messages')
      .insert({
        user_id: currentUser.user_id,
        username: currentUser.username,
        content: newMessage.trim(),
        receiver_id: receiverId,
      });

    console.log(`[${currentUser.username}] === MESSAGE SEND RESULT ===`);
    console.log(`[${currentUser.username}] Error:`, error);
    if (error) {
      console.error(`[${currentUser.username}] Database insert error:`, error);
    }
    
    setRealtimeStatus(error ? 'Send failed!' : 'Message sent, waiting for confirmation...');
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    onLogout();
  };

  const formatTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const formatDate = (timestamp: string) => {
    return new Date(timestamp).toLocaleDateString('en-US', {
      month: '2-digit',
      day: '2-digit',
      year: '2-digit'
    });
  };

  const getMessageTextColor = (username: string) => {
    if (!username) {
      return 'text-black';
    }
    if (username.toLowerCase().includes('chatbot') || username.toLowerCase().includes('bot')) {
      return 'text-chat-bot-text';
    }
    if (username.toLowerCase().includes('moderator') || username.toLowerCase().includes('mod')) {
      return 'text-chat-moderator-text';
    }
    return 'text-black';
  };

  if (loading) {
    return (
      <div className="h-screen bg-win98-desktop flex items-center justify-center font-win98">
        <div className="win98-panel p-4">
          <div className="text-black text-sm">Loading chat system...</div>
        </div>
      </div>
    );
  }

  // Debug log before render
  console.log(`[${currentUser?.username}] === RENDER DEBUG ===`);
  console.log(`[${currentUser?.username}] Current view:`, isDirectMessage ? `Direct chat with ${selectedUser?.username}` : 'Lobby');
  console.log(`[${currentUser?.username}] Messages in state:`, messages.length);
  messages.forEach((msg, index) => {
    console.log(`[${currentUser?.username}] RENDER MSG ${index}:`, {
      from: msg.username,
      content: msg.content.substring(0, 20) + '...',
      receiver_id: msg.receiver_id,
      receiver_id_type: typeof msg.receiver_id,
      isOptimistic: msg.isOptimistic || false
    });
  });

  return (
    <div className="h-screen bg-win98-desktop font-win98 p-2 flex items-center justify-center">
      <div className="win98-window max-w-[900px] h-full w-full flex">
        {/* Main Chat Window */}
        <div className="flex-1 win98-panel mr-2 flex flex-col h-full">
          {/* Title Bar */}
          <div className="win98-titlebar flex items-center justify-between px-2 py-1">
            <div className="flex items-center">
              <Terminal className="h-4 w-4 mr-1" />
              <span>
                {isDirectMessage && selectedUser 
                  ? `Директен чат с ${selectedUser.username}` 
                  : `Ретро 4ат - Споделено Лоби`
                } - {currentUser?.username}
              </span>
            </div>
            <div className="flex items-center">
              <div className="mr-2 text-xs">
                <span className={`px-1 ${realtimeStatus.includes('Connected') ? 'text-icq-green' : realtimeStatus.includes('ERROR') || realtimeStatus.includes('TIMEOUT') ? 'text-red-600' : 'text-yellow-600'}`}>
                  {realtimeStatus}
                </span>
              </div>
              {isDirectMessage && (
                <button 
                  onClick={returnToLobby}
                  className="win98-button px-2 py-0 text-xs font-bold text-black mr-2"
                >
                  <ArrowLeft className="h-3 w-3 mr-1 inline" />
                  Лоби
                </button>
              )}
              <button 
                onClick={handleLogout}
                className="win98-button px-2 py-0 text-xs font-bold text-black"
              >
                <LogOut className="h-3 w-3 mr-1 inline" />
                Изход
              </button>
            </div>
          </div>

          {/* Mobile Navigation Tabs - Show only on screens smaller than 2xl */}
          <div className="2xl:hidden win98-panel p-1 border-b border-win98-dark-gray">
            <div className="flex space-x-1">
              <button
                onClick={() => setActiveMobilePanel('chat')}
                className={`flex-1 py-1 px-2 text-xs font-bold ${
                  activeMobilePanel === 'chat'
                    ? 'win98-inset bg-win98-light-gray'
                    : 'win98-button'
                }`}
              >
                Чат
              </button>
              <button
                onClick={() => setActiveMobilePanel('users')}
                className={`flex-1 py-1 px-2 text-xs font-bold ${
                  activeMobilePanel === 'users'
                    ? 'win98-inset bg-win98-light-gray'
                    : 'win98-button'
                }`}
              >
                Потребители ({filteredOnlineUsers.length})
              </button>
              <button
                onClick={() => setActiveMobilePanel('activeChats')}
                className={`flex-1 py-1 px-2 text-xs font-bold ${
                  activeMobilePanel === 'activeChats'
                    ? 'win98-inset bg-win98-light-gray'
                    : 'win98-button'
                }`}
              >
                Чатове ({activeChats.size})
              </button>
            </div>
          </div>

          {/* Chat Content */}
          <div className={`flex flex-col flex-1 min-h-0 ${activeMobilePanel !== 'chat' ? '2xl:flex hidden' : ''}`}>
            {/* Debug Info Bar */}
            <div className="hidden bg-yellow-100 border-b border-yellow-300 p-1 text-xs text-black">
              <div>Status: {realtimeStatus}</div>
              <div>Details: {subscriptionDetails}</div>
              <div>Messages Count: {messages.length}</div>
            </div>
            
            {/* Messages Area */}
            <div className="flex-1 p-1 overflow-y-auto bg-chat-message-bg border border-chat-border min-h-0">
              <div className="space-y-1">
                {messages.map((message) => (
                  <div key={message.id} className="text-xs">
                    <div className="flex items-start flex-wrap">
                      <span className="text-win98-dark-gray mr-1">
                        ({formatTime(message.created_at)})
                      </span>
                      <span className={`font-bold mr-1 ${getMessageTextColor(message.username)}`}>
                        {message.username}:
                      </span>
                      <span className="text-black">
                        {message.content}
                      </span>
                      {message.isOptimistic && (
                        <span className="text-win98-dark-gray ml-1 text-xs">
                          (изпраща се...)
                        </span>
                      )}
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>
            </div>

            {/* Message Input */}
            <div className="p-2 bg-win98-gray border-t border-chat-border">
              <form onSubmit={sendMessage} className="flex space-x-2">
                <input
                  type="text"
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  className="flex-1 win98-input text-base"
                  placeholder={isDirectMessage && selectedUser 
                    ? `Съобщение до ${selectedUser.username}...` 
                    : "Напиши съобщение..."
                  }
                  maxLength={500}
                />
                <button
                  type="submit"
                  disabled={!newMessage.trim()}
                  className="win98-button px-3 py-2 text-xs font-bold text-white bg-gradient-to-b from-blue-400 to-blue-600 border-2 border-blue-700 hover:from-blue-500 hover:to-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
                >
                  <Send className="h-3 w-3 mr-1" />
                  Изпрати
                </button>
              </form>
            </div>
          </div>
        </div>

        {/* Mobile Users Panel */}
        <div className={`2xl:hidden win98-panel flex-col h-full overflow-hidden ${
          activeMobilePanel === 'users' ? 'flex' : 'hidden'
        }`}>
          {/* Title Bar */}
          <div className="win98-titlebar flex items-center justify-between px-2 py-1">
            <div className="flex items-center">
              <UsersIcon className="h-4 w-4 mr-1" />
              <span>Потребители</span>
            </div>
          </div>

          {/* Online Users Content */}
          <div className="flex flex-col flex-1 min-h-0">
            <div className="p-2 bg-win98-gray border-b border-win98-dark-gray">
              <div className="text-xs text-black font-bold">
                Потребители на линия ({filteredOnlineUsers.length})
              </div>
              <div className="text-xs text-win98-dark-gray mt-1">
                Двоен клик за директен чат
              </div>
              <div className="mt-2">
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full win98-input text-xs"
                  placeholder="Търси потребител..."
                />
              </div>
            </div>
            
            <div className="flex-1 p-1 bg-white win98-inset overflow-y-auto min-h-0">
              <div className="space-y-1">
                {filteredOnlineUsers.map((user) => (
                  <div
                    key={user.id}
                    className={`p-1 text-xs text-black cursor-pointer flex items-center hover:bg-win98-light-gray ${
                      user.user_id === currentUser?.user_id ? 'font-bold' : ''
                    } ${
                      selectedUser?.user_id === user.user_id ? 'bg-win98-blue text-white' : ''
                    }`}
                    onDoubleClick={() => {
                      handleUserDoubleClick(user);
                      setActiveMobilePanel('chat');
                    }}
                    title={user.user_id === currentUser?.user_id ? 'Това сте вие' : 'Двоен клик за директен чат'}
                  >
                    <OnlineStatus isOnline={onlineUserIds.has(user.user_id)} />
                    <span>{user.username}</span>
                    {user.user_id === currentUser?.user_id && (
                      <span className="ml-1 text-xs">(вие)</span>
                    )}
                  </div>
                ))}
                {filteredOnlineUsers.length === 0 && searchTerm && (
                  <div className="text-center text-win98-dark-gray py-2">
                    <p className="text-xs">Няма намерени потребители</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Mobile Active Chats Panel */}
        <div className={`2xl:hidden win98-panel flex-col h-full overflow-hidden ${
          activeMobilePanel === 'activeChats' ? 'flex' : 'hidden'
        }`}>
          {/* Active Chats Title Bar */}
          <div className="win98-titlebar flex items-center justify-between px-2 py-1">
            <div className="flex items-center">
              <MessageSquare className="h-4 w-4 mr-1" />
              <span>Директни чатове</span>
            </div>
          </div>

          {/* Active Chats Content */}
          <div className="flex flex-col flex-1 min-h-0">
            <div className="p-2 bg-win98-gray border-b border-win98-dark-gray">
              <div className="text-xs text-black font-bold">
                Активни чатове ({activeChats.size})
              </div>
              <div className="text-xs text-win98-dark-gray mt-1">
                Клик за отваряне на чат
              </div>
            </div>
            
            <div className="flex-1 p-1 bg-white win98-inset overflow-y-auto min-h-0">
              <div className="space-y-1">
                {Array.from(activeChats).map((userId) => {
                  const user = users.find(u => u.user_id === userId);
                  if (!user) return null;
                  
                  const isOnline = onlineUserIds.has(userId);
                  const unreadCount = unreadMessages.get(userId) || 0;
                  
                  return (
                    <div
                      key={userId}
                      className={`p-1 text-xs cursor-pointer flex items-center hover:bg-win98-light-gray ${
                        selectedUser?.user_id === userId ? 'bg-win98-blue text-white' : 'text-black'
                      }`}
                      onClick={() => {
                        handleUserDoubleClick(user);
                        setActiveMobilePanel('chat');
                      }}
                      title={`Чат с ${user.username}${isOnline ? ' (онлайн)' : ' (офлайн)'}`}
                    >
                      <div className={`w-2 h-2 rounded-full mr-1 ${
                        isOnline ? 'bg-icq-green' : 'bg-win98-dark-gray'
                      }`}></div>
                      <span className={isOnline ? '' : 'text-win98-dark-gray'}>{user.username}</span>
                      <div className="ml-auto flex items-center">
                        {/* Show unread message indicator */}
                        {unreadCount > 0 && (
                          <div className="bg-blue-500 text-white rounded-full w-4 h-4 flex items-center justify-center text-xs font-bold mr-1">
                            {unreadCount}
                          </div>
                        )}
                        {unreadCount > 0 ? (
                          <MessageCircle className="h-3 w-3 text-blue-500 mr-1" />
                        ) : (
                          <MessageCircle className="h-3 w-3 opacity-50 mr-1" />
                        )}
                        {/* Remove chat button */}
                        <button
                          onClick={(e) => removeActiveChat(userId, e)}
                          className="win98-button p-0 w-3 h-3 flex items-center justify-center text-xs font-bold hover:bg-red-200"
                          title="Премахни чат"
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  );
                })}
                {activeChats.size === 0 && (
                  <div className="text-center text-win98-dark-gray py-2">
                    <p className="text-xs">Няма активни чатове</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Users List Window */}
        <div className="hidden xl:flex w-64 win98-panel flex-col h-full overflow-hidden">
          {/* Title Bar */}
          <div className="win98-titlebar flex items-center justify-between px-2 py-1">
            <div className="flex items-center">
              <UsersIcon className="h-4 w-4 mr-1" />
              <span>Потребители</span>
            </div>
          </div>

          {/* Online Users Content */}
          <div className="flex flex-col flex-1 min-h-0 max-h-[50%]">
            <div className="p-2 bg-win98-gray border-b border-win98-dark-gray">
              <div className="text-xs text-black font-bold">
                Потребители на линия ({filteredOnlineUsers.length})
              </div>
              <div className="text-xs text-win98-dark-gray mt-1">
                Двоен клик за директен чат
              </div>
              <div className="mt-2">
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full win98-input text-xs"
                  placeholder="Търси потребител..."
                />
              </div>
            </div>
            
            <div className="flex-1 p-1 bg-white win98-inset overflow-y-auto min-h-0">
              <div className="space-y-1">
                {filteredOnlineUsers.map((user) => (
                  <div
                    key={user.id}
                    className={`p-1 text-xs text-black cursor-pointer flex items-center hover:bg-win98-light-gray ${
                      user.user_id === currentUser?.user_id ? 'font-bold' : ''
                    } ${
                      selectedUser?.user_id === user.user_id ? 'bg-win98-blue text-white' : ''
                    }`}
                    onDoubleClick={() => handleUserDoubleClick(user)}
                    title={user.user_id === currentUser?.user_id ? 'Това сте вие' : 'Двоен клик за директен чат'}
                  >
                    <OnlineStatus isOnline={onlineUserIds.has(user.user_id)} />
                    <span>{user.username}</span>
                    {user.user_id === currentUser?.user_id && (
                      <span className="ml-1 text-xs">(вие)</span>
                    )}
                  </div>
                ))}
                {filteredOnlineUsers.length === 0 && searchTerm && (
                  <div className="text-center text-win98-dark-gray py-2">
                    <p className="text-xs">Няма намерени потребители</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Active Chats Section */}
          <div className="flex flex-col flex-1 min-h-0 max-h-[50%] border-t-2 border-win98-dark-gray">
            {/* Active Chats Title Bar */}
            <div className="win98-titlebar flex items-center justify-between px-2 py-1">
              <div className="flex items-center">
                <MessageSquare className="h-4 w-4 mr-1" />
                <span>Директни чатове</span>
              </div>
            </div>

            {/* Active Chats Content */}
            <div className="flex flex-col flex-1 min-h-0">
              <div className="p-2 bg-win98-gray border-b border-win98-dark-gray">
                <div className="text-xs text-black font-bold">
                  Активни чатове ({activeChats.size})
                </div>
                <div className="text-xs text-win98-dark-gray mt-1">
                  Клик за отваряне на чат
                </div>
              </div>
              
              <div className="flex-1 p-1 bg-white win98-inset overflow-y-auto min-h-0">
                <div className="space-y-1">
                  {Array.from(activeChats).map((userId) => {
                    const user = users.find(u => u.user_id === userId);
                    if (!user) return null;
                    
                    const isOnline = onlineUserIds.has(userId);
                    const unreadCount = unreadMessages.get(userId) || 0;
                    
                    return (
                      <div
                        key={userId}
                        className={`p-1 text-xs cursor-pointer flex items-center hover:bg-win98-light-gray ${
                          selectedUser?.user_id === userId ? 'bg-win98-blue text-white' : 'text-black'
                        }`}
                        onClick={() => handleUserDoubleClick(user)}
                        title={`Чат с ${user.username}${isOnline ? ' (онлайн)' : ' (офлайн)'}`}
                      >
                        <OnlineStatus isOnline={isOnline} />
                        <span className={isOnline ? '' : 'text-win98-dark-gray'}>{user.username}</span>
                        <div className="ml-auto flex items-center">
                          {/* Show unread message indicator */}
                          {unreadCount > 0 && (
                            <div className="bg-blue-500 text-white rounded-full w-4 h-4 flex items-center justify-center text-xs font-bold mr-1">
                              {unreadCount}
                            </div>
                          )}
                          {unreadCount > 0 ? (
                            <MessageCircle className="h-3 w-3 text-blue-500 mr-1" />
                          ) : (
                            <MessageCircle className="h-3 w-3 opacity-50 mr-1" />
                          )}
                          {/* Remove chat button */}
                          <button
                            onClick={(e) => removeActiveChat(userId, e)}
                            className="win98-button p-0 w-3 h-3 flex items-center justify-center text-xs font-bold hover:bg-red-200"
                            title="Премахни чат"
                          >
                            ×
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  {activeChats.size === 0 && (
                    <div className="text-center text-win98-dark-gray py-2">
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