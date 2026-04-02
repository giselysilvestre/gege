import type { SupabaseClient, User } from "@supabase/supabase-js";

/**
 * Renova o JWT local com os dados atuais do Auth (inclui user_metadata / "Display name").
 * Sem isso, o app pode continuar mostrando nome antigo depois de editar o usuário no painel.
 */
export async function getAuthUserWithFreshMetadata(sb: SupabaseClient): Promise<User | null> {
  await sb.auth.refreshSession().catch(() => undefined);
  const { data, error } = await sb.auth.getUser();
  if (error || !data?.user) return null;
  return data.user;
}
