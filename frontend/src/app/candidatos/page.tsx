"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { ensureClienteForUser } from "@/lib/ensureClienteBrowser";
import { BottomNav } from "@/components/BottomNav";
import { effectiveDisplayScore, isHighMatchScore } from "@/lib/score";

type CandidatoList = {
  id: string;
  nome: string | null;
  telefone: string | null;
  cidade: string | null;
  bairro: string | null;
  score: number | null;
};

function collectCandidatosFromRows(rows: { candidatos: unknown }[] | null | undefined) {
  const out: CandidatoList[] = [];
  const seen = new Set<string>();
  for (const r of rows ?? []) {
    const raw = r.candidatos as unknown;
    const one = Array.isArray(raw) ? (raw[0] as CandidatoList | undefined) : (raw as CandidatoList | null);
    if (one?.id && !seen.has(one.id)) {
      seen.add(one.id);
      out.push(one);
    }
  }
  return out;
}

function CandidatosContent() {
  const searchParams = useSearchParams();
  const vagaId = searchParams.get("vaga") ?? undefined;

  const [candidatos, setCandidatos] = useState<CandidatoList[]>([]);
  const [clienteNome, setClienteNome] = useState<string | null>(null);
  const [noCliente, setNoCliente] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      const supabase = getSupabaseBrowserClient();
      const { data: sessWrap } = await supabase.auth.getSession();
      const session = sessWrap.session;
      if (!session?.user) {
        setNoCliente(true);
        setLoading(false);
        return;
      }

      const cliente = await ensureClienteForUser(supabase, session.user);
      if (!cliente?.id) {
        setNoCliente(true);
        setLoading(false);
        return;
      }

      setClienteNome(cliente.nome_empresa);

      let list: CandidatoList[] = [];
      if (vagaId) {
        const { data: vagaOk } = await supabase.from("vagas").select("id").eq("id", vagaId).eq("cliente_id", cliente.id).maybeSingle();
        if (vagaOk) {
          const { data: rows } = await supabase
            .from("candidaturas")
            .select("candidatos(id, nome, telefone, cidade, bairro, score)")
            .eq("vaga_id", vagaId);
          list = collectCandidatosFromRows(rows as { candidatos: unknown }[]);
        }
      } else {
        const { data: vagasRows } = await supabase.from("vagas").select("id").eq("cliente_id", cliente.id);
        const ids = vagasRows?.map((v) => v.id) ?? [];
        if (ids.length) {
          const { data: rows } = await supabase
            .from("candidaturas")
            .select("candidatos(id, nome, telefone, cidade, bairro, score)")
            .in("vaga_id", ids);
          list = collectCandidatosFromRows(rows as { candidatos: unknown }[]);
        }
      }

      setCandidatos(list);
      setLoading(false);
    })();
  }, [vagaId]);

  const subtitle = vagaId
    ? "Inscritos nesta vaga"
    : "Todos os candidatos inscritos nas suas vagas (use ?vaga=id para filtrar uma vaga)";

  if (loading) {
    return (
      <div style={{ background: "#F9FAFB", minHeight: "100vh", padding: "24px 16px" }}>
        <p style={{ fontSize: "14px", color: "#667085" }}>Carregando candidatos…</p>
      </div>
    );
  }

  return (
    <div style={{ background: "#F9FAFB", minHeight: "100vh", paddingBottom: "80px" }}>
      <div style={{ background: "#fff", padding: "16px", borderBottom: "1px solid #EAECF0" }}>
        <div style={{ fontSize: "18px", fontWeight: 700, color: "#101828" }}>Candidatos</div>
        <div style={{ fontSize: "12px", color: "#667085", marginTop: "4px" }}>
          {subtitle}
          {clienteNome ? ` · ${clienteNome}` : ""}
        </div>
      </div>
      <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: "10px" }}>
        {noCliente ? (
          <p style={{ fontSize: "13px", color: "#B42318" }}>Faça login para ver candidatos.</p>
        ) : null}
        {!noCliente &&
          candidatos.map((c) => {
            const initials =
              c.nome
                ?.split(" ")
                .slice(0, 2)
                .map((n) => n[0])
                .join("")
                .toUpperCase() ?? "?";
            return (
              <Link
                key={c.id}
                href={vagaId ? `/candidatos/${c.id}?vaga=${vagaId}` : `/candidatos/${c.id}`}
                style={{
                  display: "block",
                  borderRadius: "12px",
                  background: "#fff",
                  padding: "16px",
                  border: "1px solid #EAECF0",
                  textDecoration: "none",
                  boxShadow: "0 1px 2px rgba(16, 24, 40, 0.06)",
                }}
              >
                <div style={{ display: "flex", alignItems: "flex-start", gap: "12px" }}>
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
                    {initials}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: "15px", fontWeight: 600, color: "#101828", marginBottom: "4px" }}>{c.nome}</p>
                    <p style={{ fontSize: "11px", color: "#667085", lineHeight: 1.35 }}>
                      {c.telefone}
                      {c.bairro || c.cidade ? ` · ${c.bairro || c.cidade}` : ""}
                    </p>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "8px" }}>
                      {isHighMatchScore(c.id, c.score) ? (
                        <span
                          className="bg-green-500"
                          style={{ fontSize: "10px", fontWeight: 600, padding: "3px 10px", borderRadius: "20px", color: "#fff" }}
                        >
                          match
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <p style={{ fontSize: "22px", fontWeight: 700, color: "#101828", lineHeight: 1 }}>
                      {effectiveDisplayScore(c.id, c.score)}
                    </p>
                    <p style={{ fontSize: "9px", color: "#98A2B3", marginTop: "4px", fontWeight: 500 }}>score</p>
                  </div>
                </div>
              </Link>
            );
          })}
        {!noCliente && !candidatos.length ? (
          <p style={{ fontSize: "13px", color: "#667085" }}>
            Nenhuma inscrição ainda.{" "}
            <Link href="/vagas/nova" style={{ color: "#101828", fontWeight: 600 }}>
              Publique uma vaga
            </Link>{" "}
            ou abra{" "}
            <Link href="/vagas" style={{ color: "#101828", fontWeight: 600 }}>
              Minhas vagas
            </Link>
            .
          </p>
        ) : null}
      </div>
      <BottomNav />
    </div>
  );
}

export default function CandidatosPage() {
  return (
    <Suspense
      fallback={
        <div style={{ background: "#F9FAFB", minHeight: "100vh", padding: "24px 16px" }}>
          <p style={{ fontSize: "14px", color: "#667085" }}>Carregando…</p>
        </div>
      }
    >
      <CandidatosContent />
    </Suspense>
  );
}
