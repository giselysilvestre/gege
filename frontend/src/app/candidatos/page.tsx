"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { normalizePercentScore } from "@/lib/score";
import type { CandidatoInscricaoRow } from "./ui/CandidatoInscricaoCard";
import { ALLOWED_CANDIDATE_TAGS, toAllowedCandidateTags } from "@/lib/candidate-tags";
import { CandidatosFiltersBar } from "./ui/CandidatosFiltersBar";
import { STATUS_FILTRO_LABELS, type StatusFiltroKey } from "./ui/candidatosConstants";
import { buildExperienciaResumoLinha } from "./ui/candidatosFormat";
import { useSupabaseBrowser } from "@/lib/supabase/useSupabaseBrowser";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ActiveFilterChips } from "@/components/ui/ActiveFilterChips";

type SortKey = "candidato" | "score" | "etapa" | "inscricao";

function stageCountPredicate(status: string, stage: "triagem" | "entrevista" | "teste" | "contratado" | "desistiu"): boolean {
  if (stage === "triagem") return status === "novo" || status === "em_triagem";
  if (stage === "entrevista") return status === "em_entrevista" || status === "entrevista" || status === "entrevistado";
  if (stage === "teste") return status === "em_teste" || status === "teste" || status === "aprovado_teste" || status === "aprovado";
  if (stage === "contratado") return status === "contratado";
  return status === "reprovado" || status === "desistiu";
}

function etapaPill(status: string): { className: string; label: string } {
  switch (status) {
    case "contratado":
      return { className: "ep ep-contratado", label: "Contratado" };
    case "reprovado":
    case "desistiu":
      return { className: "ep ep-reprovado", label: "Desistiu" };
    case "em_entrevista":
    case "entrevista":
    case "entrevistado":
      return { className: "ep ep-entrevista", label: "Entrevista" };
    case "em_teste":
    case "teste":
    case "aprovado":
    case "aprovado_teste":
      return { className: "ep ep-teste", label: "Teste" };
    case "em_triagem":
      return { className: "ep ep-triagem", label: "Triagem" };
    default:
      return { className: "ep ep-inscrito", label: "Inscrito" };
  }
}

function scoreClass(score: number | null): string {
  const n = normalizePercentScore(score);
  if (n == null) return "score";
  if (n >= 70) return "score";
  if (n >= 50) return "score mid";
  return "score low";
}

function initialsFromNome(nome: string) {
  return nome
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
}

function tagsDaLinha(r: CandidatoInscricaoRow): string[] {
  return toAllowedCandidateTags(r.tags ?? []);
}

function idadeDe(d: string | null | undefined): number | null {
  if (!d) return null;
  const b = new Date(d);
  if (Number.isNaN(b.getTime())) return null;
  const t = new Date();
  let a = t.getFullYear() - b.getFullYear();
  const m = t.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && t.getDate() < b.getDate())) a--;
  return a >= 0 ? a : null;
}

function fmtKm(km: number | null | undefined): string | null {
  if (km == null || !Number.isFinite(km)) return null;
  const n = Number(km);
  return `${n % 1 === 0 ? String(Math.round(n)) : n.toFixed(1).replace(".", ",")}km`;
}

function cidadeUf(cidade: string | null | undefined): string | null {
  const t = cidade?.trim();
  if (!t) return null;
  // Se já vier "Cidade, UF", mantém.
  if (/,\s*[A-Z]{2}$/.test(t)) return t;
  return t;
}

function statusMatchesKey(status: string, key: StatusFiltroKey): boolean {
  if (key === "entrevista") return status === "em_entrevista" || status === "entrevista" || status === "entrevistado";
  if (key === "teste") return status === "em_teste" || status === "teste" || status === "aprovado" || status === "aprovado_teste";
  if (key === "contratado") return status === "contratado";
  if (key === "reprovado") return status === "reprovado" || status === "desistiu";
  return false;
}

function nextDbStatus(current: string): string | null {
  if (current === "novo") return "em_triagem";
  if (current === "em_triagem") return "em_entrevista";
  if (current === "em_entrevista" || current === "entrevista" || current === "entrevistado") return "em_teste";
  if (current === "em_teste" || current === "teste" || current === "aprovado" || current === "aprovado_teste") return "contratado";
  return null;
}

function nextLabel(current: string): string | null {
  const n = nextDbStatus(current);
  if (n === "em_triagem") return "Triagem";
  if (n === "em_entrevista") return "Entrevista";
  if (n === "em_teste") return "Teste";
  if (n === "contratado") return "Contratado";
  return null;
}

function sortArrow(sortBy: SortKey, sortDir: "asc" | "desc", key: SortKey): string {
  if (sortBy !== key) return "↕";
  return sortDir === "asc" ? "↑" : "↓";
}

function CandidatosContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const vagaFromQuery = (searchParams.get("vaga") ?? "").trim();
  const [loading, setLoading] = useState(true);
  const [noCliente, setNoCliente] = useState(false);
  const [vagasAtivas, setVagasAtivas] = useState<Array<{ id: string; cargo: string; titulo_publicacao?: string | null }>>([]);
  const [rawRows, setRawRows] = useState<CandidatoInscricaoRow[]>([]);
  const [q, setQ] = useState("");
  const [selectedVagaIds, setSelectedVagaIds] = useState<string[]>(() => (vagaFromQuery ? [vagaFromQuery] : []));
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [statusTodos, setStatusTodos] = useState(true);
  const [statusKeys, setStatusKeys] = useState<StatusFiltroKey[]>([]);
  const [kmMax, setKmMax] = useState(50);
  const [sortBy, setSortBy] = useState<SortKey>("score");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const PAGE_SIZE = 100;
  const supabase = useSupabaseBrowser();
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({
        page: String(page),
        pageSize: String(PAGE_SIZE),
      });
      if (vagaFromQuery) qs.set("vaga", vagaFromQuery);
      const res = await fetch(`/api/candidatos/list?${qs.toString()}`, { cache: "default" });
      const json = (await res.json()) as {
        rows?: CandidatoInscricaoRow[];
        vagasAtivas?: Array<{ id: string; cargo: string; titulo_publicacao?: string | null }>;
        debug?: Record<string, unknown>;
        hasMore?: boolean;
        message?: string;
      };
      if (!res.ok) {
        setNoCliente(res.status === 401);
        setRawRows([]);
        setVagasAtivas([]);
        setHasMore(false);
        setLoading(false);
        return;
      }
      setNoCliente(false);
      setRawRows(json.rows ?? []);
      setVagasAtivas(json.vagasAtivas ?? []);
      setHasMore(Boolean(json.hasMore));
    } catch {
      setNoCliente(false);
      setRawRows([]);
      setVagasAtivas([]);
      setHasMore(false);
    }
    setLoading(false);
  }, [page, vagaFromQuery]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!vagaFromQuery) return;
    setSelectedVagaIds((prev) => (prev.length === 1 && prev[0] === vagaFromQuery ? prev : [vagaFromQuery]));
  }, [vagaFromQuery]);

  const availableTags = useMemo(() => {
    return [...ALLOWED_CANDIDATE_TAGS];
  }, []);

  const stageCounts = useMemo(
    () => ({
      todos: rawRows.length,
      triagem: rawRows.filter((r) => stageCountPredicate(r.status, "triagem")).length,
      entrevista: rawRows.filter((r) => stageCountPredicate(r.status, "entrevista")).length,
      teste: rawRows.filter((r) => stageCountPredicate(r.status, "teste")).length,
      contratado: rawRows.filter((r) => stageCountPredicate(r.status, "contratado")).length,
      desistiu: rawRows.filter((r) => stageCountPredicate(r.status, "desistiu")).length,
    }),
    [rawRows]
  );
  const hasDistanceData = useMemo(() => rawRows.some((r) => r.distancia_km != null), [rawRows]);

  const tableRows = useMemo(() => {
    const t = q.trim().toLowerCase();
    const kmFilterOn = kmMax < 50;
    let rows = rawRows;
    if (selectedVagaIds.length > 0) rows = rows.filter((r) => selectedVagaIds.includes(r.vagaId));
    if (selectedTags.length > 0) rows = rows.filter((r) => selectedTags.some((x) => tagsDaLinha(r).includes(x)));
    rows = rows.filter((r) => {
      if (!kmFilterOn || !hasDistanceData) return true;
      return r.distancia_km != null && r.distancia_km <= kmMax;
    });
    if (!statusTodos && statusKeys.length > 0) rows = rows.filter((r) => statusKeys.some((k) => statusMatchesKey(r.status, k)));
    const stageRank: Record<string, number> = {
      novo: 1,
      em_triagem: 2,
      em_entrevista: 3,
      em_teste: 4,
      contratado: 5,
      reprovado: 0,
      desistiu: 0,
    };
    rows = [...rows].sort((a, b) => {
      let cmp = 0;
      if (sortBy === "candidato") cmp = a.candidato.nome.localeCompare(b.candidato.nome, "pt");
      if (sortBy === "score") cmp = (normalizePercentScore(a.score ?? a.candidato.score) ?? -1) - (normalizePercentScore(b.score ?? b.candidato.score) ?? -1);
      if (sortBy === "etapa") cmp = (stageRank[a.status] ?? -1) - (stageRank[b.status] ?? -1);
      if (sortBy === "inscricao") {
        const ta = a.enviado_em ? new Date(a.enviado_em).getTime() : 0;
        const tb = b.enviado_em ? new Date(b.enviado_em).getTime() : 0;
        cmp = ta - tb;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    if (t) {
      rows = rows.filter(
        (r) =>
          r.candidato.nome.toLowerCase().includes(t) ||
          r.cargo.toLowerCase().includes(t) ||
          (r.candidato.bairro?.toLowerCase().includes(t) ?? false) ||
          (r.candidato.cidade?.toLowerCase().includes(t) ?? false)
      );
    }
    return rows;
  }, [rawRows, q, selectedVagaIds, selectedTags, statusTodos, statusKeys, kmMax, sortBy, sortDir, hasDistanceData]);

  const currentPage = page;
  const hasActiveFilters = selectedVagaIds.length > 0 || selectedTags.length > 0 || !statusTodos || kmMax < 50 || Boolean(q.trim());
  const activeChips = useMemo(() => {
    const chips: Array<{ key: string; label: string; onRemove: () => void }> = [];
    if (q.trim()) chips.push({ key: "q", label: `Busca: ${q.trim()}`, onRemove: () => setQ("") });
    selectedVagaIds.forEach((vagaId) => {
      const vaga = vagasAtivas.find((v) => v.id === vagaId);
      const vagaNome = (vaga?.titulo_publicacao?.trim() || vaga?.cargo?.trim() || vagaId).trim();
      chips.push({
        key: `vaga:${vagaId}`,
        label: `Vaga: ${vagaNome}`,
        onRemove: () => setSelectedVagaIds((prev) => prev.filter((id) => id !== vagaId)),
      });
    });
    selectedTags.forEach((tag) => {
      chips.push({ key: `tag:${tag}`, label: `Tag: ${tag}`, onRemove: () => setSelectedTags((prev) => prev.filter((x) => x !== tag)) });
    });
    if (!statusTodos && statusKeys.length > 0) {
      statusKeys.forEach((k) => {
        chips.push({
          key: `status:${k}`,
          label: `Status: ${STATUS_FILTRO_LABELS[k]}`,
          onRemove: () => setStatusKeys((prev) => prev.filter((x) => x !== k)),
        });
      });
    }
    if (kmMax < 50) chips.push({ key: "km", label: `Distância ≤ ${kmMax}km`, onRemove: () => setKmMax(50) });
    return chips;
  }, [q, selectedVagaIds, vagasAtivas, selectedTags, statusTodos, statusKeys, kmMax]);

  function clearAllFilters() {
    if (vagaFromQuery) router.replace(pathname || "/candidatos");
    setQ("");
    setSelectedVagaIds([]);
    setSelectedTags([]);
    setStatusTodos(true);
    setStatusKeys([]);
    setKmMax(50);
  }

  function onSort(key: SortKey) {
    if (sortBy === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortBy(key);
      setSortDir(key === "candidato" ? "asc" : "desc");
    }
  }

  async function onAction(candidaturaId: string, action: "proxima" | "reprovar" | "desistiu" | "whatsapp", tel: string) {
    if (action === "whatsapp" && tel) {
      const wa = tel.replace(/\D/g, "");
      if (wa) window.open(`https://wa.me/${wa}`, "_blank", "noopener,noreferrer");
      return;
    }
    if (!supabase) return;
    if (action === "reprovar") {
      await supabase.from("candidaturas").update({ status: "reprovado" }).eq("id", candidaturaId);
      await load();
      return;
    }
    if (action === "desistiu") {
      await supabase.from("candidaturas").update({ status: "desistiu" }).eq("id", candidaturaId);
      await load();
      return;
    }
    const row = rawRows.find((r) => r.candidaturaId === candidaturaId);
    if (!row) return;
    const next = nextDbStatus(row.status);
    if (!next) return;
    await supabase.from("candidaturas").update({ status: next }).eq("id", candidaturaId);
    await load();
  }

  if (loading) return <div className="fs14 c600" style={{ padding: 8 }}>Carregando candidatos…</div>;

  const stageBoxes: { key: string; label: string; n: number }[] = [
    { key: "todos", label: "Todos", n: stageCounts.todos },
    { key: "triagem", label: "Triagem", n: stageCounts.triagem },
    { key: "entrevista", label: "Entrevista", n: stageCounts.entrevista },
    { key: "teste", label: "Teste", n: stageCounts.teste },
    { key: "contratado", label: "Contratado", n: stageCounts.contratado },
    { key: "desistiu", label: "Desistiu", n: stageCounts.desistiu },
  ];

  return (
    <div style={{ minHeight: "100%" }}>
      <div className="flex aic jsb mb16">
        <Link href="/dashboard" className="btn btn-ghost btn-sm">← Voltar</Link>
        {!noCliente ? (
          <CandidatosFiltersBar
            vagasAtivas={vagasAtivas}
            selectedVagaIds={selectedVagaIds}
            onChangeVagas={setSelectedVagaIds}
            availableTags={availableTags}
            selectedTags={selectedTags}
            onToggleTag={(tag) => setSelectedTags((prev) => (prev.includes(tag) ? prev.filter((x) => x !== tag) : [...prev, tag]))}
            statusTodos={statusTodos}
            statusKeys={statusKeys}
            onChangeStatusTodos={(v) => {
              setStatusTodos(v);
              if (v) setStatusKeys([]);
            }}
            onToggleStatusKey={(k) => {
              setStatusTodos(false);
              setStatusKeys((prev) => (prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]));
            }}
            kmMax={kmMax}
            onChangeKmMax={setKmMax}
          />
        ) : null}
      </div>

      <div className="stage-boxes mb16">
        {stageBoxes.map((b) => (
          <div
            key={b.key}
            className="stage-box"
            style={{ cursor: "default", pointerEvents: "none" }}
          >
            <div className="stage-box-n">{b.n}</div>
            <div className="stage-box-l">{b.label}</div>
          </div>
        ))}
      </div>

      <div className="search-row">
        <input className="search-input" type="text" placeholder="🔍  Buscar candidatos..." value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <ActiveFilterChips chips={activeChips} onClearAll={clearAllFilters} />

      {noCliente ? <p className="fs13 mb16" style={{ color: "var(--danger-fg)" }}>Faça login para ver candidatos.</p> : null}
      {!noCliente && kmMax < 50 && !hasDistanceData ? (
        <p className="fs12 c500 mb12">Filtro de distância indisponível agora (ainda não há dados de distância nesta lista).</p>
      ) : null}

      {!noCliente && !tableRows.length ? (
        <div className="card mb16" style={{ background: "var(--warning-bg-soft)", border: "1px solid var(--warning-border-soft)" }}>
          <p className="fs13 c700" style={{ marginBottom: 6 }}>Nenhuma inscrição encontrada para este filtro.</p>
          <p className="fs12 c600" style={{ marginBottom: hasActiveFilters ? 10 : 0 }}>
            Se a etapa "Entrevista" estiver vazia no banco, o resultado vazio aqui é esperado.
          </p>
          {hasActiveFilters ? (
            <button type="button" className="btn btn-ghost btn-xs" onClick={clearAllFilters}>
              Limpar filtros
            </button>
          ) : null}
        </div>
      ) : null}

      {!noCliente ? (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div className="table-wrap">
            <table className="eq-table">
              <colgroup>
                <col style={{ width: "14.285%" }} />
                <col style={{ width: "14.285%" }} />
                <col style={{ width: "14.285%" }} />
                <col style={{ width: "14.285%" }} />
                <col style={{ width: "14.285%" }} />
                <col style={{ width: "14.285%" }} />
                <col style={{ width: "14.285%" }} />
              </colgroup>
              <thead>
                <tr>
                  <th className="sortable" onClick={() => onSort("candidato")}>Candidato {sortArrow(sortBy, sortDir, "candidato")}</th>
                  <th>Experiência</th>
                  <th
                    className="sortable"
                    title="Score IA do currículo do candidato (0–100)."
                    onClick={() => onSort("score")}
                  >
                    Score IA {sortArrow(sortBy, sortDir, "score")}
                  </th>
                  <th>Tags</th>
                  <th className="sortable" onClick={() => onSort("etapa")}>Etapa {sortArrow(sortBy, sortDir, "etapa")}</th>
                  <th className="sortable" onClick={() => onSort("inscricao")}>Inscrição {sortArrow(sortBy, sortDir, "inscricao")}</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {tableRows.map((r) => {
                  const ep = etapaPill(r.status);
                  const dt = r.enviado_em ? new Date(r.enviado_em) : null;
                  const insc = dt && Number.isFinite(dt.getTime()) ? dt.toLocaleDateString("pt-BR") : "—";
                  const mergedTags = tagsDaLinha(r).slice(0, 4);
                  const sc = normalizePercentScore(r.score ?? r.candidato.score);
                  const age = idadeDe(r.candidato.data_nascimento ?? null);
                  const loc = [age != null ? `${age}a` : null, cidadeUf(r.candidato.cidade), fmtKm(r.distancia_km)].filter(Boolean).join(" · ");
                  const exp = (r.candidato.exp_resumo?.trim() || "").split(/\n|[;|]/)[0]?.trim() || buildExperienciaResumoLinha(r.candidato) || "—";
                  const nextEtapa = nextLabel(r.status);
                  return (
                    <tr key={r.candidaturaId} style={{ cursor: "pointer" }} onClick={() => router.push(`/candidatos/${r.candidato.id}?vaga=${encodeURIComponent(r.vagaId)}`)}>
                      <td>
                        <div className="flex aic g8">
                          <div className="av">{initialsFromNome(r.candidato.nome)}</div>
                          <div>
                            <div className="fw6">{r.candidato.nome}</div>
                            <div className="cand-loc">{loc || "—"}</div>
                          </div>
                        </div>
                      </td>
                      <td className="c600 fs13">{exp || "—"}</td>
                      <td>{sc != null ? <div className={scoreClass(r.score ?? r.candidato.score)}>{Math.round(sc)}</div> : <span className="c400">—</span>}</td>
                      <td>
                        <div className="tag-row">
                          {mergedTags.map((t) => (
                            <span key={t} className={t === "desempregado" ? "badge b-blue" : "badge b-olive"}>{t}</span>
                          ))}
                        </div>
                      </td>
                      <td><span className={ep.className}>{ep.label}</span></td>
                      <td className="c600 fs13">{insc}</td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <select
                          className="search-input"
                          style={{ maxWidth: 170 }}
                          defaultValue=""
                          onChange={(e) => {
                            const val = e.target.value as "proxima" | "reprovar" | "desistiu" | "whatsapp" | "";
                            if (!val) return;
                            void onAction(r.candidaturaId, val, r.candidato.telefone ?? "");
                            e.currentTarget.value = "";
                          }}
                        >
                          <option value="">Ações</option>
                          <option value="proxima" disabled={!nextEtapa}>
                            {nextEtapa ? `Avançar p/ ${nextEtapa}` : "Sem próxima etapa"}
                          </option>
                          <option value="reprovar">Reprovar</option>
                          <option value="desistiu">Desistiu</option>
                          <option value="whatsapp">WhatsApp</option>
                        </select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {!noCliente && !tableRows.length ? <p className="fs13 muted mt16">Nenhuma inscrição encontrada.</p> : null}
      {!noCliente && (tableRows.length > 0 || page > 1) ? (
        <div className="flex aic jsb mt16">
          <p className="fs12 c500">
            Página {currentPage} · {tableRows.length} candidatos carregados
          </p>
          <div className="flex aic g8">
            <button type="button" className="btn btn-ghost btn-sm" disabled={currentPage <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
              Anterior
            </button>
            <button type="button" className="btn btn-ghost btn-sm" disabled={!hasMore} onClick={() => setPage((p) => p + 1)}>
              Próxima
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function CandidatosPage() {
  return (
    <Suspense fallback={<div style={{ background: "var(--n50)", minHeight: "100vh", padding: "24px 16px" }}><p style={{ fontSize: "14px", color: "var(--n500)" }}>Carregando…</p></div>}>
      <CandidatosContent />
    </Suspense>
  );
}
