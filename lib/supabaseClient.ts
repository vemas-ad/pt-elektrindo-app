import { createClient } from "@supabase/supabase-js";

let supabaseInstance: ReturnType<typeof createClient> | null = null;

export const supabase =
  supabaseInstance ??
  (supabaseInstance = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    }
  ));

if (typeof window !== "undefined") {
  console.log(
    "✅ SUPABASE URL (client):",
    process.env.NEXT_PUBLIC_SUPABASE_URL
  );
}
