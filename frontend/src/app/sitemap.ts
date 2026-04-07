import { createClient } from '@/lib/supabase/server'

export default async function sitemap() {
  const supabase = await createClient()

  const { data: vagas, error } = await supabase
    .from('vagas')
    .select('slug, criado_em')
    .eq('status_vaga', 'aberta')
    .not('slug', 'is', null)

  console.log('sitemap vagas:', vagas, error)

  const vagasUrls = (vagas ?? []).map((v) => ({
    url: `https://gege.ia.br/vagas/${v.slug}`,
    lastModified: new Date(v.criado_em),
    changeFrequency: 'daily' as const,
    priority: 0.8,
  }))

  return [
    {
      url: 'https://gege.ia.br',
      lastModified: new Date(),
      changeFrequency: 'daily' as const,
      priority: 1,
    },
    ...vagasUrls,
  ]
}
