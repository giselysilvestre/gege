import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import {
  conteudoLogTemplate,
  normalizarTelefone,
  sendKapsoTemplate,
  sendKapsoTemplateNamedParams,
  sendKapsoText,
} from "@/lib/kapso";
import { dentroJanela24h } from "@/lib/crm/format";
import {
  META_TEMPLATE_POR_MODELO,
  modeloPorMotivoReprovacao,
  preencherMensagemAcao,
  type ModeloMensagemAcao,
} from "@/lib/crm/mensagens-acao";
import { proximaEtapaFunil } from "@/lib/crm/mapEtapa";
import { FUNIL_ETAPAS, type CrmTemplateWhatsapp, type EtapaFunil, type MotivoReprovacao } from "@/lib/crm/types";
import type { CandidaturaStatus } from "@/lib/candidatura-status";
import {
  CANDIDATURA_STATUS_DESISTENCIA,
  CANDIDATURA_STATUS_ENCAMINHADO_AGUARDANDO,
  CANDIDATURA_STATUS_INICIAL,
  nextCandidaturaStatus,
  reprovadoStatusForEtapa,
} from "@/lib/candidatura-status";

export const dynamic = "force-dynamic";

function mensagemErro(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    const msg = String((error as { message?: string }).message ?? "");
    const details = String((error as { details?: string }).details ?? "");
    const hint = String((error as { hint?: string }).hint ?? "");
    const code = String((error as { code?: string }).code ?? "");
    return [msg, details, hint, code].filter(Boolean).join(" — ") || "Erro desconhecido";
  }
  return String(error ?? "Erro desconhecido");
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseSessaoIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return [
    ...new Set(
      raw
        .map((id) => String(id ?? "").trim())
        .filter((id): id is string => id.length > 0)
    ),
  ];
}

function parseEnviarMensagem(raw: unknown) {
  return raw === true;
}

function parseModeloMensagem(raw: unknown): ModeloMensagemAcao | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  const valid = [
    "reprovar_distancia",
    "reprovar_horario",
    "reprovar_perfil",
    "desistencia",
    "encaminhado",
    "mover_vaga",
  ] as const;
  return (valid as readonly string[]).includes(s) ? (s as ModeloMensagemAcao) : null;
}

async function loadVagaClienteNome(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  candidaturaId: string | null
) {
  if (!candidaturaId) return "empresa";
  const { data } = await supabase
    .from("candidaturas")
    .select("vaga_id, vagas(cliente:clientes(nome_empresa))")
    .eq("id", candidaturaId)
    .maybeSingle();
  const vaga = data?.vagas as { cliente?: { nome_empresa?: string } | { nome_empresa?: string }[] } | null;
  const cliente = Array.isArray(vaga?.cliente) ? vaga?.cliente[0] : vaga?.cliente;
  return String(cliente?.nome_empresa ?? "empresa");
}

async function enviarMensagemModelo(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  sessaoId: string,
  sessao: SessaoRow,
  cand: CandRow | null,
  modelo: ModeloMensagemAcao,
  opts?: { vagaTitulo?: string; candidaturaId?: string | null }
): Promise<{ aviso?: string }> {
  const telefone = normalizarTelefone(String(cand?.telefone ?? ""));
  if (!telefone) {
    return { aviso: "Sem telefone — mensagem não enviada." };
  }

  const candidaturaId = opts?.candidaturaId ?? sessao.candidatura_id;
  const cliente = await loadVagaClienteNome(supabase, candidaturaId);
  const vaga =
    opts?.vagaTitulo?.trim() ||
    (await loadVagaTitulo(supabase, candidaturaId));
  const msg = preencherMensagemAcao(modelo, {
    nome: String(cand?.nome ?? "candidato"),
    cliente,
    vaga,
  });

  const ultimaInbound = sessao.ultima_inbound_at ?? null;
  if (dentroJanela24h(ultimaInbound)) {
    const kapso = await sendKapsoText(telefone, msg);
    await registrarOutbound(supabase, sessaoId, sessao.candidato_id, msg, kapso.kapsoMessageId, {
      tipo_mensagem: "manual_crm",
      espera_resposta: true,
    });
    return {};
  }

  const meta = META_TEMPLATE_POR_MODELO[modelo];
  if (!meta) {
    return {
      aviso:
        "Janela de 24h fechada. Cadastre um template Meta para este tipo de mensagem ou espere o candidato responder.",
    };
  }

  const varMap = {
    nome: String(cand?.nome ?? "candidato").split(/\s+/)[0],
    cliente,
    vaga,
  };
  const namedParams = meta.vars.map((v) => ({
    parameter_name: v,
    text: varMap[v],
  }));

  try {
    const kapso = await sendKapsoTemplateNamedParams(telefone, meta.kapsoName, namedParams);
    await registrarOutbound(
      supabase,
      sessaoId,
      sessao.candidato_id,
      `[template:${meta.kapsoName}] ${msg}`,
      kapso.kapsoMessageId,
      { tipo_mensagem: "follow_up_d1", espera_resposta: true }
    );
    return {
      aviso: `Janela 24h fechada: enviado via template ${meta.kapsoName}.`,
    };
  } catch {
    return {
      aviso: `Mensagem não enviada: cadastre o template "${meta.kapsoName}" na Kapso/Meta (janela 24h fechada).`,
    };
  }
}

async function loadVagaTituloPorId(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  vagaId: string
) {
  const { data } = await supabase
    .from("vagas")
    .select("titulo_publicacao,cargo")
    .eq("id", vagaId)
    .maybeSingle();
  return String(data?.titulo_publicacao ?? data?.cargo ?? "vaga").trim();
}

async function loadVagaTitulo(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  candidaturaId: string | null
) {
  if (!candidaturaId) return "vaga";
  const { data } = await supabase
    .from("candidaturas")
    .select("vagas(titulo_publicacao,cargo)")
    .eq("id", candidaturaId)
    .maybeSingle();
  const vaga = data?.vagas as { titulo_publicacao?: string | null; cargo?: string | null } | null;
  return String(vaga?.titulo_publicacao ?? vaga?.cargo ?? "vaga").trim();
}

async function loadSessao(supabase: ReturnType<typeof getSupabaseAdmin>, sessaoId: string) {
  const { data, error } = await supabase
    .from("whatsapp_sessoes")
    .select("id,candidato_id,candidatura_id,etapa_funil,reativacao_enviada,ultima_inbound_at")
    .eq("id", sessaoId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

type SessaoRow = NonNullable<Awaited<ReturnType<typeof loadSessao>>>;
type CandRow = { id: string; nome: string; telefone: string | null; curriculo_url: string | null };

async function loadCandidaturaStatus(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  candidaturaId: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from("candidaturas")
    .select("status")
    .eq("id", candidaturaId)
    .maybeSingle();
  if (error) throw error;
  return data?.status != null ? String(data.status) : null;
}

async function executarReprovar(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  sessaoId: string,
  sessao: SessaoRow,
  cand: CandRow | null,
  motivo: MotivoReprovacao
) {
  if (sessao.candidatura_id) {
    const statusAtual = await loadCandidaturaStatus(supabase, sessao.candidatura_id);
    const reprovado = reprovadoStatusForEtapa(statusAtual);
    if (!reprovado) throw new Error("Não é possível reprovar nesta etapa");
    await supabase
      .from("candidaturas")
      .update({
        motivo_reprovacao: motivo,
        status: reprovado,
        atualizado_em: new Date().toISOString(),
      })
      .eq("id", sessao.candidatura_id);
  }
  await supabase
    .from("whatsapp_sessoes")
    .update({ etapa_funil: "reprovado", status: "encerrado" })
    .eq("id", sessaoId);
}

async function registrarOutbound(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  sessaoId: string,
  candidatoId: string | null,
  conteudo: string,
  kapsoMessageId: string | null,
  opts?: { tipo_mensagem?: string | null; espera_resposta?: boolean }
) {
  if (!candidatoId) {
    throw new Error("Sessão sem candidato vinculado — não foi possível salvar no histórico.");
  }

  const now = new Date().toISOString();
  const row = {
    sessao_id: sessaoId,
    candidato_id: candidatoId,
    direcao: "outbound" as const,
    tipo_midia: "texto" as const,
    tipo_mensagem: opts?.tipo_mensagem ?? "manual_crm",
    conteudo,
    criado_em: now,
    kapso_message_id: kapsoMessageId,
    processado_pela_ia: false,
    espera_resposta: opts?.espera_resposta ?? false,
  };

  const { error } = await supabase.from("whatsapp_eventos").insert(row);
  if (error) {
    const hint =
      error.code === "23514" && String(error.message).includes("tipo_mensagem")
        ? " Rode a migration 20260604230000_whatsapp_eventos_tipo_mensagem_crm no Supabase."
        : "";
    throw new Error(`${error.message}${hint}`);
  }
  await supabase
    .from("whatsapp_sessoes")
    .update({ ultima_outbound_at: now, atualizado_em: now })
    .eq("id", sessaoId);
}

async function executarAvancar(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  sessaoId: string,
  sessao: SessaoRow
) {
  const atual = (sessao.etapa_funil as EtapaFunil | null) ?? "abordado";
  const prox = proximaEtapaFunil(atual);
  if (!prox) {
    throw new Error("Não há próxima etapa");
  }
  const now = new Date().toISOString();
  await supabase
    .from("whatsapp_sessoes")
    .update({ etapa_funil: prox, atualizado_em: now })
    .eq("id", sessaoId);

  if (sessao.candidatura_id) {
    const statusAtual = await loadCandidaturaStatus(supabase, sessao.candidatura_id);
    const proxStatus = nextCandidaturaStatus(statusAtual);
    if (!proxStatus) throw new Error("Não há próxima etapa");
    await supabase
      .from("candidaturas")
      .update({ status: proxStatus, atualizado_em: new Date().toISOString() })
      .eq("id", sessao.candidatura_id);
  }

  if (prox === "encaminhado") {
    const dedupeKey = `entrevista_marcada:${sessaoId}`;
    await supabase.from("whatsapp_alertas").upsert(
      {
        tipo: "entrevista_marcada",
        sessao_id: sessaoId,
        candidato_id: sessao.candidato_id,
        candidatura_id: sessao.candidatura_id ?? null,
        titulo: "Candidato encaminhado p/ entrevista",
        detalhe: "Marcado no CRM (Avançar etapa → encaminhado).",
        metadata: { origem: "crm_avancar" },
        dedupe_key: dedupeKey,
        status: "ativo",
      },
      { onConflict: "dedupe_key", ignoreDuplicates: false }
    );
  }
  return prox;
}

function isEtapaFunilDb(v: string): v is EtapaFunil {
  return (FUNIL_ETAPAS as readonly string[]).includes(v);
}

function candidaturaStatusForEtapaFunil(etapa: EtapaFunil): CandidaturaStatus | null {
  const map: Partial<Record<EtapaFunil, CandidaturaStatus>> = {
    abordado: "abordado_em_conversa",
    respondeu: "abordado_em_conversa",
    interessado: "abordado_avancar",
    qualificado: "qualificado_avancar",
    encaminhado: CANDIDATURA_STATUS_ENCAMINHADO_AGUARDANDO,
    contratado: "contratado",
  };
  return map[etapa] ?? null;
}

async function executarMoverEtapaFunil(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  sessaoId: string,
  sessao: SessaoRow,
  cand: CandRow | null,
  destino: EtapaFunil
): Promise<EtapaFunil> {
  const atual = (sessao.etapa_funil as EtapaFunil | null) ?? "abordado";
  if (atual === destino) return destino;

  if (destino === "reprovado") {
    await executarReprovar(supabase, sessaoId, sessao, cand, "eliminatorio");
    return "reprovado";
  }

  if (destino === "desistiu") {
    await supabase
      .from("whatsapp_sessoes")
      .update({ etapa_funil: "desistiu", status: "encerrado", atualizado_em: new Date().toISOString() })
      .eq("id", sessaoId);
    if (sessao.candidatura_id) {
      await supabase
        .from("candidaturas")
        .update({
          motivo_reprovacao: "desistiu",
          status: CANDIDATURA_STATUS_DESISTENCIA,
          atualizado_em: new Date().toISOString(),
        })
        .eq("id", sessao.candidatura_id);
    }
    return "desistiu";
  }

  if (destino === "encaminhado") {
    await executarEncaminhar(supabase, sessaoId, sessao);
    return "encaminhado";
  }

  const now = new Date().toISOString();
  const statusSessao =
    destino === "inativo" || destino === "contratado" ? "encerrado" : "ativo";

  await supabase
    .from("whatsapp_sessoes")
    .update({ etapa_funil: destino, status: statusSessao, atualizado_em: now })
    .eq("id", sessaoId);

  if (sessao.candidatura_id) {
    const statusCand = candidaturaStatusForEtapaFunil(destino);
    if (statusCand) {
      await supabase
        .from("candidaturas")
        .update({ status: statusCand, atualizado_em: now })
        .eq("id", sessao.candidatura_id);
    }
  }

  return destino;
}

async function executarEncaminhar(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  sessaoId: string,
  sessao: SessaoRow
) {
  const now = new Date().toISOString();
  await supabase
    .from("whatsapp_sessoes")
    .update({ etapa_funil: "encaminhado", atualizado_em: now })
    .eq("id", sessaoId);

  if (sessao.candidatura_id) {
    await supabase
      .from("candidaturas")
      .update({
        status: CANDIDATURA_STATUS_ENCAMINHADO_AGUARDANDO,
        atualizado_em: new Date().toISOString(),
      })
      .eq("id", sessao.candidatura_id);
  }

  const dedupeKey = `entrevista_marcada:${sessaoId}`;
  await supabase.from("whatsapp_alertas").upsert(
    {
      tipo: "entrevista_marcada",
      sessao_id: sessaoId,
      candidato_id: sessao.candidato_id,
      candidatura_id: sessao.candidatura_id ?? null,
      titulo: "Candidato encaminhado p/ entrevista",
      detalhe: "Marcado no CRM (Encaminhar).",
      metadata: { origem: "crm_encaminhar" },
      dedupe_key: dedupeKey,
      status: "ativo",
    },
    { onConflict: "dedupe_key", ignoreDuplicates: false }
  );
}

async function executarMoverVaga(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  sessaoId: string,
  sessao: SessaoRow,
  cand: CandRow | null,
  vagaDestinoId: string,
  enviarMensagem: boolean
) {
  if (!sessao.candidatura_id) {
    throw new Error("Sessão sem candidatura vinculada");
  }

  const { data: candOrigem, error: candErr } = await supabase
    .from("candidaturas")
    .select("id,candidato_id,vaga_id")
    .eq("id", sessao.candidatura_id)
    .maybeSingle();
  if (candErr) throw candErr;
  if (!candOrigem?.candidato_id || !candOrigem.vaga_id) {
    throw new Error("Candidatura de origem inválida");
  }

  const vagaOrigemId = String(candOrigem.vaga_id);
  if (vagaOrigemId === vagaDestinoId) {
    throw new Error("A vaga de destino é a mesma da vaga atual");
  }

  const candidatoId = String(candOrigem.candidato_id);
  const candidaturaOrigemId = String(candOrigem.id);

  const { data: dupDest } = await supabase
    .from("candidaturas")
    .select("id")
    .eq("vaga_id", vagaDestinoId)
    .eq("candidato_id", candidatoId)
    .neq("id", candidaturaOrigemId);

  for (const row of dupDest ?? []) {
    const { error } = await supabase.from("candidaturas").delete().eq("id", row.id);
    if (error) throw error;
  }

  let candidaturaDestinoId: string;
  const { data: existenteDest } = await supabase
    .from("candidaturas")
    .select("id")
    .eq("vaga_id", vagaDestinoId)
    .eq("candidato_id", candidatoId)
    .maybeSingle();

  if (existenteDest?.id) {
    candidaturaDestinoId = String(existenteDest.id);
    const { error } = await supabase
      .from("candidaturas")
      .update({
        status: CANDIDATURA_STATUS_INICIAL,
        arquivada: false,
        arquivada_em: null,
        motivo_reprovacao: null,
        atualizado_em: new Date().toISOString(),
      })
      .eq("id", candidaturaDestinoId);
    if (error) throw error;
  } else {
    const { data: inserted, error } = await supabase
      .from("candidaturas")
      .insert({
        candidato_id: candidatoId,
        vaga_id: vagaDestinoId,
        status: CANDIDATURA_STATUS_INICIAL,
      })
      .select("id")
      .single();
    if (error) throw error;
    candidaturaDestinoId = String(inserted.id);
  }

  const { error: sessaoErr } = await supabase
    .from("whatsapp_sessoes")
    .update({
      candidatura_id: candidaturaDestinoId,
      etapa_funil: "abordado",
      status: "ativo",
      atualizado_em: new Date().toISOString(),
    })
    .eq("id", sessaoId);
  if (sessaoErr) throw sessaoErr;

  if (candidaturaOrigemId !== candidaturaDestinoId) {
    const { error: movidoErr } = await supabase
      .from("candidaturas")
      .update({
        arquivada: true,
        arquivada_em: new Date().toISOString(),
        atualizado_em: new Date().toISOString(),
      })
      .eq("id", candidaturaOrigemId);
    if (movidoErr) throw movidoErr;
  }

  const tituloVaga = await loadVagaTituloPorId(supabase, vagaDestinoId);
  let avisoMensagem: string | undefined;

  if (enviarMensagem) {
    const msgResult = await enviarMensagemModelo(supabase, sessaoId, sessao, cand, "mover_vaga", {
      vagaTitulo: tituloVaga,
      candidaturaId: candidaturaDestinoId,
    });
    avisoMensagem = msgResult.aviso;
  }

  return { candidaturaDestinoId, vagaDestinoId, tituloVaga, avisoMensagem };
}

async function executarTemplate(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  sessaoId: string,
  sessao: SessaoRow,
  cand: CandRow | null,
  templateName: CrmTemplateWhatsapp
) {
  const telefone = normalizarTelefone(String(cand?.telefone ?? ""));
  if (!telefone) {
    throw new Error("Telefone não encontrado");
  }
  const nome = String(cand?.nome ?? "candidato").split(/\s+/)[0];
  const cargo = await loadVagaTitulo(supabase, sessao.candidatura_id);
  const kapso = await sendKapsoTemplate(telefone, templateName, { nome, cargo });
  await registrarOutbound(
    supabase,
    sessaoId,
    sessao.candidato_id,
    conteudoLogTemplate(templateName),
    kapso.kapsoMessageId,
    { tipo_mensagem: "follow_up_d1", espera_resposta: true }
  );
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const action = String(body.action ?? "");
    const supabase = getSupabaseAdmin();

    if (action === "reprovar_lote") {
      const motivo = String(body.motivo ?? "") as MotivoReprovacao;
      const enviarMensagem = parseEnviarMensagem(body.enviarMensagem);
      const sessaoIds = parseSessaoIds(body.sessaoIds);
      if (!motivo) {
        return NextResponse.json({ error: "motivo é obrigatório" }, { status: 400 });
      }
      if (sessaoIds.length === 0) {
        return NextResponse.json({ error: "sessaoIds é obrigatório" }, { status: 400 });
      }

      const erros: { sessaoId: string; error: string }[] = [];
      const avisos: string[] = [];
      let processados = 0;
      for (const sid of sessaoIds) {
        try {
          const sessao = await loadSessao(supabase, sid);
          if (!sessao) {
            erros.push({ sessaoId: sid, error: "Sessão não encontrada" });
            continue;
          }
          const { data: cand } = await supabase
            .from("candidatos")
            .select("id,nome,telefone,curriculo_url")
            .eq("id", sessao.candidato_id ?? "")
            .maybeSingle();
          await executarReprovar(supabase, sid, sessao, cand, motivo);
          if (enviarMensagem) {
            const r = await enviarMensagemModelo(
              supabase,
              sid,
              sessao,
              cand,
              modeloPorMotivoReprovacao(motivo)
            );
            if (r.aviso) avisos.push(r.aviso);
          }
          processados += 1;
        } catch (error) {
          erros.push({ sessaoId: sid, error: mensagemErro(error) });
        }
      }

      return NextResponse.json({
        ok: erros.length === 0,
        processados,
        total: sessaoIds.length,
        erros,
        aviso: avisos.length > 0 ? [...new Set(avisos)].join(" ") : undefined,
      });
    }

    if (action === "avancar_lote") {
      const sessaoIds = parseSessaoIds(body.sessaoIds);
      if (sessaoIds.length === 0) {
        return NextResponse.json({ error: "sessaoIds é obrigatório" }, { status: 400 });
      }

      const erros: { sessaoId: string; error: string }[] = [];
      let processados = 0;
      for (const sid of sessaoIds) {
        try {
          const sessao = await loadSessao(supabase, sid);
          if (!sessao) {
            erros.push({ sessaoId: sid, error: "Sessão não encontrada" });
            continue;
          }
          await executarAvancar(supabase, sid, sessao);
          processados += 1;
        } catch (error) {
          erros.push({ sessaoId: sid, error: mensagemErro(error) });
        }
      }

      return NextResponse.json({
        ok: erros.length === 0,
        processados,
        total: sessaoIds.length,
        erros,
      });
    }

    if (action === "mover_vaga_lote") {
      const vagaDestinoId = String(body.vagaDestinoId ?? "").trim();
      const enviarMensagem = body.enviarMensagem === true;
      const sessaoIds = parseSessaoIds(body.sessaoIds);
      if (!vagaDestinoId) {
        return NextResponse.json({ error: "vagaDestinoId é obrigatório" }, { status: 400 });
      }
      if (sessaoIds.length === 0) {
        return NextResponse.json({ error: "sessaoIds é obrigatório" }, { status: 400 });
      }

      const erros: { sessaoId: string; error: string }[] = [];
      const avisos: string[] = [];
      let processados = 0;
      for (let i = 0; i < sessaoIds.length; i += 1) {
        const sid = sessaoIds[i];
        try {
          const sessao = await loadSessao(supabase, sid);
          if (!sessao) {
            erros.push({ sessaoId: sid, error: "Sessão não encontrada" });
            continue;
          }
          const { data: cand } = await supabase
            .from("candidatos")
            .select("id,nome,telefone,curriculo_url")
            .eq("id", sessao.candidato_id ?? "")
            .maybeSingle();
          const result = await executarMoverVaga(
            supabase,
            sid,
            sessao,
            cand,
            vagaDestinoId,
            enviarMensagem
          );
          if (result.avisoMensagem) avisos.push(result.avisoMensagem);
          processados += 1;
        } catch (error) {
          erros.push({ sessaoId: sid, error: mensagemErro(error) });
        }
        if (i < sessaoIds.length - 1) await sleep(400);
      }

      return NextResponse.json({
        ok: erros.length === 0,
        processados,
        total: sessaoIds.length,
        erros,
        aviso: avisos.length > 0 ? [...new Set(avisos)].join(" ") : undefined,
      });
    }

    if (action === "template_lote") {
      const template = String(body.template ?? "").trim() as CrmTemplateWhatsapp;
      const sessaoIds = parseSessaoIds(body.sessaoIds);
      if (!template) {
        return NextResponse.json({ error: "template é obrigatório" }, { status: 400 });
      }
      if (sessaoIds.length === 0) {
        return NextResponse.json({ error: "sessaoIds é obrigatório" }, { status: 400 });
      }

      const erros: { sessaoId: string; error: string }[] = [];
      let processados = 0;
      for (let i = 0; i < sessaoIds.length; i += 1) {
        const sid = sessaoIds[i];
        try {
          const sessao = await loadSessao(supabase, sid);
          if (!sessao) {
            erros.push({ sessaoId: sid, error: "Sessão não encontrada" });
            continue;
          }
          const { data: cand } = await supabase
            .from("candidatos")
            .select("id,nome,telefone,curriculo_url")
            .eq("id", sessao.candidato_id ?? "")
            .maybeSingle();
          await executarTemplate(supabase, sid, sessao, cand, template);
          processados += 1;
        } catch (error) {
          erros.push({ sessaoId: sid, error: mensagemErro(error) });
        }
        if (i < sessaoIds.length - 1) await sleep(400);
      }

      return NextResponse.json({
        ok: erros.length === 0,
        processados,
        total: sessaoIds.length,
        erros,
      });
    }

    const sessaoId = String(body.sessaoId ?? "").trim();

    if (!sessaoId || !action) {
      return NextResponse.json({ error: "action e sessaoId são obrigatórios" }, { status: 400 });
    }
    const sessao = await loadSessao(supabase, sessaoId);
    if (!sessao) {
      return NextResponse.json({ error: "Sessão não encontrada" }, { status: 404 });
    }

    const { data: cand } = await supabase
      .from("candidatos")
      .select("id,nome,telefone,curriculo_url")
      .eq("id", sessao.candidato_id ?? "")
      .maybeSingle();

    const telefone = normalizarTelefone(String(cand?.telefone ?? ""));
    const nome = String(cand?.nome ?? "candidato").split(/\s+/)[0];

    if (action === "enviar") {
      const mensagem = String(body.mensagem ?? "").trim();
      if (!mensagem) {
        return NextResponse.json({ error: "mensagem é obrigatória" }, { status: 400 });
      }
      if (!telefone) {
        return NextResponse.json({ error: "Telefone não encontrado" }, { status: 400 });
      }
      const ultimaInbound = (sessao as { ultima_inbound_at?: string | null }).ultima_inbound_at ?? null;
      if (!dentroJanela24h(ultimaInbound)) {
        return NextResponse.json(
          {
            error:
              "Janela de 24h expirada: o WhatsApp não entrega texto livre depois disso. Use um template aprovado (ex.: fup_mensagem) ou espere o candidato responder.",
            codigo: "janela_24h_expirada",
            ultima_inbound_at: ultimaInbound,
          },
          { status: 422 }
        );
      }
      const kapso = await sendKapsoText(telefone, mensagem);
      await registrarOutbound(
        supabase,
        sessaoId,
        sessao.candidato_id,
        mensagem,
        kapso.kapsoMessageId
      );
      return NextResponse.json({ ok: true, kapsoMessageId: kapso.kapsoMessageId });
    }

    if (action === "reprovar") {
      const motivo = String(body.motivo ?? "") as MotivoReprovacao;
      const enviarMensagem = parseEnviarMensagem(body.enviarMensagem);
      if (!motivo) {
        return NextResponse.json({ error: "motivo é obrigatório" }, { status: 400 });
      }
      await executarReprovar(supabase, sessaoId, sessao, cand, motivo);
      let aviso: string | undefined;
      if (enviarMensagem) {
        const r = await enviarMensagemModelo(
          supabase,
          sessaoId,
          sessao,
          cand,
          modeloPorMotivoReprovacao(motivo)
        );
        aviso = r.aviso;
      }
      return NextResponse.json({ ok: true, etapa_funil: "reprovado", aviso });
    }

    if (action === "desistir") {
      const enviarMensagem = parseEnviarMensagem(body.enviarMensagem);
      await supabase
        .from("whatsapp_sessoes")
        .update({ etapa_funil: "desistiu", status: "encerrado" })
        .eq("id", sessaoId);
      if (sessao.candidatura_id) {
        await supabase
          .from("candidaturas")
          .update({
            motivo_reprovacao: "desistiu",
            status: CANDIDATURA_STATUS_DESISTENCIA,
            atualizado_em: new Date().toISOString(),
          })
          .eq("id", sessao.candidatura_id);
      }
      let aviso: string | undefined;
      if (enviarMensagem) {
        const r = await enviarMensagemModelo(supabase, sessaoId, sessao, cand, "desistencia");
        aviso = r.aviso;
      }
      return NextResponse.json({ ok: true, etapa_funil: "desistiu", aviso });
    }

    if (action === "reativar") {
      if (sessao.reativacao_enviada) {
        return NextResponse.json({ error: "Reativação já enviada para este candidato" }, { status: 400 });
      }
      const msg = `Oi ${nome}, ainda tá disponível?`;
      if (!telefone) {
        return NextResponse.json({ error: "Telefone não encontrado" }, { status: 400 });
      }
      const kapso = await sendKapsoText(telefone, msg);
      await registrarOutbound(
        supabase,
        sessaoId,
        sessao.candidato_id,
        msg,
        kapso.kapsoMessageId
      );
      await supabase
        .from("whatsapp_sessoes")
        .update({ reativacao_enviada: true, etapa_funil: "abordado" })
        .eq("id", sessaoId);
      return NextResponse.json({ ok: true });
    }

    if (action === "favoritar") {
      const favorito = body.favorito !== false;
      const { error } = await supabase
        .from("whatsapp_sessoes")
        .update({ favorito_crm: favorito })
        .eq("id", sessaoId);
      if (error) {
        return NextResponse.json({ error: mensagemErro(error) }, { status: 500 });
      }
      return NextResponse.json({ ok: true, favorito_crm: favorito });
    }

    if (action === "pausar_agente") {
      await supabase
        .from("whatsapp_sessoes")
        .update({ status: "encerrado", atualizado_em: new Date().toISOString() })
        .eq("id", sessaoId);
      return NextResponse.json({ ok: true, status: "encerrado" });
    }

    if (action === "avancar") {
      const enviarMensagem = parseEnviarMensagem(body.enviarMensagem);
      const prox = await executarAvancar(supabase, sessaoId, sessao);
      let aviso: string | undefined;
      if (enviarMensagem && prox === "encaminhado") {
        const r = await enviarMensagemModelo(supabase, sessaoId, sessao, cand, "encaminhado");
        aviso = r.aviso;
      }
      return NextResponse.json({ ok: true, etapa_funil: prox, aviso });
    }

    if (action === "encaminhar") {
      const enviarMensagem = parseEnviarMensagem(body.enviarMensagem);
      await executarEncaminhar(supabase, sessaoId, sessao);
      let aviso: string | undefined;
      if (enviarMensagem) {
        const r = await enviarMensagemModelo(supabase, sessaoId, sessao, cand, "encaminhado");
        aviso = r.aviso;
      }
      return NextResponse.json({ ok: true, etapa_funil: "encaminhado", aviso });
    }

    if (action === "mandar_mensagem") {
      const modelo = parseModeloMensagem(body.modeloMensagem);
      if (!modelo) {
        return NextResponse.json({ error: "modeloMensagem é obrigatório" }, { status: 400 });
      }
      const vagaTitulo = String(body.vagaTitulo ?? "").trim() || undefined;
      const r = await enviarMensagemModelo(supabase, sessaoId, sessao, cand, modelo, {
        vagaTitulo,
      });
      if (r.aviso?.includes("não enviada") || r.aviso?.includes("Cadastre")) {
        return NextResponse.json({ ok: false, aviso: r.aviso }, { status: 422 });
      }
      return NextResponse.json({ ok: true, aviso: r.aviso });
    }

    if (action === "mover_etapa") {
      const etapaDestino = String(body.etapaDestino ?? "").trim();
      if (!isEtapaFunilDb(etapaDestino)) {
        return NextResponse.json({ error: "etapaDestino inválida" }, { status: 400 });
      }
      const etapa = await executarMoverEtapaFunil(
        supabase,
        sessaoId,
        sessao,
        cand,
        etapaDestino
      );
      return NextResponse.json({ ok: true, etapa_funil: etapa });
    }

    if (action === "mover_vaga") {
      const vagaDestinoId = String(body.vagaDestinoId ?? "").trim();
      const enviarMensagem = body.enviarMensagem === true;
      if (!vagaDestinoId) {
        return NextResponse.json({ error: "vagaDestinoId é obrigatório" }, { status: 400 });
      }
      const result = await executarMoverVaga(
        supabase,
        sessaoId,
        sessao,
        cand,
        vagaDestinoId,
        enviarMensagem
      );
      return NextResponse.json({
        ok: true,
        candidatura_id: result.candidaturaDestinoId,
        vaga_id: result.vagaDestinoId,
        vaga_nome: result.tituloVaga,
        aviso: result.avisoMensagem,
      });
    }

    if (action === "reprocessar_cv") {
      if (!cand?.curriculo_url) {
        return NextResponse.json(
          {
            error:
              "Candidato sem URL de currículo. Rode o gege-cv-processor manualmente para este arquivo.",
          },
          { status: 400 }
        );
      }
      return NextResponse.json({
        ok: false,
        aviso:
          "Reprocessamento automático via CRM ainda não ligado ao processor. Use gege-cv-processor com o PDF deste candidato.",
        curriculo_url: cand.curriculo_url,
      });
    }

    return NextResponse.json({ error: `Ação desconhecida: ${action}` }, { status: 400 });
  } catch (error) {
    const message = mensagemErro(error);
    console.error("[acoes]", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
