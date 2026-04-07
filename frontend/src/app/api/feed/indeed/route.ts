import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = await createClient()

  const { data: vagas } = await supabase
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
    .eq('status_vaga', 'aberta')
    .order('criado_em', { ascending: false })

  const items = (vagas ?? []).map((v) => {
    const titulo = v.titulo_publicacao ?? v.cargo
    const empresa = (v.clientes as any)?.nome_empresa ?? ''
    const cidade = (v.cliente_unidades as any)?.cidade ?? ''
    const uf = (v.cliente_unidades as any)?.uf ?? ''

    return `
    <job>
      <title><![CDATA[${titulo}]]></title>
      <date>${new Date(v.criado_em).toISOString()}</date>
      <referencenumber>${v.id}</referencenumber>
      <url>https://gege.ia.br/vagas/${v.slug}</url>
      <company><![CDATA[${empresa}]]></company>
      <city><![CDATA[${cidade}]]></city>
      <state>${uf}</state>
      <country>BR</country>
      <description><![CDATA[${v.descricao ?? titulo}]]></description>
      <salary>${v.salario ?? ''}</salary>
      <jobtype>${v.modelo_contratacao === 'CLT' ? 'fulltime' : 'contractor'}</jobtype>
    </job>`
  }).join('')

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<source>
  <publisher>Gegê</publisher>
  <publisherurl>https://gege.ia.br</publisherurl>
  <jobs>${items}
  </jobs>
</source>`

  return new NextResponse(xml, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' }
  })
}
