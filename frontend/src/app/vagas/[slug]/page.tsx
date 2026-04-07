import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'

export default async function VagaPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const supabase = await createClient()

  const { data: vaga } = await supabase
    .from('vagas')
    .select(`
      id,
      slug,
      cargo,
      titulo_publicacao,
      descricao,
      salario,
      modelo_contratacao,
      criado_em,
      prazo_contratacao,
      clientes ( nome_empresa ),
      cliente_unidades ( cidade, uf )
    `)
    .eq('slug', slug)
    .eq('status_vaga', 'aberta')
    .single()

  if (!vaga) notFound()

  const titulo = vaga.titulo_publicacao ?? vaga.cargo
  const empresa = (vaga.clientes as any)?.nome_empresa ?? 'Empresa'
  const cidade = (vaga.cliente_unidades as any)?.cidade ?? ''
  const uf = (vaga.cliente_unidades as any)?.uf ?? ''

  const jsonLd = {
    '@context': 'https://schema.org/',
    '@type': 'JobPosting',
    title: titulo,
    description: vaga.descricao ?? titulo,
    datePosted: vaga.criado_em,
    validThrough: vaga.prazo_contratacao ?? null,
    employmentType: vaga.modelo_contratacao === 'CLT' ? 'FULL_TIME' : 'CONTRACTOR',
    hiringOrganization: {
      '@type': 'Organization',
      name: empresa,
      sameAs: 'https://gege.ia.br',
    },
    jobLocation: {
      '@type': 'Place',
      address: {
        '@type': 'PostalAddress',
        addressLocality: cidade,
        addressRegion: uf,
        addressCountry: 'BR',
      },
    },
    baseSalary: vaga.salario ? {
      '@type': 'MonetaryAmount',
      currency: 'BRL',
      value: {
        '@type': 'QuantitativeValue',
        value: Number(vaga.salario),
        unitText: 'MONTH',
      },
    } : undefined,
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <main style={{ maxWidth: 640, margin: '0 auto', padding: '2rem 1rem' }}>
        <h1>{titulo}</h1>
        <p>{empresa} · {cidade}{uf ? `, ${uf}` : ''}</p>
        {vaga.salario && <p>R$ {Number(vaga.salario).toLocaleString('pt-BR')}/mês · {vaga.modelo_contratacao}</p>}
        <hr />
        <pre style={{ whiteSpace: 'pre-wrap' }}>{vaga.descricao}</pre>
      </main>
    </>
  )
}
