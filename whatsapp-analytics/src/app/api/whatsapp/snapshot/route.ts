import { NextResponse } from "next/server";
import { precisaResposta } from "@/lib/crm";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Sessao = {
  id: string;
  candidatura_id: string | null;
  candidato_id: string | null;
  etapa_atual: string | null;
  status: string | null;
  ultima_inbound_at: string | null;
  ultima_outbound_at: string | null;
};

type Evento = {
  id: string;
  sessao_id: string;
  direcao: "inbound" | "outbound";
  conteudo: string | null;
  tipo_mensagem: string | null;
  criado_em: string;
};

type Analise = {
  candidato_id: string;
  score_pos_entrevista: number | null;
  score_final: number | null;
  score_ia: number | null;
  tags: string[] | null;
};

const ETAPAS = [
  "disparo_template",
  "apresentacao_vaga",
  "confirma_endereco",
  "mini_entrevista",
  "agendamento_entrevista",
  "encerramento",
] as const;

function toColumn(etapa: string | null) {
  if (!etapa) return "sem_etapa";
  return ETAPAS.includes(etapa as (typeof ETAPAS)[number]) ? etapa : "outras";
}

export async function GET(request: Request) {
  try {
    const supabase = getSupabaseAdmin();
    const url = new URL(request.url);
    const selectedSession = url.searchParams.get("sessionId");

    const [{ data: vagas, error: vagasError }, { data: candidaturas, error: candError }, { data: sessoes, error: sessError }] =
      await Promise.all([
        supabase.from("vagas").select("id,cargo"),
        supabase.from("candidaturas").select("id,vaga_id,candidato_id,status"),
        supabase
          .from("whatsapp_sessoes")
          .select(
            "id,candidatura_id,candidato_id,etapa_atual,status,ultima_inbound_at,ultima_outbound_at"
          )
          .order("criado_em", { ascending: false })
          .limit(5000),
      ]);

    if (vagasError || candError || sessError) {
      throw vagasError || candError || sessError;
    }

    const candidaturaById = new Map(
      (candidaturas ?? []).map((c) => [c.id as string, c])
    );

    const candidatoIds = Array.from(
      new Set((sessoes ?? []).map((s) => s.candidato_id).filter(Boolean))
    ) as string[];

    const { data: candidatos, error: candidatosError } = await supabase
      .from("candidatos")
      .select("id,nome,telefone")
      .in("id", candidatoIds.length ? candidatoIds : ["__none__"]);

    if (candidatosError) throw candidatosError;

    const { data: analises, error: analisesError } = await supabase
      .from("candidatos_analise")
      .select("candidato_id,score_pos_entrevista,score_final,score_ia,tags")
      .in("candidato_id", candidatoIds.length ? candidatoIds : ["__none__"]);

    if (analisesError) throw analisesError;

    const candidatoById = new Map((candidatos ?? []).map((c) => [c.id as string, c]));
    const analiseByCandidatoId = new Map(
      ((analises ?? []) as Analise[]).map((a) => [a.candidato_id, a])
    );
    const sessionIds = (sessoes ?? []).map((s) => s.id as string);
    const sessionIdsFilter = sessionIds.length ? sessionIds : ["__none__"];

    const [{ count: inboundCount, error: inboundCountError }, { count: outboundCount, error: outboundCountError }] =
      await Promise.all([
        supabase
          .from("whatsapp_eventos")
          .select("*", { count: "exact", head: true })
          .in("sessao_id", sessionIdsFilter)
          .eq("direcao", "inbound"),
        supabase
          .from("whatsapp_eventos")
          .select("*", { count: "exact", head: true })
          .in("sessao_id", sessionIdsFilter)
          .eq("direcao", "outbound"),
      ]);

    if (inboundCountError || outboundCountError) {
      throw inboundCountError || outboundCountError;
    }

    const lastBySession = new Map<string, Evento>();
    const BATCH_SIZE = 1000;
    const MAX_BATCHES = 30;
    const pendingSessions = new Set(sessionIds);

    // Busca paginada dos eventos mais recentes para evitar limite padrão por consulta.
    for (let batch = 0; batch < MAX_BATCHES && pendingSessions.size > 0; batch += 1) {
      const from = batch * BATCH_SIZE;
      const to = from + BATCH_SIZE - 1;
      const { data: eventosRaw, error: eventosError } = await supabase
        .from("whatsapp_eventos")
        .select("id,sessao_id,direcao,conteudo,tipo_mensagem,criado_em")
        .in("sessao_id", sessionIdsFilter)
        .order("criado_em", { ascending: false })
        .range(from, to);

      if (eventosError) throw eventosError;

      const eventos = (eventosRaw ?? []) as Evento[];
      if (eventos.length === 0) break;

      for (const evento of eventos) {
        if (!pendingSessions.has(evento.sessao_id)) continue;
        lastBySession.set(evento.sessao_id, evento);
        pendingSessions.delete(evento.sessao_id);
      }

      if (eventos.length < BATCH_SIZE) break;
    }

    const vagasMap = new Map(
      (vagas ?? []).map((v) => [v.id as string, { ...v, total: 0, respostas: 0, interessados: 0 }])
    );

    const pipeline: Record<string, number> = {};
    const conversas = (sessoes ?? []).map((s) => {
      const sessao = s as Sessao;
      const cand =
        sessao.candidato_id ? candidatoById.get(sessao.candidato_id) ?? null : null;
      const candidatura =
        sessao.candidatura_id ? candidaturaById.get(sessao.candidatura_id) ?? null : null;
      const vagaId = (candidatura?.vaga_id as string | null) ?? null;
      const analise =
        sessao.candidato_id ? analiseByCandidatoId.get(sessao.candidato_id) ?? null : null;

      if (vagaId && vagasMap.has(vagaId)) {
        const m = vagasMap.get(vagaId)!;
        m.total += 1;
        if (sessao.ultima_inbound_at) m.respostas += 1;
        if (["confirma_endereco", "mini_entrevista", "agendamento_entrevista", "encerramento"].includes(sessao.etapa_atual ?? "")) {
          m.interessados += 1;
        }
      }

      const col = toColumn(sessao.etapa_atual);
      pipeline[col] = (pipeline[col] ?? 0) + 1;

      const ultimaDirecao = lastBySession.get(sessao.id)?.direcao ?? null;

      return {
        id: sessao.id,
        candidato_id: sessao.candidato_id,
        candidatura_id: sessao.candidatura_id,
        etapa_atual: sessao.etapa_atual,
        status: sessao.status,
        vaga_id: vagaId,
        vaga_nome: vagaId ? (vagasMap.get(vagaId)?.cargo ?? "Sem vaga") : "Sem vaga",
        candidato_nome: (cand?.nome as string | null) ?? "Sem nome",
        telefone: (cand?.telefone as string | null) ?? null,
        ultima_mensagem: lastBySession.get(sessao.id)?.conteudo ?? null,
        ultima_direcao: ultimaDirecao,
        ultima_data: lastBySession.get(sessao.id)?.criado_em ?? null,
        ultima_inbound_at: sessao.ultima_inbound_at,
        ultima_outbound_at: sessao.ultima_outbound_at,
        precisa_resposta: precisaResposta(
          sessao.ultima_inbound_at,
          sessao.ultima_outbound_at,
          ultimaDirecao
        ),
        score_pos_entrevista: analise?.score_pos_entrevista ?? null,
        score_final: analise?.score_final ?? null,
        score_ia: analise?.score_ia ?? null,
        tags: Array.isArray(analise?.tags) ? analise.tags.map(String) : [],
      };
    });

    let selectedMessages: Evento[] = [];
    if (selectedSession) {
      const { data: selectedRaw, error: selectedError } = await supabase
        .from("whatsapp_eventos")
        .select("id,sessao_id,direcao,conteudo,tipo_mensagem,criado_em")
        .eq("sessao_id", selectedSession)
        .order("criado_em", { ascending: true })
        .limit(5000);
      if (selectedError) throw selectedError;
      selectedMessages = (selectedRaw ?? []) as Evento[];
    }

    return NextResponse.json(
      {
        cards: {
          total_sessoes: conversas.length,
          total_respostas: inboundCount ?? 0,
          total_enviadas: outboundCount ?? 0,
          sessoes_interesse: conversas.filter((c) =>
            ["confirma_endereco", "mini_entrevista", "agendamento_entrevista", "encerramento"].includes(
              c.etapa_atual ?? ""
            )
          ).length,
        },
        overview: Array.from(vagasMap.values()).sort((a, b) => b.total - a.total),
        pipeline,
        conversas: conversas.sort((a, b) => {
          const ad = a.ultima_data ? Date.parse(a.ultima_data) : 0;
          const bd = b.ultima_data ? Date.parse(b.ultima_data) : 0;
          return bd - ad;
        }),
        mensagens: selectedMessages,
      },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
          Pragma: "no-cache",
          Expires: "0",
        },
      }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido";
    console.error("[snapshot] erro ao carregar dados:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
