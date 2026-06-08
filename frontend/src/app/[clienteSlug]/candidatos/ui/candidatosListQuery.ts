import type { StatusFiltroKey } from "./candidatosConstants";
import { CANDIDATURA_STATUSES } from "@/lib/candidatura-status";

export type CandidatosSortKey = "candidato" | "score" | "score_entrevista" | "etapa" | "inscricao";

export type CandidatosListUiState = {
  q: string;
  selectedVagaIds: string[];
  selectedTags: string[];
  statusTodos: boolean;
  statusKeys: StatusFiltroKey[];
  kmMax: number;
  sortBy: CandidatosSortKey;
  sortDir: "asc" | "desc";
  page: number;
};

const SORT_KEYS: CandidatosSortKey[] = ["candidato", "score", "score_entrevista", "etapa", "inscricao"];
const STATUS_SET = new Set<string>(CANDIDATURA_STATUSES);

export const CANDIDATOS_LIST_DEFAULTS: CandidatosListUiState = {
  q: "",
  selectedVagaIds: [],
  selectedTags: [],
  statusTodos: true,
  statusKeys: [],
  kmMax: 50,
  sortBy: "score_entrevista",
  sortDir: "desc",
  page: 1,
};

function parsePositiveInt(raw: string | null, fallback: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.floor(n);
}

function splitCsv(raw: string | null): string[] {
  if (!raw?.trim()) return [];
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

/** Lê filtros/ordenação da URL da listagem. */
export function parseCandidatosListQuery(searchParams: URLSearchParams): CandidatosListUiState {
  const d = CANDIDATOS_LIST_DEFAULTS;
  const vagasCsv = splitCsv(searchParams.get("vagas"));
  const vagaSingle = (searchParams.get("vaga") ?? "").trim();
  const selectedVagaIds = vagasCsv.length > 0 ? vagasCsv : vagaSingle ? [vagaSingle] : [];

  const statusRaw = splitCsv(searchParams.get("status"));
  const statusKeys = statusRaw.filter((s): s is StatusFiltroKey => STATUS_SET.has(s));

  const sortRaw = (searchParams.get("sort") ?? "").trim();
  const sortBy = SORT_KEYS.includes(sortRaw as CandidatosSortKey) ? (sortRaw as CandidatosSortKey) : d.sortBy;
  const dirRaw = (searchParams.get("dir") ?? "").trim();
  const sortDir = dirRaw === "asc" || dirRaw === "desc" ? dirRaw : d.sortDir;

  const kmRaw = searchParams.get("km");
  const kmParsed = kmRaw != null ? Number(kmRaw) : d.kmMax;
  const kmMax = Number.isFinite(kmParsed) && kmParsed >= 0 && kmParsed <= 50 ? kmParsed : d.kmMax;

  return {
    q: (searchParams.get("q") ?? "").trim(),
    selectedVagaIds,
    selectedTags: splitCsv(searchParams.get("tags")),
    statusTodos: statusKeys.length === 0,
    statusKeys,
    kmMax,
    sortBy,
    sortDir,
    page: parsePositiveInt(searchParams.get("page"), d.page),
  };
}

/** Serializa estado da listagem para query string (sem `lista` / `from`). */
export function serializeCandidatosListQuery(state: CandidatosListUiState): string {
  const qs = new URLSearchParams();
  if (state.q) qs.set("q", state.q);
  if (state.selectedVagaIds.length === 1) {
    qs.set("vaga", state.selectedVagaIds[0]);
  } else if (state.selectedVagaIds.length > 1) {
    qs.set("vagas", state.selectedVagaIds.join(","));
  }
  if (state.selectedTags.length) qs.set("tags", state.selectedTags.join(","));
  if (!state.statusTodos && state.statusKeys.length) qs.set("status", state.statusKeys.join(","));
  if (state.kmMax < 50) qs.set("km", String(state.kmMax));
  if (state.sortBy !== CANDIDATOS_LIST_DEFAULTS.sortBy || state.sortDir !== CANDIDATOS_LIST_DEFAULTS.sortDir) {
    qs.set("sort", state.sortBy);
    qs.set("dir", state.sortDir);
  }
  if (state.page > 1) qs.set("page", String(state.page));
  return qs.toString();
}

/** Vaga usada na API (`/api/candidatos/list`). */
export function apiVagaFromListQuery(searchParams: URLSearchParams): string | null {
  const vaga = (searchParams.get("vaga") ?? "").trim();
  if (vaga) return vaga;
  const vagas = splitCsv(searchParams.get("vagas"));
  return vagas.length === 1 ? vagas[0] : null;
}

export function buildCandidatoDetailHref(
  clienteSlug: string,
  candidatoId: string,
  vagaId: string,
  listQuery: string
): string {
  const qs = new URLSearchParams();
  qs.set("vaga", vagaId);
  if (listQuery) qs.set("lista", listQuery);
  return `/${clienteSlug}/candidatos/${candidatoId}?${qs.toString()}`;
}

export function buildCandidatosBackHref(
  clienteSlug: string,
  listaQuery: string | null,
  vagaId: string | null
): string {
  if (listaQuery) return `/${clienteSlug}/candidatos?${listaQuery}`;
  if (vagaId) return `/${clienteSlug}/candidatos?vaga=${encodeURIComponent(vagaId)}`;
  return `/${clienteSlug}/candidatos`;
}
