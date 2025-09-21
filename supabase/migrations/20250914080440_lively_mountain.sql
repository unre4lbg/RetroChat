/*
  # Create messages table for chat functionality

  1. New Tables
    - `messages`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references auth.users)
      - `username` (text, for display purposes)
      - `content` (text, message content)
      - `created_at` (timestamp)

  2. Security
    - Enable RLS on `messages` table
    - Add policies for authenticated users to read all messages and insert their own
*/

CREATE TABLE IF NOT EXISTS messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  username text NOT NULL,
  content text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read all messages
CREATE POLICY "Authenticated users can read all messages"
  ON messages
  FOR SELECT
  TO authenticated
  USING (true);

-- Allow authenticated users to insert their own messages
CREATE POLICY "Users can insert own messages"
  ON messages
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_user_id ON messages(user_id);