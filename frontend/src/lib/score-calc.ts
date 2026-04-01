/**
 * Cálculo de score de compatibilidade candidato × vaga (regras de negócio do match).
 */

export type ScoreCalcCandidato = {
  disponivel?: boolean | null;
  disponibilidade_horario?: string | null;
  escolaridade?: string | null;
  situacao_emprego?: string | null;
  exp_total_meses?: number | null;
  exp_total_empregos?: number | null;
  exp_instabilidade_pct?: number | null;
  exp_alimentacao_meses?: number | null;
  exp_atendimento_meses?: number | null;
  exp_cozinha_meses?: number | null;
  exp_lideranca_meses?: number | null;
};

export type ScoreCalcVaga = {
  cargo: string;
  horario?: string | null;
  /** 0–4: fundamental, médio incompleto implícito baixo, médio, técnico, superior. Padrão: 2 (médio). */
  escolaridadeMinNivel?: number;
};

export type ScoreCalcResult = { score: number; tags: string[] };

const TAG_HORARIO = "horário incompatível";
const TAG_INSTAB_GRAVE = "instabilidade grave";
const TAG_MATCH = "match";
const TAG_ALERTA_INSTAB = "alerta instabilidade";
const TAG_FOOD = "experiente food service";
const TAG_PRIMEIRA_EXP = "primeira experiência";
const TAG_DESEMPREGADO = "desempregado";

function norm(s: string | null | undefined): string {
  return (s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .trim();
}

const SHIFT_TOKENS = ["manha", "tarde", "noite", "integral", "madrugada", "comercial", "6x1", "12x36", "plantao"] as const;

function turnosMencionados(s: string): string[] {
  const n = norm(s);
  return SHIFT_TOKENS.filter((t) => n.includes(t));
}

function horariosIncompativeis(
  dispCand: string | null | undefined,
  horarioVaga: string | null | undefined
): boolean {
  const v = norm(horarioVaga);
  const d = norm(dispCand);
  if (!v || !d) return false;
  if (v.includes(d) || d.includes(v)) return false;
  const dT = turnosMencionados(d);
  const vT = turnosMencionados(v);
  if (!dT.length || !vT.length) return false;
  return !dT.some((t) => vT.includes(t));
}

/** Estimativa de quantidade de empregos curtos (<3 meses) a partir do % de instabilidade. */
export function expEmpregosCurtos(c: ScoreCalcCandidato): number {
  const n = c.exp_total_empregos ?? 0;
  const pct = c.exp_instabilidade_pct;
  if (n <= 0 || pct == null || !Number.isFinite(Number(pct))) return 0;
  return Math.round((Number(pct) / 100) * n);
}

function eliminatorioInstabilidade(c: ScoreCalcCandidato): boolean {
  const n = c.exp_total_empregos ?? 0;
  if (n <= 2) return false;
  const curtos = expEmpregosCurtos(c);
  return curtos > n * 0.5;
}

function nivelEscolaridade(raw: string | null | undefined): number {
  const t = norm(raw);
  if (!t) return 0;
  if (t.includes("superior") || t.includes("gradua") || t.includes("universit") || t.includes("pos ") || t.includes("pós"))
    return 4;
  if (t.includes("tecnico")) return 3;
  if (t.includes("medio") || t.includes("ensino medio")) return 2;
  if (t.includes("fundamental")) return 1;
  return 1;
}

function escolaridadeAtingeMinimo(
  candidatoEsc: string | null | undefined,
  minNivel: number
): boolean {
  return nivelEscolaridade(candidatoEsc) >= minNivel;
}

function isDesempregado(s: string | null | undefined): boolean {
  return norm(s).includes("desempreg");
}

function isEmpregado(s: string | null | undefined): boolean {
  const t = norm(s);
  return t.includes("empreg") && !t.includes("desempreg");
}

function lerp(x: number, x0: number, p0: number, x1: number, p1: number): number {
  if (x <= x0) return p0;
  if (x >= x1) return p1;
  return p0 + ((x - x0) / (x1 - x0)) * (p1 - p0);
}

/** <5m = 0%, 12m = 50%, ≥24m = 100% */
function pctMediaEmpresa(mesesMedia: number): number {
  if (mesesMedia < 5) return 0;
  if (mesesMedia >= 24) return 100;
  if (mesesMedia <= 12) return lerp(mesesMedia, 5, 0, 12, 50);
  return lerp(mesesMedia, 12, 50, 24, 100);
}

/** 0m = 0%, 6m = 50%, ≥18m = 100% */
function pctMesesArea(meses: number): number {
  if (meses <= 0) return 0;
  if (meses >= 18) return 100;
  if (meses <= 6) return lerp(meses, 0, 0, 6, 50);
  return lerp(meses, 6, 50, 18, 100);
}

function mesesNaAreaVaga(cargo: string, c: ScoreCalcCandidato): number {
  const t = norm(cargo);
  if (/gerente|supervisor|lider|coorden/.test(t)) return c.exp_lideranca_meses ?? 0;
  if (/cozinhe|cozinha|estoquista|estoque/.test(t)) return c.exp_cozinha_meses ?? 0;
  if (/garcom|garçom|atendent|atendente|barista|caixa/.test(t)) return c.exp_atendimento_meses ?? 0;
  return Math.max(c.exp_atendimento_meses ?? 0, c.exp_cozinha_meses ?? 0);
}

export function mediaMesesPorEmpresa(c: ScoreCalcCandidato): number {
  const total = c.exp_total_meses ?? 0;
  const n = c.exp_total_empregos ?? 0;
  if (total <= 0 || n <= 0) return 0;
  return total / n;
}

/** Para logs/diagnóstico: mesmo critério de `calcularScore` (horário + instabilidade). */
export function describeEliminatorios(c: ScoreCalcCandidato, vaga: ScoreCalcVaga): { passed: boolean; reason: string } {
  if (horariosIncompativeis(c.disponibilidade_horario, vaga.horario)) {
    return {
      passed: false,
      reason:
        "Eliminatório horário: candidato e vaga têm horário/turno preenchidos mas sem turno em comum (após normalização).",
    };
  }
  if (eliminatorioInstabilidade(c)) {
    const n = c.exp_total_empregos ?? 0;
    const curtos = expEmpregosCurtos(c);
    return {
      passed: false,
      reason: `Eliminatório instabilidade: exp_total_empregos=${n} (>2) e exp_empregos_curtos=${curtos} > ${n}*0.5.`,
    };
  }
  return { passed: true, reason: "Passou nos eliminatórios (horário e instabilidade)." };
}

function uniqTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of tags) {
    const k = t.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(t);
  }
  return out;
}

function appendTagsFromScore(score: number, c: ScoreCalcCandidato): string[] {
  const tags: string[] = [];
  if (score >= 90) tags.push(TAG_MATCH);
  const curtos = expEmpregosCurtos(c);
  if (curtos > 0) tags.push(TAG_ALERTA_INSTAB);
  if ((c.exp_alimentacao_meses ?? 0) > 12) tags.push(TAG_FOOD);
  if ((c.exp_total_meses ?? 0) === 0) tags.push(TAG_PRIMEIRA_EXP);
  if (isDesempregado(c.situacao_emprego)) tags.push(TAG_DESEMPREGADO);
  return uniqTags(tags);
}

/**
 * Caso 1: exp_total_empregos ≤ 1 — disponível 50 + escolaridade mínima 30 + desempregado 20.
 * Caso 2: experiência — média empresa 35% + área 35% + escolaridade 15% + situação 15%.
 */
export function calcularScore(candidato: ScoreCalcCandidato, vaga: ScoreCalcVaga): ScoreCalcResult {
  if (horariosIncompativeis(candidato.disponibilidade_horario, vaga.horario)) {
    return { score: 0, tags: [TAG_HORARIO] };
  }

  if (eliminatorioInstabilidade(candidato)) {
    return { score: 0, tags: [TAG_INSTAB_GRAVE] };
  }

  const minNivel = vaga.escolaridadeMinNivel ?? 2;
  const empregos = candidato.exp_total_empregos ?? 0;
  const primeiraExp = empregos <= 1;

  let score: number;

  if (primeiraExp) {
    let pts = 0;
    if (candidato.disponivel !== false) pts += 50;
    if (escolaridadeAtingeMinimo(candidato.escolaridade, minNivel)) pts += 30;
    if (isDesempregado(candidato.situacao_emprego)) pts += 20;
    score = Math.min(100, Math.round(pts));
  } else {
    const pMedia = pctMediaEmpresa(mediaMesesPorEmpresa(candidato));
    const mesesArea = mesesNaAreaVaga(vaga.cargo, candidato);
    const pArea = pctMesesArea(mesesArea);
    const pEsc = escolaridadeAtingeMinimo(candidato.escolaridade, minNivel) ? 100 : 0;
    let pSit = 50;
    if (isDesempregado(candidato.situacao_emprego)) pSit = 100;
    else if (isEmpregado(candidato.situacao_emprego)) pSit = 70;

    const raw = pMedia * 0.35 + pArea * 0.35 + pEsc * 0.15 + pSit * 0.15;
    score = Math.min(100, Math.round(raw));
  }

  const extra = appendTagsFromScore(score, candidato);
  return { score, tags: uniqTags(extra) };
}
