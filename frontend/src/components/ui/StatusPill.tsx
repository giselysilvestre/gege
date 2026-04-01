import type { CSSProperties } from "react";

type Status =
  | "aberta"
  | "em_selecao"
  | "fechada"
  | "cancelada"
  | "novo"
  | "em_triagem"
  | "em_entrevista"
  | "em_teste"
  | "aprovado"
  | "reprovado"
  | "desistiu"
  | "contratado";

const pillBase: CSSProperties = {
  display: "inline-flex",
  borderRadius: "999px",
  padding: "0.25rem 0.5rem",
  fontSize: "10px",
  fontWeight: 500,
};

const map: Record<Status, CSSProperties> = {
  aberta: { background: "var(--status-open-bg)", color: "var(--warn-fg)" },
  em_selecao: { background: "var(--berry-light)", color: "var(--status-lavender-fg)" },
  fechada: { background: "var(--n100)", color: "var(--n500)" },
  cancelada: { background: "var(--n100)", color: "var(--n500)" },
  novo: { background: "var(--berry-light)", color: "var(--status-lavender-fg)" },
  em_triagem: { background: "var(--berry-light)", color: "var(--status-lavender-fg)" },
  em_entrevista: { background: "var(--status-interview-bg)", color: "var(--status-interview-fg)" },
  em_teste: { background: "var(--status-test-bg)", color: "var(--status-test-fg)" },
  aprovado: { background: "var(--status-interview-bg)", color: "var(--status-interview-fg)" },
  reprovado: { background: "var(--status-neutral-bg)", color: "var(--status-neutral-fg)" },
  desistiu: { background: "var(--status-neutral-bg)", color: "var(--status-neutral-fg)" },
  contratado: { background: "var(--status-interview-bg)", color: "var(--status-interview-fg)" },
};

export function StatusPill({ status, children }: { status: Status; children?: React.ReactNode }) {
  return (
    <span style={{ ...pillBase, ...map[status] }}>
      {children ?? status.replace("_", " ")}
    </span>
  );
}
