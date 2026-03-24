function sanitizeText(m: string): string {
  const t = m.trim();
  if (t.startsWith("<!DOCTYPE") || t.toLowerCase().includes("<html")) {
    return "Não foi possível falar com o Supabase (a resposta veio como página HTML). Verifique SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no backend/.env — a URL deve ser https://SEU-PROJETO.supabase.co (Project URL), sem path extra.";
  }
  return t.length > 800 ? `${t.slice(0, 800)}…` : t;
}

/** Erros do cliente PostgREST/Supabase nem sempre são `instanceof Error`. */
export function safeClientMessage(err: unknown): string {
  if (err && typeof err === "object" && "message" in err) {
    const msg = (err as { message: unknown }).message;
    if (typeof msg === "string" && msg.length > 0) {
      return sanitizeText(msg);
    }
  }
  if (err instanceof Error && err.message) {
    return sanitizeText(err.message);
  }
  const fallback = typeof err === "string" ? err : JSON.stringify(err);
  return sanitizeText(fallback === "{}" ? "Erro desconhecido ao acessar o banco." : fallback);
}
