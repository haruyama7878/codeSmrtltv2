import { createClient } from "@supabase/supabase-js";

// Client-side requests use the same-origin rewrite; server-side requests use the configured Supabase URL.
const supabaseUrl =
  typeof window !== "undefined"
    ? window.location.origin
    : (process.env.SUPABASE_INTERNAL_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL);
const supabasePublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error("Supabase environment variables are required");
}

export const supabase = createClient(supabaseUrl, supabasePublishableKey);
