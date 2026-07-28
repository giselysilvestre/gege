import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  CrmCandidatoRow,
  CrmDashboard,
  CrmMetrics,
  CandidatoExperiencia,
  EtapaFunil,
  VagaOption,
  WhatsappMessage,
} from "./types";
import { FUNIL_ETAPAS } from "./types";
import { diasSemResposta, precisaResposta, ultimaAtividadeFromSessao } from "./format";
import { topExperiencias } from "./experiencia";
import { inferirEtapaFunil, statusDot } from "./mapEtapa";

function isEtapaFunilDb(v: string): v is EtapaFunil {
  return (FUNIL_ETAPAS as readonly string[]).includes(v);
}

type SessaoRow = {
  id: string;
  candidato_id: string | null;
  candidatura_id: string | null;
  etapa_atual: string | null;
  etapa_funil: string | null;
  status: string | null;
  ultima_inbound_at: string | null;
  ultima_outbound_at: string | null;
  primeira_resposta_at: string | null;
  resumo_ia: string | null;
  reativacao_enviada: boolean | null;
  favorito_crm: boolean | null;
  criado_em: string;
  atualizado_em: string | null;
};

/** Evita URL gigante no PostgREST (limite ~16KB de headers). */
const IN_CHUNK = 40;
/** PostgREST/Supabase devolve no máximo 1000 linhas por consulta — paginar acima disso. */
const PAGE_SIZE = 1000;
/** Paralelismo máximo de consultas .in() — evita saturar o Supabase. */
const IN_PARALLEL = 8;

async function mapInBatches<T, R>(
  items: T[],
  batchSize: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const part = await Promise.all(batch.map(fn));
    out.push(...part);
  }
  return out;
}

async function fetchCandidaturasByIds(supabase: SupabaseClient, ids: string[]) {
  const map = new Map<string, Record<string, unknown>>();
  const unique = [...new Set(ids)];
  if (unique.length === 0) return map;

  const chunks: string[][] = [];
  for (let i = 0; i < unique.length; i += IN_CHUNK) {
    chunks.push(unique.slice(i, i + IN_CHUNK));
  }

  const parts = await mapInBatches(chunks, IN_PARALLEL, async (slice) => {
    const { data, error } = await supabase
      .from("candidaturas")
      .select(
        "id,vaga_id,candidato_id,status,distancia_km,motivo_reprovacao,score_compatibilidade,atualizado_em"
      )
      .in("id", slice);
    if (error) throw error;
    return data ?? [];
  });

  for (const row of parts.flat()) map.set(row.id as string, row);
  return map;
}

async function fetchRowsByIds<T extends Record<string, unknown>>(
  supabase: SupabaseClient,
  table: string,
  select: string,
  column: string,
  ids: string[]
): Promise<T[]> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return [];

  const chunks: string[][] = [];
  for (let i = 0; i < unique.length; i += IN_CHUNK) {
    chunks.push(unique.slice(i, i + IN_CHUNK));
  }

  const parts = await mapInBatches(chunks, IN_PARALLEL, async (slice) => {
    const { data, error } = await supabase.from(table).select(select).in(column, slice);
    if (error) throw error;
    return (data ?? []) as unknown as T[];
  });
  return parts.flat();
}

type UltimaMsgRow = { conteudo: string | null; criado_em: string };

async function fetchUltimaMensagemPorSessao(
  supabase: SupabaseClient,
  sessaoIds: string[]
): Promise<Map<string, UltimaMsgRow>> {
  const map = new Map<string, UltimaMsgRow>();
  if (sessaoIds.length === 0) return map;

  // Prévia na lista: só as sessões mais recentes; 1 consulta por chunk (sem paginar milhares de eventos).
  const targetIds = sessaoIds.slice(0, 600);
  const perChunkLimit = 250;

  for (let i = 0; i < targetIds.length; i += IN_CHUNK) {
    const chunk = targetIds.slice(i, i + IN_CHUNK);
    const pending = new Set(chunk);

    const { data, error } = await supabase
      .from("whatsapp_eventos")
      .select("sessao_id,conteudo,criado_em")
      .in("sessao_id", chunk)
      .order("criado_em", { ascending: false })
      .limit(perChunkLimit);

    if (error) throw error;

    for (const ev of (data ?? []) as {
      sessao_id: string;
      conteudo: string | null;
      criado_em: string;
    }[]) {
      if (!pending.has(ev.sessao_id) || map.has(ev.sessao_id)) continue;
      map.set(ev.sessao_id, { conteudo: ev.conteudo, criado_em: ev.criado_em });
      pending.delete(ev.sessao_id);
    }
  }

  return map;
}

const SESSAO_SELECT =
  "id,candidato_id,candidatura_id,etapa_atual,etapa_funil,status,ultima_inbound_at,ultima_outbound_at,primeira_resposta_at,resumo_ia,reativacao_enviada,favorito_crm,criado_em,atualizado_em";

async function fetchAllSessoes(supabase: SupabaseClient): Promise<SessaoRow[]> {
  const sessoes: SessaoRow[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("whatsapp_sessoes")
      .select(SESSAO_SELECT)
      .order("atualizado_em", { ascending: false })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const batch = (data ?? []) as SessaoRow[];
    sessoes.push(...batch);
    if (batch.length < PAGE_SIZE) break;
  }
  return sessoes;
}

async function fetchSessoesInChunk(
  supabase: SupabaseClient,
  candidaturaIds: string[]
): Promise<SessaoRow[]> {
  const rows: SessaoRow[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("whatsapp_sessoes")
      .select(SESSAO_SELECT)
      .in("candidatura_id", candidaturaIds)
      .order("atualizado_em", { ascending: false })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const batch = (data ?? []) as SessaoRow[];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) break;
  }
  return rows;
}

async function fetchCandidaturaIdsByVaga(supabase: SupabaseClient, vagaId: string) {
  const ids: string[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("candidaturas")
      .select("id")
      .eq("vaga_id", vagaId)
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const batch = (data ?? []).map((r) => r.id as string);
    ids.push(...batch);
    if (batch.length < PAGE_SIZE) break;
  }
  return ids;
}

async function fetchSessoesForCandidaturaIds(
  supabase: SupabaseClient,
  candidaturaIds: string[]
): Promise<SessaoRow[]> {
  if (candidaturaIds.length === 0) return [];

  const chunks: string[][] = [];
  for (let i = 0; i < candidaturaIds.length; i += IN_CHUNK) {
    chunks.push(candidaturaIds.slice(i, i + IN_CHUNK));
  }

  const parts = await Promise.all(
    chunks.map(async (slice) => fetchSessoesInChunk(supabase, slice))
  );

  const byId = new Map<string, SessaoRow>();
  for (const s of parts.flat()) byId.set(s.id, s);
  return Array.from(byId.values());
}

async function fetchVagaIdsByCliente(
  supabase: SupabaseClient,
  clienteId: string
): Promise<string[]> {
  const { data, error } = await supabase.from("vagas").select("id").eq("cliente_id", clienteId);
  if (error) throw error;
  return (data ?? []).map((r) => r.id as string);
}

export async function countCandidaturas(
  supabase: SupabaseClient,
  opts: { vagaId: string | null; clienteId: string | null }
): Promise<number> {
  let vagaIds: string[] | null = null;
  if (opts.vagaId) {
    vagaIds = [opts.vagaId];
  } else if (opts.clienteId) {
    vagaIds = await fetchVagaIdsByCliente(supabase, opts.clienteId);
    if (vagaIds.length === 0) return 0;
  }

  if (!opts.vagaId && !opts.clienteId) {
    const { count, error } = await supabase
      .from("whatsapp_sessoes")
      .select("*", { count: "exact", head: true });
    if (error) throw error;
    return count ?? 0;
  }

  if (vagaIds) {
    let total = 0;
    for (let i = 0; i < vagaIds.length; i += IN_CHUNK) {
      const slice = vagaIds.slice(i, i + IN_CHUNK);
      const { count, error } = await supabase
        .from("candidaturas")
        .select("*", { count: "exact", head: true })
        .in("vaga_id", slice);
      if (error) throw error;
      total += count ?? 0;
    }
    return total;
  }

  const { count, error } = await supabase
    .from("candidaturas")
    .select("*", { count: "exact", head: true });
  if (error) throw error;
  return count ?? 0;
}

export async function fetchVagas(supabase: SupabaseClient): Promise<VagaOption[]> {
  const { data: vagas, error } = await supabase
    .from("vagas")
    .select("id,cargo,titulo_publicacao,cliente_id,clientes(nome_empresa)")
    .order("criado_em", { ascending: false })
    .limit(500);
  if (error) throw error;

  return (vagas ?? [])
    .map((v) => {
      const cl = Array.isArray(v.clientes) ? v.clientes[0] : v.clientes;
      const cliente = (cl as { nome_empresa?: string } | null)?.nome_empresa ?? "Cliente";
      const titulo = (v.titulo_publicacao as string | null) ?? (v.cargo as string);
      return {
        id: v.id as string,
        cargo: v.cargo as string,
        titulo: v.titulo_publicacao as string | null,
        cliente_id: v.cliente_id as string,
        cliente_nome: cliente,
        label: `${cliente} — ${titulo}`,
      };
    })
    .sort(
      (a, b) =>
        a.cliente_nome.localeCompare(b.cliente_nome, "pt-BR") ||
        (a.titulo ?? a.cargo).localeCompare(b.titulo ?? b.cargo, "pt-BR")
    );
}

export async function fetchCrmRows(
  supabase: SupabaseClient,
  vagaId: string | null,
  clienteId: string | null = null,
  opts?: { skipPreview?: boolean }
): Promise<CrmCandidatoRow[]> {
  const skipPreview = opts?.skipPreview !== false;
  let sessoes: SessaoRow[];
  let candidaturaIds: string[];

  if (vagaId) {
    candidaturaIds = await fetchCandidaturaIdsByVaga(supabase, vagaId);
    sessoes = await fetchSessoesForCandidaturaIds(supabase, candidaturaIds);
  } else if (clienteId) {
    const vagaIds = await fetchVagaIdsByCliente(supabase, clienteId);
    candidaturaIds = [];
    for (const vid of vagaIds) {
      const ids = await fetchCandidaturaIdsByVaga(supabase, vid);
      candidaturaIds.push(...ids);
    }
    candidaturaIds = [...new Set(candidaturaIds)];
    sessoes = await fetchSessoesForCandidaturaIds(supabase, candidaturaIds);
  } else {
    sessoes = await fetchAllSessoes(supabase);
    candidaturaIds = Array.from(
      new Set(sessoes.map((s) => s.candidatura_id).filter(Boolean))
    ) as string[];
  }

  sessoes.sort((a, b) => {
    const ta = Date.parse(a.atualizado_em ?? a.criado_em) || 0;
    const tb = Date.parse(b.atualizado_em ?? b.criado_em) || 0;
    return tb - ta;
  });

  const candidaturaById = await fetchCandidaturasByIds(supabase, candidaturaIds);

  const candidatoIds = Array.from(
    new Set(sessoes.map((s) => s.candidato_id).filter(Boolean))
  ) as string[];

  const [candidatos, analises, experienciasRaw, { data: vagas }] = await Promise.all([
    candidatoIds.length
      ? fetchRowsByIds<Record<string, unknown>>(
          supabase,
          "candidatos",
          "id,nome,telefone,situacao_emprego,cidade,bairro,regiao,data_nascimento,curriculo_url",
          "id",
          candidatoIds
        )
      : Promise.resolve([]),
    candidatoIds.length
      ? fetchRowsByIds<Record<string, unknown>>(
          supabase,
          "candidatos_analise",
          "candidato_id,score_ia,score_final,score_pos_entrevista,tags,disponibilidade_horario,perfil_resumo,analise_completa",
          "candidato_id",
          candidatoIds
        )
      : Promise.resolve([]),
    candidatoIds.length
      ? fetchRowsByIds<Record<string, unknown>>(
          supabase,
          "candidatos_experiencia",
          "candidato_id,empresa,cargo,data_inicio,data_fim,meses",
          "candidato_id",
          candidatoIds
        )
      : Promise.resolve([]),
    supabase.from("vagas").select("id,cargo,titulo_publicacao"),
  ]);

  const candidatoById = new Map(candidatos.map((c) => [c.id as string, c]));
  const analiseById = new Map(analises.map((a) => [a.candidato_id as string, a]));
  const experienciasByCandidato = new Map<string, CandidatoExperiencia[]>();
  for (const row of experienciasRaw) {
    const candidatoId = row.candidato_id as string;
    const empresa = String(row.empresa ?? "").trim();
    if (!empresa) continue;
    const list = experienciasByCandidato.get(candidatoId) ?? [];
    list.push({
      empresa,
      cargo: (row.cargo as string | null) ?? null,
      data_inicio: (row.data_inicio as string | null) ?? null,
      data_fim: (row.data_fim as string | null) ?? null,
      meses: row.meses != null ? Number(row.meses) : null,
    });
    experienciasByCandidato.set(candidatoId, list);
  }
  const vagasMap = new Map(
    (vagas ?? []).map((v) => [
      v.id as string,
      (v.titulo_publicacao as string) || (v.cargo as string) || "Vaga",
    ])
  );

  let ultimaMsgPorSessao = new Map<string, UltimaMsgRow>();
  if (!skipPreview) {
    const previewIds = sessoes.slice(0, 600).map((s) => s.id);
    try {
      ultimaMsgPorSessao = await Promise.race([
        fetchUltimaMensagemPorSessao(supabase, previewIds),
        new Promise<Map<string, UltimaMsgRow>>((_, reject) => {
          setTimeout(() => reject(new Error("timeout preview")), 8_000);
        }),
      ]);
    } catch (e) {
      console.warn("[fetchCrmRows] Prévia de última mensagem indisponível:", e);
    }
  }

  const rows: CrmCandidatoRow[] = [];

  for (const s of sessoes) {
    const cand = s.candidato_id ? candidatoById.get(s.candidato_id) : null;
    const candRow = s.candidatura_id ? candidaturaById.get(s.candidatura_id) : null;
    const analise = s.candidato_id ? analiseById.get(s.candidato_id) : null;
    const vagaIdRow = (candRow?.vaga_id as string | undefined) ?? null;
    const ultima = ultimaAtividadeFromSessao(s.ultima_inbound_at, s.ultima_outbound_at);

    const etapaFunil = inferirEtapaFunil(
      s,
      candRow
        ? {
            status: candRow.status as string,
            motivo_reprovacao: candRow.motivo_reprovacao as string | null,
          }
        : null,
      analise
        ? { score_pos_entrevista: analise.score_pos_entrevista as number | null }
        : null
    );

    const ultimaDir = ultima.ultima_direcao;
    const precisa = precisaResposta(
      s.ultima_inbound_at,
      s.ultima_outbound_at,
      ultimaDir
    );
    const diasInat = diasSemResposta(s.ultima_inbound_at, s.ultima_outbound_at);

    // Score CV = parecer do currículo (score_ia) puro — sem score_final nem score_compatibilidade.
    const scoreCv =
      analise?.score_ia != null ? (analise.score_ia as number | null) : null;

    rows.push({
      sessao_id: s.id,
      candidato_id: s.candidato_id ?? "",
      candidatura_id: s.candidatura_id,
      candidato_nome: (cand?.nome as string) ?? "Sem nome",
      telefone: (cand?.telefone as string | null) ?? null,
      etapa_funil: etapaFunil,
      etapa_atual: s.etapa_atual,
      status_sessao: s.status,
      vaga_id: vagaIdRow,
      vaga_nome: vagaIdRow ? (vagasMap.get(vagaIdRow) ?? "Sem vaga") : "Sem vaga",
      score_cv: scoreCv != null ? Math.round(Number(scoreCv)) : null,
      score_entrevista:
        analise?.score_pos_entrevista != null
          ? Number(analise.score_pos_entrevista)
          : null,
      distancia_km:
        candRow?.distancia_km != null ? Number(candRow.distancia_km) : null,
      cidade: (cand?.cidade as string | null) ?? null,
      bairro: (cand?.bairro as string | null) ?? null,
      regiao: (cand?.regiao as string | null) ?? null,
      data_nascimento: (cand?.data_nascimento as string | null) ?? null,
      disponibilidade: (analise?.disponibilidade_horario as string | null) ?? null,
      situacao: (cand?.situacao_emprego as string | null) ?? null,
      tags: Array.isArray(analise?.tags) ? (analise.tags as string[]).map(String) : [],
      ultima_mensagem: ultimaMsgPorSessao.get(s.id)?.conteudo ?? null,
      ultima_direcao: ultimaDir,
      ultima_data: ultima.ultima_data,
      ultima_inbound_at: s.ultima_inbound_at,
      ultima_outbound_at: s.ultima_outbound_at,
      precisa_resposta: precisa,
      status_dot: statusDot(etapaFunil, precisa, diasInat),
      resumo_ia: s.resumo_ia,
      perfil_resumo: (analise?.perfil_resumo as string | null) ?? null,
      analise_completa: (analise?.analise_completa as string | null) ?? null,
      experiencias_cv: s.candidato_id
        ? topExperiencias(experienciasByCandidato.get(s.candidato_id) ?? [])
        : [],
      curriculo_url: (cand?.curriculo_url as string | null) ?? null,
      reativacao_enviada: Boolean(s.reativacao_enviada),
      motivo_reprovacao: (candRow?.motivo_reprovacao as string | null) ?? null,
      candidatura_status: (candRow?.status as string | null) ?? null,
      favorito_crm: Boolean(s.favorito_crm),
      sessao_criado_em: s.criado_em ?? null,
      sessao_etapa_funil:
        s.etapa_funil && isEtapaFunilDb(s.etapa_funil) ? (s.etapa_funil as EtapaFunil) : null,
      sessao_atualizado_em: s.atualizado_em ?? null,
      candidatura_atualizado_em: (candRow?.atualizado_em as string | null) ?? null,
    });
  }

  return rows;
}

export function buildMetrics(rows: CrmCandidatoRow[], todos: number): CrmMetrics {
  const abordados = rows.filter(
    (r) =>
      r.ultima_outbound_at ||
      [
        "abordado",
        "respondeu",
        "interessado",
        "qualificado",
        "encaminhado",
        "contratado",
        "inativo",
      ].includes(r.etapa_funil)
  ).length;
  const responderam = rows.filter((r) =>
    ["respondeu", "interessado", "qualificado", "encaminhado", "contratado"].includes(r.etapa_funil)
  ).length;
  const interessados = rows.filter((r) =>
    ["interessado", "qualificado", "encaminhado", "contratado"].includes(r.etapa_funil)
  ).length;
  const qualificados = rows.filter((r) =>
    ["qualificado", "encaminhado", "contratado"].includes(r.etapa_funil)
  ).length;
  const encaminhados = rows.filter((r) =>
    ["encaminhado", "contratado"].includes(r.etapa_funil)
  ).length;
  const reprovados = rows.filter((r) => r.etapa_funil === "reprovado").length;

  const pct = (n: number, base: number) => (base > 0 ? Math.round((n / base) * 100) : 0);

  return {
    todos,
    abordados,
    responderam,
    interessados,
    qualificados,
    encaminhados,
    reprovados,
    pct_responderam: pct(responderam, abordados),
    pct_interessados: pct(interessados, abordados),
    pct_qualificados: pct(qualificados, abordados),
    pct_encaminhados: pct(encaminhados, abordados),
  };
}

export function buildDashboard(rows: CrmCandidatoRow[]): CrmDashboard {
  const funil_counts = Object.fromEntries(
    FUNIL_ETAPAS.map((e) => [e, rows.filter((r) => r.etapa_funil === e).length])
  ) as Record<EtapaFunil, number>;

  const abordados = rows.length || 1;
  const responderam = rows.filter((r) => r.ultima_inbound_at).length;
  const qualificados = funil_counts.qualificado + funil_counts.encaminhado + funil_counts.contratado;

  const tempos: number[] = [];
  for (const r of rows) {
    if (r.etapa_funil !== "qualificado" && r.etapa_funil !== "encaminhado" && r.etapa_funil !== "contratado") {
      continue;
    }
    if (r.ultima_inbound_at && r.ultima_data) {
      const t = Date.parse(r.ultima_data) - Date.parse(r.ultima_inbound_at);
      if (t > 0) tempos.push(t);
    }
  }
  const tempo_medio_qualificado_horas =
    tempos.length > 0
      ? Math.round(tempos.reduce((a, b) => a + b, 0) / tempos.length / 3600000)
      : null;

  const motivoMap = new Map<string, number>();
  for (const r of rows) {
    if (!r.motivo_reprovacao) continue;
    motivoMap.set(r.motivo_reprovacao, (motivoMap.get(r.motivo_reprovacao) ?? 0) + 1);
  }

  const atividade_7d: CrmDashboard["atividade_7d"] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    atividade_7d.push({
      dia: d.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit" }),
      inbound: 0,
      outbound: 0,
    });
  }

  return {
    taxa_resposta: Math.round((responderam / abordados) * 100),
    taxa_qualificacao: Math.round((qualificados / abordados) * 100),
    tempo_medio_qualificado_horas,
    funil_counts,
    atividade_7d,
    motivos_reprovacao: Array.from(motivoMap.entries()).map(([motivo, count]) => ({
      motivo,
      count,
    })),
  };
}

const MESSAGE_PAGE = 350;

export async function fetchMessages(
  supabase: SupabaseClient,
  sessaoId: string
): Promise<WhatsappMessage[]> {
  const { data, error } = await supabase
    .from("whatsapp_eventos")
    .select("id,direcao,conteudo,criado_em,tipo_mensagem")
    .eq("sessao_id", sessaoId)
    .order("criado_em", { ascending: false })
    .limit(MESSAGE_PAGE);
  if (error) throw error;
  const rows = (data ?? []) as WhatsappMessage[];
  return rows.reverse();
}

export async function enrichDashboardActivity(
  supabase: SupabaseClient,
  _vagaId: string | null,
  dashboard: CrmDashboard,
  sessionIds: string[]
) {
  if (sessionIds.length === 0) return dashboard;

  const since = new Date();
  since.setDate(since.getDate() - 6);
  since.setHours(0, 0, 0, 0);

  const sessionSet = new Set(sessionIds);
  const eventRows: { direcao: string; criado_em: string; sessao_id: string }[] = [];
  const ids = [...sessionSet];
  for (let i = 0; i < ids.length; i += IN_CHUNK) {
    const slice = ids.slice(i, i + IN_CHUNK);
    const { data, error } = await supabase
      .from("whatsapp_eventos")
      .select("direcao,criado_em,sessao_id")
      .in("sessao_id", slice)
      .gte("criado_em", since.toISOString());
    if (error) throw error;
    eventRows.push(...((data ?? []) as typeof eventRows));
  }

  const dayKeys: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dayKeys.push(d.toISOString().slice(0, 10));
  }

  const counts = new Map(dayKeys.map((k) => [k, { inbound: 0, outbound: 0 }]));

  for (const ev of eventRows) {
    if (!sessionSet.has(ev.sessao_id as string)) continue;
    const key = (ev.criado_em as string).slice(0, 10);
    const bucket = counts.get(key);
    if (!bucket) continue;
    if (ev.direcao === "inbound") bucket.inbound += 1;
    else bucket.outbound += 1;
  }

  dashboard.atividade_7d = dayKeys.map((key) => {
    const d = new Date(key + "T12:00:00");
    const c = counts.get(key) ?? { inbound: 0, outbound: 0 };
    return {
      dia: d.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit" }),
      inbound: c.inbound,
      outbound: c.outbound,
    };
  });

  return dashboard;
}
