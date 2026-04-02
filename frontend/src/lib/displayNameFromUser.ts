import type { User } from "@supabase/supabase-js";

/**
 * Nome exibido para o recrutador: metadados do Auth (Display name no painel Supabase costuma ir em full_name ou name).
 * Não usar clientes.nome_contato — é dado da empresa / contato master.
 */
export function displayNameFromUser(user: User | null | undefined): string {
  if (!user) return "Recrutador";
  const m = user.user_metadata as Record<string, unknown> | undefined;
  const pick =
    (typeof m?.full_name === "string" && m.full_name.trim()) ||
    (typeof m?.name === "string" && m.name.trim()) ||
    (typeof m?.display_name === "string" && m.display_name.trim()) ||
    "";
  if (pick) return pick;

  const email = user.email?.trim();
  if (email) {
    let local = email.split("@")[0] ?? "";
    local = local.replace(/\+.*$/, "").replace(/\./g, " ").trim();
    if (local) return local.replace(/\s+/g, " ");
  }
  return "Recrutador";
}

export function initialsFromDisplayName(name: string): string {
  const p = name.trim().split(/\s+/).filter(Boolean);
  if (p.length === 0) return "?";
  if (p.length === 1) return p[0].slice(0, 2).toUpperCase();
  return (p[0][0] + p[p.length - 1][0]).toUpperCase();
}
