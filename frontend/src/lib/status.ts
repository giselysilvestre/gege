export const STATUS_CONFIG: Record<string, { label: string; bg: string; color: string; border: string }> = {
  aberta: { label: "Nova", bg: "#101828", color: "#fff", border: "transparent" },
  em_selecao: { label: "Em seleção", bg: "#F0F9FF", color: "#026AA2", border: "#B9E6FE" },
  em_triagem: { label: "Em triagem", bg: "#F0F9FF", color: "#026AA2", border: "#B9E6FE" },
  em_entrevista: { label: "Em entrevista", bg: "#ECFDF3", color: "#027A48", border: "#A9EFC5" },
  em_teste: { label: "Em teste", bg: "#FFFAEB", color: "#B54708", border: "#FEDF89" },
  fechada: { label: "Fechada", bg: "#F2F4F7", color: "#344054", border: "#D0D5DD" },
  cancelada: { label: "Congelada", bg: "#F5F3FF", color: "#5925DC", border: "#D9D6FE" },
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
