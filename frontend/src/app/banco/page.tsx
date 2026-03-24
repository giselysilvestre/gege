"use client";

import { useState, useEffect } from "react";
import { Search, SlidersHorizontal } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { BottomNav } from "@/components/BottomNav";
import { effectiveDisplayScore } from "@/lib/score";

type Talento = {
  id: string;
  nome: string;
  telefone: string;
  score: number | null;
  bairro: string | null;
  exp_resumo: string | null;
};

function waDigits(tel: string) {
  const d = tel?.replace(/\D/g, "") ?? "";
  return d.startsWith("55") ? d : `55${d}`;
}

export default function BancoTalentos() {
  const [search, setSearch] = useState("");
  const [talentos, setTalentos] = useState<Talento[]>([]);
  const [filterOpen, setFilterOpen] = useState(false);
  const [filtroMatch, setFiltroMatch] = useState<"todos" | "match">("todos");
  const supabase = createClient();

  useEffect(() => {
    void (async () => {
      const { data } = await supabase
        .from("candidatos")
        .select("id, nome, telefone, score, bairro, exp_resumo")
        .eq("disponivel", true)
        .order("criado_em", { ascending: false })
        .limit(100);
      setTalentos((data as Talento[]) ?? []);
    })();
  }, []);

  const filtered = talentos.filter((t) => {
    if (filtroMatch === "match" && effectiveDisplayScore(t.id, t.score) < 90) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return t.nome?.toLowerCase().includes(q) || t.telefone?.includes(search);
  });

  return (
    <div style={{ background: "#F9FAFB", minHeight: "100vh", paddingBottom: "88px" }}>
      <div style={{ background: "#fff", padding: "16px", borderBottom: "1px solid #EAECF0" }}>
        <div style={{ fontSize: "20px", fontWeight: 700, color: "#101828", marginBottom: "14px", letterSpacing: "-0.02em" }}>Banco de Talentos</div>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div className="relative flex-1" style={{ minWidth: 0 }}>
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: "#98A2B3" }} pointerEvents="none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Busque talentos pelo nome, email ou celular"
              className="w-full rounded-xl border pl-10 pr-3"
              style={{
                borderColor: "#EAECF0",
                backgroundColor: "#fff",
                height: "48px",
                fontSize: "13px",
                color: "#101828",
                outline: "none",
              }}
            />
          </div>
          <button
            type="button"
            onClick={() => setFilterOpen((o) => !o)}
            aria-label="Filtros"
            className="flex shrink-0 items-center justify-center rounded-xl border border-amber-300"
            style={{
              width: "48px",
              height: "48px",
              background: "#FACC15",
              cursor: "pointer",
              borderColor: "#EAB308",
              boxShadow: "0 1px 2px rgba(16, 24, 40, 0.08)",
            }}
          >
            <SlidersHorizontal className="h-5 w-5" style={{ color: "#101828" }} strokeWidth={2.25} />
          </button>
        </div>
        {filterOpen ? (
          <div style={{ marginTop: "12px" }}>
            <label style={{ display: "block", fontSize: "11px", fontWeight: 600, color: "#667085", marginBottom: "6px" }}>Filtrar</label>
            <select
              value={filtroMatch}
              onChange={(e) => setFiltroMatch(e.target.value === "match" ? "match" : "todos")}
              style={{
                width: "100%",
                borderRadius: "10px",
                border: "1px solid #EAECF0",
                padding: "10px 12px",
                fontSize: "13px",
                fontFamily: "inherit",
                background: "#fff",
                color: "#101828",
              }}
            >
              <option value="todos">Todos os talentos</option>
              <option value="match">Match (score ≥ 90)</option>
            </select>
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-3 p-4">
        {filtered.map((talento) => (
          <div
            key={talento.id}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "stretch",
              borderRadius: "12px",
              background: "#fff",
              padding: "14px",
              textAlign: "left",
              border: "1px solid #EAECF0",
              boxShadow: "0 1px 2px rgba(16, 24, 40, 0.06)",
            }}
          >
            <div style={{ fontSize: "13px", fontWeight: 700, color: "#101828", marginBottom: "8px", lineHeight: 1.3 }}>{talento.nome}</div>
            <a
              href={`https://wa.me/${waDigits(talento.telefone)}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ fontSize: "11px", fontWeight: 600, color: "#027A48", textDecoration: "underline", marginBottom: "6px", wordBreak: "break-all" }}
            >
              {talento.telefone}
            </a>
            <div style={{ fontSize: "11px", color: "#667085", marginBottom: "3px" }}>Bairro: {talento.bairro?.trim() || "—"}</div>
            <div style={{ fontSize: "11px", color: "#667085", marginBottom: "6px" }}>Distância: —</div>
            <div style={{ fontSize: "13px", fontWeight: 700, color: "#101828", marginBottom: "6px" }}>
              Score {effectiveDisplayScore(talento.id, talento.score)}
            </div>
            <p style={{ fontSize: "11px", color: "#475467", lineHeight: 1.45, marginTop: "4px" }}>{talento.exp_resumo?.trim() || "—"}</p>
          </div>
        ))}
      </div>
      <BottomNav />
    </div>
  );
}
