import type { SupabaseClient, User } from "@supabase/supabase-js";

export type ClienteEmpresa = {
  id: string;
  nome_empresa: string | null;
  email: string | null;
  nome_contato: string | null;
};

function ilikeExactPattern(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

/**
 * Garante linha em `clientes` para o utilizador da sessão (browser).
 * Mesma ideia que getCurrentCliente no servidor, só com RLS (sem service role).
 */
export async function ensureClienteForUser(supabase: SupabaseClient, user: User): Promise<ClienteEmpresa | null> {
  const emailRaw = user.email?.trim();
  if (!emailRaw || !user.id) return null;

  const email = emailRaw;
  const emailKey = email.toLowerCase();

  const { data: rows } = await supabase
    .from("clientes")
    .select("id, nome_empresa, email, nome_contato")
    .ilike("email", ilikeExactPattern(email))
    .order("criado_em", { ascending: true })
    .limit(1);

  const found = rows?.[0] as ClienteEmpresa | undefined;
  if (found) return found;

  const local = emailKey.split("@")[0] || "cliente";
  const slugBase = local.replace(/[^a-z0-9-]+/gi, "-").replace(/^-+|-+$/g, "") || "cliente";
  const telefonePlaceholder = `u-${user.id.replace(/-/g, "")}`;

  const { data: insRows, error } = await (supabase.from("clientes") as any)
    .insert({
      nome_empresa: local,
      nome_contato: local,
      email: emailKey,
      telefone: telefonePlaceholder,
      cep: "",
      cidade: "",
      slug: `${slugBase}-${Date.now()}`,
    })
    .select("id, nome_empresa, email, nome_contato")
    .limit(1);

  const ins = insRows?.[0] as ClienteEmpresa | undefined;
  if (!error && ins) return ins;

  if (error?.code === "23505") {
    const { data: retry } = await supabase
      .from("clientes")
      .select("id, nome_empresa, email, nome_contato")
      .ilike("email", ilikeExactPattern(email))
      .limit(1);
    return (retry?.[0] as ClienteEmpresa) ?? null;
  }

  console.error("[ensureClienteForUser]", error?.message);
  return null;
}
