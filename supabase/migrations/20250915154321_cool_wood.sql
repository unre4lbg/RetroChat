/*
  # Manual Realtime System with Database Triggers

  This migration creates a manual real-time notification system using PostgreSQL's
  NOTIFY/LISTEN functionality as a backup to Supabase Realtime.

  1. New Tables
    - `realtime_events` - Stores real-time events for manual broadcasting
  
  2. Database Functions
    - `notify_message_changes()` - Function to broadcast message changes
    - `cleanup_old_events()` - Function to clean up old events
  
  3. Triggers
    - Trigger on messages table to automatically notify clients
  
  4. Security
    - Enable RLS on new tables
    - Add policies for authenticated users
*/

-- Create realtime_events table for manual notifications
CREATE TABLE IF NOT EXISTS realtime_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  table_name text NOT NULL,
  record_id uuid NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE realtime_events ENABLE ROW LEVEL SECURITY;

-- Create policy for authenticated users to read events
CREATE POLICY "Authenticated users can read realtime events"
  ON realtime_events
  FOR SELECT
  TO authenticated
  USING (true);

-- Create policy for system to insert events
CREATE POLICY "System can insert realtime events"
  ON realtime_events
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Create function to notify about message changes
CREATE OR REPLACE FUNCTION notify_message_changes()
RETURNS TRIGGER AS $$
BEGIN
  -- Insert notification event
  INSERT INTO realtime_events (event_type, table_name, record_id, payload)
  VALUES (
    TG_OP,
    'messages',
    NEW.id,
    jsonb_build_object(
      'id', NEW.id,
      'user_id', NEW.user_id,
      'username', NEW.username,
      'content', NEW.content,
      'created_at', NEW.created_at
    )
  );
  
  -- Use PostgreSQL NOTIFY for immediate notification
  PERFORM pg_notify('message_changes', 
    jsonb_build_object(
      'event', TG_OP,
      'table', 'messages',
      'id', NEW.id,
      'user_id', NEW.user_id,
      'username', NEW.username,
      'content', NEW.content,
      'created_at', NEW.created_at
    )::text
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger on messages table
DROP TRIGGER IF EXISTS messages_realtime_trigger ON messages;
CREATE TRIGGER messages_realtime_trigger
  AFTER INSERT ON messages
  FOR EACH ROW
  EXECUTE FUNCTION notify_message_changes();

-- Create function to cleanup old events (older than 1 hour)
CREATE OR REPLACE FUNCTION cleanup_old_events()
RETURNS void AS $$
BEGIN
  DELETE FROM realtime_events 
  WHERE created_at < now() - interval '1 hour';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_realtime_events_created_at 
  ON realtime_events (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_realtime_events_table_name 
  ON realtime_events (table_name);