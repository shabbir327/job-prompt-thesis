import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export const SUPABASE_URL = "https://vjwcpzprgqzbjmwjrfrc.supabase.co";
export const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZqd2NwenByZ3F6Ymptd2pyZnJjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI2NTA5MTUsImV4cCI6MjA4ODIyNjkxNX0.vHt6h1o4kMmiQuFSPiPirqk4CR-E5gJiIb0HxCeT8g4";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);