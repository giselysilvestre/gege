"use client";

import { useRouter } from "next/navigation";
import type { CSSProperties } from "react";
import { normalizePercentScore } from "@/lib/score";
import {
  buildExperienciaResumoLinha,
  candidatoAlertaInstabilidade,
  candidatoSemExperiencia,
  formatInscricaoRelativa,
} from "./candidatosFormat";

export type CandidatoInscricaoRow = {
  candidaturaId: string;
  vagaId: string;
  status: string;
  enviado_em: string | null;
  cargo: string;
  tags?: string[] | null;
  score?: number | null;
  distancia_km?: number | null;
  candidato: {
    id: string;
    nome: string;
    telefone?: string | null;
    bairro: string | null;
    cidade?: string | null;
    data_nascimento?: string | null;
    situacao_emprego: string | null;
    score: number | null;
    exp_total_meses: number | null;
    exp_instabilidade_pct: number | null;
    exp_alimentacao_meses: number | null;
    exp_atendimento_meses: number | null;
    exp_cozinha_meses: number | null;
    exp_lideranca_meses: number | null;
    exp_total_empregos: number | null;
    exp_resumo: string | null;
  };
};

/** Sequência no banco: novo → em_triagem → em_entrevista → em_teste → contratado */
function nextDbStatus(current: string): string | null {
  switch (current) {
    case "novo":
      return "em_triagem";
    case "em_triagem":
      return "em_entrevista";
    case "em_entrevista":
      return "em_teste";
    case "em_teste":
    case "aprovado":
      return "contratado";
    default:
      return null;
  }
}

const tagBase: CSSProperties = {
  fontSize: "10px",
  fontWeight: 600,
  padding: "4px 10px",
  borderRadius: "20px",
  display: "inline-block",
};

function initialsFromNome(nome: string) {
  return nome
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase() || "?";
}

function employmentSituationTag(situacao: string | null | undefined): { label: string; style: CSSProperties } | null {
  if (!situacao?.trim()) return null;
  const t = situacao.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
  if (t.includes("desempreg")) {
    return {
      label: "desempregada",
      style: { ...tagBase, background: "var(--status-employed-bg)", color: "var(--status-employed-fg)", border: "1px solid var(--status-employed-border)" },
    };
  }
  if (t.includes("empreg") && !t.includes("desempreg")) {
    return {
      label: "empregada",
      style: { ...tagBase, background: "var(--status-employed-bg)", color: "var(--status-employed-fg)", border: "1px solid var(--status-employed-border)" },
    };
  }
  return {
    label: situacao.trim().slice(0, 28),
    style: { ...tagBase, background: "var(--n50)", color: "var(--n600)", border: "1px solid var(--n200)" },
  };
}

function formatDistanciaOptional(km: number | null | undefined): string | null {
  if (km == null || !Number.isFinite(Number(km))) return null;
  const n = Number(km);
  const t = n % 1 === 0 ? String(Math.round(n)) : n.toFixed(1).replace(".", ",");
  return `${t} km`;
}

export function CandidatoInscricaoCard({
  row,
  onReprovar,
  onProximaEtapa,
  busy,
}: {
  row: CandidatoInscricaoRow;
  onReprovar: (candidaturaId: string) => void;
  onProximaEtapa: (candidaturaId: string, nextDb: string) => void;
  busy: boolean;
}) {
  const router = useRouter();
  const c = row.candidato;
  const scoreVal = normalizePercentScore(c.score);
  const instab = candidatoAlertaInstabilidade(c);
  const semExp = candidatoSemExperiencia(c);
  const proxDb = nextDbStatus(row.status);
  const detailHref = `/candidatos/${c.id}?vaga=${row.vagaId}`;
  const resumoExperiencias = buildExperienciaResumoLinha(c);
  const empTag = employmentSituationTag(c.situacao_emprego);
  const distStr = formatDistanciaOptional(row.distancia_km ?? null);
  const linha2 = [row.cargo, c.bairro?.trim() || null, distStr].filter(Boolean).join(" · ");

  function goDetail() {
    router.push(detailHref);
  }

  return (
    <div
      style={{
        borderRadius: "12px",
        background: "var(--white)",
        padding: "16px",
        border: "1px solid var(--n200)",
        boxShadow: "var(--card-shadow)",
        marginBottom: "10px",
      }}
    >
      <div
        role="link"
        tabIndex={0}
        onClick={goDetail}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            goDetail();
          }
        }}
        style={{ cursor: "pointer" }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "10px" }}>
          <div
            style={{
              width: "44px",
              height: "44px",
              borderRadius: "50%",
              background: "var(--n100)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "13px",
              fontWeight: 700,
              color: "var(--n600)",
              flexShrink: 0,
            }}
          >
            {initialsFromNome(c.nome)}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: "16px", fontWeight: 700, color: "var(--n900)", lineHeight: 1.25 }}>{c.nome}</p>
          </div>
          <div style={{ textAlign: "right", flexShrink: 0 }}>
            <p style={{ fontSize: "22px", fontWeight: 700, color: "var(--n900)", lineHeight: 1 }}>{scoreVal ?? "—"}</p>
            <p style={{ fontSize: "9px", color: "var(--n400)", marginTop: "2px", fontWeight: 500 }} title="Score IA">
              score ia
            </p>
          </div>
        </div>

        <p style={{ fontSize: "12px", color: "var(--n500)", lineHeight: 1.45, marginBottom: "10px" }}>{linha2}</p>

        <div
          style={{
            display: "flex",
            flexDirection: "row",
            flexWrap: "nowrap",
            alignItems: "center",
            gap: "6px",
            marginBottom: "10px",
            overflowX: "auto",
            maxWidth: "100%",
            WebkitOverflowScrolling: "touch",
          }}
        >
          <span
            style={{
              ...tagBase,
              flexShrink: 0,
              fontSize: "11px",
              fontWeight: 600,
              color: "var(--n500)",
              background: "var(--n50)",
              border: "1px solid var(--n200)",
            }}
          >
            {row.enviado_em ? formatInscricaoRelativa(row.enviado_em) : "sem data"}
          </span>
          {semExp ? (
            <span style={{ ...tagBase, flexShrink: 0, background: "var(--n100)", color: "var(--n700)", border: "1px solid var(--n300)" }}>
              sem experiência
            </span>
          ) : null}
          {instab ? (
            <span style={{ ...tagBase, flexShrink: 0, background: "var(--warn-bg)", color: "var(--warn-fg)", border: "1px solid var(--warn-border)" }}>
              alerta instabilidade
            </span>
          ) : null}
          {empTag ? (
            <span style={{ ...empTag.style, flexShrink: 0 }}>{empTag.label}</span>
          ) : null}
        </div>

        {resumoExperiencias ? (
          <p
            style={{
              fontSize: "12px",
              color: "var(--n500)",
              lineHeight: 1.45,
              marginBottom: "10px",
              whiteSpace: "normal",
              wordBreak: "break-word",
            }}
          >
            {resumoExperiencias}
          </p>
        ) : null}
      </div>

      <div
        style={{ display: "flex", gap: "8px", marginTop: "14px", paddingTop: "14px", borderTop: "1px solid var(--n100)" }}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          disabled={busy || row.status === "reprovado"}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onReprovar(row.candidaturaId);
          }}
          style={{
            flex: 1,
            height: "44px",
            borderRadius: "8px",
            border: "1px solid var(--n300)",
            background: "var(--white)",
            fontSize: "13px",
            fontWeight: 600,
            color: "var(--n700)",
            cursor: busy ? "wait" : "pointer",
            opacity: row.status === "reprovado" ? 0.5 : 1,
          }}
        >
          Reprovar
        </button>
        <button
          type="button"
          disabled={busy || !proxDb || row.status === "reprovado" || row.status === "contratado"}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (proxDb) onProximaEtapa(row.candidaturaId, proxDb);
          }}
          style={{
            flex: 1,
            height: "44px",
            borderRadius: "8px",
            border: "none",
            background: "var(--n900)",
            fontSize: "13px",
            fontWeight: 600,
            color: "var(--white)",
            cursor: busy || !proxDb ? "not-allowed" : "pointer",
            opacity: !proxDb || row.status === "reprovado" || row.status === "contratado" ? 0.5 : 1,
          }}
        >
          Próxima etapa
        </button>
      </div>
    </div>
  );
}
