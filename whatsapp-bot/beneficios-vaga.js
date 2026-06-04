/**
 * Monta linhas de benefícios a partir de vagas.beneficios_json (mesma regra do painel).
 * Só inclui benefício quando está ativo/valor no JSON — nunca inventa.
 */

function formatBrl(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n.toFixed(2).replace(".", ",");
}

/**
 * @param {Record<string, unknown>|null|undefined} b
 * @returns {string[]}
 */
function linhasBeneficiosFromJson(b) {
  if (!b || typeof b !== "object" || Array.isArray(b)) return [];

  const lines = [];

  if (typeof b.bonus_meta === "number" && b.bonus_meta > 0) {
    const v = formatBrl(b.bonus_meta);
    if (v) lines.push(`🎯 Bônus por meta: R$ ${v} (além do salário)`);
  }

  if (typeof b.vale_alimentacao === "number" && b.vale_alimentacao > 0) {
    const v = formatBrl(b.vale_alimentacao);
    if (v) lines.push(`🍽️ Vale Alimentação: R$ ${v}`);
  }

  if (b.refeicao_local === true) {
    lines.push("🍽️ Refeição no local");
  } else if (typeof b.refeicao_descricao === "string" && b.refeicao_descricao.trim()) {
    lines.push(`🍽️ ${b.refeicao_descricao.trim()}`);
  }

  if (b.vale_transporte === true) {
    lines.push("🚌 Vale Transporte");
  }

  if (b.plano_saude === true) {
    lines.push("💊 Plano de Saúde");
  }

  if (b.plano_odontologico === true) {
    lines.push("🦷 Plano Odontológico");
  }

  if (b.plano_carreira === true) {
    lines.push("📈 Plano de Carreira");
  }

  if (b.totalpass === true) {
    lines.push("🎫 TotalPass");
  }

  if (typeof b.comissao === "string" && b.comissao.trim()) {
    lines.push(`💵 Comissão: ${b.comissao.trim()}`);
  } else if (b.comissao === true) {
    lines.push("💵 Comissão");
  }

  if (
    typeof b.premio_meta_descricao === "string" &&
    b.premio_meta_descricao.trim() &&
    !(typeof b.bonus_meta === "number" && b.bonus_meta > 0)
  ) {
    lines.push(`🎯 ${b.premio_meta_descricao.trim()}`);
  }

  // "outros" no painel é só checkbox — só mostra se houver texto (senão é redundante/vago)
  if (typeof b.outros_descricao === "string" && b.outros_descricao.trim()) {
    lines.push(`✨ ${b.outros_descricao.trim()}`);
  }

  return lines;
}

module.exports = { linhasBeneficiosFromJson, formatBrl };
