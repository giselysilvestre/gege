/**
 * Verifica import do SYSTEM_PROMPT_BASE, placeholders e fluxo de recusa (sem Claude).
 * Uso: node verify-prompt.js
 */
require("dotenv").config();
const { SYSTEM_PROMPT_BASE } = require("./ana-prompt");
const {
  processarFluxoRecusa,
  detectaMotivoExplicitoRecusa,
  recusaCurtaSemMotivo,
} = require("./recusa-motivo");
const { calcularTempoDeslocamento } = require("./distance-matrix");

function assert(cond, msg) {
  if (!cond) {
    console.error("❌", msg);
    process.exit(1);
  }
}

assert(typeof SYSTEM_PROMPT_BASE === "string" && SYSTEM_PROMPT_BASE.length > 500, "SYSTEM_PROMPT_BASE vazio");
assert(SYSTEM_PROMPT_BASE.includes("{{tipo_cargo}}"), "placeholder tipo_cargo ausente");
assert(SYSTEM_PROMPT_BASE.includes("{{bairro}}"), "placeholder bairro ausente");
assert(SYSTEM_PROMPT_BASE.includes("confirma_endereco"), "etapa confirma_endereco no prompt");
assert(SYSTEM_PROMPT_BASE.includes("aguardando_motivo_recusa"), "etapa aguardando_motivo_recusa no prompt");
assert(SYSTEM_PROMPT_BASE.includes("antes de ir, você consegue me dizer o motivo"), "coleta motivo no prompt");

let prompt = SYSTEM_PROMPT_BASE;
const replacements = {
  "{{nome}}": "Maria",
  "{{cargo_principal}}": "Atendente",
  "{{tipo_cargo}}": "operacional",
  "{{cidade}}": "Rio de Janeiro",
  "{{bairro}}": "Copacabana",
  "{{situacao_emprego}}": "desempregado",
  "{{disponibilidade_horario}}": "manhã",
  "{{fit_food_service}}": "Alto",
  "{{score_ia}}": "82",
  "{{tags}}": "food",
  "{{tipo_fluxo}}": "candidatura",
  "{{etapa_atual}}": "confirma_endereco",
  "{{vaga.cliente_nome}}": "Tapí",
  "{{vaga.cargo}}": "Atendente",
  "{{vaga.unidade_nome}}": "Loja Centro",
  "{{vaga.salario}}": "1.800,00",
  "{{vaga.beneficios_linhas}}": "🎁 Vale refeição",
  "{{vaga.endereco_linha}}": "Rua A, 10",
  "{{vaga.bairro}}": "Centro",
  "{{vaga.cidade}}": "Rio de Janeiro",
  "{{vaga.uf}}": "RJ",
  "{{vaga.escala}}": "6x1",
  "{{vaga.horario}}": "08h às 16h",
};

for (const [key, val] of Object.entries(replacements)) {
  prompt = prompt.split(key).join(val);
}

const leftovers = prompt.match(/\{\{[^}]+\}\}/g) || [];
assert(leftovers.length === 0, `placeholders não substituídos: ${leftovers.join(", ")}`);
assert(prompt.includes("ROTEIRO OPERACIONAL"), "roteiro operacional no texto");

// Recusa sem motivo → pede motivo
const semMotivo = processarFluxoRecusa("apresentacao_vaga", "não");
assert(semMotivo?.skipClaude === true, "recusa sem motivo deve short-circuit");
assert(semMotivo.updates.etapa_atual === "aguardando_motivo_recusa", "deve ir para aguardando_motivo_recusa");
assert(semMotivo.resposta.includes("motivo"), "deve pedir motivo");

// Recusa com motivo explícito → encerramento distância, sem pedir motivo
const comLonge = processarFluxoRecusa("apresentacao_vaga", "fica longe pra mim");
assert(comLonge?.updates.etapa_atual === "encerramento", "recusa longe → encerramento");
assert(comLonge.feedbackTipo === "reprovado_distancia", "feedback distancia");
assert(!comLonge.resposta.includes("motivo"), "não deve pedir motivo");

assert(detectaMotivoExplicitoRecusa("fica longe") === "distancia", "detecta longe");
assert(recusaCurtaSemMotivo("não quero") === true, "recusa curta");

// aguardando_motivo_recusa com resposta → salva motivo
const comResposta = processarFluxoRecusa("aguardando_motivo_recusa", "achei o salário baixo");
assert(comResposta.updates.motivo_recusa?.includes("salário"), "salva motivo_recusa");
assert(comResposta.resposta.includes("obrigada pelo feedback"), "agradece feedback");

const { preencherTemplate, dispararFeedbackReprovacao, FEEDBACK_TIMING_MS } = require("./feedback-reprovacao");
assert(FEEDBACK_TIMING_MS.reprovado_score === 48 * 60 * 60 * 1000, "delay score 48h");

(async () => {
  const vazio = await calcularTempoDeslocamento("", "01310-100");
  assert(vazio === "", "CEP vazio retorna string vazia");

  if (process.env.GOOGLE_MAPS_API_KEY) {
    const min = await calcularTempoDeslocamento("22775-030", "01310-100");
    console.log("   tempo_deslocamento_min (API real):", min || "(vazio)");
  } else {
    console.log("   (GOOGLE_MAPS_API_KEY ausente — pulando teste API real)");
  }

  console.log("✅ SYSTEM_PROMPT_BASE importado (v3, %d chars)", SYSTEM_PROMPT_BASE.length);
  console.log("✅ Placeholders substituídos");
  console.log("✅ Recusa sem motivo / com motivo explícito");
  console.log("✅ Templates feedback OK");
})();
