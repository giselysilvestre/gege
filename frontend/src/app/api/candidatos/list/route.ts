import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseRouteHandlerClient } from "@/lib/supabase/server";
import { getCurrentCliente } from "@/lib/data";
import { vagaTituloPublico } from "@/lib/vaga-display";
import type { CandidatoInscricaoRow } from "@/app/[clienteSlug]/candidatos/ui/CandidatoInscricaoCard";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { devError } from "@/lib/devLog";

export const dynamic = "force-dynamic";
/** Colunas que existem em `vw_candidaturas_enriquecida` desde a migration 023.
 * Campos exp_* extras entram após aplicar `030_view_candidaturas_enriquecida_experiencia.sql` no Supabase;
 * não incluir aqui antes disso quebra o PostgREST (lista vazia / 500). */
const ENRICHED_COLUMNS =
  "candidatura_id,vaga_id,cliente_id,status,enviado_em,atualizado_em,distancia_km,tags_candidatura,candidato_id,candidato_nome,candidato_telefone,candidato_bairro,candidato_cidade,candidato_data_nascimento,candidato_situacao_emprego,vaga_cargo,vaga_titulo_publicacao,score_ia_atual,tags_analise,ultima_experiencia";

/** Só incluir objeto `debug` nas respostas quando explicitamente ligado (evita vazar estrutura interna em produção). */
const LIST_API_DEBUG =
  process.env.GEGE_API_DEBUG === "1" || process.env.GEGE_API_DEBUG === "true";

function jsonWithOptionalDebug(
  body: Record<string, unknown>,
  debug: Record<string, unknown>,
  init?: Parameters<typeof NextResponse.json>[1]
) {
  const payload = LIST_API_DEBUG ? { ...body, debug } : body;
  return NextResponse.json(payload, init);
}

function parsePositiveInt(raw: string | null, fallback: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.floor(n);
}

function bearerToken(request: Request): string | null {
  const h = request.headers.get("authorization");
  if (!h?.startsWith("Bearer ")) return null;
  const t = h.slice(7).trim();
  return t || null;
}

function bestByCandidate(rows: CandidatoInscricaoRow[]): CandidatoInscricaoRow[] {
  const byCand = new Map<string, CandidatoInscricaoRow>();
  for (const r of rows) {
    const cid = r.candidato?.id;
    if (!cid) continue;
    const prev = byCand.get(cid);
    const prevScore = typeof prev?.score === "number" ? prev.score : -1;
    const curScore = typeof r.score === "number" ? r.score : -1;
    if (!prev || curScore > prevScore) byCand.set(r.candidato.id, r);
  }
  return [...byCand.values()].sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
}

export async function GET(request: Request) {
  try {
    return await handleCandidatosListGet(request);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro interno";
    console.error("[api/candidatos/list]", e);
    devError("[api/candidatos/list] não tratado:", e);
    return NextResponse.json(
      { message: msg.includes("Defina ") ? "Servidor sem variáveis Supabase (NEXT_PUBLIC_*)." : msg },
      { status: 500 }
    );
  }
}

async function handleCandidatosListGet(request: Request) {
  const reqUrl = new URL(request.url);
  const page = parsePositiveInt(reqUrl.searchParams.get("page"), 1);
  const pageSize = Math.min(200, parsePositiveInt(reqUrl.searchParams.get("pageSize"), 100));
  const vagaFilter = reqUrl.searchParams.get("vaga")?.trim() || null;
  const clienteSlug = reqUrl.searchParams.get('clienteSlug')?.trim() || null
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const token = bearerToken(request);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!token && (!url || !anon)) {
    return NextResponse.json(
      { message: "Configuração inválida: defina NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY." },
      { status: 503 }
    );
  }
  const supabase =
    token && url && anon
      ? createClient(url, anon, {
          global: { headers: { Authorization: `Bearer ${token}` } },
          auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
        })
      : await getSupabaseRouteHandlerClient();

  const debug: Record<string, unknown> = {};

  const clienteBySlug = clienteSlug
    ? (
        await supabase
          .from('clientes')
          .select('id, nome_empresa, email, nome_contato')
          .eq('slug', clienteSlug)
          .single()
      ).data
    : null
  const cliente = clienteBySlug ?? await getCurrentCliente(supabase, { accessToken: token })
  if (!cliente?.id) {
    return jsonWithOptionalDebug({ message: "Cliente não encontrado" }, { ...debug, cliente: null }, { status: 401 });
  }
  debug.cliente_id = cliente.id;

  const { data: vagasRows, error: vagasError } = await supabase
    .from("vagas")
    .select("id,cargo,titulo_publicacao,status_vaga")
    .eq("cliente_id", cliente.id)
    .neq("status_vaga", "cancelada");
  if (vagasError) {
    return jsonWithOptionalDebug({ message: vagasError.message }, { ...debug, etapa: "vagas", erro: vagasError.message }, { status: 500 });
  }
  const vagas = (vagasRows as unknown as Array<Record<string, unknown>> | null) ?? [];
  debug.vagas_encontradas = vagas.length;
  const vagasAtivas = vagas.map((v) => ({
    id: String(v.id),
    cargo: String(v.cargo ?? ""),
    titulo_publicacao: (v.titulo_publicacao as string | null | undefined) ?? null,
  }));
  if (!vagas.length) {
    return jsonWithOptionalDebug(
      { rows: [], vagasAtivas, page, pageSize, hasMore: false },
      debug,
      { headers: { "Cache-Control": "private, max-age=30, stale-while-revalidate=30" } }
    );
  }
  let enrQuery = supabase
    .from("vw_candidaturas_enriquecida")
    .select(ENRICHED_COLUMNS)
    .eq("cliente_id", cliente.id);
  if (vagaFilter) enrQuery = enrQuery.eq("vaga_id", vagaFilter);
  const { data: enrRows, error: enrError } = await enrQuery
    .order("enviado_em", { ascending: false })
    .range(from, to);

  let base = (enrRows as unknown as Array<Record<string, unknown>> | null) ?? [];
  if (enrError) {
    debug.enriquecida_error = enrError.message;
    try {
      const admin = getSupabaseAdmin();
      let adminQuery = admin
        .from("vw_candidaturas_enriquecida")
        .select(ENRICHED_COLUMNS)
        .eq("cliente_id", cliente.id);
      if (vagaFilter) adminQuery = adminQuery.eq("vaga_id", vagaFilter);
      const resAdmin = await adminQuery
        .order("enviado_em", { ascending: false })
        .range(from, to);
      if (!resAdmin.error) {
        base = (resAdmin.data as unknown as Array<Record<string, unknown>> | null) ?? [];
        debug.enriquecida_admin_fallback = true;
      } else {
        return jsonWithOptionalDebug({ message: resAdmin.error.message }, { ...debug, etapa: "enriquecida" }, { status: 500 });
      }
    } catch {
      return jsonWithOptionalDebug({ message: enrError.message }, { ...debug, etapa: "enriquecida" }, { status: 500 });
    }
  }
  debug.candidaturas_lidas = base.length;
  if (!base.length) {
    return jsonWithOptionalDebug(
      { rows: [], vagasAtivas, page, pageSize, hasMore: false },
      debug,
      { headers: { "Cache-Control": "private, max-age=30, stale-while-revalidate=30" } }
    );
  }
  const rows = base
    .filter((row) => row.candidato_id != null && String(row.candidato_id).length > 0)
    .map((row) => {
      const scoreRaw = row.score_ia_atual;
      const scoreN = Number(scoreRaw);
      const scoreIa = Number.isFinite(scoreN) ? Math.max(0, Math.min(100, Math.round(scoreN))) : null;
      return {
        candidaturaId: String(row.candidatura_id),
        vagaId: String(row.vaga_id),
        status: String(row.status),
        enviado_em: row.enviado_em ? String(row.enviado_em) : null,
        cargo: vagaTituloPublico({
          cargo: String(row.vaga_cargo ?? ""),
          titulo_publicacao: (row.vaga_titulo_publicacao as string | null | undefined) ?? null,
        }),
        tags: [
          ...(Array.isArray(row.tags_candidatura) ? row.tags_candidatura.map((x: unknown) => String(x)) : []),
          ...(Array.isArray(row.tags_analise) ? row.tags_analise.map((x: unknown) => String(x)) : []),
        ],
        score: scoreIa,
        distancia_km:
          row.distancia_km != null && Number.isFinite(Number(row.distancia_km))
            ? Number(row.distancia_km)
            : null,
        candidato: {
          id: String(row.candidato_id),
          nome: String(row.candidato_nome ?? "—"),
          telefone: (row.candidato_telefone as string | null | undefined) ?? null,
          bairro: (row.candidato_bairro as string | null | undefined) ?? null,
          cidade: (row.candidato_cidade as string | null | undefined) ?? null,
          data_nascimento: (row.candidato_data_nascimento as string | null | undefined) ?? null,
          situacao_emprego: (row.candidato_situacao_emprego as string | null | undefined) ?? null,
          score: scoreIa,
          exp_total_meses: (row.exp_total_meses as number | null | undefined) ?? null,
          exp_instabilidade_pct: (row.exp_instabilidade_pct as number | null | undefined) ?? null,
          exp_alimentacao_meses: (row.exp_alimentacao_meses as number | null | undefined) ?? null,
          exp_atendimento_meses: (row.exp_atendimento_meses as number | null | undefined) ?? null,
          exp_cozinha_meses: (row.exp_cozinha_meses as number | null | undefined) ?? null,
          exp_lideranca_meses: (row.exp_lideranca_meses as number | null | undefined) ?? null,
          exp_total_empregos: (row.exp_total_empregos as number | null | undefined) ?? null,
          exp_resumo:
            (row.exp_resumo as string | null | undefined) ??
            ((row.ultima_experiencia as string | null | undefined) ?? null),
        },
      } as CandidatoInscricaoRow;
    })
    .filter((x): x is CandidatoInscricaoRow => Boolean(x));
  debug.candidatos_cruzados = rows.length;

  const uniqueRows = bestByCandidate(rows);
  debug.linhas_unicas_final = uniqueRows.length;

  return jsonWithOptionalDebug(
    { rows: uniqueRows, vagasAtivas, page, pageSize, hasMore: base.length >= pageSize },
    debug,
    { headers: { "Cache-Control": "private, max-age=30, stale-while-revalidate=30" } }
  );
}
