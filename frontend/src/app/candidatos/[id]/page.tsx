"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { BottomNav } from "@/components/BottomNav";
import { effectiveDisplayScore, isHighMatchScore } from "@/lib/score";

type Candidato = {
  id: string;
  nome: string;
  telefone: string;
  email: string | null;
  cidade: string | null;
  score: number | null;
  disponivel: boolean | null;
  situacao_emprego: string | null;
  disponibilidade_horario: string | null;
  escolaridade: string | null;
  exp_resumo: string | null;
  exp_alimentacao_meses: number | null;
  exp_atendimento_meses: number | null;
  exp_cozinha_meses: number | null;
  exp_lideranca_meses: number | null;
  curriculo_url: string | null;
};

function pct(months: number) {
  return Math.min(100, Math.round((months / 60) * 100));
}

function ExpBar({ label, months }: { label: string; months: number }) {
  const p = pct(months);
  return (
    <div style={{ marginBottom: "10px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
        <span style={{ fontSize: "11px", color: "#667085" }}>{label}</span>
        <span style={{ fontSize: "11px", fontWeight: 500, color: "#101828" }}>{months} meses</span>
      </div>
      <div style={{ height: "6px", borderRadius: "4px", background: "#EAECF0", overflow: "hidden" }}>
        <div style={{ width: `${p}%`, height: "100%", background: "#101828", borderRadius: "4px" }} />
      </div>
    </div>
  );
}

function CandidatoPerfilInner() {
  const params = useParams();
  const searchParams = useSearchParams();
  const id = String(params.id ?? "");
  const vagaId = searchParams.get("vaga");
  const backHref = vagaId ? `/vagas/${vagaId}` : "/candidatos";

  const [c, setC] = useState<Candidato | null>(null);
  const supabase = createClient();

  useEffect(() => {
    if (!id) return;
    void (async () => {
      const { data } = await supabase.from("candidatos").select("*").eq("id", id).single();
      setC((data as Candidato) ?? null);
    })();
  }, [id, supabase]);

  const wa = c?.telefone?.replace(/\D/g, "") ?? "";

  return (
    <div style={{ background: "#F9FAFB", minHeight: "100vh", paddingBottom: "80px" }}>
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
          href={backHref}
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
        <span style={{ fontSize: "16px", fontWeight: 700, color: "#101828" }}>Perfil</span>
      </div>

      {!c ? (
        <p style={{ padding: "24px 16px", color: "#667085" }}>Carregando…</p>
      ) : (
        <>
          <div style={{ background: "#fff", padding: "20px 16px", borderBottom: "1px solid #EAECF0" }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: "14px", marginBottom: "12px" }}>
              <div
                style={{
                  width: "48px",
                  height: "48px",
                  borderRadius: "50%",
                  background: "#F2F4F7",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: 700,
                  color: "#475467",
                  flexShrink: 0,
                }}
              >
                {c.nome
                  ?.split(" ")
                  .slice(0, 2)
                  .map((n) => n[0])
                  .join("")
                  .toUpperCase()}
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: "18px", fontWeight: 600, color: "#101828", marginBottom: "4px" }}>{c.nome}</p>
                <p style={{ fontSize: "12px", color: "#667085" }}>
                  {c.cidade || "—"}
                  {` · score ${effectiveDisplayScore(c.id, c.score)}`}
                </p>
              </div>
            </div>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              {isHighMatchScore(c.id, c.score) ? (
                <span
                  className="bg-green-500"
                  style={{ fontSize: "10px", fontWeight: 600, padding: "4px 10px", borderRadius: "20px", color: "#fff" }}
                >
                  match
                </span>
              ) : null}
              {c.disponivel ? (
                <span style={{ fontSize: "10px", fontWeight: 600, padding: "4px 10px", borderRadius: "20px", background: "#F2F4F7", color: "#475467" }}>
                  Disponível
                </span>
              ) : null}
              {c.situacao_emprego ? (
                <span style={{ fontSize: "10px", fontWeight: 500, padding: "4px 10px", borderRadius: "20px", background: "#F2F4F7", color: "#667085" }}>
                  {c.situacao_emprego}
                </span>
              ) : null}
            </div>
          </div>

          <div style={{ padding: "16px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "20px" }}>
              {[
                ["Telefone", c.telefone],
                ["Email", c.email || "—"],
                ["Escolaridade", c.escolaridade || "—"],
                ["Disponibilidade", c.disponibilidade_horario || "—"],
              ].map(([k, v]) => (
                <div key={String(k)} style={{ background: "#fff", border: "1px solid #EAECF0", borderRadius: "12px", padding: "12px" }}>
                  <p style={{ fontSize: "10px", color: "#98A2B3", marginBottom: "4px", textTransform: "uppercase", letterSpacing: "0.03em" }}>{k}</p>
                  <p style={{ fontSize: "12px", fontWeight: 500, color: "#101828", wordBreak: "break-word" }}>{v}</p>
                </div>
              ))}
            </div>

            {c.exp_resumo ? (
              <p style={{ fontSize: "13px", color: "#667085", lineHeight: 1.5, marginBottom: "20px", fontStyle: "italic" }}>{c.exp_resumo}</p>
            ) : null}

            <p style={{ fontSize: "11px", fontWeight: 600, color: "#667085", marginBottom: "12px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Experiência
            </p>
            <div style={{ marginBottom: "24px" }}>
              <ExpBar label="Alimentação" months={c.exp_alimentacao_meses ?? 0} />
              <ExpBar label="Atendimento" months={c.exp_atendimento_meses ?? 0} />
              <ExpBar label="Cozinha" months={c.exp_cozinha_meses ?? 0} />
              <ExpBar label="Liderança" months={c.exp_lideranca_meses ?? 0} />
            </div>

            {vagaId ? (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "12px" }}>
                <button
                  type="button"
                  onClick={async () => {
                    if (!vagaId || !c?.id) return;
                    await supabase
                      .from("candidaturas")
                      .update({ status: "em_triagem" })
                      .eq("vaga_id", vagaId)
                      .eq("candidato_id", c.id);
                    window.location.href = `/vagas/${vagaId}`;
                  }}
                  style={{
                    minHeight: "48px",
                    borderRadius: "8px",
                    background: "#101828",
                    border: "none",
                    fontSize: "14px",
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
                    if (!vagaId || !c?.id) return;
                    await supabase
                      .from("candidaturas")
                      .update({ status: "reprovado" })
                      .eq("vaga_id", vagaId)
                      .eq("candidato_id", c.id);
                    window.location.href = `/vagas/${vagaId}`;
                  }}
                  style={{
                    minHeight: "48px",
                    borderRadius: "8px",
                    background: "#fff",
                    border: "1px solid #EAECF0",
                    fontSize: "14px",
                    fontWeight: 500,
                    color: "#475467",
                    cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  Não
                </button>
              </div>
            ) : null}
            {wa ? (
              <a
                href={`https://wa.me/${wa}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: "block",
                  textAlign: "center",
                  minHeight: "48px",
                  lineHeight: "48px",
                  borderRadius: "8px",
                  background: "#101828",
                  color: "#fff",
                  fontSize: "14px",
                  fontWeight: 600,
                  textDecoration: "none",
                }}
              >
                WhatsApp
              </a>
            ) : null}
            {c.curriculo_url ? (
              <a
                href={c.curriculo_url}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: "block",
                  textAlign: "center",
                  marginTop: "10px",
                  minHeight: "48px",
                  lineHeight: "48px",
                  borderRadius: "8px",
                  border: "1px solid #EAECF0",
                  background: "#fff",
                  color: "#475467",
                  fontSize: "14px",
                  fontWeight: 500,
                  textDecoration: "none",
                }}
              >
                Ver CV
              </a>
            ) : null}
          </div>
        </>
      )}
      <BottomNav />
    </div>
  );
}

export default function CandidatoPerfilPage() {
  return (
    <Suspense
      fallback={
        <div style={{ minHeight: "50vh", padding: "24px", color: "#667085" }}>
          Carregando…
        </div>
      }
    >
      <CandidatoPerfilInner />
    </Suspense>
  );
}
