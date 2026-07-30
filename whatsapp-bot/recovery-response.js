/**
 * Gera resposta da Ana para sessões com inbounds recuperados (sem duplicar inbound no banco).
 */
require("dotenv").config();
const axios = require("axios");
const Anthropic = require("@anthropic-ai/sdk");
const { createClient } = require("@supabase/supabase-js");
const { SYSTEM_PROMPT_BASE } = require("./ana-prompt");
const { linhasBeneficiosFromJson } = require("./beneficios-vaga");
const { normalizeE164Digits } = require("./webhook-kapso");
const {
  filtrarSaidaAna,
  isEtapaEncerrada,
  isFechamentoSocialCandidato,
} = require("./ana-sanitize");
const {
  detectaSimInteresseVaga,
  detectaNaoInteresseVaga,
  extrairMinutosDeslocamento,
  deveAvancarParaMiniEntrevista,
  respostaReprovaPorDistancia,
  MENSAGEM_INICIO_MINI_ENTREVISTA,
  normalizarTextoRespostaCurta,
} = require("./interesse-detect");
const { respostaFixaFunil, MENSAGEM_CONFIRMA_ENDERECO } = require("./respostas-fixas");

const MAX_HISTORY_MESSAGES = 20;
const MENSAGEM_SEM_AGENDAMENTO =
  "obrigada por responder! vou encaminhar seu perfil pro time do cliente analisar. se você for selecionado pra próxima etapa, o próprio time entra em contato com você — eu não marco entrevista por aqui. qualquer dúvida, pode mandar mensagem.";
const MENSAGEM_CANDIDATO_PERGUNTA_ENTREVISTA =
  "quem define data, horário e local de entrevista é o time da empresa, não eu. assim que tiverem retorno sobre seu perfil, eles te avisam. não consigo agendar nem confirmar horário por aqui.";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    process.env.SUPABASE_SERVICE_ROLE_KEY || "",
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

function getAnthropic() {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY || "" });
}

function inferirTipoCargo(cargo) {
  const texto = (cargo || "").toLowerCase();
  if (/\b(supervisor|supervisora|gerente|coordenador|coordenadora|líder|lider)\b/.test(texto)) {
    return "lideranca";
  }
  return "operacional";
}

function montarMensagemApresentacaoVaga(contextoVaga) {
  if (!contextoVaga) {
    return "me dá um minuto que vou confirmar os detalhes da vaga com o time";
  }

  const benefLines =
    contextoVaga.beneficios_linhas?.length > 0
      ? contextoVaga.beneficios_linhas
      : linhasBeneficiosFromJson(contextoVaga.beneficios_json);

  const bloco = [
    `Que ótimo! é uma vaga pra ${contextoVaga.cliente_nome}:`,
    `🧑‍🍳 ${contextoVaga.cargo} — ${contextoVaga.unidade_nome}`,
    `💰 Salário: R$ ${contextoVaga.salario}`,
    ...benefLines,
    `📍 ${contextoVaga.endereco_linha}, ${contextoVaga.bairro} — ${contextoVaga.cidade}/${contextoVaga.uf}`,
    `🕐 Escala ${contextoVaga.escala} (${contextoVaga.horario})`,
    "",
    "você tem interesse pela vaga?",
  ];

  return bloco.join("\n");
}

async function montarContextoVaga(supabase, candidaturaId) {
  if (!candidaturaId) return null;

  const { data: cand, error: candErr } = await supabase
    .from("candidaturas")
    .select("id, vaga_id")
    .eq("id", candidaturaId)
    .maybeSingle();
  if (candErr || !cand?.vaga_id) return null;

  const { data: vaga, error: vagaErr } = await supabase
    .from("vagas")
    .select(
      `id, cliente_id, unidade_id, cargo, salario, escala, horario, beneficios_json,
       unidade:cliente_unidades(id, nome, endereco_linha, bairro, cidade, uf),
       cliente:clientes(id, nome_empresa)`
    )
    .eq("id", cand.vaga_id)
    .maybeSingle();
  if (vagaErr || !vaga) return null;

  const u = Array.isArray(vaga.unidade) ? vaga.unidade[0] : vaga.unidade;
  const clienteDireto = Array.isArray(vaga.cliente) ? vaga.cliente[0] : vaga.cliente;
  const b = vaga.beneficios_json || {};

  let clienteNome = clienteDireto?.nome_empresa || "";
  if (!clienteNome && u?.id) {
    const { data: unidadeComCliente } = await supabase
      .from("cliente_unidades")
      .select("id, cliente:clientes(nome_empresa)")
      .eq("id", u.id)
      .maybeSingle();
    const clienteViaUnidade = Array.isArray(unidadeComCliente?.cliente)
      ? unidadeComCliente.cliente[0]
      : unidadeComCliente?.cliente;
    clienteNome = clienteViaUnidade?.nome_empresa || "";
  }

  return {
    cliente_nome: clienteNome,
    cargo: vaga.cargo || "",
    unidade_nome: u?.nome || "",
    salario: vaga.salario ? Number(vaga.salario).toFixed(2).replace(".", ",") : "",
    beneficios_json: b,
    beneficios_linhas: linhasBeneficiosFromJson(b),
    endereco_linha: u?.endereco_linha || "",
    bairro: u?.bairro || "",
    cidade: u?.cidade || "",
    uf: u?.uf || "",
    escala: vaga.escala || "",
    horario: vaga.horario || "",
  };
}

async function loadConversationHistoryBySessao(supabase, sessaoId) {
  const { data, error } = await supabase
    .from("whatsapp_eventos")
    .select("direcao, conteudo")
    .eq("sessao_id", sessaoId)
    .order("criado_em", { ascending: true });
  if (error) throw error;

  const mapped = (data || [])
    .map((event) => ({
      role: event.direcao === "inbound" ? "user" : "assistant",
      content: typeof event.conteudo === "string" ? event.conteudo : "",
    }))
    .filter((m) => m.content.length > 0);

  if (mapped.length > MAX_HISTORY_MESSAGES) {
    return mapped.slice(mapped.length - MAX_HISTORY_MESSAGES);
  }
  return mapped;
}

async function loadSessaoEvents(supabase, sessaoId) {
  const { data, error } = await supabase
    .from("whatsapp_eventos")
    .select("direcao, conteudo, criado_em")
    .eq("sessao_id", sessaoId)
    .order("criado_em", { ascending: true });
  if (error) throw error;
  return data || [];
}

function inferirEtapaPorMensagemAna(etapaAtual, assistantMessage) {
  const t = normalizarTextoRespostaCurta(assistantMessage);
  if (!t) return null;
  if (
    t.includes("vou te fazer algumas perguntas rapidas") ||
    t.includes("te conhecer melhor") ||
    t.includes("me conta sobre seu ultimo emprego")
  ) {
    return "mini_entrevista";
  }
  if (
    t.includes("vou passar seu perfil") ||
    t.includes("encaminhar seu perfil") ||
    t.includes("nao marco entrevista")
  ) {
    return "encerramento";
  }
  return null;
}

function sanitizarMensagemAna(etapaAtual, userMessage, assistantMessage) {
  const msg = String(assistantMessage || "").trim();
  const user = String(userMessage || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\s+/g, " ")
    .trim();
  const etapa = String(etapaAtual || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\s+/g, " ")
    .trim();

  if (/\b(que dia|qual dia|que horario|qual horario)\b/.test(user) && /\b(entrevist|marcar|agend)\b/.test(user)) {
    return MENSAGEM_CANDIDATO_PERGUNTA_ENTREVISTA;
  }

  if (
    etapa === "mini_entrevista" &&
    /^(trabalhei|meu desligamento|eu lido|eu trabalhei)\b/i.test(msg)
  ) {
    return "pode me contar melhor? me fala sobre seu último emprego.";
  }

  if (etapa === "mini_entrevista" && /forma como preferir|tanto faz|como preferir/.test(user)) {
    return "pode me contar melhor? me fala sobre seu último emprego.";
  }

  return filtrarSaidaAna({ etapaAtual, userMessage, assistantMessage: msg });
}

function deveEnviarApresentacaoVaga(sessao, events) {
  if (sessao.etapa_atual !== "disparo_template" || !sessao.candidatura_id) return false;
  const templateOutbound = events.find(
    (e) =>
      e.direcao === "outbound" &&
      (String(e.conteudo || "").includes("[template:") ||
        String(e.conteudo || "").toLowerCase().includes("oportunidade de"))
  );
  if (!templateOutbound) return false;
  const inboundsAfter = events.filter(
    (e) => e.direcao === "inbound" && String(e.criado_em) > String(templateOutbound.criado_em)
  );
  return inboundsAfter.length > 0;
}

function ultimaMensagemInbound(events) {
  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i].direcao === "inbound") return String(events[i].conteudo || "");
  }
  return "";
}

function inboundsDesdeUltimoOutbound(events) {
  let lastOutboundIdx = -1;
  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i].direcao === "outbound") {
      lastOutboundIdx = i;
      break;
    }
  }
  return events
    .slice(lastOutboundIdx + 1)
    .filter((e) => e.direcao === "inbound")
    .map((e) => String(e.conteudo || "").trim())
    .filter(Boolean);
}

function dentroJanela24h(ultimaInboundAt) {
  if (!ultimaInboundAt) return false;
  const diff = Date.now() - new Date(ultimaInboundAt).getTime();
  return diff >= 0 && diff < 24 * 60 * 60 * 1000;
}

async function sendKapsoText(toDigits, body) {
  const phoneNumberId = process.env.KAPSO_PHONE_NUMBER_ID;
  const apiKey = process.env.KAPSO_API_KEY;
  if (!apiKey || !phoneNumberId) {
    throw new Error("KAPSO_API_KEY ou KAPSO_PHONE_NUMBER_ID ausentes");
  }
  const url = `https://api.kapso.ai/meta/whatsapp/v24.0/${phoneNumberId}/messages`;
  const response = await axios.post(
    url,
    { messaging_product: "whatsapp", to: toDigits, type: "text", text: { body } },
    { headers: { "Content-Type": "application/json", "X-API-Key": apiKey } }
  );
  return response.data;
}

async function sendKapsoTemplate(toDigits, templateName = "gege_fup", { nome = "tudo bem" } = {}) {
  const phoneNumberId = process.env.KAPSO_PHONE_NUMBER_ID;
  const apiKey = process.env.KAPSO_API_KEY;
  if (!apiKey || !phoneNumberId) {
    throw new Error("KAPSO_API_KEY ou KAPSO_PHONE_NUMBER_ID ausentes");
  }
  const url = `https://api.kapso.ai/meta/whatsapp/v24.0/${phoneNumberId}/messages`;
  const body = {
    messaging_product: "whatsapp",
    to: toDigits,
    type: "template",
    template: {
      name: templateName,
      language: { code: "pt_BR" },
    },
  };
  if (templateName === "gege_fup") {
    body.template.components = [
      {
        type: "body",
        parameters: [{ type: "text", parameter_name: "nome", text: nome }],
      },
    ];
  }
  const response = await axios.post(url, body, {
    headers: { "Content-Type": "application/json", "X-API-Key": apiKey },
  });
  return response.data;
}

function isErroJanela24h(err) {
  const msg = String(err?.response?.data?.error || err?.message || "");
  return err?.response?.status === 422 && /24-hour window|24 hour/i.test(msg);
}

async function generateRecoveryReply(sessaoId, { dryRun = true, ignorarJanela = false } = {}) {
  const supabase = getSupabase();
  const anthropic = getAnthropic();

  const { data: sessao, error: sessaoErr } = await supabase
    .from("whatsapp_sessoes")
    .select(
      "id, candidato_id, candidatura_id, tipo_fluxo, etapa_atual, status, ultima_inbound_at, ultima_outbound_at"
    )
    .eq("id", sessaoId)
    .maybeSingle();
  if (sessaoErr) throw sessaoErr;
  if (!sessao) throw new Error(`Sessão não encontrada: ${sessaoId}`);

  const { data: candidato, error: candErr } = await supabase
    .from("candidatos")
    .select("id, nome, telefone, cargo_principal, cidade, bairro, situacao_emprego")
    .eq("id", sessao.candidato_id)
    .maybeSingle();
  if (candErr) throw candErr;
  if (!candidato) throw new Error(`Candidato não encontrado: ${sessao.candidato_id}`);

  const events = await loadSessaoEvents(supabase, sessaoId);
  const pendentes = inboundsDesdeUltimoOutbound(events);
  if (pendentes.length === 0) {
    throw new Error("Sem inbound pendente após último outbound — nada a responder");
  }
  const ultimaInbound = pendentes[pendentes.length - 1];
  const contextoVaga = sessao.candidatura_id
    ? await montarContextoVaga(supabase, sessao.candidatura_id)
    : null;

  let resposta;
  let modoResposta;
  let etapaEfetiva = sessao.etapa_atual;

  if (sessao.etapa_atual === "apresentacao_vaga") {
    if (detectaSimInteresseVaga(ultimaInbound)) etapaEfetiva = "confirma_endereco";
    else if (detectaNaoInteresseVaga(ultimaInbound)) etapaEfetiva = "encerramento";
  }
  if (etapaEfetiva === "confirma_endereco") {
    if (deveAvancarParaMiniEntrevista(ultimaInbound)) etapaEfetiva = "mini_entrevista";
  }

  if (deveEnviarApresentacaoVaga(sessao, events)) {
    resposta = montarMensagemApresentacaoVaga(contextoVaga);
    modoResposta = "apresentacao_vaga_fixa";
    etapaEfetiva = "apresentacao_vaga";
  } else {
    const { data: analise } = await supabase
      .from("candidatos_analise")
      .select("score_ia, tags, fit_food_service, disponibilidade_horario")
      .eq("candidato_id", sessao.candidato_id)
      .maybeSingle();

    const cargoReferencia = contextoVaga?.cargo || candidato.cargo_principal || "";
    const tipoCargo = inferirTipoCargo(cargoReferencia);
    const tipoFluxo = sessao.tipo_fluxo || (sessao.candidatura_id ? "candidatura" : "reativo");

    let systemPromptDinamico = SYSTEM_PROMPT_BASE
      .replace(/\{\{nome\}\}/g, candidato.nome || "não informado")
      .replace(/\{\{cargo_principal\}\}/g, candidato.cargo_principal || "não informado")
      .replace(/\{\{tipo_cargo\}\}/g, tipoCargo)
      .replace(/\{\{cidade\}\}/g, candidato.cidade || "não informada")
      .replace(/\{\{bairro\}\}/g, candidato.bairro || "não informado")
      .replace(/\{\{situacao_emprego\}\}/g, candidato.situacao_emprego || "não informada")
      .replace(/\{\{score_ia\}\}/g, analise?.score_ia?.toString() || "não calculado")
      .replace(/\{\{tags\}\}/g, analise?.tags?.join(", ") || "nenhuma")
      .replace(/\{\{fit_food_service\}\}/g, analise?.fit_food_service || "não avaliado")
      .replace(/\{\{disponibilidade_horario\}\}/g, analise?.disponibilidade_horario || "não informada")
      .replace(/\{\{tipo_fluxo\}\}/g, tipoFluxo)
      .replace(/\{\{etapa_atual\}\}/g, etapaEfetiva);

    if (contextoVaga) {
      systemPromptDinamico = systemPromptDinamico
        .replace(/\{\{vaga\.cliente_nome\}\}/g, contextoVaga.cliente_nome)
        .replace(/\{\{vaga\.cargo\}\}/g, contextoVaga.cargo)
        .replace(/\{\{vaga\.unidade_nome\}\}/g, contextoVaga.unidade_nome)
        .replace(/\{\{vaga\.salario\}\}/g, contextoVaga.salario)
        .replace(/\{\{vaga\.endereco_linha\}\}/g, contextoVaga.endereco_linha)
        .replace(/\{\{vaga\.bairro\}\}/g, contextoVaga.bairro)
        .replace(/\{\{vaga\.cidade\}\}/g, contextoVaga.cidade)
        .replace(/\{\{vaga\.uf\}\}/g, contextoVaga.uf)
        .replace(/\{\{vaga\.escala\}\}/g, contextoVaga.escala)
        .replace(/\{\{vaga\.horario\}\}/g, contextoVaga.horario)
        .replace(
          /\{\{vaga\.beneficios_linhas\}\}/g,
          (contextoVaga.beneficios_linhas || []).join("\n")
        );
    } else {
      systemPromptDinamico = systemPromptDinamico.replace(/\{\{vaga\.[^}]+\}\}/g, "");
    }

    if (isEtapaEncerrada(etapaEfetiva) && isFechamentoSocialCandidato(ultimaInbound)) {
      resposta = null;
      modoResposta = "suprimida_fechamento_social";
    } else {
      const respostaSemIa = respostaFixaFunil({
        etapaAnterior: sessao.etapa_atual,
        etapaAtual: etapaEfetiva,
        userMessage: ultimaInbound,
        contextoVaga,
      });
      if (respostaSemIa) {
        resposta = respostaSemIa;
        modoResposta = "fixa_funil";
      } else {
        try {
          const history = await loadConversationHistoryBySessao(supabase, sessaoId);
          const response = await anthropic.messages.create({
            model: process.env.CLAUDE_MODEL || "claude-sonnet-4-5",
            max_tokens: 300,
            system: systemPromptDinamico,
            messages: history,
          });

          const rawAssistantMessage = response.content
            .filter((b) => b.type === "text")
            .map((b) => b.text)
            .join("\n")
            .trim();
          resposta = sanitizarMensagemAna(etapaEfetiva, ultimaInbound, rawAssistantMessage);
          modoResposta = "claude_historico";
        } catch (claudeErr) {
          console.error("[recovery] Claude falhou:", claudeErr.message || claudeErr);
          const fallback = respostaFixaFunil({
            etapaAnterior: sessao.etapa_atual,
            etapaAtual: etapaEfetiva,
            userMessage: ultimaInbound,
            contextoVaga,
          });
          if (fallback) {
            resposta = fallback;
            modoResposta = "fixa_fallback";
          } else if (etapaEfetiva === "confirma_endereco" || etapaEfetiva === "apresentacao_vaga") {
            resposta = MENSAGEM_CONFIRMA_ENDERECO;
            etapaEfetiva = "confirma_endereco";
            modoResposta = "fixa_fallback_endereco";
          } else if (etapaEfetiva === "mini_entrevista") {
            resposta = MENSAGEM_INICIO_MINI_ENTREVISTA;
            modoResposta = "fixa_fallback_entrevista";
          } else {
            throw claudeErr;
          }
        }
      }
      if (
        resposta &&
        etapaEfetiva === "confirma_endereco" &&
        respostaReprovaPorDistancia(resposta)
      ) {
        resposta = MENSAGEM_INICIO_MINI_ENTREVISTA;
        etapaEfetiva = "mini_entrevista";
      }
    }
  }

  const janela24h = dentroJanela24h(sessao.ultima_inbound_at);
  const preview = {
    sessao_id: sessaoId,
    candidato_id: candidato.id,
    candidato_nome: candidato.nome,
    telefone: candidato.telefone,
    etapa_atual: sessao.etapa_atual,
    etapa_apos_resposta: etapaEfetiva,
    modo_resposta: modoResposta,
    inbounds_pendentes: pendentes,
    janela_24h_ok: janela24h,
    resposta_ana: resposta,
    dry_run: dryRun,
  };

  if (dryRun) return preview;

  if (resposta === null) {
    return { ...preview, enviado: false, suprimida: true };
  }

  if (!janela24h && !ignorarJanela) {
    throw new Error("Fora da janela de 24h — precisa template, não texto livre");
  }

  const toDigits = normalizeE164Digits(candidato.telefone);
  let kapsoResp;
  let modoEnvio = "texto";
  let conteudoLog = resposta;

  try {
    kapsoResp = await sendKapsoText(toDigits, resposta);
  } catch (err) {
    if (!isErroJanela24h(err)) throw err;
    kapsoResp = await sendKapsoTemplate(toDigits, "gege_fup", {
      nome: (candidato.nome || "tudo bem").split(/\s+/)[0],
    });
    modoEnvio = "template_fup";
    conteudoLog = "[template:gege_fup] (fora da janela 24h — aguardando resposta do candidato)";
    console.warn(`[recovery] sessão ${sessaoId} fora da janela 24h — enviado gege_fup`);
  }
  const nowIso = new Date().toISOString();
  const kapsoMessageId = kapsoResp?.messages?.[0]?.id || kapsoResp?.id || null;

  await supabase.from("whatsapp_eventos").insert({
    sessao_id: sessaoId,
    candidato_id: candidato.id,
    direcao: "outbound",
    tipo_midia: modoEnvio === "template_fup" ? "template" : "texto",
    conteudo: conteudoLog,
    processado_pela_ia: true,
    espera_resposta: true,
    kapso_message_id: kapsoMessageId,
    criado_em: nowIso,
  });

  const updates = {
    ultima_outbound_at: nowIso,
    etapa_atual: etapaEfetiva,
  };
  const etapaInferida = inferirEtapaPorMensagemAna(etapaEfetiva, resposta);
  if (etapaInferida && modoEnvio !== "template_fup") updates.etapa_atual = etapaInferida;

  await supabase.from("whatsapp_sessoes").update(updates).eq("id", sessaoId);

  return {
    ...preview,
    enviado: true,
    kapso_message_id: kapsoMessageId,
    modo_envio: modoEnvio,
  };
}

module.exports = {
  generateRecoveryReply,
  deveEnviarApresentacaoVaga,
  inboundsDesdeUltimoOutbound,
  dentroJanela24h,
};
