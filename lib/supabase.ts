import "react-native-url-polyfill/auto";
import { createClient } from "@supabase/supabase-js";

// ⚠️ ADD YOUR SUPABASE CREDENTIALS HERE
// Get these from https://app.supabase.com/project/_/settings/api
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || "YOUR_SUPABASE_URL";
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || "YOUR_SUPABASE_ANON_KEY";

if (!SUPABASE_URL || SUPABASE_URL === "YOUR_SUPABASE_URL") {
  console.warn("⚠️  Supabase URL not configured. Set EXPO_PUBLIC_SUPABASE_URL in .env");
}
if (!SUPABASE_ANON_KEY || SUPABASE_ANON_KEY === "YOUR_SUPABASE_ANON_KEY") {
  console.warn("⚠️  Supabase anon key not configured. Set EXPO_PUBLIC_SUPABASE_ANON_KEY in .env");
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
