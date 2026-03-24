"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { BottomNav } from "@/components/BottomNav";
import { JobCard, type JobCardVaga } from "@/components/JobCard";

type Props = {
  initialVagas: JobCardVaga[];
  errorMessage?: string | null;
};

export function VagasLista({ initialVagas, errorMessage }: Props) {
  const [tab, setTab] = useState<"todas" | "ativas" | "inativas">("todas");

  const filtered = initialVagas.filter((v) => {
    if (tab === "ativas") return ["aberta", "em_selecao"].includes(v.status_vaga);
    if (tab === "inativas") return ["fechada", "cancelada"].includes(v.status_vaga);
    return true;
  });

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
          href="/dashboard"
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
          <ChevronLeft size={16} color="#344054" />
        </Link>
        <span style={{ fontSize: "17px", fontWeight: 700, color: "#101828", letterSpacing: "-0.02em" }}>Minhas vagas</span>
      </div>
      <div
        style={{
          background: "#fff",
          padding: "12px 16px",
          display: "flex",
          gap: "8px",
          borderBottom: "1px solid #EAECF0",
          flexWrap: "wrap",
        }}
      >
        {(
          [
            ["todas", "Todas"],
            ["ativas", "Ativas"],
            ["inativas", "Inativas"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            style={{
              fontSize: "13px",
              fontWeight: tab === key ? 600 : 500,
              padding: "10px 16px",
              minHeight: "44px",
              borderRadius: "999px",
              border: "none",
              cursor: "pointer",
              fontFamily: "inherit",
              background: tab === key ? "#101828" : "transparent",
              color: tab === key ? "#fff" : "#667085",
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <div style={{ padding: "12px 16px" }}>
        {errorMessage ? (
          <p
            style={{
              fontSize: "14px",
              color: "#B42318",
              padding: "12px",
              background: "#FEF3F2",
              borderRadius: "12px",
              border: "1px solid #FECDCA",
            }}
          >
            {errorMessage}
          </p>
        ) : null}
        {!errorMessage && filtered.length === 0 ? (
          <p style={{ fontSize: "14px", color: "#667085", padding: "16px 0" }}>
            Nenhuma vaga nesta aba. Use &quot;+ Abrir nova vaga&quot; no início.
          </p>
        ) : null}
        {filtered.map((v) => (
          <JobCard key={v.id} vaga={v} />
        ))}
      </div>
      <BottomNav />
    </div>
  );
}
