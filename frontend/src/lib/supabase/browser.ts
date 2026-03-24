import { createBrowserClient } from "@supabase/ssr";

function requireClientEnv(value: string | undefined, name: string): string {
  if (!value) throw new Error(`Defina ${name} no frontend/.env.local`);
  return value;
}

/** Cliente browser; @supabase/ssr já usa singleton em ambiente de browser. */
export function getSupabaseBrowserClient() {
  const url = requireClientEnv(process.env.NEXT_PUBLIC_SUPABASE_URL, "NEXT_PUBLIC_SUPABASE_URL");
  const anonKey = requireClientEnv(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, "NEXT_PUBLIC_SUPABASE_ANON_KEY");
  return createBrowserClient(url, anonKey);
}