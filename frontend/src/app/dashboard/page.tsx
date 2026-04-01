"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { ensureClienteForUser, type ClienteEmpresa } from "@/lib/ensureClienteBrowser";
import {
  funnelRowsFromStatuses,
  isNoFunil,
  pctBar,
  vagaPipelineCounts,
} from "@/lib/candidatura-funnel";
import { normalizePercentScore } from "@/lib/score";
import { vagaTituloPublico, vagaUnidadePublica } from "@/lib/vaga-display";

const ATIVAS = ["aberta", "em_selecao"] as const;

function startOfToday(): Date {
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  return t;
}

function startOfMonth(): Date {
  const t = new Date();
  t.setDate(1);
  t.setHours(0, 0, 0, 0);
  return t;
}

function daysAgo(n: number): Date {
  const t = new Date();
  t.setDate(t.getDate() - n);
  t.setHours(0, 0, 0, 0);
  return t;
}

function formatSalario(s: string | number | null | undefined): string | null {
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

/** Sempre em dias (protótipo dashboard). */
function abertaHaDias(criadoEm: string): string {
  const days = Math.max(0, Math.floor((Date.now() - new Date(criadoEm).getTime()) / 86_400_000));
  if (days === 0) return "Aberta hoje";
  return `Aberta há ${days} dias`;
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

function initials(nome: string) {
  const p = nome.trim().split(/\s+/).filter(Boolean);
  if (p.length === 0) return "?";
  if (p.length === 1) return p[0].slice(0, 2).toUpperCase();
  return (p[0][0] + p[p.length - 1][0]).toUpperCase();
}

function cidadeUf(cidade: string | null | undefined): string | null {
  const t = cidade?.trim();
  if (!t) return null;
  if (/,\s*[A-Z]{2}$/.test(t)) return t;
  return t;
}

function etapaPillTop(status: string): { cls: string; label: string } {
  switch (status) {
    case "contratado":
      return { cls: "ep ep-contratado", label: "Contratado" };
    case "reprovado":
      return { cls: "ep ep-reprovado", label: "Reprovado" };
    case "novo":
      return { cls: "ep ep-inscrito", label: "Inscrito" };
    case "em_triagem":
      return { cls: "ep ep-triagem", label: "Triagem" };
    case "em_entrevista":
    case "entrevista":
    case "entrevistado":
      return { cls: "ep ep-entrevista", label: "Entrevista" };
    case "em_teste":
    case "teste":
    case "aprovado":
    case "aprovado_teste":
      return { cls: "ep ep-teste", label: "Teste" };
    default:
      return { cls: "ep ep-inscrito", label: status };
  }
}

function scoreClassCompat(score: number | null): string {
  const n = normalizePercentScore(score);
  if (n == null) return "score";
  if (n >= 70) return "score";
  if (n >= 50) return "score mid";
  return "score low";
}

type CandidaturaRow = {
  candidato_id: string;
  status: string;
  enviado_em: string | null;
  atualizado_em: string | null;
  vaga_id: string;
};

type DashboardVaga = {
  id: string;
  cargo: string;
  titulo_publicacao?: string | null;
  quantidade_vagas?: number | null;
  salario?: string | number | null;
  escala?: string | null;
  horario?: string | null;
  descricao?: string | null;
  unidade?: string | null;
  cliente_unidades?: { nome: string | null } | { nome: string | null }[] | null;
  criado_em: string;
  status_vaga: string;
  candidaturas?: { id: string; status: string; candidato_id?: string }[];
};

type TopRow = {
  id: string;
  candidatoId: string;
  vagaId: string;
  status: string;
  score: number | null;
  distanciaKm: number | null;
  tags: string[] | null;
  nome: string;
  cidade: string | null;
  idade: number | null;
  expResumo: string | null;
  cargoVaga: string;
};

function bestByCandidate(rows: TopRow[]): TopRow[] {
  const byCand = new Map<string, TopRow>();
  for (const r of rows) {
    const prev = byCand.get(r.candidatoId);
    const p = prev?.score ?? -1;
    const n = r.score ?? -1;
    if (!prev || n > p) byCand.set(r.candidatoId, r);
  }
  return [...byCand.values()].sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
}

export default function DashboardPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [cliente, setCliente] = useState<ClienteEmpresa | null>(null);
  const [vagas, setVagas] = useState<DashboardVaga[]>([]);
  const [metrics, setMetrics] = useState({
    vagasAtivas: 0,
    vagasEsteMes: 0,
    candidatosUnicos: 0,
    candidatosHoje: 0,
    contratados: 0,
    contratadosEsteMes: 0,
    tempoMedio: null as string | null,
    tempoSub: null as { text: string; up: boolean } | null,
  });
  const [funnel, setFunnel] = useState<{ label: string; value: number; pct: number; fill: string }[]>([]);
  const [topRows, setTopRows] = useState<TopRow[]>([]);
  const [mobileProfileOpen, setMobileProfileOpen] = useState(false);
  const mobileProfileRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    void (async () => {
      const sb = getSupabaseBrowserClient();
      const { data: s } = await sb.auth.getSession();
      if (!s.session?.user) {
        setLoading(false);
        return;
      }
      const cli = await ensureClienteForUser(sb, s.session.user);
      setCliente(cli);
      if (!cli?.id) {
        setLoading(false);
        return;
      }

      const today = startOfToday();
      const monthStart = startOfMonth();
      const d30 = daysAgo(30);
      const d60 = daysAgo(60);

      const { data: vagasBaseRows } = await sb
        .from("vagas")
        .select("id,status_vaga,criado_em")
        .eq("cliente_id", cli.id);
      const vagasBase = (vagasBaseRows as Array<{ id: string; status_vaga: string; criado_em: string }> | null) ?? [];
      const allVagaIds = vagasBase.map((r) => r.id);
      const activeIds = vagasBase.filter((r) => ATIVAS.includes(r.status_vaga as (typeof ATIVAS)[number])).map((r) => r.id);
      const vagasEsteMes = vagasBase.filter(
        (r) => ATIVAS.includes(r.status_vaga as (typeof ATIVAS)[number]) && new Date(r.criado_em) >= monthStart
      ).length;

      const [vdRes, crRes] = await Promise.all([
        sb
          .from("vagas")
          .select(
            "id, cargo, titulo_publicacao, quantidade_vagas, salario, escala, horario, descricao, unidade, cliente_unidades(nome), criado_em, status_vaga, candidaturas(id,status,candidato_id)"
          )
          .eq("cliente_id", cli.id)
          .in("status_vaga", [...ATIVAS])
          .order("criado_em", { ascending: false }),
        allVagaIds.length
          ? sb
              .from("candidaturas")
              .select("candidato_id,status,enviado_em,atualizado_em,vaga_id")
              .in("vaga_id", allVagaIds)
          : Promise.resolve({ data: [] as CandidaturaRow[] }),
      ]);

      setVagas((vdRes.data as DashboardVaga[]) ?? []);
      const candidaturas = (crRes.data as CandidaturaRow[]) ?? [];

      const activeSet = new Set(activeIds);
      const onActive = candidaturas.filter((c) => activeSet.has(c.vaga_id));
      const inscritosBase = onActive.filter((c) => isNoFunil(c.status));
      const candidatosUnicos = inscritosBase.length;
      const candidatosHoje = inscritosBase.filter((c) => c.enviado_em && new Date(c.enviado_em) >= today).length;

      const contratados = candidaturas.filter((c) => c.status === "contratado").length;
      const contratadosEsteMes = candidaturas.filter(
        (c) =>
          c.status === "contratado" &&
          c.atualizado_em &&
          new Date(c.atualizado_em) >= monthStart
      ).length;

      const funnelSlice = inscritosBase;
      const rowsF = funnelRowsFromStatuses(funnelSlice.map((c) => c.status));
      const base = rowsF[0]?.value ?? 0;
      const funnelBuilt = rowsF.map((r, i) => {
        const pct = i === 0 ? (base > 0 ? 100 : 0) : pctBar(r.value, base);
        const fill =
          i === 0 ? "var(--gray-900)" : i === rowsF.length - 1 ? "var(--berry)" : "var(--olive)";
        return { label: r.label, value: r.value, pct, fill };
      });
      setFunnel(funnelBuilt);

      const hired = candidaturas.filter((c) => c.status === "contratado");
      const vagaIdsHired = [...new Set(hired.map((h) => h.vaga_id))];
      let tempoMedio: string | null = null;
      let tempoSub: { text: string; up: boolean } | null = null;
      if (vagaIdsHired.length > 0) {
        const vagaCriado = new Map(vagasBase.map((v) => [v.id, v.criado_em]));
        const daysList: number[] = [];
        const recent: number[] = [];
        const prev: number[] = [];
        for (const h of hired) {
          const open = vagaCriado.get(h.vaga_id);
          const close = h.atualizado_em;
          if (!open || !close) continue;
          const d = (new Date(close).getTime() - new Date(open).getTime()) / 86_400_000;
          if (!Number.isFinite(d) || d < 0) continue;
          daysList.push(d);
          const tClose = new Date(close);
          if (tClose >= d30) recent.push(d);
          if (tClose < d30 && tClose >= d60) prev.push(d);
        }
        if (daysList.length > 0) {
          tempoMedio = (daysList.reduce((a, b) => a + b, 0) / daysList.length).toFixed(1);
        }
        if (recent.length > 0 && prev.length > 0) {
          const aR = recent.reduce((a, b) => a + b, 0) / recent.length;
          const aP = prev.reduce((a, b) => a + b, 0) / prev.length;
          const diff = aR - aP;
          if (Math.abs(diff) >= 0.05) {
            tempoSub =
              diff < 0
                ? { text: `↓ ${Math.abs(diff).toFixed(1)} dias vs período anterior`, up: true }
                : { text: `↑ ${diff.toFixed(1)} dias vs período anterior`, up: false };
          }
        }
      }

      setMetrics({
        vagasAtivas: activeIds.length,
        vagasEsteMes,
        candidatosUnicos,
        candidatosHoje,
        contratados,
        contratadosEsteMes,
        tempoMedio,
        tempoSub,
      });

      let tops: TopRow[] = [];
      try {
        const res = await fetch("/api/candidatos/list?page=1&pageSize=80", { cache: "default" });
        if (res.ok) {
          const json = (await res.json()) as {
            rows?: Array<{
              candidaturaId: string;
              candidato: { id: string; nome: string; cidade?: string | null; data_nascimento?: string | null; exp_resumo?: string | null };
              vagaId: string;
              status: string;
              score?: number | null;
              distancia_km?: number | null;
              tags?: string[] | null;
              cargo: string;
            }>;
          };
          tops = (json.rows ?? [])
            .filter((r) => r.status !== "reprovado" && r.status !== "desistiu")
            .map((r) => ({
              id: r.candidaturaId,
              candidatoId: r.candidato.id,
              vagaId: r.vagaId,
              status: r.status,
              score: r.score ?? null,
              distanciaKm: r.distancia_km ?? null,
              tags: Array.isArray(r.tags) ? r.tags : null,
              nome: r.candidato.nome ?? "—",
              cidade: r.candidato.cidade ?? null,
              idade: idadeDe(r.candidato.data_nascimento ?? null),
              expResumo: r.candidato.exp_resumo ?? null,
              cargoVaga: r.cargo ?? "—",
            }));
        }
      } catch {
        tops = [];
      }
      setTopRows(bestByCandidate(tops).slice(0, 5));

      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    if (!mobileProfileOpen) return;
    const onPointerDown = (ev: MouseEvent | TouchEvent) => {
      const target = ev.target as Node | null;
      if (!target || !mobileProfileRef.current) return;
      if (!mobileProfileRef.current.contains(target)) setMobileProfileOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
    };
  }, [mobileProfileOpen]);

  async function onMobileLogout() {
    const sb = getSupabaseBrowserClient();
    await sb.auth.signOut();
    router.push("/login");
  }

  const metricCards = [
    {
      label: "Vagas ativas",
      value: String(metrics.vagasAtivas),
      sub: `↑ ${metrics.vagasEsteMes} este mês`,
      subClass: "metric-up",
    },
    {
      label: "Candidatos",
      value: String(metrics.candidatosUnicos),
      sub: `↑ ${metrics.candidatosHoje} hoje`,
      subClass: "metric-up",
    },
    {
      label: "Contratados",
      value: String(metrics.contratados),
      sub: `↑ ${metrics.contratadosEsteMes} este mês`,
      subClass: "metric-up",
    },
    {
      label: "Tempo médio",
      value: metrics.tempoMedio != null ? `${metrics.tempoMedio} dias` : "—",
      sub: metrics.tempoSub?.text ?? "desde abrir a vaga até contratar",
      subClass: metrics.tempoSub ? (metrics.tempoSub.up ? "metric-up" : "metric-dn") : "",
    },
  ];

  if (loading) {
    return <div style={{ padding: 32, color: "var(--gray-500)", fontSize: 14 }}>Carregando…</div>;
  }

  if (!cliente?.id) {
    return (
      <div style={{ padding: 32, color: "var(--gray-500)", fontSize: 14 }}>
        Associe um cliente à sua conta para ver o painel.
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100%" }}>
      <section className="dash-mobile">
        <div className="dash-mobile-header">
          <Link href="/dashboard" className="dash-mobile-logo-link" aria-label="Ir para Início">
            <Image src="/branding/logo-gege-purple-transparent.png" alt="" width={118} height={34} className="dash-mobile-logo" />
          </Link>
          <div className="dash-mobile-profile-wrap" ref={mobileProfileRef}>
            <button type="button" className="dash-mobile-brand" onClick={() => setMobileProfileOpen((v) => !v)}>
              <span className="dash-mobile-brand-avatar">
                {((cliente.nome_contato?.trim().slice(0, 2) || "Gi").replace(/\s+/g, "").slice(0, 2) || "Gi").toUpperCase()}
              </span>
              <span className="dash-mobile-brand-copy">
                <span className="dash-mobile-brand-person">{cliente.nome_contato?.trim() || "Recrutador"}</span>
                <span className="dash-mobile-brand-company">{cliente.nome_empresa?.trim() || "Cliente"}</span>
              </span>
            </button>
            {mobileProfileOpen ? (
              <div className="dash-mobile-profile-menu">
                <button
                  type="button"
                  className="dash-mobile-profile-item"
                  onClick={() => {
                    setMobileProfileOpen(false);
                    router.push("/configuracoes");
                  }}
                >
                  Configurações
                </button>
                <button type="button" className="dash-mobile-profile-item dash-mobile-profile-item-danger" onClick={onMobileLogout}>
                  Logout
                </button>
              </div>
            ) : null}
          </div>
        </div>

        <div className="grid-4 dash-mobile-metrics">
          {metricCards.map((m, i) => (
            <div key={`m-${i}`} className="metric">
              <div className="metric-label" style={{ textTransform: "none", letterSpacing: 0, fontSize: 13, color: "var(--n600)" }}>
                {m.label}
              </div>
              <div className="metric-value" style={{ color: "var(--n900)" }}>
                {m.value}
              </div>
              <div className={`metric-sub ${m.subClass}`.trim()}>{m.sub}</div>
            </div>
          ))}
        </div>

        <div className="dash-mobile-section card">
          <div className="dash-mobile-section-head">
            <h2>Vagas</h2>
            <Link href="/vagas/nova" className="dash-mobile-new-btn">+ Nova Vaga</Link>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {vagas.slice(0, 3).map((v) => {
              const cands = v.candidaturas ?? [];
              const { inscritos, triados, entrevistados, testados } = vagaPipelineCounts(cands);
              const sal = formatSalario(v.salario);
              const uni = vagaUnidadePublica(v);
              const meta = [sal, v.escala?.trim() || null, v.horario?.trim() || null].filter(Boolean) as string[];
              return (
                <Link key={`mv-${v.id}`} href={`/candidatos?vaga=${v.id}`} className="dash-mobile-job-card">
                  <div style={{ fontWeight: 700, fontSize: 15, color: "var(--gray-900)", marginBottom: 6 }}>{vagaTituloPublico(v)}</div>
                  {uni ? (
                    <div style={{ fontSize: 12, color: "var(--gray-500)", marginBottom: 6 }}>{uni}</div>
                  ) : null}
                  <div style={{ fontSize: 12, color: "var(--gray-500)", marginBottom: 12, lineHeight: 1.5 }}>{meta.join(" · ")}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                    <span className="ep ep-inscrito" style={{ background: "var(--gray-900)", color: "white" }}>Nova</span>
                    <span style={{ fontSize: 12, color: "var(--gray-400)" }}>{abertaHaDias(v.criado_em)}</span>
                  </div>
                  <div style={{ display: "flex", gap: 8, paddingTop: 12, borderTop: "1px solid var(--n200)" }}>
                    {[
                      ["inscritos", inscritos],
                      ["triados", triados],
                      ["entrevista", entrevistados],
                      ["teste", testados],
                    ].map(([lbl, val]) => (
                      <div key={String(lbl)} style={{ flex: 1, textAlign: "center" }}>
                        <div style={{ fontSize: 18, fontWeight: 800, color: "var(--gray-900)", lineHeight: 1 }}>{val}</div>
                        <div style={{ marginTop: 6, fontSize: 10, color: "var(--gray-400)", textTransform: "uppercase", letterSpacing: "0.04em", fontWeight: 600 }}>
                          {lbl}
                        </div>
                      </div>
                    ))}
                  </div>
                </Link>
              );
            })}
            {vagas.length === 0 ? <p style={{ fontSize: 13, color: "var(--n500)", margin: 0 }}>Nenhuma vaga ativa.</p> : null}
          </div>
          <div className="dash-mobile-vagas-footer">
            <Link href="/vagas" className="dash-mobile-link">Ver todas</Link>
          </div>
        </div>

        <div className="dash-mobile-section card" style={{ marginBottom: 110 }}>
          <div className="dash-mobile-section-head">
            <h2>Top candidatos</h2>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {topRows.length === 0 ? (
              <div className="card-sm" style={{ fontSize: 13, color: "var(--n500)" }}>
                Nenhuma candidatura da empresa.
              </div>
            ) : (
              topRows.map((r) => {
                const ep = etapaPillTop(r.status);
                const loc = [r.idade != null ? `${r.idade}a` : null, cidadeUf(r.cidade), r.distanciaKm != null ? `${r.distanciaKm}km` : null]
                  .filter(Boolean)
                  .join(" · ");
                const sc = normalizePercentScore(r.score);
                return (
                  <Link key={`tc-${r.id}`} href={`/candidatos/${r.candidatoId}?vaga=${encodeURIComponent(r.vagaId)}`} className="dash-mobile-cand-card card-sm">
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div className="av">{initials(r.nome)}</div>
                        <div>
                          <div style={{ fontWeight: 700, color: "var(--n900)" }}>{r.nome}</div>
                          <div className="cand-loc">{loc || "—"}</div>
                        </div>
                      </div>
                      <span className={scoreClassCompat(r.score)}>{sc != null ? Math.round(sc) : "—"}</span>
                    </div>
                    <div style={{ marginTop: 10, fontSize: 13, color: "var(--n600)" }}>
                      <strong style={{ color: "var(--n900)" }}>Vaga:</strong> {r.cargoVaga}
                    </div>
                    <div className="tag-row">
                      {(r.tags ?? []).slice(0, 4).map((t) => (
                        <span key={`${r.id}-${t}`} className="badge b-olive" style={{ fontSize: 10 }}>
                          {t}
                        </span>
                      ))}
                    </div>
                    <div style={{ marginTop: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span className={ep.cls}>{ep.label}</span>
                      <span style={{ fontSize: 13, color: "var(--n600)", textDecoration: "underline", textUnderlineOffset: 3 }}>Ver candidato →</span>
                    </div>
                  </Link>
                );
              })
            )}
          </div>
          <div className="dash-mobile-vagas-footer">
            <Link href="/candidatos" className="dash-mobile-link">Ver todos</Link>
          </div>
        </div>
      </section>

      <section className="dash-desktop">
        <div className="grid-4" style={{ marginBottom: 24 }}>
          {metricCards.map((m, i) => (
            <div key={i} className="metric">
              <div className="metric-label">{m.label}</div>
              <div className="metric-value" style={{ color: "var(--gray-900)" }}>
                {m.value}
              </div>
              <div className={`metric-sub ${m.subClass}`.trim()}>{m.sub}</div>
            </div>
          ))}
        </div>

        <div className="grid-2" style={{ marginBottom: 24, gap: 20 }}>
          <div className="card">
            <div style={{ fontWeight: 700, fontSize: 15, color: "var(--gray-900)", marginBottom: 20 }}>
              Funil
            </div>
            {funnel.map((s, i) => (
              <div key={i} className="funnel-row" style={{ marginBottom: 14 }}>
                <div className="funnel-label" style={{ minWidth: 100 }}>
                  {s.label}
                </div>
                <div
                  style={{
                    flex: 1,
                    height: 8,
                    borderRadius: 99,
                    background: "var(--gray-200)",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      height: 8,
                      borderRadius: 99,
                      width: `${s.pct}%`,
                      background: s.fill,
                      minWidth: s.pct > 0 ? 4 : 0,
                      transition: "width 0.25s ease",
                    }}
                  />
                </div>
                <div className="funnel-n" style={{ minWidth: 36 }}>
                  {s.value}
                </div>
              </div>
            ))}
          </div>

          <div className="card">
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 16,
              }}
            >
              <div style={{ fontWeight: 700, fontSize: 15, color: "var(--gray-900)" }}>Vagas</div>
              <Link href="/vagas" className="btn btn-ghost btn-sm" style={{ fontWeight: 600 }}>
                Ver todas →
              </Link>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {vagas.slice(0, 3).map((v) => {
                const cands = v.candidaturas ?? [];
                const { inscritos, triados, entrevistados, testados } = vagaPipelineCounts(cands);
                const sal = formatSalario(v.salario);
                const uni = vagaUnidadePublica(v);
                const meta = [sal, v.escala?.trim() || null, v.horario?.trim() || null, abertaHaDias(v.criado_em)].filter(
                  Boolean
                ) as string[];
                return (
                  <Link
                    key={v.id}
                    href={`/candidatos?vaga=${v.id}`}
                    style={{
                      display: "block",
                      borderRadius: 12,
                      padding: 16,
                      border: "1px solid var(--gray-200)",
                      textDecoration: "none",
                      color: "inherit",
                    }}
                  >
                    <div style={{ fontWeight: 700, fontSize: 15, color: "var(--gray-900)", marginBottom: 4 }}>
                      {vagaTituloPublico(v)}
                    </div>
                    {uni ? (
                      <div style={{ fontSize: 12, color: "var(--gray-500)", marginBottom: 10 }}>{uni}</div>
                    ) : (
                      <div style={{ marginBottom: 10 }} />
                    )}
                    <div style={{ fontSize: 12, color: "var(--gray-500)", marginBottom: 12, lineHeight: 1.5 }}>
                      {meta.join(" · ")}
                    </div>
                    <div
                      style={{
                        display: "flex",
                        gap: 16,
                        paddingTop: 12,
                        borderTop: "1px solid var(--gray-100)",
                      }}
                    >
                      {[
                        ["inscritos", inscritos],
                        ["triados", triados],
                        ["entrevistados", entrevistados],
                        ["testados", testados],
                      ].map(([lbl, val]) => (
                        <div key={String(lbl)} style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 18, fontWeight: 800, color: "var(--gray-900)" }}>{val}</div>
                          <div
                            style={{
                              fontSize: 10,
                              color: "var(--gray-400)",
                              textTransform: "uppercase",
                              letterSpacing: "0.06em",
                              fontWeight: 600,
                            }}
                          >
                            {lbl}
                          </div>
                        </div>
                      ))}
                    </div>
                  </Link>
                );
              })}
              {vagas.length === 0 ? (
                <p style={{ fontSize: 13, color: "var(--gray-500)", margin: 0 }}>Nenhuma vaga ativa.</p>
              ) : null}
            </div>
          </div>
        </div>

        <div className="card">
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 8,
            }}
          >
            <div style={{ fontWeight: 700, fontSize: 15, color: "var(--gray-900)" }}>Top candidatos</div>
            <Link href="/candidatos" className="btn btn-ghost btn-sm" style={{ fontWeight: 600 }}>
              Ver todos →
            </Link>
          </div>
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
                  <th>Candidato</th>
                  <th>Vaga</th>
                  <th>Experiência</th>
                  <th style={{ textAlign: "center" }} title="Score IA do currículo (0–100)">
                    Score IA
                  </th>
                  <th>Tags</th>
                  <th>Etapa</th>
                  <th style={{ width: 72 }} />
                </tr>
              </thead>
              <tbody>
                {topRows.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ color: "var(--gray-500)", fontSize: 13 }}>
                      Nenhuma candidatura da empresa. Inscreva candidatos ou associe candidatos a vagas no Supabase.
                    </td>
                  </tr>
                ) : (
                  topRows.map((r) => {
                    const ep = etapaPillTop(r.status);
                    const loc =
                      [r.idade != null ? `${r.idade}a` : null, cidadeUf(r.cidade), r.distanciaKm != null ? `${r.distanciaKm}km` : null]
                        .filter(Boolean)
                        .join(" · ");
                    const sc = normalizePercentScore(r.score);
                    return (
                      <tr key={r.id}>
                        <td>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <div className="av">{initials(r.nome)}</div>
                            <div>
                              <div style={{ fontWeight: 600, color: "var(--gray-900)" }}>{r.nome}</div>
                              <div className="cand-loc">{loc}</div>
                            </div>
                          </div>
                        </td>
                        <td>{r.cargoVaga}</td>
                        <td style={{ maxWidth: 220, fontSize: 12, color: "var(--gray-600)" }}>
                          {r.expResumo?.trim() || "—"}
                        </td>
                        <td style={{ textAlign: "center" }}>
                          {sc != null ? <span className={scoreClassCompat(r.score)}>{Math.round(sc)}</span> : "—"}
                        </td>
                        <td>
                          <div className="tag-row">
                            {(r.tags ?? []).slice(0, 4).map((t) => (
                              <span key={t} className="badge b-olive" style={{ fontSize: 10 }}>
                                {t}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td>
                          <span className={ep.cls}>{ep.label}</span>
                        </td>
                        <td>
                          <Link
                            href={`/candidatos/${r.candidatoId}?vaga=${encodeURIComponent(r.vagaId)}`}
                            className="btn btn-ghost btn-xs"
                            onClick={(e) => e.stopPropagation()}
                          >
                            Ver
                          </Link>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
