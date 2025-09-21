export interface User {
  id: string;
  email: string;
  username: string;
  created_at: string;
}

export interface Message {
  id: string;
  user_id: string;
  username: string;
  content: string;
  created_at: string;
  receiver_id?: string | null;
}

export interface UserProfile {
  id: string;
  user_id: string;
  username: string;
  created_at: string;
}