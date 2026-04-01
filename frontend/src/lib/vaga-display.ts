/** Título e unidade exibidos nas telas (vaga publicada vs cargo canônico). */

export type VagaTituloFields = {
  titulo_publicacao?: string | null;
  cargo: string;
};

export type VagaUnidadeFields = {
  unidade?: string | null;
  /** Supabase FK pode vir como objeto ou array de uma posição. */
  cliente_unidades?: { nome: string | null } | { nome: string | null }[] | null;
  descricao?: string | null;
};

export function vagaTituloPublico(v: VagaTituloFields): string {
  const t = v.titulo_publicacao?.trim();
  return t || v.cargo?.trim() || "—";
}

function unidadeJoinNome(raw: VagaUnidadeFields["cliente_unidades"]): string | null {
  if (raw == null) return null;
  const row = Array.isArray(raw) ? raw[0] : raw;
  return row?.nome?.trim() || null;
}

export function vagaUnidadePublica(v: VagaUnidadeFields): string | null {
  const j = unidadeJoinNome(v.cliente_unidades);
  if (j) return j;
  const u = v.unidade?.trim();
  if (u) return u;
  const d = v.descricao?.trim() ?? "";
  const m = d.match(/^Unidade:\s*([^\n·]+)/i);
  return m?.[1]?.trim() || null;
}

/** Lista no filtro (mantém cargo para compatibilidade com tipos antigos). */
export type VagaOpcaoFiltro = {
  id: string;
  cargo: string;
  titulo_publicacao?: string | null;
};

export function vagaLabelLista(v: VagaOpcaoFiltro): string {
  return vagaTituloPublico(v);
}
