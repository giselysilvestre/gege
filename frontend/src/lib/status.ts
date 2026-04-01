export const STATUS_CONFIG: Record<string, { label: string; bg: string; color: string; border: string }> = {
  aberta: { label: "Nova", bg: "var(--n900)", color: "var(--white)", border: "transparent" },
  em_selecao: { label: "Em seleção", bg: "var(--info-bg)", color: "var(--info-fg)", border: "var(--status-employed-border)" },
  em_triagem: { label: "Em triagem", bg: "var(--info-bg)", color: "var(--info-fg)", border: "var(--status-employed-border)" },
  em_entrevista: { label: "Em entrevista", bg: "var(--success-bg)", color: "var(--success-fg)", border: "var(--olive-mid)" },
  em_teste: { label: "Em teste", bg: "var(--warn-bg)", color: "var(--warn-fg)", border: "var(--warn-border)" },
  fechada: { label: "Fechada", bg: "var(--n100)", color: "var(--n700)", border: "var(--n300)" },
  cancelada: { label: "Congelada", bg: "var(--berry-light)", color: "var(--berry-dark)", border: "var(--berry-mid)" },
};

export function getDaysOpen(createdAt: string | undefined | null, status: string, closedAt?: string | null): string {
  if (!createdAt) return "—";
  if ((status === "fechada" || status === "cancelada") && closedAt) {
    return `Fechada em ${new Date(closedAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}`;
  }
  const days = Math.floor((Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60 * 24));
  if (days === 0) return "Aberta hoje";
  if (days < 7) return `Aberta há ${days} dias`;
  return `Aberta em ${new Date(createdAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}`;
}
