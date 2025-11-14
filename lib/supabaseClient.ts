import { createClient } from "@supabase/supabase-js";

console.log("URL:", process.env.NEXT_PUBLIC_SUPABASE_URL);
console.log("KEY:", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? "DETECTED" : "MISSING");

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

console.log("ENV URL:", process.env.NEXT_PUBLIC_SUPABASE_URL);
console.log("ENV KEY:", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? "KEY OK" : "MISSING");


if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Supabase environment variables are missing! Pastikan .env.local sudah benar dan di root folder.");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
