import { createClient } from '@supabase/supabase-js';

console.error('=== SUPABASE ENVIRONMENT CHECK ===');
console.error('VITE_SUPABASE_URL:', import.meta.env.VITE_SUPABASE_URL);
console.error('VITE_SUPABASE_ANON_KEY exists:', !!import.meta.env.VITE_SUPABASE_ANON_KEY);
console.error('VITE_SUPABASE_ANON_KEY length:', import.meta.env.VITE_SUPABASE_ANON_KEY?.length);

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

console.error('=== ACTUAL VALUES BEFORE CLIENT CREATION ===');
console.error('supabaseUrl value:', supabaseUrl);
console.error('supabaseAnonKey first 20 chars:', supabaseAnonKey?.substring(0, 20) + '...');

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing Supabase environment variables:');
  console.error('supabaseUrl:', supabaseUrl);
  console.error('supabaseAnonKey exists:', !!supabaseAnonKey);
  throw new Error(`Missing Supabase environment variables. URL: ${!!supabaseUrl}, Key: ${!!supabaseAnonKey}`);
}

console.error('=== SUPABASE CLIENT INITIALIZED SUCCESSFULLY ===');
export const supabase = createClient(supabaseUrl, supabaseAnonKey);