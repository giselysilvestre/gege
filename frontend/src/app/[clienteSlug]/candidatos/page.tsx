"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { displayScoreEntrevista, normalizePercentScore } from "@/lib/score";
import type { CandidatoInscricaoRow } from "./ui/CandidatoInscricaoCard";
import { ALLOWED_CANDIDATE_TAGS, toAllowedCandidateTags } from "@/lib/candidate-tags";
import { CandidatosFiltersBar } from "./ui/CandidatosFiltersBar";
import { STATUS_FILTRO_LABELS, type StatusFiltroKey } from "./ui/candidatosConstants";
import {
  CANDIDATURA_FUNIL_BOXES,
  CANDIDATURA_STATUS_RANK,
  type CandidaturaSummaryCounts,
  type CandidaturaStatus,
  candidaturaStatusLabel,
  candidaturaStatusPill,
  emptySummaryCounts,
  nextCandidaturaStatus,
  normalizeCandidaturaStatus,
} from "@/lib/candidatura-status";
import { buildExperienciaResumoLinha } from "./ui/candidatosFormat";
import { useSupabaseBrowser } from "@/lib/supabase/useSupabaseBrowser";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ActiveFilterChips } from "@/components/ui/ActiveFilterChips";
import { getClienteBySlug } from '@/lib/getClienteBySlug'
import { useClienteSlug } from '@/lib/context/ClienteSlugContext'
import {
  apiVagaFromListQuery,
  buildCandidatoDetailHref,
  CANDIDATOS_LIST_DEFAULTS,
  type CandidatosSortKey,
  parseCandidatosListQuery,
  serializeCandidatosListQuery,
} from "./ui/candidatosListQuery";

type SortKey = CandidatosSortKey;
type SummaryCounts = CandidaturaSummaryCounts;

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
  return normalizeCandidaturaStatus(status) === key;
}

function nextLabel(current: string): string | null {
  const n = nextCandidaturaStatus(current);
  return n ? candidaturaStatusLabel(n) : null;
}

function sortArrow(sortBy: SortKey, sortDir: "asc" | "desc", key: SortKey): string {
  if (sortBy !== key) return "↕";
  return sortDir === "asc" ? "↑" : "↓";
}

function scoreCv(a: CandidatoInscricaoRow): number {
  return normalizePercentScore(a.score ?? a.candidato.score) ?? -1;
}

function scoreEnt(a: CandidatoInscricaoRow): number {
  return displayScoreEntrevista(a.score_entrevista) ?? -1;
}

/** Ordenação primária + desempate: Score Ent e Score CV (maiores primeiro). */
function compareCandidatoRows(a: CandidatoInscricaoRow, b: CandidatoInscricaoRow, sortBy: SortKey, sortDir: "asc" | "desc"): number {
  const stageRank = CANDIDATURA_STATUS_RANK;
  let cmp = 0;
  if (sortBy === "candidato") cmp = a.candidato.nome.localeCompare(b.candidato.nome, "pt");
  if (sortBy === "score") cmp = scoreCv(a) - scoreCv(b);
  if (sortBy === "score_entrevista") cmp = scoreEnt(a) - scoreEnt(b);
  if (sortBy === "etapa") {
    cmp =
      (stageRank[normalizeCandidaturaStatus(a.status) ?? "inscrito"] ?? -1) -
      (stageRank[normalizeCandidaturaStatus(b.status) ?? "inscrito"] ?? -1);
  }
  if (sortBy === "inscricao") {
    const ta = a.enviado_em ? new Date(a.enviado_em).getTime() : 0;
    const tb = b.enviado_em ? new Date(b.enviado_em).getTime() : 0;
    cmp = ta - tb;
  }
  if (cmp !== 0) return sortDir === "asc" ? cmp : -cmp;

  if (sortBy !== "score_entrevista") {
    const entCmp = scoreEnt(b) - scoreEnt(a);
    if (entCmp !== 0) return entCmp;
  }
  if (sortBy !== "score") {
    const cvCmp = scoreCv(b) - scoreCv(a);
    if (cvCmp !== 0) return cvCmp;
  }
  return a.candidato.nome.localeCompare(b.candidato.nome, "pt");
}

function CandidatosContent() {
  const slug = useClienteSlug()
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const vagaFromQuery = apiVagaFromListQuery(searchParams);
  const skipUrlSync = useRef(false);
  const [loading, setLoading] = useState(true);
  const [noCliente, setNoCliente] = useState(false);
  const [vagasAtivas, setVagasAtivas] = useState<Array<{ id: string; cargo: string; titulo_publicacao?: string | null }>>([]);
  const [rawRows, setRawRows] = useState<CandidatoInscricaoRow[]>([]);
  const [summaryCounts, setSummaryCounts] = useState<SummaryCounts | null>(null);
  const [q, setQ] = useState(CANDIDATOS_LIST_DEFAULTS.q);
  const [selectedVagaIds, setSelectedVagaIds] = useState<string[]>(CANDIDATOS_LIST_DEFAULTS.selectedVagaIds);
  const [selectedTags, setSelectedTags] = useState<string[]>(CANDIDATOS_LIST_DEFAULTS.selectedTags);
  const [statusTodos, setStatusTodos] = useState(CANDIDATOS_LIST_DEFAULTS.statusTodos);
  const [statusKeys, setStatusKeys] = useState<StatusFiltroKey[]>(CANDIDATOS_LIST_DEFAULTS.statusKeys);
  const [kmMax, setKmMax] = useState(CANDIDATOS_LIST_DEFAULTS.kmMax);
  const [sortBy, setSortBy] = useState<SortKey>(CANDIDATOS_LIST_DEFAULTS.sortBy);
  const [sortDir, setSortDir] = useState<"asc" | "desc">(CANDIDATOS_LIST_DEFAULTS.sortDir);
  const [page, setPage] = useState(CANDIDATOS_LIST_DEFAULTS.page);
  const [hasMore, setHasMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const PAGE_SIZE = 100;
  const supabase = useSupabaseBrowser();

  useEffect(() => {
    skipUrlSync.current = true;
    const parsed = parseCandidatosListQuery(searchParams);
    setQ(parsed.q);
    setSelectedVagaIds(parsed.selectedVagaIds);
    setSelectedTags(parsed.selectedTags);
    setStatusTodos(parsed.statusTodos);
    setStatusKeys(parsed.statusKeys);
    setKmMax(parsed.kmMax);
    setSortBy(parsed.sortBy);
    setSortDir(parsed.sortDir);
    setPage(parsed.page);
  }, [searchParams]);

  const listQueryString = useMemo(
    () =>
      serializeCandidatosListQuery({
        q,
        selectedVagaIds,
        selectedTags,
        statusTodos,
        statusKeys,
        kmMax,
        sortBy,
        sortDir,
        page,
      }),
    [q, selectedVagaIds, selectedTags, statusTodos, statusKeys, kmMax, sortBy, sortDir, page]
  );

  useEffect(() => {
    if (skipUrlSync.current) {
      skipUrlSync.current = false;
      return;
    }
    const next = listQueryString;
    const current = searchParams.toString();
    if (next === current) return;
    router.replace(next ? `${pathname}?${next}` : pathname || `/${slug}/candidatos`, { scroll: false });
  }, [listQueryString, pathname, router, searchParams, slug]);
  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const cli = await getClienteBySlug(slug)
      if (!cli?.id) {
        setNoCliente(true);
        setRawRows([]);
        setVagasAtivas([]);
        setHasMore(false);
        setLoading(false);
        return;
      }
      const qs = new URLSearchParams({
        page: String(page),
        pageSize: String(PAGE_SIZE),
      });
      qs.set("clienteSlug", slug);
      const apiVagaId = selectedVagaIds.length === 1 ? selectedVagaIds[0] : vagaFromQuery;
      if (apiVagaId) qs.set("vaga", apiVagaId);
      if (!statusTodos && statusKeys.length > 0) qs.set("status", statusKeys.join(","));
      qs.set("sort", sortBy);
      qs.set("dir", sortDir);
      const headers: HeadersInit = {};
      if (supabase) {
        const { data: sess } = await supabase.auth.getSession();
        const token = sess.session?.access_token;
        if (token) headers.Authorization = `Bearer ${token}`;
      }
      const res = await fetch(`/api/candidatos/list?${qs.toString()}`, {
        cache: "no-store",
        credentials: "include",
        headers,
      });
      const json = (await res.json()) as {
        rows?: CandidatoInscricaoRow[];
        vagasAtivas?: Array<{ id: string; cargo: string; titulo_publicacao?: string | null }>;
        summaryCounts?: SummaryCounts;
        debug?: Record<string, unknown>;
        hasMore?: boolean;
        message?: string;
      };
      if (!res.ok) {
        setNoCliente(res.status === 401);
        setRawRows([]);
        setVagasAtivas([]);
        setSummaryCounts((prev) => (res.status === 401 ? null : prev));
        setHasMore(false);
        setLoadError(json.message ?? "Não foi possível carregar os candidatos.");
        setLoading(false);
        return;
      }
      setNoCliente(false);
      setRawRows(json.rows ?? []);
      setVagasAtivas(json.vagasAtivas ?? []);
      if (json.summaryCounts) setSummaryCounts(json.summaryCounts);
      setHasMore(Boolean(json.hasMore));
      if (json.message && !(json.rows?.length)) setLoadError(json.message);
    } catch {
      setNoCliente(false);
      setRawRows([]);
      setLoadError("Erro de rede ao carregar candidatos.");
      setHasMore(false);
    }
    setLoading(false);
  }, [page, vagaFromQuery, slug, selectedVagaIds, statusTodos, statusKeys, sortBy, sortDir, supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  const availableTags = useMemo(() => {
    return [...ALLOWED_CANDIDATE_TAGS];
  }, []);

  const stageCounts = useMemo(() => {
    if (summaryCounts) return summaryCounts;
    const counts = emptySummaryCounts();
    counts.todos = rawRows.length;
    for (const r of rawRows) {
      const s = normalizeCandidaturaStatus(r.status);
      if (s) counts[s] += 1;
    }
    return counts;
  }, [rawRows, summaryCounts]);
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
    rows = [...rows].sort((a, b) => compareCandidatoRows(a, b, sortBy, sortDir));
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
          onRemove: () => {
            setStatusKeys((prev) => prev.filter((x) => x !== k));
            setPage(1);
          },
        });
      });
    }
    if (kmMax < 50) chips.push({ key: "km", label: `Distância ≤ ${kmMax}km`, onRemove: () => setKmMax(50) });
    return chips;
  }, [q, selectedVagaIds, vagasAtivas, selectedTags, statusTodos, statusKeys, kmMax]);

  function clearAllFilters() {
    setQ("");
    setSelectedVagaIds([]);
    setSelectedTags([]);
    setStatusTodos(true);
    setStatusKeys([]);
    setKmMax(50);
    setPage(1);
  }

  function onSort(key: SortKey) {
    if (sortBy === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortBy(key);
      setSortDir(key === "candidato" ? "asc" : "desc");
    }
  }

  function onStageBoxClick(key: keyof CandidaturaSummaryCounts) {
    if (key === "todos") {
      setStatusTodos(true);
      setStatusKeys([]);
    } else {
      const k = key as CandidaturaStatus;
      if (!statusTodos && statusKeys.length === 1 && statusKeys[0] === k) {
        setStatusTodos(true);
        setStatusKeys([]);
      } else {
        setStatusTodos(false);
        setStatusKeys([k]);
      }
    }
    setPage(1);
  }

  function stageBoxActive(key: keyof CandidaturaSummaryCounts): boolean {
    if (key === "todos") return statusTodos;
    return !statusTodos && statusKeys.includes(key as CandidaturaStatus);
  }

  async function onAction(candidaturaId: string, action: "proxima" | "reprovar" | "desistiu" | "whatsapp", tel: string) {
    if (action === "whatsapp" && tel) {
      const wa = tel.replace(/\D/g, "");
      if (wa) {
        const url = `https://wa.me/${wa.startsWith("55") ? wa : `55${wa}`}`;
        // Safari no iPhone costuma bloquear window.open fora de um toque direto em <a>.
        const w = window.open(url, "_blank", "noopener,noreferrer");
        if (w == null) window.location.assign(url);
      }
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
    const next = nextCandidaturaStatus(row.status);
    if (!next) return;
    await supabase.from("candidaturas").update({ status: next }).eq("id", candidaturaId);
    await load();
  }

  if (loading) return <div className="fs14 c600" style={{ padding: 8 }}>Carregando candidatos…</div>;

  const stageBoxes = CANDIDATURA_FUNIL_BOXES.map((b) => ({
    key: b.key,
    label: b.label,
    n: stageCounts[b.key],
  }));

  return (
    <div style={{ minHeight: "100%" }}>
      <div className="flex aic jsb mb16">
        <Link href={`/${slug}/dashboard`} className="btn btn-ghost btn-sm">← Voltar</Link>
        {!noCliente ? (
          <CandidatosFiltersBar
            vagasAtivas={vagasAtivas}
            selectedVagaIds={selectedVagaIds}
            onChangeVagas={(ids) => {
              setSelectedVagaIds(ids);
              setPage(1);
            }}
            availableTags={availableTags}
            selectedTags={selectedTags}
            onToggleTag={(tag) => setSelectedTags((prev) => (prev.includes(tag) ? prev.filter((x) => x !== tag) : [...prev, tag]))}
            statusTodos={statusTodos}
            statusKeys={statusKeys}
            onChangeStatusTodos={(v) => {
              setStatusTodos(v);
              if (v) setStatusKeys([]);
              setPage(1);
            }}
            onToggleStatusKey={(k) => {
              setStatusTodos(false);
              setStatusKeys((prev) => (prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]));
              setPage(1);
            }}
            kmMax={kmMax}
            onChangeKmMax={setKmMax}
          />
        ) : null}
      </div>

      <div className="stage-boxes mb16">
        {stageBoxes.map((b) => (
          <button
            key={b.key}
            type="button"
            className={`stage-box${stageBoxActive(b.key) ? " active" : ""}`}
            onClick={() => onStageBoxClick(b.key)}
            aria-pressed={stageBoxActive(b.key)}
            aria-label={`Filtrar por ${b.label}: ${b.n}`}
          >
            <div className="stage-box-n">{b.n}</div>
            <div className="stage-box-l">{b.label}</div>
          </button>
        ))}
      </div>
      <div className="stage-summary-mobile mb16">
        {CANDIDATURA_FUNIL_BOXES.filter((b) => b.key !== "reprovado" && b.key !== "desistiu").map((b) => ({
          n: stageCounts[b.key],
          label: b.label,
        })).map((s) => (
          <div key={s.label} className="stage-summary-mobile-item">
            <div className="stage-summary-mobile-n">{s.n}</div>
            <div className="stage-summary-mobile-l">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="search-row">
        <input className="search-input" type="text" placeholder="🔍  Buscar candidatos..." value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <ActiveFilterChips chips={activeChips} onClearAll={clearAllFilters} />

      {noCliente ? <p className="fs13 mb16" style={{ color: "var(--danger-fg)" }}>Faça login para ver candidatos.</p> : null}
      {!noCliente && loadError ? (
        <p className="fs13 mb16" style={{ color: "var(--danger-fg)" }}>{loadError}</p>
      ) : null}
      {!noCliente && kmMax < 50 && !hasDistanceData ? (
        <p className="fs12 c500 mb12">Filtro de distância indisponível agora (ainda não há dados de distância nesta lista).</p>
      ) : null}

      {!noCliente && !tableRows.length ? (
        <div className="card mb16" style={{ background: "var(--warning-bg-soft)", border: "1px solid var(--warning-border-soft)" }}>
          <p className="fs13 c700" style={{ marginBottom: 6 }}>Nenhuma inscrição encontrada para este filtro.</p>
          <p className="fs12 c600" style={{ marginBottom: hasActiveFilters ? 10 : 0 }}>
            Se o status filtrado não existir no banco, o resultado vazio aqui é esperado.
          </p>
          {hasActiveFilters ? (
            <button type="button" className="btn btn-ghost btn-xs" onClick={clearAllFilters}>
              Limpar filtros
            </button>
          ) : null}
        </div>
      ) : null}

      {!noCliente ? (
        <>
          <div className="candidatos-desktop-table card" style={{ padding: 0, overflow: "hidden" }}>
            <div className="table-wrap">
              <table className="eq-table">
                <colgroup>
                  <col style={{ width: "12.5%" }} />
                  <col style={{ width: "12.5%" }} />
                  <col style={{ width: "10%" }} />
                  <col style={{ width: "10%" }} />
                  <col style={{ width: "15%" }} />
                  <col style={{ width: "12.5%" }} />
                  <col style={{ width: "12.5%" }} />
                  <col style={{ width: "15%" }} />
                </colgroup>
                <thead>
                  <tr>
                    <th className="sortable" onClick={() => onSort("candidato")}>Candidato {sortArrow(sortBy, sortDir, "candidato")}</th>
                    <th>Experiência</th>
                    <th
                      className="sortable"
                      title="Score do currículo do candidato (0–100)."
                      onClick={() => onSort("score")}
                    >
                      Score CV {sortArrow(sortBy, sortDir, "score")}
                    </th>
                    <th
                      className="sortable"
                      title="Score da entrevista por WhatsApp (0–100)."
                      onClick={() => onSort("score_entrevista")}
                    >
                      Score Ent {sortArrow(sortBy, sortDir, "score_entrevista")}
                    </th>
                    <th>Tags</th>
                    <th className="sortable" onClick={() => onSort("etapa")}>Etapa {sortArrow(sortBy, sortDir, "etapa")}</th>
                    <th className="sortable" onClick={() => onSort("inscricao")}>Inscrição {sortArrow(sortBy, sortDir, "inscricao")}</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {tableRows.map((r) => {
                    const ep = candidaturaStatusPill(r.status);
                    const dt = r.enviado_em ? new Date(r.enviado_em) : null;
                    const insc = dt && Number.isFinite(dt.getTime()) ? dt.toLocaleDateString("pt-BR") : "—";
                    const mergedTags = tagsDaLinha(r).slice(0, 4);
                    const sc = normalizePercentScore(r.score ?? r.candidato.score);
                    const scEnt = displayScoreEntrevista(r.score_entrevista);
                    const age = idadeDe(r.candidato.data_nascimento ?? null);
                    const loc = [age != null ? `${age}a` : null, cidadeUf(r.candidato.cidade), fmtKm(r.distancia_km)].filter(Boolean).join(" · ");
                    const exp = (r.candidato.exp_resumo?.trim() || "").split(/\n|[;|]/)[0]?.trim() || buildExperienciaResumoLinha(r.candidato) || "—";
                    const nextEtapa = nextLabel(r.status);
                    return (
                      <tr key={r.candidaturaId} style={{ cursor: "pointer" }} onClick={() => router.push(buildCandidatoDetailHref(slug, r.candidato.id, r.vagaId, listQueryString))}>
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
                        <td>{scEnt != null ? <div className={scoreClass(scEnt)}>{Math.round(scEnt)}</div> : <span className="c400">—</span>}</td>
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

          <div className="candidatos-mobile-list">
            {tableRows.map((r) => {
              const ep = candidaturaStatusPill(r.status);
              const mergedTags = tagsDaLinha(r).slice(0, 4);
              const sc = normalizePercentScore(r.score ?? r.candidato.score);
              const scEnt = displayScoreEntrevista(r.score_entrevista);
              const age = idadeDe(r.candidato.data_nascimento ?? null);
              const loc = [age != null ? `${age}a` : null, cidadeUf(r.candidato.cidade), fmtKm(r.distancia_km)].filter(Boolean).join(" · ");
              const nextEtapa = nextLabel(r.status);
              return (
                <div
                  key={`m-${r.candidaturaId}`}
                  className="candidatos-mobile-card"
                  role="button"
                  tabIndex={0}
                  onClick={() => router.push(buildCandidatoDetailHref(slug, r.candidato.id, r.vagaId, listQueryString))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      router.push(buildCandidatoDetailHref(slug, r.candidato.id, r.vagaId, listQueryString));
                    }
                  }}
                >
                  <div className="candidatos-mobile-card-head">
                    <div className="flex aic g8" style={{ minWidth: 0, flex: 1 }}>
                      <div className="av">{initialsFromNome(r.candidato.nome)}</div>
                      <div style={{ minWidth: 0 }}>
                        <div className="fw7" style={{ color: "var(--n900)", fontSize: 15, lineHeight: 1.25 }}>
                          {r.candidato.nome}
                        </div>
                        <div className="cand-loc">{loc || "—"}</div>
                      </div>
                    </div>
                    <div className="flex aic g6">
                      {sc != null ? (
                        <span className={scoreClass(r.score ?? r.candidato.score)} title="Score CV">{Math.round(sc)}</span>
                      ) : (
                        <span className="c400 fs13">—</span>
                      )}
                      {scEnt != null ? (
                        <span className={scoreClass(scEnt)} title="Score Ent">{Math.round(scEnt)}</span>
                      ) : null}
                    </div>
                  </div>
                  <div style={{ marginTop: 10, fontSize: 13, color: "var(--n600)" }}>
                    <strong style={{ color: "var(--n900)" }}>Cargo:</strong> {r.cargo}
                  </div>
                  <div className="tag-row" style={{ marginTop: 8 }}>
                    {mergedTags.map((t) => (
                      <span key={t} className={t === "desempregado" ? "badge b-blue" : "badge b-olive"} style={{ fontSize: 10 }}>
                        {t}
                      </span>
                    ))}
                  </div>
                  <div className="candidatos-mobile-card-footer">
                    <span className={ep.className}>{ep.label}</span>
                    <div onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
                      <select
                        className="search-input candidatos-mobile-acoes-select"
                        defaultValue=""
                        aria-label="Ações do candidato"
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
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      ) : null}

      {!noCliente && !tableRows.length ? <p className="fs13 muted mt16">Nenhuma inscrição encontrada.</p> : null}
      {!noCliente && (tableRows.length > 0 || page > 1) ? (
        <div className="flex aic jsb mt16">
          <p className="fs12 c500">
            Página {currentPage} · {tableRows.length} candidato{tableRows.length === 1 ? "" : "s"}
            {!statusTodos && statusKeys.length > 0 && summaryCounts
              ? ` (filtro: ${statusKeys.map((k) => STATUS_FILTRO_LABELS[k]).join(", ")})`
              : ""}
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
