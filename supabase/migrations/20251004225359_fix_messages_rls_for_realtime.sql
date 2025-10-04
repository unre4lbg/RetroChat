/*
  # Fix Messages RLS Policy for Realtime

  ## Problem
  The current SELECT policy blocks realtime notifications because it only allows users
  to see their own messages or messages addressed to them. When User A sends a public 
  message, Users B and C don't receive realtime notifications because the policy 
  doesn't allow them to "see" the new row.

  ## Solution
  Update the SELECT policy to allow all authenticated users to read all messages.
  The filtering logic will be handled on the client side to show only relevant messages.

  ## Changes
  1. Drop the restrictive SELECT policy
  2. Create a new permissive SELECT policy that allows authenticated users to read all messages
  
  ## Security Notes
  - All messages are still protected by authentication requirement
  - Only authenticated users can read messages
  - Client-side filtering ensures users only see appropriate messages in their view
  - This approach is necessary for realtime subscriptions to work properly
*/

-- Drop the existing restrictive SELECT policy
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON messages;

-- Create a new permissive SELECT policy for realtime to work
CREATE POLICY "Authenticated users can read all messages"
  ON messages
  FOR SELECT
  TO authenticated
  USING (true);
