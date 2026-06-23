/**
 * Fonte canônica do score_final (candidatos_analise).
 * Pesos: 0.5 × score_ia + 0.5 × score_pos_entrevista quando ambos existem.
 *
 * Réplica tipada: frontend/src/lib/score-final.ts — manter em sync.
 */

/** Normaliza para inteiro 0–100 ou null. */
function toScore(v) {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).trim());
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(100, Math.round(n)));
}

/**
 * @param {number|string|null|undefined} scoreIa
 * @param {number|string|null|undefined} scorePos
 * @returns {number|null}
 */
function computeScoreFinal(scoreIa, scorePos) {
  const ia = toScore(scoreIa);
  const pos = toScore(scorePos);
  if (ia == null && pos == null) return null;
  if (pos == null) return ia;
  if (ia == null) return pos;
  return Math.round(0.5 * ia + 0.5 * pos);
}

module.exports = { computeScoreFinal, toScore };
