/** Data de inscrição em texto relativo (pt-BR). Nunca usa "hoje". */
export function formatInscricaoRelativa(iso: string): string {
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  if (diffMs < 0) return "agora";
  const hours = Math.floor(diffMs / 3_600_000);
  if (hours < 24) {
    const h = Math.max(1, hours);
    return h === 1 ? "há 1 hora" : `há ${h} horas`;
  }
  const days = Math.floor(diffMs / 86_400_000);
  if (days < 30) return days === 1 ? "há 1 dia" : `há ${days} dias`;
  const months = Math.floor(days / 30);
  return months === 1 ? "há 1 mês" : `há ${months} meses`;
}

export function formatDistanciaKm(km: number | null | undefined): string {
  if (km == null || !Number.isFinite(Number(km))) return "—";
  const n = Number(km);
  const t = n % 1 === 0 ? String(Math.round(n)) : n.toFixed(1).replace(".", ",");
  return `${t} km`;
}

type ExpFields = {
  exp_total_meses?: number | null;
  exp_alimentacao_meses?: number | null;
  exp_atendimento_meses?: number | null;
  exp_cozinha_meses?: number | null;
  exp_lideranca_meses?: number | null;
  exp_instabilidade_pct?: number | null;
};

export function totalMesesExperiencia(c: ExpFields): number {
  const total = c.exp_total_meses ?? 0;
  if (total > 0) return total;
  return (
    (c.exp_alimentacao_meses ?? 0) +
    (c.exp_atendimento_meses ?? 0) +
    (c.exp_cozinha_meses ?? 0) +
    (c.exp_lideranca_meses ?? 0)
  );
}

export function candidatoSemExperiencia(c: ExpFields): boolean {
  return totalMesesExperiencia(c) < 3;
}

/** Troca frequente de emprego (heurística a partir do banco). */
export function candidatoAlertaInstabilidade(c: ExpFields): boolean {
  const pct = c.exp_instabilidade_pct;
  if (pct != null && Number(pct) >= 38) return true;
  return false;
}

function trunc(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, Math.max(0, max - 1))}…`;
}

/**
 * Extrai até `max` nomes a partir de `exp_resumo` (texto livre ou JSON array de strings).
 */
export function extractEmpresasFromResumo(raw: string | null | undefined, max: number, maxLenEach: number): string[] {
  if (!raw?.trim()) return [];
  const t = raw.trim();
  try {
    const j = JSON.parse(t) as unknown;
    if (Array.isArray(j)) {
      return j
        .map((x) => String(x).trim())
        .filter((s) => s.length > 0)
        .slice(0, max)
        .map((s) => trunc(s, maxLenEach));
    }
  } catch {
    /* texto livre */
  }
  const parts = t
    .split(/[,;]|(?:\s+e\s+)/i)
    .map((s) => s.trim())
    .filter((s) => s.length >= 2);
  const out: string[] = [];
  for (const p of parts) {
    if (/^(trabalhei|atuei|atuou|experiência|anos|meses|atendimento|cozinha)/i.test(p)) continue;
    const cleaned = p.replace(/^[\d.\s•\-–]+/u, "").replace(/\s+/g, " ");
    if (cleaned.length < 2 || cleaned.length > 80) continue;
    out.push(trunc(cleaned, maxLenEach));
    if (out.length >= max) break;
  }
  if (out.length === 0 && t.length <= 42) out.push(trunc(t, maxLenEach));
  return out.slice(0, max);
}

export type ExperienciaResumoInput = ExpFields & {
  exp_total_empregos?: number | null;
  exp_resumo?: string | null;
};

/** Linha "X experiências · Y meses em média · Emp1, Emp2, Emp3" ou null se não houver dado. */
export function buildExperienciaResumoLinha(c: ExperienciaResumoInput): string | null {
  const totalMeses = totalMesesExperiencia(c);
  let nExp = Math.max(0, Math.floor(Number(c.exp_total_empregos) || 0));
  if (nExp <= 0 && totalMeses > 0) nExp = 1;

  const empresas = extractEmpresasFromResumo(c.exp_resumo, 3, 22);
  if (nExp <= 0 && empresas.length > 0) nExp = Math.min(empresas.length, 3);

  if (nExp <= 0 && totalMeses <= 0 && empresas.length === 0) return null;

  const media = nExp > 0 ? Math.max(0, Math.round(totalMeses / nExp)) : 0;
  const expLabel = nExp === 1 ? "1 experiência" : `${nExp} experiências`;
  const mediaLabel = `${media} ${media === 1 ? "mês" : "meses"} em média`;

  if (empresas.length === 0) return `${expLabel} · ${mediaLabel}`;

  return `${expLabel} · ${mediaLabel} · ${empresas.join(", ")}`;
}
