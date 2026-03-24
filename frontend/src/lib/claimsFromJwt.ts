/** Lê `sub` e `email` do JWT (access token) sem validar assinatura — o PostgREST/Supabase valida no pedido. */
export function claimsFromAccessToken(token: string): { sub: string; email: string } | null {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    const payload = parts[1];
    const b64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
    const raw =
      typeof Buffer !== "undefined"
        ? Buffer.from(b64 + pad, "base64").toString("utf8")
        : typeof atob !== "undefined"
          ? atob(b64 + pad)
          : "";
    if (!raw) return null;
    const json = JSON.parse(raw) as Record<string, unknown>;
    const sub = typeof json.sub === "string" ? json.sub : null;
    const email = typeof json.email === "string" ? json.email : null;
    if (!sub || !email) return null;
    return { sub, email };
  } catch {
    return null;
  }
}
