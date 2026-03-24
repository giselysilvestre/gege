import { createClient, type SupabaseClient } from "@supabase/supabase-js";

function envTrim(v: string | undefined): string {
  if (!v) return "";
  const t = v.trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    return t.slice(1, -1).trim();
  }
  return t;
}

let cached: SupabaseClient | null = null;

/**
 * Cliente sob demanda: o servidor Express sobe mesmo sem .env completo (/health funciona).
 * CRUD falha com 503 até SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY estarem corretos.
 */
export function getSupabase(): SupabaseClient {
  if (cached) return cached;
  const url = envTrim(process.env.SUPABASE_URL);
  const serviceKey = envTrim(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!url || !serviceKey) {
    throw new Error(
      "Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no backend/.env. A URL é https://SEU-ID.supabase.co (Project URL). A chave é a service_role (texto longo), não uma URL."
    );
  }
  cached = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}

/** Recarrega env após editar .env (tsx watch reinicia o processo; útil em testes). */
export function resetSupabaseClient(): void {
  cached = null;
}
