/*
  # Fix RLS policies for Realtime broadcasting

  1. Policy Updates
    - Update messages table policies to ensure Realtime events are broadcasted
    - Ensure all authenticated users can receive real-time updates
  2. Security
    - Maintain security while allowing proper Realtime functionality
    - Keep INSERT restrictions to prevent unauthorized message creation
*/

-- Drop existing policies for messages table
DROP POLICY IF EXISTS "Authenticated users can read all messages" ON messages;
DROP POLICY IF EXISTS "Users can insert own messages" ON messages;
DROP POLICY IF EXISTS "Allow authenticated to delete all messages" ON messages;

-- Create new policies that work better with Realtime
CREATE POLICY "Enable read access for authenticated users"
  ON messages
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Enable insert for authenticated users"
  ON messages
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Enable delete for authenticated users"
  ON messages
  FOR DELETE
  TO authenticated
  USING (true);

-- Also update user_profiles policies for consistency
DROP POLICY IF EXISTS "Users can read all profiles" ON user_profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON user_profiles;
DROP POLICY IF EXISTS "Allow authenticated to update all user profiles" ON user_profiles;
DROP POLICY IF EXISTS "Allow authenticated to delete all user profiles" ON user_profiles;

CREATE POLICY "Enable read access for authenticated users"
  ON user_profiles
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Enable insert for authenticated users"
  ON user_profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Enable update for authenticated users"
  ON user_profiles
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Enable delete for authenticated users"
  ON user_profiles
  FOR DELETE
  TO authenticated
  USING (true);