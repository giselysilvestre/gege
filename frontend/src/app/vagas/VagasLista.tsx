"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { JobCardVaga } from "@/components/JobCard";
import { STATUS_CONFIG, getDaysOpen } from "@/lib/status";
import { vagaTituloPublico, vagaUnidadePublica } from "@/lib/vaga-display";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { ActiveFilterChips } from "@/components/ui/ActiveFilterChips";
import { devError } from "@/lib/devLog";

type Props = {
  initialVagas: JobCardVaga[];
  errorMessage?: string | null;
};

function etapaMaisAvancada(vaga: JobCardVaga): string {
  const cands = vaga.candidaturas ?? [];
  if (cands.length === 0) return "—";
  const order: Record<string, number> = {
    reprovado: 1,
    desistiu: 1,
    inscrito: 2,
    novo: 2,
    em_triagem: 3,
    em_entrevista: 4,
    entrevista: 4,
    entrevistado: 4,
    em_teste: 5,
    teste: 5,
    aprovado_teste: 5,
    aprovado: 5,
    contratado: 7,
  };
  const labels: Record<string, string> = {
    em_triagem: "Triagem",
    em_entrevista: "Entrevista",
    entrevista: "Entrevista",
    entrevistado: "Entrevista",
    em_teste: "Teste",
    teste: "Teste",
    aprovado_teste: "Teste",
    aprovado: "Teste",
    contratado: "Contratado",
    reprovado: "Desistiu",
    desistiu: "Desistiu",
    inscrito: "Inscrito",
    novo: "Inscrito",
  };
  let best = 0;
  let st = "inscrito";
  for (const c of cands) {
    const o = order[c.status] ?? 2;
    if (o > best) {
      best = o;
      st = c.status;
    }
  }
  return labels[st] ?? st;
}

function statusVagaLabel(status: string) {
  return STATUS_CONFIG[status]?.label ?? status;
}

function statusSelectLabel(status: string) {
  if (status === "em_selecao") return "aberta";
  return status;
}

export function VagasLista({ initialVagas, errorMessage }: Props) {
  const router = useRouter();
  const [vagas, setVagas] = useState<JobCardVaga[]>(initialVagas);
  const [q, setQ] = useState("");
  const [unidade, setUnidade] = useState("");
  const [statusFiltro, setStatusFiltro] = useState<"ativa" | "inativa" | "todas">("ativa");
  const [statusVagaFiltro, setStatusVagaFiltro] = useState<"todas" | "aberta" | "fechada" | "cancelada">("todas");
  const [sortBy, setSortBy] = useState<"vaga" | "unidade" | "posicoes" | "inscritos" | "etapa" | "status" | "aberto">("aberto");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const unidades = useMemo(() => {
    const s = new Set<string>();
    for (const v of initialVagas) {
      const u = vagaUnidadePublica(v);
      if (u) s.add(u);
    }
    return [...s].sort((a, b) => a.localeCompare(b, "pt"));
  }, [initialVagas]);

  const rows = useMemo(() => {
    const filtered = vagas.filter((v) => {
      const ativa = v.status_vaga === "aberta" || v.status_vaga === "em_selecao";
      if (statusFiltro === "ativa" && !ativa) return false;
      if (statusFiltro === "inativa" && ativa) return false;
      if (statusVagaFiltro === "aberta" && !(v.status_vaga === "aberta" || v.status_vaga === "em_selecao")) return false;
      if (statusVagaFiltro === "fechada" && v.status_vaga !== "fechada") return false;
      if (statusVagaFiltro === "cancelada" && v.status_vaga !== "cancelada") return false;
      const u = vagaUnidadePublica(v) ?? "";
      if (unidade && u !== unidade) return false;
      const needle = q.trim().toLowerCase();
      const titulo = vagaTituloPublico(v).toLowerCase();
      if (needle && !titulo.includes(needle) && !u.toLowerCase().includes(needle)) return false;
      return true;
    });
    const stageRank: Record<string, number> = {
      Inscrito: 1,
      Triagem: 2,
      Entrevista: 3,
      Teste: 4,
      Contratado: 5,
      Reprovado: 0,
      "—": -1,
    };
    const statusRank: Record<string, number> = { aberta: 3, em_selecao: 2, fechada: 1, cancelada: 0 };
    const sorted = [...filtered].sort((a, b) => {
      const aUn = vagaUnidadePublica(a) ?? "";
      const bUn = vagaUnidadePublica(b) ?? "";
      const aPos = (a as { quantidade_vagas?: number | null }).quantidade_vagas ?? 1;
      const bPos = (b as { quantidade_vagas?: number | null }).quantidade_vagas ?? 1;
      const aIns = (a.candidaturas ?? []).length;
      const bIns = (b.candidaturas ?? []).length;
      const aEt = etapaMaisAvancada(a);
      const bEt = etapaMaisAvancada(b);
      const aCriado = new Date(a.criado_em).getTime() || 0;
      const bCriado = new Date(b.criado_em).getTime() || 0;
      let cmp = 0;
      if (sortBy === "vaga") cmp = vagaTituloPublico(a).localeCompare(vagaTituloPublico(b), "pt");
      if (sortBy === "unidade") cmp = aUn.localeCompare(bUn, "pt");
      if (sortBy === "posicoes") cmp = aPos - bPos;
      if (sortBy === "inscritos") cmp = aIns - bIns;
      if (sortBy === "etapa") cmp = (stageRank[aEt] ?? -1) - (stageRank[bEt] ?? -1);
      if (sortBy === "status") cmp = (statusRank[a.status_vaga] ?? -1) - (statusRank[b.status_vaga] ?? -1);
      if (sortBy === "aberto") cmp = aCriado - bCriado;
      return sortDir === "asc" ? cmp : -cmp;
    });
    return sorted;
  }, [vagas, q, unidade, statusFiltro, statusVagaFiltro, sortBy, sortDir]);
  const activeChips = [
    ...(q.trim()
      ? [{ key: "q", label: `Busca: ${q.trim()}`, onRemove: () => setQ("") }]
      : []),
    ...(unidade
      ? [{ key: "un", label: `Unidade: ${unidade}`, onRemove: () => setUnidade("") }]
      : []),
    ...(statusFiltro !== "ativa"
      ? [{ key: "st", label: `Status: ${statusFiltro}`, onRemove: () => setStatusFiltro("ativa") }]
      : []),
    ...(statusVagaFiltro !== "todas"
      ? [{ key: "stv", label: `Situação: ${statusVagaFiltro}`, onRemove: () => setStatusVagaFiltro("todas") }]
      : []),
  ];

  async function updateStatusVaga(vagaId: string, nextStatus: "aberta" | "fechada" | "cancelada") {
    const ok = window.confirm(`Tem certeza que deseja mudar o status para "${nextStatus}"?`);
    if (!ok) return;
    const sb = getSupabaseBrowserClient();
    const payload: { status_vaga: string; fechada_em?: string | null } = { status_vaga: nextStatus };
    payload.fechada_em = nextStatus === "aberta" ? null : new Date().toISOString();
    const { error } = await sb.from("vagas").update(payload).eq("id", vagaId);
    if (error) {
      devError("[vagas] update status:", error.message);
      return;
    }
    setVagas((prev) =>
      prev.map((v) =>
        v.id === vagaId
          ? { ...v, status_vaga: nextStatus, fechada_em: payload.fechada_em ?? v.fechada_em }
          : v
      )
    );
  }

  function onSort(key: typeof sortBy) {
    if (sortBy === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortBy(key);
      setSortDir(key === "vaga" || key === "unidade" ? "asc" : "desc");
    }
  }

  return (
    <div style={{ minHeight: "100%" }}>
      <div className="flex aic jsb mb16 vagas-head-mobile">
        <Link href="/dashboard" className="btn btn-ghost btn-sm">
          ← Voltar
        </Link>
        <Link href="/vagas/nova" className="dash-mobile-new-btn vagas-new-mobile-only">
          + Nova Vaga
        </Link>
      </div>

      <div className="search-row vagas-search-mobile">
        <input
          className="search-input"
          type="text"
          placeholder="🔍  Buscar vagas..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select className="search-input" style={{ maxWidth: 180 }} value={unidade} onChange={(e) => setUnidade(e.target.value)}>
          <option value="">Todas unidades</option>
          {unidades.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </select>
        <select
          className="search-input"
          style={{ maxWidth: 140 }}
          value={statusFiltro}
          onChange={(e) => setStatusFiltro(e.target.value as typeof statusFiltro)}
        >
          <option value="ativa">Ativa</option>
          <option value="inativa">Inativa</option>
          <option value="todas">Todas</option>
        </select>
      </div>
      <ActiveFilterChips
        chips={activeChips}
        onClearAll={() => {
          setQ("");
          setUnidade("");
          setStatusFiltro("ativa");
          setStatusVagaFiltro("todas");
        }}
      />

      {errorMessage ? (
        <p className="mb16 fs13" style={{ color: "var(--danger-fg)" }}>
          {errorMessage}
        </p>
      ) : null}

      <div className="card vagas-desktop-table" style={{ padding: 0, overflow: "hidden" }}>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th className="sortable" onClick={() => onSort("vaga")}>Nome da Vaga</th>
                <th className="sortable" onClick={() => onSort("unidade")}>Unidade</th>
                <th className="sortable" onClick={() => onSort("posicoes")}>Posições</th>
                <th className="sortable" onClick={() => onSort("inscritos")}>Inscritos</th>
                <th className="sortable" onClick={() => onSort("etapa")}>Etapa mais avançada</th>
                <th className="sortable" onClick={() => onSort("status")}>Status</th>
                <th className="sortable" onClick={() => onSort("aberto")}>Aberto em</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((v) => {
                const cands = v.candidaturas ?? [];
                const un = vagaUnidadePublica(v) ?? "—";
                const pos = (v as { quantidade_vagas?: number | null }).quantidade_vagas;
                const aberto = getDaysOpen(v.criado_em, v.status_vaga, v.fechada_em ?? null);
                return (
                  <tr key={v.id} style={{ cursor: "pointer" }} onClick={() => router.push(`/candidatos?vaga=${encodeURIComponent(v.id)}`)}>
                    <td>
                      <Link
                        href={`/candidatos?vaga=${encodeURIComponent(v.id)}`}
                        className="fw6 fs13"
                        style={{ color: "var(--gray-900)" }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {vagaTituloPublico(v)}
                      </Link>
                    </td>
                    <td><span className="badge b-gray">{un}</span></td>
                    <td className="c600 fs13">{pos != null && pos > 0 ? String(pos) : "1"}</td>
                    <td className="c600 fs13">{cands.length}</td>
                    <td><span className="badge b-berry">{etapaMaisAvancada(v)}</span></td>
                    <td>
                      <span className="badge b-gray">{statusVagaLabel(v.status_vaga)}</span>
                    </td>
                    <td className="c600 fs13">{aberto}</td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <select
                        className="search-input"
                        style={{ maxWidth: 130, height: 32, padding: "0 8px", fontSize: 12 }}
                        value={statusSelectLabel(v.status_vaga)}
                        onChange={(e) => {
                          const val = e.target.value as "aberta" | "fechada" | "cancelada";
                          if (val === statusSelectLabel(v.status_vaga)) return;
                          void updateStatusVaga(v.id, val);
                        }}
                      >
                        <option value="aberta">aberta</option>
                        <option value="fechada">fechada</option>
                        <option value="cancelada">cancelada</option>
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <div className="vagas-mobile-cards">
        {rows.map((v) => {
          const cands = v.candidaturas ?? [];
          const un = vagaUnidadePublica(v);
          const pos = (v as { quantidade_vagas?: number | null }).quantidade_vagas;
          const posicoes = pos != null && pos > 0 ? pos : 1;
          const posLabel = `${posicoes} ${posicoes > 1 ? "Posições" : "Posição"}`;
          const aberto = getDaysOpen(v.criado_em, v.status_vaga, v.fechada_em ?? null);
          return (
            <Link
              key={`mv-${v.id}`}
              href={`/candidatos?vaga=${encodeURIComponent(v.id)}`}
              className="dash-mobile-job-card"
              style={{ marginBottom: 10 }}
            >
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
                <div style={{ fontWeight: 700, fontSize: 15, color: "var(--gray-900)" }}>{vagaTituloPublico(v)}</div>
                <div onClick={(e) => e.preventDefault()}>
                  <select
                    className="search-input"
                    style={{ maxWidth: 120, height: 30, padding: "0 8px", fontSize: 12 }}
                    value={statusSelectLabel(v.status_vaga)}
                    onChange={(e) => {
                      const val = e.target.value as "aberta" | "fechada" | "cancelada";
                      if (val === statusSelectLabel(v.status_vaga)) return;
                      void updateStatusVaga(v.id, val);
                    }}
                  >
                    <option value="aberta">aberta</option>
                    <option value="fechada">fechada</option>
                    <option value="cancelada">cancelada</option>
                  </select>
                </div>
              </div>
              <div style={{ fontSize: 12, color: "var(--gray-500)", marginBottom: 6, lineHeight: 1.35 }}>
                {[un, posLabel].filter(Boolean).join(" · ")}
              </div>
              <div style={{ fontSize: 12, color: "var(--gray-500)", marginBottom: 12, lineHeight: 1.5 }}>
                {[v.salario ? String(v.salario) : null, v.escala ?? null, v.horario ?? null].filter(Boolean).join(" · ")}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                <span className="ep ep-inscrito" style={{ background: "var(--gray-900)", color: "white" }}>
                  {statusVagaLabel(v.status_vaga)}
                </span>
                <span style={{ fontSize: 12, color: "var(--gray-400)" }}>{aberto}</span>
              </div>
              <div style={{ display: "flex", gap: 8, paddingTop: 10, borderTop: "1px solid var(--n200)" }}>
                {[
                  ["inscritos", cands.length],
                  ["triados", cands.filter((c) => c.status === "em_triagem").length],
                  ["entrevista", cands.filter((c) => c.status === "em_entrevista" || c.status === "entrevistado").length],
                  ["teste", cands.filter((c) => c.status === "em_teste" || c.status === "teste" || c.status === "aprovado_teste").length],
                ].map(([lbl, val]) => (
                  <div key={String(lbl)} style={{ flex: 1, textAlign: "center", minWidth: 0 }}>
                    <div style={{ fontSize: 18, fontWeight: 800, color: "var(--gray-900)", lineHeight: 1 }}>{val}</div>
                    <div style={{ marginTop: 7, fontSize: 9, color: "var(--gray-400)", textTransform: "uppercase", letterSpacing: "0.03em", fontWeight: 600 }}>
                      {lbl}
                    </div>
                  </div>
                ))}
              </div>
            </Link>
          );
        })}
      </div>

      {!errorMessage && rows.length === 0 ? (
        <p className="fs13 muted mt16">Nenhuma vaga encontrada. Crie uma em &quot;+ Nova Vaga&quot; na barra superior.</p>
      ) : null}
    </div>
  );
}
