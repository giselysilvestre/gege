import { Fragment } from 'react'
import Image from 'next/image'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { notFound } from 'next/navigation'

const PAGE_CSS = `
.vaga-pub-page * { box-sizing: border-box; }
.vaga-pub-page { max-width: 600px; margin: 0 auto; padding: 24px 16px 48px; }
.vaga-pub-header { display: flex; align-items: center; gap: 12px; margin-bottom: 28px; padding-bottom: 20px; border-bottom: 0.5px solid #e8e8e8; }
.vaga-pub-logo-box { width: 48px; height: 48px; border-radius: 10px; background: #6B2D5B; display: flex; align-items: center; justify-content: center; color: #fff; font-size: 18px; font-weight: 500; flex-shrink: 0; }
.vaga-pub-logo-wrap { width: 48px; height: 48px; border-radius: 10px; overflow: hidden; flex-shrink: 0; background: #f7f7f8; display: flex; align-items: center; justify-content: center; border: 0.5px solid #e8e8e8; }
.vaga-pub-logo-img { object-fit: contain; width: 48px; height: 48px; }
.vaga-pub-empresa { font-size: 13px; color: #666; margin-bottom: 2px; }
.vaga-pub-empresa-nome { font-size: 15px; font-weight: 500; color: #111; }
.vaga-pub-titulo { font-size: 22px; font-weight: 500; color: #111; margin-bottom: 14px; line-height: 1.3; }
.vaga-pub-pills { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 24px; }
.vaga-pub-pill { display: inline-block; padding: 4px 12px; border-radius: 999px; font-size: 12px; font-weight: 500; border: 0.5px solid; }
.vaga-pub-pill-local { background: #E1F5EE; color: #0F6E56; border-color: #5DCAA5; }
.vaga-pub-pill-salario { background: #EAF3DE; color: #3B6D11; border-color: #97C459; }
.vaga-pub-pill-modelo { background: #EEEDFE; color: #534AB7; border-color: #AFA9EC; }
.vaga-pub-details-card { background: #f7f7f8; border-radius: 12px; padding: 16px; margin-bottom: 24px; display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.vaga-pub-detail-item { display: flex; flex-direction: column; gap: 3px; }
.vaga-pub-detail-label { font-size: 11px; font-weight: 500; color: #888; text-transform: uppercase; letter-spacing: 0.5px; }
.vaga-pub-detail-value { font-size: 13px; color: #111; word-break: break-word; }
.vaga-pub-beneficios { margin-bottom: 24px; }
.vaga-pub-section-label { font-size: 11px; font-weight: 500; color: #888; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 10px; }
.vaga-pub-beneficios-list { display: flex; flex-wrap: wrap; gap: 8px; }
.vaga-pub-beneficio-tag { padding: 4px 12px; background: #f7f7f8; border: 0.5px solid #e8e8e8; border-radius: 999px; font-size: 12px; color: #666; }
.vaga-pub-descricao-section { margin-bottom: 28px; }
.vaga-pub-descricao { font-size: 14px; color: #111; line-height: 1.7; white-space: pre-wrap; word-break: break-word; }
.vaga-pub-btn-wa { display: flex; align-items: center; justify-content: center; gap: 10px; width: 100%; padding: 14px; border-radius: 12px; background: #25D366; color: #fff; font-size: 15px; font-weight: 500; border: none; cursor: pointer; text-decoration: none; box-sizing: border-box; }
.vaga-pub-btn-wa:hover { background: #1ebe5d; }
.vaga-pub-wa-icon { width: 20px; height: 20px; flex-shrink: 0; }
.vaga-pub-footer { margin-top: 32px; text-align: center; font-size: 12px; color: #888; }
.vaga-pub-footer span { color: #6B2D5B; font-weight: 500; }
@media (max-width: 520px) {
  .vaga-pub-details-card { grid-template-columns: 1fr; }
}
`

const BENEF_JSON_LABELS: Record<string, string> = {
  plano_saude: 'Plano de saúde',
  plano_odontologico: 'Plano odontológico',
  vale_transporte: 'Vale transporte',
  refeicao_local: 'Refeição no local',
  vale_alimentacao: 'Vale alimentação',
  bonus_meta: 'Bônus por meta',
  plano_carreira: 'Plano de carreira',
  outros: 'Outros benefícios',
}

function initialsFromEmpresa(nome: string): string {
  const parts = nome.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return 'E'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function formatCepLoja(raw: string | null | undefined): string {
  if (!raw?.trim()) return ''
  const d = raw.replace(/\D/g, '')
  if (d.length === 8) return `${d.slice(0, 5)}-${d.slice(5)}`
  return raw.trim()
}

/** Apenas dígitos; prefixo 55 (DDI Brasil) se ainda não houver. */
function waDigits(v: string | null | undefined): string {
  const d = (v ?? '').replace(/\D/g, '')
  if (!d) return ''
  return d.startsWith('55') ? d : `55${d}`
}

function beneficiosListFromVaga(bjson: unknown, bstring: string | null | undefined): string[] {
  if (bjson != null && typeof bjson === 'object' && !Array.isArray(bjson)) {
    const o = bjson as Record<string, unknown>
    const out: string[] = []
    for (const [key, val] of Object.entries(o)) {
      const base = BENEF_JSON_LABELS[key]
      if (!base) continue
      if (val === true) {
        out.push(base)
        continue
      }
      if (typeof val === 'number' && val > 0 && (key === 'vale_alimentacao' || key === 'bonus_meta')) {
        out.push(`${base} (R$ ${val.toLocaleString('pt-BR')})`)
        continue
      }
    }
    if (out.length > 0) return out
  }
  const s = bstring?.trim()
  if (!s) return []
  return s
    .split(/[;,]/)
    .map((x) => x.trim())
    .filter(Boolean)
}

type VagaRow = {
  id: string
  slug: string
  cargo: string
  titulo_publicacao: string | null
  descricao: string | null
  salario: number | string | null
  modelo_contratacao: string | null
  criado_em: string | null
  prazo_contratacao: string | null
  escala: string | null
  horario: string | null
  unidade_id: string | null
  unidade: string | null
  cep_loja: string | null
  quantidade_vagas: number | null
  beneficios: string | null
  beneficios_json: Record<string, unknown> | null
  clientes: {
    nome_empresa?: string | null
    cliente_configuracoes?:
      | {
          contato_whatsapp?: string | null
          contato_telefone?: string | null
          logo_url?: string | null
          carreira_logo_url?: string | null
        }
      | Array<{
          contato_whatsapp?: string | null
          contato_telefone?: string | null
          logo_url?: string | null
          carreira_logo_url?: string | null
        }>
      | null
  } | null
  cliente_unidades: {
    endereco_linha?: string | null
    cidade?: string | null
    uf?: string | null
  } | null
}

/** Com unidade_id: "endereço — Cidade/UF". Sem FK ou dados: texto legado + CEP. */
function formatEnderecoVagaPublica(vaga: VagaRow): string {
  const un = vaga.cliente_unidades
  if (vaga.unidade_id && un) {
    const linha = un.endereco_linha?.trim() ?? ''
    const cidadeUf = [un.cidade?.trim(), un.uf?.trim()].filter(Boolean).join('/')
    if (linha && cidadeUf) return `${linha} — ${cidadeUf}`
    if (linha) return linha
    if (cidadeUf) return cidadeUf
  }
  const legado = vaga.unidade?.trim() ?? ''
  const cep = formatCepLoja(vaga.cep_loja)
  const partes = [legado, cep].filter(Boolean)
  return partes.length > 0 ? partes.join(', ') : '—'
}

function pickCfgRow(clientes: VagaRow['clientes']) {
  const cfg = clientes?.cliente_configuracoes
  if (!cfg) return null
  return Array.isArray(cfg) ? cfg[0] : cfg
}

function pickPublicLogoUrl(clientes: VagaRow['clientes']): string | null {
  const row = pickCfgRow(clientes)
  const primary = row?.logo_url?.trim()
  if (primary) return primary
  const fallback = row?.carreira_logo_url?.trim()
  return fallback || null
}

function pickContatoWhatsapp(clientes: VagaRow['clientes']): string | null {
  const row = pickCfgRow(clientes)
  const wa = row?.contato_whatsapp?.trim()
  if (wa) return wa
  const tel = row?.contato_telefone?.trim()
  return tel || null
}

export default async function VagaPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const supabase = getSupabaseAdmin()

  const { data: vagaRaw, error } = await supabase
    .from('vagas')
    .select(
      `
      id,
      slug,
      cargo,
      titulo_publicacao,
      descricao,
      salario,
      modelo_contratacao,
      criado_em,
      prazo_contratacao,
      escala,
      horario,
      unidade_id,
      unidade,
      cep_loja,
      quantidade_vagas,
      beneficios,
      beneficios_json,
      clientes (
        nome_empresa,
        cliente_configuracoes (
          contato_whatsapp,
          contato_telefone,
          logo_url,
          carreira_logo_url
        )
      ),
      cliente_unidades ( endereco_linha, cidade, uf )
    `,
    )
    .eq('slug', slug)
    .in('status_vaga', ['aberta', 'em_selecao'])
    .maybeSingle()

  console.log('[vaga-debug]', { slug, vagaRaw, error })

  const vaga = vagaRaw as VagaRow | null
  if (!vaga) notFound()

  const titulo = vaga.titulo_publicacao ?? vaga.cargo
  const empresa = vaga.clientes?.nome_empresa?.trim() || 'Empresa'
  const iniciais = initialsFromEmpresa(empresa)
  const logoUrl = pickPublicLogoUrl(vaga.clientes)
  const cidade = vaga.cliente_unidades?.cidade?.trim() ?? ''
  const uf = vaga.cliente_unidades?.uf?.trim() ?? ''
  const localLabel = [cidade, uf].filter(Boolean).join(', ') || 'Local a combinar'

  const salarioNum =
    vaga.salario != null && vaga.salario !== '' ? Number(vaga.salario) : null
  const salarioFmt =
    salarioNum != null && Number.isFinite(salarioNum)
      ? `R$ ${salarioNum.toLocaleString('pt-BR')}/mês`
      : null

  const modelo = vaga.modelo_contratacao?.trim() || '—'
  const horario = vaga.horario?.trim() || '—'
  const escala = vaga.escala?.trim() || '—'
  const endereco = formatEnderecoVagaPublica(vaga)
  const qtd = vaga.quantidade_vagas != null && vaga.quantidade_vagas > 0 ? vaga.quantidade_vagas : 1
  const vagasLabel = `${qtd} ${qtd === 1 ? 'posição' : 'posições'}`

  const beneficiosTags = beneficiosListFromVaga(vaga.beneficios_json, vaga.beneficios)

  const contatoWhatsapp = pickContatoWhatsapp(vaga.clientes)
  const wa = waDigits(contatoWhatsapp)
  const waHref =
    wa
      ? `https://wa.me/${wa}?text=${encodeURIComponent(`Olá, tenho interesse na vaga de ${titulo}`)}`
      : null

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
    baseSalary:
      salarioNum != null && Number.isFinite(salarioNum)
        ? {
            '@type': 'MonetaryAmount',
            currency: 'BRL',
            value: {
              '@type': 'QuantitativeValue',
              value: salarioNum,
              unitText: 'MONTH',
            },
          }
        : undefined,
  }

  const descricao = vaga.descricao ?? ''

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <style dangerouslySetInnerHTML={{ __html: PAGE_CSS }} />
      <div className="vaga-pub-page">
        <header className="vaga-pub-header">
          {logoUrl ? (
            <div className="vaga-pub-logo-wrap" aria-hidden>
              <Image
                src={logoUrl}
                alt=""
                width={48}
                height={48}
                className="vaga-pub-logo-img"
                unoptimized
              />
            </div>
          ) : (
            <div className="vaga-pub-logo-box" aria-hidden>
              {iniciais}
            </div>
          )}
          <div>
            <div className="vaga-pub-empresa">Vaga de emprego</div>
            <div className="vaga-pub-empresa-nome">{empresa}</div>
          </div>
        </header>

        <h1 className="vaga-pub-titulo">{titulo}</h1>

        <div className="vaga-pub-pills">
          <span className="vaga-pub-pill vaga-pub-pill-local">{localLabel}</span>
          {salarioFmt ? (
            <span className="vaga-pub-pill vaga-pub-pill-salario">{salarioFmt}</span>
          ) : null}
          <span className="vaga-pub-pill vaga-pub-pill-modelo">{modelo}</span>
        </div>

        <div className="vaga-pub-details-card">
          <div className="vaga-pub-detail-item">
            <span className="vaga-pub-detail-label">Horário</span>
            <span className="vaga-pub-detail-value">{horario}</span>
          </div>
          <div className="vaga-pub-detail-item">
            <span className="vaga-pub-detail-label">Escala</span>
            <span className="vaga-pub-detail-value">{escala}</span>
          </div>
          <div className="vaga-pub-detail-item">
            <span className="vaga-pub-detail-label">Endereço</span>
            <span className="vaga-pub-detail-value">{endereco}</span>
          </div>
          <div className="vaga-pub-detail-item">
            <span className="vaga-pub-detail-label">Vagas</span>
            <span className="vaga-pub-detail-value">{vagasLabel}</span>
          </div>
        </div>

        {beneficiosTags.length > 0 ? (
          <section className="vaga-pub-beneficios" aria-label="Benefícios">
            <div className="vaga-pub-section-label">Benefícios</div>
            <div className="vaga-pub-beneficios-list">
              {beneficiosTags.map((b) => (
                <span key={b} className="vaga-pub-beneficio-tag">
                  {b}
                </span>
              ))}
            </div>
          </section>
        ) : null}

        <section className="vaga-pub-descricao-section" aria-label="Sobre a vaga">
          <div className="vaga-pub-section-label">Sobre a vaga</div>
          <div className="vaga-pub-descricao">
            {descricao.split('\n').map((line, i) => (
              <Fragment key={i}>
                {i > 0 ? <br /> : null}
                {line}
              </Fragment>
            ))}
          </div>
        </section>

        {waHref ? (
          <a className="vaga-pub-btn-wa" href={waHref} target="_blank" rel="noopener noreferrer">
            <svg className="vaga-pub-wa-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
            </svg>
            Candidatar pelo WhatsApp
          </a>
        ) : null}

        <div className="vaga-pub-footer">
          Powered by <span>gegê</span>
        </div>
      </div>
    </>
  )
}
