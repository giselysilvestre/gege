import Link from "next/link";
import { STATUS_CONFIG, getDaysOpen } from "@/lib/status";
import { isHighMatchScore } from "@/lib/score";

export type JobCardVaga = {
  id: string;
  cargo: string;
  salario?: string | number | null;
  escala?: string | null;
  horario?: string | null;
  status_vaga: string;
  criado_em: string;
  fechada_em?: string | null;
  candidaturas?: Array<{
    id: string;
    status: string;
    candidatos: { id: string; score: number | null } | null;
  }>;
};

function formatSalario(s: string | number | null | undefined) {
  if (s == null || s === "") return null;
  if (typeof s === "number") {
    if (!Number.isFinite(s) || s <= 0) return null;
    return `R$ ${s.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
  }
  let t = String(s).trim().replace(/\s/g, "");
  if (!t) return null;
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  else t = t.replace(/[^\d.]/g, "");
  const n = Number(t);
  if (!Number.isFinite(n) || n <= 0) return null;
  return `R$ ${n.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function statsFromCandidaturas(vaga: JobCardVaga) {
  const rows = vaga.candidaturas ?? [];
  const inscritos = rows.length;
  const match = rows.filter((r) => {
    const c = r.candidatos;
    if (!c?.id) return false;
    return isHighMatchScore(c.id, c.score);
  }).length;
  const entrevistas = rows.filter((r) => r.status === "em_triagem").length;
  return { inscritos, match, entrevistas };
}

export function JobCard({ vaga }: { vaga: JobCardVaga }) {
  const cfg = STATUS_CONFIG[vaga.status_vaga] ?? STATUS_CONFIG.aberta;
  const { inscritos, match, entrevistas } = statsFromCandidaturas(vaga);
  const salarioFmt = formatSalario(vaga.salario);

  return (
    <div
      style={{
        background: "#fff",
        borderRadius: "12px",
        border: "1px solid #EAECF0",
        padding: "20px",
        marginBottom: "10px",
        boxShadow: "0 1px 2px rgba(16, 24, 40, 0.06)",
      }}
    >
      <p style={{ fontSize: "16px", fontWeight: 700, color: "#101828", marginBottom: "6px", lineHeight: 1.25 }}>{vaga.cargo}</p>
      <p style={{ fontSize: "12px", color: "#667085", marginBottom: "14px", lineHeight: 1.4 }}>
        {[salarioFmt, vaga.escala, vaga.horario].filter(Boolean).join(" · ")}
      </p>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "18px", flexWrap: "wrap" }}>
        <span
          style={{
            fontSize: "10px",
            fontWeight: 600,
            padding: "4px 10px",
            borderRadius: "20px",
            background: cfg.bg,
            color: cfg.color,
            border: `1px solid ${cfg.border}`,
          }}
        >
          {cfg.label}
        </span>
        <span style={{ fontSize: "12px", color: "#98A2B3" }}>{getDaysOpen(vaga.criado_em, vaga.status_vaga, vaga.fechada_em)}</span>
      </div>
      <div style={{ display: "flex", marginBottom: "16px" }}>
        {[
          { num: inscritos, label: "inscritos" },
          { num: match, label: "match" },
          { num: entrevistas, label: "entrevistas" },
        ].map((s, i) => (
          <div key={i} style={{ flex: 1, textAlign: "center" }}>
            <p style={{ fontSize: "22px", fontWeight: 700, color: "#101828", lineHeight: 1, marginBottom: "6px" }}>{s.num}</p>
            <p
              style={{
                fontSize: "9px",
                color: "#98A2B3",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                fontWeight: 600,
              }}
            >
              {s.label}
            </p>
          </div>
        ))}
      </div>
      <div style={{ paddingTop: "14px", borderTop: "1px solid #F2F4F7", display: "flex", justifyContent: "flex-end" }}>
        <Link
          href={`/vagas/${vaga.id}`}
          style={{
            fontSize: "13px",
            color: "#667085",
            textDecoration: "underline",
            textUnderlineOffset: "3px",
            fontWeight: 500,
            minHeight: "44px",
            display: "inline-flex",
            alignItems: "center",
          }}
        >
          Ver candidatos →
        </Link>
      </div>
    </div>
  );
}
