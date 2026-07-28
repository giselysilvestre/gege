import type { CandidatoExperiencia } from "./types";

function parseDateMs(value: string | null): number {
  if (!value) return 0;
  const t = Date.parse(value);
  return Number.isNaN(t) ? 0 : t;
}

/** Ordena da mais recente para a mais antiga. */
export function ordenarExperiencias(exps: CandidatoExperiencia[]): CandidatoExperiencia[] {
  return [...exps].sort((a, b) => {
    const fimA = a.data_fim ? parseDateMs(a.data_fim) : Date.now();
    const fimB = b.data_fim ? parseDateMs(b.data_fim) : Date.now();
    if (fimB !== fimA) return fimB - fimA;
    return parseDateMs(b.data_inicio) - parseDateMs(a.data_inicio);
  });
}

export function topExperiencias(exps: CandidatoExperiencia[], limit = 3): CandidatoExperiencia[] {
  return ordenarExperiencias(exps).slice(0, limit);
}

function formatMesAno(value: string | null): string | null {
  if (!value) return null;
  const iso = value.match(/^(\d{4})-(\d{2})/);
  if (iso) return `${iso[2]}/${iso[1]}`;
  const t = Date.parse(value);
  if (Number.isNaN(t)) return value;
  const d = new Date(t);
  return `${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;
}

export type AnaliseCvSecao = {
  titulo: string;
  texto: string;
};

export type AnaliseCvParse = {
  intro: string | null;
  secoes: AnaliseCvSecao[];
};

const MARCADORES_ANALISE: { key: string; titulo: string }[] = [
  { key: "O que chama atenção positivamente:", titulo: "Pontos positivos" },
  { key: "O que preocupa:", titulo: "Pontos de atenção" },
  { key: "Recomendação:", titulo: "Recomendação" },
];

export function parseAnaliseCompleta(text: string): AnaliseCvParse {
  const raw = text.trim();
  if (!raw) return { intro: null, secoes: [] };

  const hits: { index: number; titulo: string; keyLen: number }[] = [];
  for (const m of MARCADORES_ANALISE) {
    const idx = raw.indexOf(m.key);
    if (idx >= 0) hits.push({ index: idx, titulo: m.titulo, keyLen: m.key.length });
  }
  hits.sort((a, b) => a.index - b.index);

  if (hits.length === 0) return { intro: raw, secoes: [] };

  const intro = raw.slice(0, hits[0].index).trim() || null;
  const secoes = hits
    .map((hit, i) => {
      const start = hit.index + hit.keyLen;
      const end = hits[i + 1]?.index ?? raw.length;
      return { titulo: hit.titulo, texto: raw.slice(start, end).trim() };
    })
    .filter((s) => s.texto);

  return { intro, secoes };
}

export function periodoExperienciaLabel(inicio: string | null, fim: string | null): string | null {
  const a = formatMesAno(inicio);
  const b = formatMesAno(fim);
  if (a && b) return `${a} até ${b}`;
  if (a) return `${a} até o momento`;
  if (b) return `até ${b}`;
  return null;
}

export function formatExperienciaDuracao(meses: number | null): string | null {
  if (meses == null || meses <= 0) return null;
  if (meses < 12) return `${meses} ${meses === 1 ? "mês" : "meses"}`;
  const anos = Math.floor(meses / 12);
  const resto = meses % 12;
  if (resto === 0) return `${anos} ${anos === 1 ? "ano" : "anos"}`;
  return `${anos} ${anos === 1 ? "ano" : "anos"} e ${resto} ${resto === 1 ? "mês" : "meses"}`;
}

export function formatExperienciaPeriodo(inicio: string | null, fim: string | null): string {
  return periodoExperienciaLabel(inicio, fim) ?? "Período não informado";
}

export function textoAnaliseCorrida(
  analiseCompleta: string | null,
  perfilResumo: string | null
): string | null {
  const analise = (analiseCompleta || "").trim();
  if (analise) return analise.replace(/\s*\n+\s*/g, " ").replace(/\s{2,}/g, " ").trim();
  const curto = (perfilResumo || "").trim();
  return curto || null;
}

export function resumoCvPreview(_analiseCompleta: string | null, perfilResumo: string | null): string {
  const curto = (perfilResumo || "").trim();
  if (curto) return curto.length > 96 ? `${curto.slice(0, 93)}…` : curto;
  return "Ver análise do candidato";
}

type ContatoCopiavel = {
  candidato_nome: string;
  telefone: string | null;
};

export function linhaContatoCopiar(row: ContatoCopiavel): string {
  const tel = (row.telefone ?? "").trim();
  return tel ? `${row.candidato_nome} ${tel}` : `${row.candidato_nome} sem telefone`;
}

type DetalheCopiavel = ContatoCopiavel & {
  analise_completa: string | null;
  perfil_resumo: string | null;
  curriculo_url: string | null;
};

export function formatDetalheCandidatoCopiar(row: DetalheCopiavel): string {
  const analise = textoAnaliseCorrida(row.analise_completa, row.perfil_resumo);
  const partes = ["--", "", linhaContatoCopiar(row)];
  if (analise) partes.push("", analise);
  const cvUrl = (row.curriculo_url ?? "").trim();
  if (cvUrl) partes.push("", cvUrl);
  partes.push("", "--");
  return partes.join("\n");
}

export function formatDetalhesLoteCopiar(rows: DetalheCopiavel[]): string {
  return rows.map(formatDetalheCandidatoCopiar).join("\n\n");
}
