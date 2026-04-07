import { getSupabaseBrowserClient } from '@/lib/supabase/browser'

export async function getClienteBySlug(slug: string) {
  const supabase = getSupabaseBrowserClient()
  const { data } = await supabase
    .from('clientes')
    .select('id, nome_empresa, email, nome_contato, slug')
    .eq('slug', slug)
    .single()
  return data ?? null
}
