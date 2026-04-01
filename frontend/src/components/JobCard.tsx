import Link from "next/link";
import { STATUS_CONFIG, getDaysOpen } from "@/lib/status";
import { isMatchCompatScore } from "@/lib/score";
import { vagaTituloPublico, vagaUnidadePublica } from "@/lib/vaga-display";

export type JobCardVaga = {
  id: string;
  cargo: string;
  titulo_publicacao?: string | null;
  salario?: string | number | null;
  escala?: string | null;
  horario?: string | null;
  endereco?: string | null;
  /** CEP da loja (schema vagas); opcional. */
  cep_loja?: string | null;
  /** Unidade/loja (migration 012); opcional. */
  unidade?: string | null;
  cliente_unidades?: { nome: string | null } | { nome: string | null }[] | null;
  descricao?: string | null;
  status_vaga: string;
  criado_em: string;
  fechada_em?: string | null;
  candidaturas?: Array<{
    id: string;
    status: string;
    score_compatibilidade: number | null;
    candidatos: { id: string } | null;
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
    if (!r.candidatos?.id) return false;
    return isMatchCompatScore(r.score_compatibilidade);
  }).length;
  const entrevistas = rows.filter((r) => r.status === "em_triagem").length;
  return { inscritos, match, entrevistas };
}

export function JobCard({ vaga }: { vaga: JobCardVaga }) {
  const cfg = STATUS_CONFIG[vaga.status_vaga] ?? STATUS_CONFIG.aberta;
  const { inscritos, match, entrevistas } = statsFromCandidaturas(vaga);
  const salarioFmt = formatSalario(vaga.salario);
  const enderecoRaw = typeof vaga.endereco === "string" ? vaga.endereco.trim() : "";
  const cepRaw = typeof vaga.cep_loja === "string" ? vaga.cep_loja.trim() : "";
  const enderecoLinha = enderecoRaw || (cepRaw ? `CEP ${cepRaw}` : "");
  const showEndereco = Boolean(enderecoLinha);
  const titulo = vagaTituloPublico(vaga);
  const unidadeLinha = vagaUnidadePublica(vaga);

  return (
    <div
      style={{
        background: "var(--white)",
        borderRadius: "12px",
        border: "1px solid var(--n200)",
        padding: "20px",
        marginBottom: "10px",
        boxShadow: "var(--card-shadow)",
      }}
    >
      <p style={{ fontSize: "16px", fontWeight: 700, color: "var(--n900)", marginBottom: "6px", lineHeight: 1.25 }}>{titulo}</p>
      {unidadeLinha ? (
        <p style={{ fontSize: "12px", color: "var(--n500)", marginBottom: "4px", lineHeight: 1.4 }}>{unidadeLinha}</p>
      ) : null}
      <p style={{ fontSize: "12px", color: "var(--n500)", marginBottom: showEndereco ? "4px" : "14px", lineHeight: 1.4 }}>
        {[salarioFmt, vaga.escala, vaga.horario].filter(Boolean).join(" · ")}
      </p>
      {showEndereco ? (
        <p style={{ fontSize: "12px", color: "var(--n500)", marginBottom: "14px", lineHeight: 1.4 }}>{enderecoLinha}</p>
      ) : null}
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
        <span style={{ fontSize: "12px", color: "var(--n400)" }}>{getDaysOpen(vaga.criado_em, vaga.status_vaga, vaga.fechada_em)}</span>
      </div>
      <div style={{ display: "flex", marginBottom: "16px" }}>
        {[
          { num: inscritos, label: "inscritos" },
          { num: match, label: "match" },
          { num: entrevistas, label: "entrevistas" },
        ].map((s, i) => (
          <div key={i} style={{ flex: 1, textAlign: "center" }}>
            <p style={{ fontSize: "22px", fontWeight: 700, color: "var(--n900)", lineHeight: 1, marginBottom: "6px" }}>{s.num}</p>
            <p
              style={{
                fontSize: "9px",
                color: "var(--n400)",
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
      <div style={{ paddingTop: "14px", borderTop: "1px solid var(--n100)", display: "flex", justifyContent: "flex-end" }}>
        <Link
          href={`/candidatos?vaga=${vaga.id}`}
          style={{
            fontSize: "13px",
            color: "var(--n500)",
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
