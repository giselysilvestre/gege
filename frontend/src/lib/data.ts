import type { SupabaseClient, User } from "@supabase/supabase-js";
import { unstable_noStore as noStore } from "next/cache";
import { claimsFromAccessToken } from "@/lib/claimsFromJwt";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { devError } from "@/lib/devLog";

type ClienteRow = {
  id: string;
  nome_empresa: string | null;
  email: string | null;
  nome_contato: string | null;
};
type ClienteMembroRow = { cliente_id: string };

type ClienteInsert = {
  nome_empresa: string;
  nome_contato: string;
  email: string;
  telefone: string;
  cep: string;
  cidade: string;
  slug: string;
};

/** `ilike` sem coringa: escapa `%` e `_` do próprio email. */
function ilikeExactPattern(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

function tryAdmin() {
  try {
    return getSupabaseAdmin();
  } catch {
    return null;
  }
}

function emailFromUser(user: User | null): string | null {
  if (!user) return null;
  const direct = user.email?.trim();
  if (direct) return direct;
  const meta = user.user_metadata;
  const m = meta && typeof meta.email === "string" ? meta.email.trim() : "";
  return m || null;
}

/**
 * Hidrata a sessão a partir dos cookies e obtém e-mail para RLS.
 * Ordem recomendada pelo @supabase/ssr: getSession() antes de getUser().
 * Se getUser falhar (rede/JWT) mas a sessão em cookie existir, usa o user da sessão.
 */
async function getAuthUserWithEmail(supabase: SupabaseClient) {
  const { data: sessData, error: sessErr } = await supabase.auth.getSession();
  if (sessErr) devError("[getCurrentCliente] getSession:", sessErr.message);

  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr) devError("[getCurrentCliente] getUser:", userErr.message);

  const verified = userData.user;
  const fromCookie = sessData.session?.user ?? null;
  const user = verified ?? fromCookie;
  const emailRaw = emailFromUser(user);

  return { user, emailRaw };
}

async function selectClienteByEmail(client: SupabaseClient, emailForIlike: string) {
  const { data: rows, error } = await client
    .from("clientes")
    .select("id, nome_empresa, email, nome_contato")
    .ilike("email", ilikeExactPattern(emailForIlike))
    .order("criado_em", { ascending: true })
    .limit(1);

  if (error) {
    devError("[getCurrentCliente] select clientes:", error.message, error.code);
    return null;
  }
  return (rows?.[0] as ClienteRow | undefined) ?? null;
}


/** Primeiro vínculo em cliente_membros (mesmo user em vários clientes: mais antigo). */
async function selectClienteByMembroUserId(client: SupabaseClient, userId: string) {
  const { data: mems, error: memErr } = await client
    .from("cliente_membros")
    .select("cliente_id")
    .eq("user_id", userId)
    .order("criado_em", { ascending: true })
    .limit(1);

  if (memErr) {
    devError("[getCurrentCliente] cliente_membros:", memErr.message, memErr.code);
    return null;
  }
  const memRows = (mems ?? null) as ClienteMembroRow[] | null;
  const cid = memRows?.[0]?.cliente_id;
  if (!cid) return null;

  const { data: rows, error } = await client
    .from("clientes")
    .select("id, nome_empresa, email, nome_contato")
    .eq("id", cid)
    .limit(1);

  if (error) {
    devError("[getCurrentCliente] select clientes by membros:", error.message, error.code);
    return null;
  }
  return (rows?.[0] as ClienteRow | undefined) ?? null;
}

async function selectClienteByMembroUserIdAdmin(
  admin: NonNullable<ReturnType<typeof tryAdmin>>,
  userId: string,
) {
  const { data: mems, error: memErr } = await admin
    .from("cliente_membros")
    .select("cliente_id")
    .eq("user_id", userId)
    .order("criado_em", { ascending: true })
    .limit(1);

  if (memErr) {
    devError("[getCurrentCliente] admin cliente_membros:", memErr.message);
    return null;
  }
  const memRows = (mems ?? null) as ClienteMembroRow[] | null;
  const cid = memRows?.[0]?.cliente_id;
  if (!cid) return null;

  const { data: rows, error } = await admin
    .from("clientes")
    .select("id, nome_empresa, email, nome_contato")
    .eq("id", cid)
    .limit(1);

  if (error) {
    devError("[getCurrentCliente] admin select clientes by membros:", error.message);
    return null;
  }
  return (rows?.[0] as ClienteRow | undefined) ?? null;
}

async function selectClienteByEmailAdmin(admin: NonNullable<ReturnType<typeof tryAdmin>>, emailForIlike: string) {
  const { data: rows, error } = await admin
    .from("clientes")
    .select("id, nome_empresa, email, nome_contato")
    .ilike("email", ilikeExactPattern(emailForIlike))
    .order("criado_em", { ascending: true })
    .limit(1);

  if (error) {
    devError("[getCurrentCliente] admin select clientes:", error.message);
    return null;
  }
  const row = (rows?.[0] as ClienteRow | undefined) ?? null;
  if (!row?.email) return null;
  return row;
}

async function upsertClienteViaAdmin(emailRaw: string, userId: string) {
  const admin = tryAdmin();
  if (!admin) {
    devError("[getCurrentCliente] SUPABASE_SERVICE_ROLE_KEY ausente ou inválida — fallback admin indisponível.");
    return null;
  }

  const viaMembro = await selectClienteByMembroUserIdAdmin(admin, userId);
  if (viaMembro) return viaMembro;

  const emailKey = emailRaw.trim().toLowerCase();
  const found = await selectClienteByEmailAdmin(admin, emailRaw.trim());
  if (found) return found;

  const local = emailKey.split("@")[0] || "cliente";
  const slugBase = local.replace(/[^a-z0-9-]+/gi, "-").replace(/^-+|-+$/g, "") || "cliente";
  const telefonePlaceholder = userId ? `u-${userId.replace(/-/g, "")}` : `t-${Date.now()}`;

  const payload: ClienteInsert = {
      nome_empresa: local,
      nome_contato: local,
      email: emailKey,
      telefone: telefonePlaceholder,
      cep: "",
      cidade: "",
      slug: `${slugBase}-${Date.now()}`,
    };
  const { data: inserted, error } = await admin
    .from("clientes")
    .insert(payload as never)
    .select("id, nome_empresa, email, nome_contato")
    .limit(1);

  const ins = inserted?.[0];

  if (!error && ins) return ins;

  if (error) {
    devError("[getCurrentCliente] admin insert:", error.message, error.code);
    if (error.code === "23505") {
      const retry = await selectClienteByEmailAdmin(admin, emailRaw.trim());
      return retry ?? null;
    }
    return null;
  }
  return null;
}

/**
 * Cliente logado (empresa). Usa sessão Supabase + RLS; se não achar linha (ex.: API route / edge case),
 * repete com service role usando o e-mail verificado do JWT — nunca confia em input do browser.
 */
export async function getCurrentCliente(supabaseClient?: SupabaseClient, opts?: { accessToken?: string | null }) {
  noStore();
  const supabase = supabaseClient ?? (await getSupabaseServerClient());
  let { user, emailRaw } = await getAuthUserWithEmail(supabase);

  if ((!emailRaw || !user?.id) && opts?.accessToken) {
    const c = claimsFromAccessToken(opts.accessToken);
    if (c) {
      user = { id: c.sub, email: c.email } as User;
      emailRaw = c.email;
    }
  }

  if (!emailRaw || !user?.id) return null;

  const email = emailRaw.trim();
  const emailKey = email.toLowerCase();

  const viaMembro = await selectClienteByMembroUserId(supabase, user.id);
  if (viaMembro) return viaMembro;

  const cliente = await selectClienteByEmail(supabase, email);
  if (cliente) return cliente;

  const admin = tryAdmin();
  if (admin) {
    const viaMembroAdmin = await selectClienteByMembroUserIdAdmin(admin, user.id);
    if (viaMembroAdmin) return viaMembroAdmin;
    const viaAdmin = await selectClienteByEmailAdmin(admin, email);
    if (viaAdmin) return viaAdmin;
  }

  const local = emailKey.split("@")[0] || "cliente";
  const slugBase = local.replace(/[^a-z0-9-]+/gi, "-").replace(/^-+|-+$/g, "") || "cliente";
  const telefonePlaceholder = `u-${user.id.replace(/-/g, "")}`;

  const payload: ClienteInsert = {
      nome_empresa: local,
      nome_contato: local,
      email: emailKey,
      telefone: telefonePlaceholder,
      cep: "",
      cidade: "",
      slug: `${slugBase}-${Date.now()}`,
    };
  const { data: insertedRows, error: insertError } = await supabase
    .from("clientes")
    .insert(payload as never)
    .select("id, nome_empresa, email, nome_contato")
    .limit(1);

  const inserted = insertedRows?.[0];

  if (!insertError && inserted) return inserted;

  if (insertError) {
    devError("[getCurrentCliente] insert (RLS):", insertError.message, insertError.code);
    if (insertError.code === "23505") {
      const retry = await selectClienteByEmail(supabase, email);
      if (retry) return retry;
    }
  }

  return upsertClienteViaAdmin(emailRaw, user.id);
}
