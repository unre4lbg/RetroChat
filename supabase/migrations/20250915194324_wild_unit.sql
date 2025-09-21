/*
  # Add Direct Messaging Support

  1. New Columns
    - Add `receiver_id` to `messages` table to support private messages
    - When `receiver_id` is NULL, message is public (lobby)
    - When `receiver_id` is set, message is private between sender and receiver

  2. Security
    - Update RLS policies to handle private messages
    - Users can only see public messages or private messages they're involved in

  3. Performance
    - Add indexes for efficient querying of private messages
*/

-- Add receiver_id column to messages table
ALTER TABLE public.messages 
ADD COLUMN receiver_id uuid NULL;

-- Add foreign key constraint
ALTER TABLE public.messages 
ADD CONSTRAINT fk_messages_receiver_id 
FOREIGN KEY (receiver_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- Add index for efficient querying
CREATE INDEX idx_messages_receiver_id ON public.messages USING btree (receiver_id);
CREATE INDEX idx_messages_private_chat ON public.messages USING btree (user_id, receiver_id) WHERE receiver_id IS NOT NULL;

-- Drop existing RLS policy for SELECT
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON public.messages;

-- Create new RLS policy for SELECT that handles both public and private messages
CREATE POLICY "Enable read access for authenticated users"
  ON public.messages
  FOR SELECT
  TO authenticated
  USING (
    receiver_id IS NULL OR  -- Public messages (lobby)
    user_id = auth.uid() OR -- Messages sent by current user
    receiver_id = auth.uid() -- Messages received by current user
  );

-- The INSERT policy remains the same as users can only insert messages as themselves
-- But let's recreate it to be explicit
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON public.messages;

CREATE POLICY "Enable insert for authenticated users"
  ON public.messages
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);