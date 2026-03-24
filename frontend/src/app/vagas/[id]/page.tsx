"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { BottomNav } from "@/components/BottomNav";
import { effectiveDisplayScore, isHighMatchScore } from "@/lib/score";

type CandidatoRow = {
  nome: string | null;
  score: number | null;
  disponivel: boolean | null;
  situacao_emprego: string | null;
  cidade: string | null;
  bairro?: string | null;
  exp_resumo: string | null;
  id: string;
};

type CandidaturaRow = {
  id: string;
  status: string;
  score_compatibilidade: number | null;
  distancia_km?: number | null;
  candidatos: CandidatoRow | null;
};

function isEmProcesso(status: string) {
  return status === "novo" || status === "em_triagem" || status === "aprovado";
}

export default function CandidatosVagaPage() {
  const params = useParams();
  const id = String(params.id ?? "");
  const [filtro, setFiltro] = useState("Todos");
  const [candidatos, setCandidatos] = useState<CandidaturaRow[]>([]);
  const [vaga, setVaga] = useState<{ cargo: string } | null>(null);
  const supabase = createClient();

  const load = useCallback(() => {
    if (!id) return;
    void (async () => {
      const v = await supabase.from("vagas").select("cargo").eq("id", id).single();
      setVaga(v.data as { cargo: string } | null);
      const c = await supabase
        .from("candidaturas")
        .select("*, candidatos(*)")
        .eq("vaga_id", id)
        .order("score_compatibilidade", { ascending: false });
      setCandidatos((c.data as CandidaturaRow[]) || []);
    })();
  }, [id, supabase]);

  useEffect(() => {
    load();
  }, [load]);

  const filtros = ["Todos", "Match", "Em processo", "Reprovados"];

  const filtered = candidatos.filter((c) => {
    const cand = c.candidatos;
    if (filtro === "Match") return cand?.id ? isHighMatchScore(cand.id, cand.score) : false;
    if (filtro === "Em processo") return isEmProcesso(c.status);
    if (filtro === "Reprovados") return c.status === "reprovado";
    return true;
  });

  const funil = [
    { label: "inscritos", value: candidatos.length },
    {
      label: "match",
      value: candidatos.filter((c) => {
        const id = c.candidatos?.id;
        return id ? isHighMatchScore(id, c.candidatos?.score) : false;
      }).length,
    },
    { label: "em processo", value: candidatos.filter((c) => isEmProcesso(c.status)).length },
    { label: "contratado", value: candidatos.filter((c) => c.status === "contratado").length },
  ];

  const getInitials = (nome: string) =>
    nome
      ?.split(" ")
      .slice(0, 2)
      .map((n: string) => n[0])
      .join("")
      .toUpperCase() ?? "?";

  return (
    <div style={{ background: "#F9FAFB", minHeight: "100vh", paddingBottom: "88px" }}>
      <div
        style={{
          background: "#fff",
          padding: "12px 16px",
          display: "flex",
          alignItems: "center",
          gap: "10px",
          borderBottom: "1px solid #EAECF0",
        }}
      >
        <Link
          href="/vagas"
          style={{
            width: "44px",
            height: "44px",
            borderRadius: "50%",
            background: "#F9FAFB",
            border: "1px solid #EAECF0",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <ChevronLeft size={18} color="#344054" />
        </Link>
        <span style={{ fontSize: "17px", fontWeight: 700, color: "#101828", letterSpacing: "-0.02em" }}>{vaga?.cargo || "…"}</span>
      </div>

      <div
        style={{
          background: "#fff",
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          borderBottom: "1px solid #EAECF0",
        }}
      >
        {funil.map((f, i) => (
          <div
            key={i}
            style={{
              padding: "14px 4px",
              textAlign: "center",
              borderRight: i < 3 ? "1px solid #EAECF0" : "none",
            }}
          >
            <p style={{ fontSize: "20px", fontWeight: 700, color: "#101828", lineHeight: 1, marginBottom: "4px" }}>{f.value}</p>
            <p
              style={{
                fontSize: "8px",
                color: "#98A2B3",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                fontWeight: 600,
              }}
            >
              {f.label}
            </p>
          </div>
        ))}
      </div>

      <div
        style={{
          background: "#fff",
          padding: "10px 16px",
          display: "flex",
          gap: "8px",
          overflowX: "auto",
          borderBottom: "1px solid #EAECF0",
          WebkitOverflowScrolling: "touch",
        }}
      >
        {filtros.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFiltro(f)}
            style={{
              fontSize: "12px",
              fontWeight: filtro === f ? 600 : 500,
              padding: "10px 14px",
              minHeight: "44px",
              borderRadius: "999px",
              border: "none",
              cursor: "pointer",
              whiteSpace: "nowrap",
              fontFamily: "inherit",
              background: filtro === f ? "#101828" : "#F2F4F7",
              color: filtro === f ? "#fff" : "#667085",
              flexShrink: 0,
            }}
          >
            {f}
          </button>
        ))}
      </div>

      <div style={{ padding: "12px 16px" }}>
        {filtered.map((c) => {
          const cand = c.candidatos;
          const isMatch = cand?.id ? isHighMatchScore(cand.id, cand.score) : false;
          const bairro = cand?.bairro?.trim();
          return (
            <div
              key={c.id}
              style={{
                background: "#fff",
                borderRadius: "12px",
                border: "1px solid #EAECF0",
                padding: "16px",
                marginBottom: "10px",
                boxShadow: "0 1px 2px rgba(16, 24, 40, 0.06)",
              }}
            >
              <div style={{ display: "flex", alignItems: "flex-start", gap: "12px", marginBottom: "10px" }}>
                <div
                  style={{
                    width: "44px",
                    height: "44px",
                    borderRadius: "50%",
                    background: "#F2F4F7",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "13px",
                    fontWeight: 700,
                    color: "#475467",
                    flexShrink: 0,
                  }}
                >
                  {getInitials(cand?.nome || "")}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: "15px", fontWeight: 600, color: "#101828", marginBottom: "4px" }}>{cand?.nome}</p>
                  <p style={{ fontSize: "11px", color: "#667085", marginBottom: "8px", lineHeight: 1.35 }}>
                    {(cand as { ultima_funcao?: string })?.ultima_funcao || "Atendente"}
                    {bairro ? ` · ${bairro}` : cand?.cidade ? ` · ${cand.cidade}` : ""}
                    {c.distancia_km != null ? ` · ${Number(c.distancia_km).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} km` : ""}
                  </p>
                  <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                    {isMatch ? (
                      <span className="bg-green-500" style={{ fontSize: "10px", fontWeight: 600, padding: "3px 10px", borderRadius: "20px", color: "#fff" }}>
                        match
                      </span>
                    ) : null}
                    <span
                      style={{
                        fontSize: "10px",
                        fontWeight: 500,
                        padding: "3px 10px",
                        borderRadius: "20px",
                        background: "#EFF8FF",
                        color: "#175CD3",
                        border: "1px solid #B2DDFF",
                      }}
                    >
                      {cand?.situacao_emprego === "desempregado" ? "desempregado(a)" : "empregado(a)"}
                    </span>
                  </div>
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <p style={{ fontSize: "24px", fontWeight: 700, color: "#101828", lineHeight: 1 }}>
                    {cand?.id ? effectiveDisplayScore(cand.id, cand.score) : "—"}
                  </p>
                  <p style={{ fontSize: "9px", color: "#98A2B3", marginTop: "4px", fontWeight: 500 }}>score</p>
                </div>
              </div>
              {cand?.exp_resumo ? (
                <p style={{ fontSize: "12px", color: "#667085", marginBottom: "14px", lineHeight: 1.45 }}>{cand.exp_resumo}</p>
              ) : null}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "10px",
                  paddingTop: "14px",
                  borderTop: "1px solid #F2F4F7",
                }}
              >
                <button
                  type="button"
                  onClick={async () => {
                    await supabase.from("candidaturas").update({ status: "em_triagem" }).eq("id", c.id);
                    load();
                  }}
                  style={{
                    padding: "12px 10px",
                    minHeight: "48px",
                    borderRadius: "8px",
                    background: "#101828",
                    border: "none",
                    fontSize: "13px",
                    fontWeight: 600,
                    color: "#fff",
                    cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  Marcar papo
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    await supabase.from("candidaturas").update({ status: "reprovado" }).eq("id", c.id);
                    load();
                  }}
                  style={{
                    padding: "12px 10px",
                    minHeight: "48px",
                    borderRadius: "8px",
                    background: "#fff",
                    border: "1px solid #EAECF0",
                    fontSize: "13px",
                    fontWeight: 500,
                    color: "#475467",
                    cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  Não
                </button>
              </div>
              <Link
                href={`/candidatos/${cand?.id}?vaga=${id}`}
                style={{
                  display: "block",
                  marginTop: "10px",
                  textAlign: "center",
                  fontSize: "12px",
                  fontWeight: 500,
                  color: "#667085",
                  textDecoration: "underline",
                  textUnderlineOffset: "2px",
                }}
              >
                Ver perfil completo
              </Link>
            </div>
          );
        })}
      </div>
      <BottomNav />
    </div>
  );
}
