/**
 * Score exibido no painel quando o banco ainda tem null/0 (ou antes do backfill 007).
 * Não reproduz `hashtext()` do Postgres; alinha com o fallback usado no Banco de Talentos.
 */
export function effectiveDisplayScore(id: string, raw: number | null | undefined): number {
  if (raw != null && raw > 0) return Math.round(raw);
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return 60 + (h % 39);
}

export function isHighMatchScore(id: string, raw: number | null | undefined): boolean {
  return effectiveDisplayScore(id, raw) >= 90;
}
