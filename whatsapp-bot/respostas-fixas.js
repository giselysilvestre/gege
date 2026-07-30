/**
 * Respostas determinísticas do funil — não dependem da API Claude.
 */

const MENSAGEM_CONFIRMA_ENDERECO =
  "você consegue me confirmar onde você mora atualmente e quanto tempo seria pra chegar no endereço da loja?";

const MENSAGEM_P1_OPERACIONAL =
  "me conta sobre seu último emprego, o que você fazia no dia a dia e por que saiu?";

const { MENSAGEM_INICIO_MINI_ENTREVISTA } = require("./interesse-detect");

/**
 * @returns {string|null} Resposta fixa ou null se precisar da IA.
 */
function respostaFixaFunil({ etapaAnterior, etapaAtual, userMessage, contextoVaga }) {
  if (etapaAnterior === "apresentacao_vaga" && etapaAtual === "confirma_endereco") {
    return MENSAGEM_CONFIRMA_ENDERECO;
  }

  if (etapaAnterior === "confirma_endereco" && etapaAtual === "mini_entrevista") {
    return MENSAGEM_INICIO_MINI_ENTREVISTA;
  }

  if (etapaAtual === "mini_entrevista") {
    const t = (userMessage || "").toLowerCase();
    if (/\b(pode|sim|ok|claro|pode ser|manda|bora)\b/.test(t)) {
      return MENSAGEM_P1_OPERACIONAL;
    }
  }

  if (etapaAtual === "encerramento") {
    return "obrigada pelo feedback! boa sorte 🙂";
  }

  // Pergunta sobre salário/detalhes na apresentação — responde e mantém na etapa
  if (etapaAtual === "apresentacao_vaga" && contextoVaga) {
    const t = (userMessage || "").toLowerCase();
    if (/\b(salario|salário|liquido|líquido)\b/.test(t)) {
      return `o valor informado é o salário base de R$ ${contextoVaga.salario}. detalhes de descontos e líquido o time da ${contextoVaga.cliente_nome} explica na próxima etapa, se você avançar. você tem interesse pela vaga?`;
    }
  }

  return null;
}

module.exports = {
  MENSAGEM_CONFIRMA_ENDERECO,
  respostaFixaFunil,
};
