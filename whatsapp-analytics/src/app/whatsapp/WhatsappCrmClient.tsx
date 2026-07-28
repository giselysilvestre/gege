"use client";

import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import type {
  CrmCandidatoRow,
  CrmDashboard,
  CrmMetrics,
  CrmViewId,
  EtapaFunil,
  VagaOption,
  WhatsappMessage,
} from "@/lib/crm/types";
import {
  ETAPA_LABELS,
  FUNIL_PRINCIPAL,
  FUNIL_SAIDAS,
  MOTIVOS_REPROVACAO,
} from "@/lib/crm/types";
import {
  avatarClass,
  iniciais,
  formatHoraMsg,
  formatDiaConversa,
  formatLocalizacao,
  chaveDiaConversa,
  tempoRelativo,
  truncar,
  formatKanbanCardTime,
  isMensagemManualCrm,
  candidatoMatchBusca,
  dentroJanela24h,
  diasSemResposta,
} from "@/lib/crm/format";
import { buildMetricsFromRows } from "@/lib/crm/metricsClient";
import { nomePrimeiroUltimo, primeiroNome, labelTag } from "@/lib/crm";
import { formatMensagemExibicao } from "@/lib/crm/formatMensagem";
import { proximaEtapaFunil } from "@/lib/crm/mapEtapa";
import {
  MODELOS_MENSAGEM_ACAO,
  modeloPorMotivoReprovacao,
  previewMensagemAcao,
  type ModeloMensagemAcao,
} from "@/lib/crm/mensagens-acao";
import {
  formatDetalhesLoteCopiar,
  linhaContatoCopiar,
} from "@/lib/crm/experiencia";

import CrmSidebar from "@/components/crm/CrmSidebar";
import { CandidatoCvResumoToggle } from "@/components/crm/CandidatoCvResumoToggle";
import VisaoGeralDashboard from "@/components/crm/VisaoGeralDashboard";

type ViewId = CrmViewId;

const VIEW_LABELS: Record<ViewId, string> = {
  kanban: "Pipelines",
  conversas: "Conversas",
  funil: "Visão Geral",
  alertas: "Alertas",
};

const CRM_USER = process.env.NEXT_PUBLIC_CRM_USER ?? "gsilvestre";

function previewListaMsg(row: CrmCandidatoRow): string {
  if (row.ultima_mensagem?.trim()) {
    const texto = formatMensagemExibicao(row.ultima_mensagem.trim());
    const quem =
      row.ultima_direcao === "outbound"
        ? "Ana"
        : primeiroNome(row.candidato_nome);
    return truncar(`${quem}: ${texto}`, 72);
  }
  if (!row.ultima_data) return "Sem mensagens";
  return "";
}

function IconFilter() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden="true">
      <path
        d="M4 6h16M7 12h10M10 18h4"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconComposerReorder() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
      <path d="M8 9l-3 3 3 3M16 9l3 3-3 3" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconComposerDoc() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
      <path
        d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      <path d="M14 3v5h5" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" />
    </svg>
  );
}

function IconComposerMic() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
      <path
        d="M12 14a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v5a3 3 0 0 0 3 3Z"
        stroke="currentColor"
        strokeWidth="1.75"
      />
      <path d="M19 10v1a7 7 0 0 1-14 0v-1M12 18v3" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

function IconSend() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
      <path
        d="m5 12 14-7-7 14 2-5 5-2Z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconRobot({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      width="12"
      height="12"
      fill="none"
      aria-hidden="true"
    >
      <rect x="5" y="8" width="14" height="11" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M9 5V8M15 5V8M12 5V8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="9.5" cy="13" r="1" fill="currentColor" />
      <circle cx="14.5" cy="13" r="1" fill="currentColor" />
      <path d="M10 17h4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function IconHuman({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      width="12"
      height="12"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="12" cy="8" r="3" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M6 19c0-3.3 2.7-6 6-6s6 2.7 6 6"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

const ABERTAS_STORAGE_KEY = "gege-crm-conversas-abertas";

function loadConversasAbertas(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(ABERTAS_STORAGE_KEY);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}

function saveConversasAbertas(ids: Set<string>) {
  localStorage.setItem(ABERTAS_STORAGE_KEY, JSON.stringify([...ids]));
}

function listaStatusClass(etapa: CrmCandidatoRow["etapa_funil"]) {
  return `lista-status-${etapa.replace(/_/g, "-")}`;
}

function crmUserInitials(username: string) {
  const clean = username.replace(/[^a-zA-Z0-9]/g, " ").trim();
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return clean.slice(0, 2).toUpperCase() || "U";
}

function IconPanelLeft() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
      <rect x="4" y="5" width="16" height="14" rx="2" stroke="currentColor" strokeWidth="1.75" />
      <path d="M9 5v14" stroke="currentColor" strokeWidth="1.75" />
    </svg>
  );
}

function IconSun() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.75" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

function IconMoon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
      <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4 7 7 0 1 0 20 14.5Z" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" />
    </svg>
  );
}

const ETAPA_ORDEM: Record<EtapaFunil, number> = {
  abordado: 0,
  respondeu: 1,
  interessado: 2,
  qualificado: 3,
  encaminhado: 4,
  contratado: 5,
  reprovado: 6,
  desistiu: 7,
  inativo: 8,
};

type SortKey = "score_cv" | "recente" | "score_entrevista" | "etapa";

function timestampRecente(row: CrmCandidatoRow): number {
  let max = 0;
  for (const d of [
    row.ultima_data,
    row.sessao_atualizado_em,
    row.candidatura_atualizado_em,
    row.sessao_criado_em,
  ]) {
    if (!d) continue;
    const t = Date.parse(d);
    if (!Number.isNaN(t)) max = Math.max(max, t);
  }
  return max;
}

function cmpScore(
  av: number | null | undefined,
  bv: number | null | undefined,
  a: CrmCandidatoRow,
  b: CrmCandidatoRow
): number {
  if (av == null && bv == null) {
    return a.candidato_nome.localeCompare(b.candidato_nome, "pt-BR");
  }
  if (av == null) return 1;
  if (bv == null) return -1;
  const diff = bv - av;
  return diff !== 0 ? diff : a.candidato_nome.localeCompare(b.candidato_nome, "pt-BR");
}

function sortCandidatos(list: CrmCandidatoRow[], sortBy: SortKey): CrmCandidatoRow[] {
  return [...list].sort((a, b) => {
    if (sortBy === "score_cv") {
      return cmpScore(a.score_cv, b.score_cv, a, b);
    }
    if (sortBy === "score_entrevista") {
      return cmpScore(a.score_entrevista, b.score_entrevista, a, b);
    }
    if (sortBy === "etapa") {
      const diff = (ETAPA_ORDEM[a.etapa_funil] ?? 99) - (ETAPA_ORDEM[b.etapa_funil] ?? 99);
      return diff !== 0 ? diff : timestampRecente(b) - timestampRecente(a);
    }
    const diff = timestampRecente(b) - timestampRecente(a);
    return diff !== 0 ? diff : a.candidato_nome.localeCompare(b.candidato_nome, "pt-BR");
  });
}

/** Bump quando mudar o shape de CrmCandidatoRow (invalida cache em memória). */
const CRM_CACHE_SCHEMA = 9;

type CrmCacheEntry = {
  schema: number;
  rows: CrmCandidatoRow[];
  metrics: CrmMetrics;
  dashboard: CrmDashboard;
  vagas: VagaOption[];
  activity?: boolean;
};

const crmCacheKey = (clienteId: string, vagaId: string) =>
  `${clienteId || "__all__"}|${vagaId || "__all__"}`;

function prefetchMessages(sessaoId: string, cache: Map<string, WhatsappMessage[]>) {
  if (cache.has(sessaoId)) return;
  const params = new URLSearchParams({ sessionId: sessaoId, messagesOnly: "1" });
  fetch(`/api/whatsapp/crm?${params}`, { cache: "no-store" })
    .then((r) => r.json())
    .then((j) => {
      if (j.mensagens) cache.set(sessaoId, j.mensagens);
    })
    .catch(() => {});
}

function ListaSkeleton() {
  return (
    <div className="lista-items lista-skeleton" aria-hidden="true">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="lista-item lista-item-skeleton">
          <div className="skeleton skeleton-avatar" />
          <div className="lista-info">
            <div className="skeleton skeleton-line skeleton-line-md" />
            <div className="skeleton skeleton-line skeleton-line-lg" />
            <div className="skeleton skeleton-line skeleton-line-sm" />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState({
  title,
  hint,
}: {
  title: string;
  hint?: string;
}) {
  return (
    <div className="empty-state">
      <div className="empty-state-icon" aria-hidden="true">
        ◌
      </div>
      <p className="empty-state-title">{title}</p>
      {hint && <p className="empty-state-hint">{hint}</p>}
    </div>
  );
}

export default function WhatsappCrmClient({
  initialView = "conversas",
}: {
  initialView?: ViewId;
}) {
  const router = useRouter();
  const [view, setView] = useState<ViewId>(initialView);
  const [clienteId, setClienteId] = useState<string>("");
  const [vagaId, setVagaId] = useState<string>("");
  const [vagas, setVagas] = useState<VagaOption[]>([]);
  const [rows, setRows] = useState<CrmCandidatoRow[]>([]);
  const [metrics, setMetrics] = useState<CrmMetrics | null>(null);
  const [dashboard, setDashboard] = useState<CrmDashboard | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [mensagens, setMensagens] = useState<WhatsappMessage[]>([]);
  const [loadingCrm, setLoadingCrm] = useState(true);
  const [refreshingCrm, setRefreshingCrm] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [messagesSessaoId, setMessagesSessaoId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const messagesCache = useRef<Map<string, WhatsappMessage[]>>(new Map());
  const crmCache = useRef<Map<string, CrmCacheEntry>>(new Map());
  const pinnedRowRef = useRef<CrmCandidatoRow | null>(null);
  const loadCrmGen = useRef(0);
  const loadMsgGen = useRef(0);
  const prevVagaRef = useRef(vagaId);
  const prevClienteRef = useRef(clienteId);

  const selectSessao = useCallback((sessaoId: string | null, row?: CrmCandidatoRow | null) => {
    if (row) pinnedRowRef.current = row;
    else if (!sessaoId) pinnedRowRef.current = null;
    setSelected(sessaoId);
  }, []);
  const [filtroEtapa, setFiltroEtapa] = useState<EtapaFunil | "">("");
  const [filtroFavoritos, setFiltroFavoritos] = useState(false);
  const [buscaNome, setBuscaNome] = useState("");
  const [sortBy, setSortBy] = useState<SortKey>("recente");
  const [filtrosOpen, setFiltrosOpen] = useState(false);
  const [msgInput, setMsgInput] = useState("");
  const [enviandoMsg, setEnviandoMsg] = useState(false);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [dragSessaoId, setDragSessaoId] = useState<string | null>(null);
  const [dropEtapa, setDropEtapa] = useState<EtapaFunil | null>(null);
  const [manualSendEnabled, setManualSendEnabled] = useState<boolean | null>(null);
  const [alertas, setAlertas] = useState<
    {
      id: string;
      tipo: string;
      sessao_id: string | null;
      titulo: string;
      detalhe: string | null;
      candidato_nome?: string | null;
    }[]
  >([]);
  const [alertasResumo, setAlertasResumo] = useState<{
    sem_resposta_ana_1h?: number;
    sem_resposta_gege_24h?: number;
    entrevista_marcada?: number;
  } | null>(null);
  const [modal, setModal] = useState<
    | "reprovar"
    | "mover_vaga"
    | "mover_etapa_lote"
    | "resumo_lote"
    | "copiar_contatos"
    | "copiar_shortlist"
    | "desistir"
    | "encaminhar"
    | "avancar"
    | "mandar_mensagem"
    | null
  >(null);
  const [motivoReprovar, setMotivoReprovar] = useState("");
  const [vagaDestinoMovido, setVagaDestinoMovido] = useState("");
  const [etapaDestinoLote, setEtapaDestinoLote] = useState<EtapaFunil | "">("");
  const [enviarMsgMovido, setEnviarMsgMovido] = useState(false);
  const [enviarMsgAcao, setEnviarMsgAcao] = useState(false);
  const [modeloMensagemManual, setModeloMensagemManual] = useState<ModeloMensagemAcao | "">("");
  const [bulkProcessing, setBulkProcessing] = useState(false);
  const [checkedIds, setCheckedIds] = useState<string[]>([]);
  const [multiselectMode, setMultiselectMode] = useState(false);
  const [listaMenuOpen, setListaMenuOpen] = useState(false);
  const [bulkMenuOpen, setBulkMenuOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [menuAcoesOpen, setMenuAcoesOpen] = useState(false);
  const [conversasAbertas, setConversasAbertas] = useState<Set<string>>(() => new Set());
  const threadRef = useRef<HTMLDivElement>(null);
  const filtrosRef = useRef<HTMLDivElement>(null);
  const listaMenuRef = useRef<HTMLDivElement>(null);
  const bulkMenuRef = useRef<HTMLDivElement>(null);
  const acoesMenuRef = useRef<HTMLDivElement>(null);
  const favoritoOverridesRef = useRef(new Map<string, boolean>());

  const mergeFavoritoOverrides = useCallback((list: CrmCandidatoRow[]) => {
    const overrides = favoritoOverridesRef.current;
    if (overrides.size === 0) return list;
    return list.map((r) => {
      const override = overrides.get(r.sessao_id);
      if (override === undefined) return r;
      if (r.favorito_crm === override) overrides.delete(r.sessao_id);
      return { ...r, favorito_crm: override };
    });
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem("gege-crm-theme");
    if (saved === "dark" || saved === "light") setTheme(saved);
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("gege-crm-theme", theme);
  }, [theme]);

  useEffect(() => {
    if (!filtrosOpen) return;
    function onDocClick(e: MouseEvent) {
      if (filtrosRef.current && !filtrosRef.current.contains(e.target as Node)) {
        setFiltrosOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [filtrosOpen]);

  useEffect(() => {
    if (!menuAcoesOpen) return;
    function onDocClick(e: MouseEvent) {
      if (acoesMenuRef.current && !acoesMenuRef.current.contains(e.target as Node)) {
        setMenuAcoesOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [menuAcoesOpen]);

  useEffect(() => {
    if (!listaMenuOpen) return;
    function onDocClick(e: MouseEvent) {
      if (listaMenuRef.current && !listaMenuRef.current.contains(e.target as Node)) {
        setListaMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [listaMenuOpen]);

  useEffect(() => {
    if (!bulkMenuOpen) return;
    function onDocClick(e: MouseEvent) {
      if (bulkMenuRef.current && !bulkMenuRef.current.contains(e.target as Node)) {
        setBulkMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [bulkMenuOpen]);

  useEffect(() => {
    if (view !== "conversas") {
      setMultiselectMode(false);
      setCheckedIds([]);
      setListaMenuOpen(false);
      setBulkMenuOpen(false);
    }
  }, [view]);

  useEffect(() => {
    setConversasAbertas(loadConversasAbertas());
  }, []);

  useEffect(() => {
    if (!selected) return;
    setConversasAbertas((prev) => {
      if (prev.has(selected)) return prev;
      const next = new Set(prev);
      next.add(selected);
      saveConversasAbertas(next);
      return next;
    });
  }, [selected]);

  useEffect(() => {
    setMenuAcoesOpen(false);
  }, [selected]);

  const switchView = useCallback(
    (next: ViewId) => {
      setView(next);
      const qs = next === "conversas" ? "" : `?view=${next}`;
      router.replace(`/whatsapp${qs}`, { scroll: false });
    },
    [router]
  );

  const vagasRef = useRef<VagaOption[]>([]);
  vagasRef.current = vagas;

  const applyCrmPayload = useCallback((json: Record<string, unknown>, includeActivity: boolean) => {
    if (Array.isArray(json.vagas) && (json.vagas as VagaOption[]).length > 0) {
      const nextVagas = json.vagas as VagaOption[];
      vagasRef.current = nextVagas;
      setVagas(nextVagas);
    }
    const nextRows = mergeFavoritoOverrides((json.rows as CrmCandidatoRow[]) ?? []);
    setRows(nextRows);
    setMetrics((json.metrics as CrmMetrics) ?? null);
    setDashboard((json.dashboard as CrmDashboard) ?? null);
    const key = crmCacheKey(clienteId, vagaId);
    crmCache.current.set(key, {
      schema: CRM_CACHE_SCHEMA,
      rows: nextRows,
      metrics: (json.metrics as CrmMetrics) ?? buildMetricsFromRows([]),
      dashboard: json.dashboard as CrmDashboard,
      vagas:
        Array.isArray(json.vagas) && (json.vagas as VagaOption[]).length > 0
          ? (json.vagas as VagaOption[])
          : vagasRef.current,
      activity: includeActivity,
    });
  }, [clienteId, vagaId, mergeFavoritoOverrides]);

  const loadCrm = useCallback(
    async (opts?: { includeActivity?: boolean; force?: boolean }) => {
      const key = crmCacheKey(clienteId, vagaId);
      const cached = crmCache.current.get(key);
      const wantActivity = Boolean(opts?.includeActivity);
      const canUseCache =
        cached &&
        cached.schema === CRM_CACHE_SCHEMA &&
        !opts?.force &&
        (!wantActivity || cached.activity) &&
        cached.rows.length > 0;

      if (canUseCache) {
        setRows(cached.rows);
        setMetrics(cached.metrics);
        setDashboard(cached.dashboard);
        if (cached.vagas.length) setVagas(cached.vagas);
        setLoadingCrm(false);
        setRefreshingCrm(false);
      } else if (!cached) {
        setLoadingCrm(true);
      } else {
        setRefreshingCrm(true);
      }

      setError(null);
      const gen = ++loadCrmGen.current;
      try {
        const params = new URLSearchParams();
        if (vagaId) params.set("vagaId", vagaId);
        if (clienteId) params.set("clienteId", clienteId);
        if (wantActivity) params.set("includeActivity", "1");
        if (vagasRef.current.length > 0) params.set("skipVagas", "1");
        params.set("skipPreview", "1");
        const res = await fetch(`/api/whatsapp/crm?${params}`, {
          cache: "no-store",
          signal: AbortSignal.timeout(120_000),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Erro ao carregar");
        if (gen !== loadCrmGen.current) return;
        applyCrmPayload(json, wantActivity);
      } catch (e) {
        if (gen === loadCrmGen.current) {
          const msg =
            e instanceof DOMException && e.name === "TimeoutError"
              ? "Carregamento demorou demais — tente de novo ou filtre por vaga"
              : e instanceof Error && e.message
                ? e.message
                : "Erro ao carregar candidatos";
          setError(msg);
        }
      } finally {
        setLoadingCrm(false);
        setRefreshingCrm(false);
      }
    },
    [clienteId, vagaId, applyCrmPayload]
  );

  const loadMessages = useCallback(
    async (sessaoId: string, opts?: { force?: boolean }) => {
      const force = opts?.force ?? false;
      if (force) messagesCache.current.delete(sessaoId);

      const cached = messagesCache.current.get(sessaoId);
      setMessagesSessaoId(sessaoId);
      if (cached) {
        setMensagens(cached);
        setLoadingMessages(false);
      } else {
        setLoadingMessages(true);
      }

      const gen = ++loadMsgGen.current;
      try {
        const params = new URLSearchParams({
          sessionId: sessaoId,
          messagesOnly: "1",
        });
        const res = await fetch(`/api/whatsapp/crm?${params}`, { cache: "no-store" });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Erro ao carregar mensagens");
        const msgs = json.mensagens ?? [];
        messagesCache.current.set(sessaoId, msgs);
        if (gen !== loadMsgGen.current) return;
        setMensagens(msgs);
      } catch (e) {
        if (gen === loadMsgGen.current) {
          setError(e instanceof Error && e.message ? e.message : "Erro ao carregar mensagens");
        }
      } finally {
        if (gen === loadMsgGen.current) setLoadingMessages(false);
      }
    },
    []
  );

  useEffect(() => {
    fetch("/api/whatsapp/config")
      .then((r) => r.json())
      .then((j) => setManualSendEnabled(Boolean(j.manualSendEnabled)))
      .catch(() => setManualSendEnabled(false));
  }, []);

  const loadAlertas = useCallback(async () => {
    try {
      const res = await fetch("/api/whatsapp/alertas?status=ativo", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) return;
      setAlertas(json.alertas ?? []);
      setAlertasResumo(json.resumo ?? null);
    } catch {
      /* silencioso — CRM funciona sem alertas */
    }
  }, []);

  useEffect(() => {
    loadAlertas();
    const t = setInterval(loadAlertas, 120000);
    return () => clearInterval(t);
  }, [loadAlertas]);

  useEffect(() => {
    if (prevVagaRef.current !== vagaId || prevClienteRef.current !== clienteId) {
      messagesCache.current.clear();
      pinnedRowRef.current = null;
      setRows([]);
      setCheckedIds([]);
      selectSessao(null);
      prevVagaRef.current = vagaId;
      prevClienteRef.current = clienteId;
    }
  }, [vagaId, clienteId, selectSessao]);

  useEffect(() => {
    loadCrm({ includeActivity: view === "funil" });
  }, [loadCrm, view, clienteId, vagaId]);

  useEffect(() => {
    if (!selected) {
      setMensagens([]);
      return;
    }
    loadMessages(selected);
  }, [selected, loadMessages]);

  const selecionada = useMemo(() => {
    if (!selected) return null;
    const fromRows = rows.find((r) => r.sessao_id === selected);
    if (fromRows) {
      pinnedRowRef.current = fromRows;
      return fromRows;
    }
    if (pinnedRowRef.current?.sessao_id === selected) return pinnedRowRef.current;
    return null;
  }, [rows, selected]);

  const chatMessages = messagesSessaoId === selected ? mensagens : [];
  const chatLoading =
    loadingMessages || (selected != null && messagesSessaoId !== selected);

  const clientePreview = useMemo(() => {
    const vagaOpt = vagas.find((v) => v.id === selecionada?.vaga_id);
    return vagaOpt?.cliente_nome ?? "empresa";
  }, [vagas, selecionada?.vaga_id]);

  const candidatoLocalizacao = useMemo(() => {
    if (!selecionada) return null;
    return formatLocalizacao(selecionada.cidade, selecionada.bairro, selecionada.regiao);
  }, [selecionada]);

  const proximaEtapaSelecionada = useMemo(() => {
    if (!selecionada) return null;
    return proximaEtapaFunil(selecionada.etapa_funil);
  }, [selecionada]);

  function abrirModal(
    m: NonNullable<typeof modal>,
    opts?: { resetEnviarMsg?: boolean }
  ) {
    if (opts?.resetEnviarMsg !== false) {
      setEnviarMsgAcao(false);
    }
    setModal(m);
  }

  const previewMsgReprovar = useMemo(() => {
    if (!motivoReprovar) return "";
    return previewMensagemAcao(modeloPorMotivoReprovacao(motivoReprovar as never), {
      nome: selecionada?.candidato_nome,
      cliente: clientePreview,
    });
  }, [motivoReprovar, selecionada?.candidato_nome, clientePreview]);

  const previewMsgContexto = useMemo(
    () => ({
      nome: selecionada?.candidato_nome,
      cliente: clientePreview,
      vaga:
        vagas.find((v) => v.id === vagaDestinoMovido)?.titulo ??
        vagas.find((v) => v.id === vagaDestinoMovido)?.cargo ??
        selecionada?.vaga_nome,
    }),
    [selecionada, clientePreview, vagaDestinoMovido, vagas]
  );

  const rowsFiltrados = useMemo(() => {
    let list = rows;
    if (filtroFavoritos) {
      list = list.filter((r) => r.favorito_crm);
    }
    const q = buscaNome.trim();
    if (q) {
      list = list.filter((r) => candidatoMatchBusca(r, q));
    }
    return list;
  }, [rows, buscaNome, filtroFavoritos]);

  const listaFiltrada = useMemo(() => {
    const list = filtroEtapa
      ? rowsFiltrados.filter((r) => r.etapa_funil === filtroEtapa)
      : rowsFiltrados;
    return sortCandidatos(list, sortBy);
  }, [rowsFiltrados, filtroEtapa, sortBy]);

  const clientes = useMemo(() => {
    const map = new Map<string, string>();
    for (const v of vagas) map.set(v.cliente_id, v.cliente_nome);
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1], "pt-BR"));
  }, [vagas]);

  const vagasFiltradas = useMemo(() => {
    let list = vagas;
    if (clienteId) list = list.filter((v) => v.cliente_id === clienteId);
    return list;
  }, [vagas, clienteId]);

  useEffect(() => {
    if (view !== "conversas") return;
    if (!selected || listaFiltrada.length === 0) return;
    const idx = listaFiltrada.findIndex((r) => r.sessao_id === selected);
    if (idx < 0) return;
    const ids = [
      listaFiltrada[idx - 1]?.sessao_id,
      listaFiltrada[idx + 1]?.sessao_id,
      listaFiltrada[idx + 2]?.sessao_id,
    ].filter(Boolean) as string[];
    for (const id of ids) prefetchMessages(id, messagesCache.current);
  }, [view, selected, listaFiltrada]);

  const byEtapa = useMemo(() => {
    const map = new Map<EtapaFunil, CrmCandidatoRow[]>();
    for (const e of [...FUNIL_PRINCIPAL, ...FUNIL_SAIDAS]) map.set(e, []);
    for (const r of rowsFiltrados) {
      if (filtroEtapa && r.etapa_funil !== filtroEtapa) continue;
      const list = map.get(r.etapa_funil) ?? [];
      list.push(r);
      map.set(r.etapa_funil, list);
    }
    for (const e of [...FUNIL_PRINCIPAL, ...FUNIL_SAIDAS]) {
      map.set(e, sortCandidatos(map.get(e) ?? [], sortBy));
    }
    return map;
  }, [rowsFiltrados, filtroEtapa, sortBy]);

  useEffect(() => {
    if (view === "kanban" && sortBy === "etapa") setSortBy("recente");
  }, [view, sortBy]);

  const qualificadosEncaminhar = useMemo(
    () =>
      rows.filter((r) =>
        ["qualificado", "encaminhado", "contratado"].includes(r.etapa_funil)
      ),
    [rows]
  );

  useEffect(() => {
    if (view !== "conversas") return;
    if (loadingCrm) return;

    if (selected) {
      const inList = listaFiltrada.some((r) => r.sessao_id === selected);
      if (!inList) {
        const first = listaFiltrada[0] ?? null;
        pinnedRowRef.current = first;
        selectSessao(first?.sessao_id ?? null, first);
      }
      return;
    }

    if (listaFiltrada[0]) {
      pinnedRowRef.current = listaFiltrada[0];
      selectSessao(listaFiltrada[0].sessao_id, listaFiltrada[0]);
    }
  }, [view, selected, listaFiltrada, loadingCrm, selectSessao]);

  useEffect(() => {
    if (threadRef.current) {
      threadRef.current.scrollTop = threadRef.current.scrollHeight;
    }
  }, [chatMessages, selected]);

  const emDestaque = useMemo(
    () => listaFiltrada.filter((r) => r.precisa_resposta).length,
    [listaFiltrada]
  );

  const filtrosAtivos =
    (clienteId ? 1 : 0) +
    (vagaId ? 1 : 0) +
    (filtroEtapa ? 1 : 0) +
    (filtroFavoritos ? 1 : 0) +
    (sortBy !== "recente" ? 1 : 0);

  const isConversasView = view === "conversas";

  const toggleChecked = useCallback((sessaoId: string) => {
    setCheckedIds((prev) =>
      prev.includes(sessaoId)
        ? prev.filter((id) => id !== sessaoId)
        : [...prev, sessaoId]
    );
  }, []);

  const prevCheckedCountRef = useRef(0);
  useEffect(() => {
    if (
      multiselectMode &&
      prevCheckedCountRef.current > 0 &&
      checkedIds.length === 0
    ) {
      setMultiselectMode(false);
      setBulkMenuOpen(false);
    }
    prevCheckedCountRef.current = checkedIds.length;
  }, [multiselectMode, checkedIds.length]);

  const todasListaSelecionadas = useMemo(() => {
    if (listaFiltrada.length === 0) return false;
    return listaFiltrada.every((r) => checkedIds.includes(r.sessao_id));
  }, [listaFiltrada, checkedIds]);

  const selecionarTudoLista = useCallback(() => {
    if (todasListaSelecionadas) {
      setCheckedIds([]);
      return;
    }
    setCheckedIds(listaFiltrada.map((r) => r.sessao_id));
  }, [listaFiltrada, todasListaSelecionadas]);

  const sairMultiselect = useCallback(() => {
    setMultiselectMode(false);
    setCheckedIds([]);
    setListaMenuOpen(false);
    setBulkMenuOpen(false);
  }, []);

  const checkedRows = useMemo(
    () => rows.filter((r) => checkedIds.includes(r.sessao_id)),
    [rows, checkedIds]
  );

  const alvoAcaoIds = useMemo(() => {
    if (checkedIds.length > 0) return checkedIds;
    if (selected) return [selected];
    return [];
  }, [checkedIds, selected]);

  const alvoAcaoRows = useMemo(() => {
    const byId = new Map(rows.map((r) => [r.sessao_id, r]));
    return alvoAcaoIds
      .map((id) => byId.get(id))
      .filter((r): r is CrmCandidatoRow => Boolean(r));
  }, [alvoAcaoIds, rows]);

  const contatosCopiarTexto = useMemo(
    () => alvoAcaoRows.map(linhaContatoCopiar).join("\n"),
    [alvoAcaoRows]
  );

  const detalhesCopiarTexto = useMemo(
    () => formatDetalhesLoteCopiar(alvoAcaoRows),
    [alvoAcaoRows]
  );

  const handleListaItemClick = useCallback(
    (row: CrmCandidatoRow, e: React.MouseEvent) => {
      if (multiselectMode) {
        e.preventDefault();
        toggleChecked(row.sessao_id);
        return;
      }
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        if (!multiselectMode) setMultiselectMode(true);
        toggleChecked(row.sessao_id);
        selectSessao(row.sessao_id, row);
        return;
      }
      setCheckedIds([]);
      selectSessao(row.sessao_id, row);
    },
    [multiselectMode, toggleChecked, selectSessao]
  );

  async function toggleFavorito(
    sessaoId: string,
    atual: boolean,
    e?: React.MouseEvent
  ) {
    e?.stopPropagation();
    e?.preventDefault();
    const novo = !atual;
    favoritoOverridesRef.current.set(sessaoId, novo);
    const patchRows = (list: CrmCandidatoRow[]) =>
      list.map((r) => (r.sessao_id === sessaoId ? { ...r, favorito_crm: novo } : r));
    setRows((prev) => patchRows(prev));
    const key = crmCacheKey(clienteId, vagaId);
    const cached = crmCache.current.get(key);
    if (cached) {
      crmCache.current.set(key, { ...cached, rows: patchRows(cached.rows) });
    }
    try {
      const res = await fetch("/api/whatsapp/acoes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "favoritar", sessaoId, favorito: novo }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Erro ao favoritar");
      setRows((prev) => patchRows(prev));
      const cachedAfter = crmCache.current.get(key);
      if (cachedAfter) {
        crmCache.current.set(key, { ...cachedAfter, rows: patchRows(cachedAfter.rows) });
      }
    } catch (err) {
      favoritoOverridesRef.current.delete(sessaoId);
      const revert = (list: CrmCandidatoRow[]) =>
        list.map((r) => (r.sessao_id === sessaoId ? { ...r, favorito_crm: atual } : r));
      setRows((prev) => revert(prev));
      const cachedNow = crmCache.current.get(key);
      if (cachedNow) {
        crmCache.current.set(key, { ...cachedNow, rows: revert(cachedNow.rows) });
      }
      setActionMsg(err instanceof Error ? err.message : String(err));
    }
  }

  async function runBulkAction(
    action: string,
    extra?: Record<string, string | boolean>
  ) {
    if (checkedIds.length === 0) return;
    setBulkProcessing(true);
    setActionMsg(null);
    try {
      const res = await fetch("/api/whatsapp/acoes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, sessaoIds: checkedIds, ...extra }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Erro na ação em lote");
      const ok = json.ok ?? checkedIds.length;
      const erros = json.erros?.length ?? 0;
      setActionMsg(
        erros > 0
          ? `${ok} processado(s), ${erros} com erro.`
          : `${ok} candidato(s) processado(s).`
      );
      for (const sid of checkedIds) messagesCache.current.delete(sid);
      setCheckedIds([]);
      setMultiselectMode(false);
      setBulkMenuOpen(false);
      setModal(null);
      await loadCrm({ includeActivity: view === "funil", force: true });
      if (selected) await loadMessages(selected, { force: true });
    } catch (err) {
      setActionMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setBulkProcessing(false);
    }
  }

  async function bulkFavoritar() {
    if (checkedIds.length === 0) return;
    setBulkProcessing(true);
    setActionMsg(null);
    const alvos = checkedIds.filter((sid) => !rows.find((r) => r.sessao_id === sid)?.favorito_crm);
    if (alvos.length === 0) {
      setActionMsg("Todos já estão nos favoritos.");
      setBulkProcessing(false);
      return;
    }
    const patchRows = (list: CrmCandidatoRow[]) =>
      list.map((r) => (alvos.includes(r.sessao_id) ? { ...r, favorito_crm: true } : r));
    setRows((prev) => patchRows(prev));
    const key = crmCacheKey(clienteId, vagaId);
    const cached = crmCache.current.get(key);
    if (cached) {
      crmCache.current.set(key, { ...cached, rows: patchRows(cached.rows) });
    }
    for (const sid of alvos) favoritoOverridesRef.current.set(sid, true);
    let ok = 0;
    const falhas: string[] = [];
    try {
      for (const sid of alvos) {
        const res = await fetch("/api/whatsapp/acoes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "favoritar", sessaoId: sid, favorito: true }),
        });
        const json = await res.json().catch(() => ({}));
        if (res.ok) {
          ok += 1;
        } else {
          favoritoOverridesRef.current.delete(sid);
          falhas.push(String(json.error ?? "Erro ao favoritar"));
        }
      }
      if (falhas.length > 0) {
        setRows((prev) =>
          prev.map((r) =>
            alvos.includes(r.sessao_id) && !favoritoOverridesRef.current.has(r.sessao_id)
              ? { ...r, favorito_crm: false }
              : r
          )
        );
      }
      setActionMsg(
        falhas.length > 0
          ? `${ok} favoritado(s), ${falhas.length} com erro.`
          : `${ok} candidato(s) favoritado(s).`
      );
    } catch (err) {
      for (const sid of alvos) favoritoOverridesRef.current.delete(sid);
      setActionMsg(err instanceof Error ? err.message : String(err));
      await loadCrm({ includeActivity: view === "funil", force: true });
    } finally {
      setBulkProcessing(false);
    }
  }

  async function runBulkMoverEtapa() {
    if (!etapaDestinoLote || alvoAcaoIds.length === 0) return;
    setBulkProcessing(true);
    setActionMsg(null);
    let ok = 0;
    const erros: string[] = [];
    try {
      for (const sid of alvoAcaoIds) {
        try {
          const res = await fetch("/api/whatsapp/acoes", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "mover_etapa",
              sessaoId: sid,
              etapaDestino: etapaDestinoLote,
            }),
          });
          const json = await res.json();
          if (!res.ok) throw new Error(json.error ?? "Erro ao mover etapa");
          ok += 1;
        } catch (err) {
          erros.push(err instanceof Error ? err.message : String(err));
        }
      }
      setActionMsg(
        erros.length > 0
          ? `${ok} atualizado(s), ${erros.length} com erro.`
          : `${ok} candidato(s) movido(s) para ${ETAPA_LABELS[etapaDestinoLote]}.`
      );
      for (const sid of alvoAcaoIds) messagesCache.current.delete(sid);
      setEtapaDestinoLote("");
      if (checkedIds.length > 0) sairMultiselect();
      setModal(null);
      await loadCrm({ includeActivity: view === "funil", force: true });
      if (selected) await loadMessages(selected, { force: true });
    } finally {
      setBulkProcessing(false);
    }
  }

  async function runAction(
    action: string,
    extra?: Record<string, string | boolean>,
    sessaoIdOverride?: string
  ) {
    const sid = sessaoIdOverride ?? selected;
    if (!sid) return;
    setActionMsg(null);
    const res = await fetch("/api/whatsapp/acoes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, sessaoId: sid, ...extra }),
    });
    const json = await res.json();
    if (!res.ok) {
      setActionMsg(json.error ?? "Erro na ação");
      return;
    }
    setActionMsg(json.aviso ?? "Ok");
    setModal(null);
    messagesCache.current.delete(sid);
    await loadCrm({ includeActivity: view === "funil" });
    if (selected === sid || sessaoIdOverride) await loadMessages(sid, { force: true });
  }

  async function moverEtapaKanban(sessaoId: string, etapaDestino: EtapaFunil) {
    const row = rows.find((r) => r.sessao_id === sessaoId);
    if (row?.etapa_funil === etapaDestino) return;
    await runAction("mover_etapa", { etapaDestino }, sessaoId);
  }

  const vagasDestinoMovido = useMemo(() => {
    if (modal === "mover_vaga" && selecionada?.vaga_id) {
      return vagas.filter((v) => v.id !== selecionada.vaga_id);
    }
    return vagas;
  }, [modal, selecionada, vagas]);

  const previewMensagemMovido = useMemo(() => {
    return previewMensagemAcao("mover_vaga", previewMsgContexto);
  }, [previewMsgContexto]);

  async function runMandarMensagem() {
    if (!modeloMensagemManual || !selected) return;
    setBulkProcessing(true);
    try {
      await runAction("mandar_mensagem", { modeloMensagem: modeloMensagemManual });
      setModeloMensagemManual("");
    } finally {
      setBulkProcessing(false);
    }
  }

  async function runMoverVaga() {
    if (!vagaDestinoMovido) return;
    if (checkedIds.length > 0) {
      await runBulkAction("mover_vaga_lote", {
        vagaDestinoId: vagaDestinoMovido,
        enviarMensagem: enviarMsgMovido,
      });
      setVagaDestinoMovido("");
      return;
    }
    if (!selected) return;

    setBulkProcessing(true);
    setActionMsg(null);
    try {
      const res = await fetch("/api/whatsapp/acoes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "mover_vaga",
          sessaoId: selected,
          vagaDestinoId: vagaDestinoMovido,
          enviarMensagem: enviarMsgMovido,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setActionMsg(json.error ?? "Erro ao mover de vaga");
        return;
      }
      setActionMsg(
        json.aviso
          ? `Movido para ${json.vaga_nome ?? "nova vaga"}. ${json.aviso}`
          : `Movido para ${json.vaga_nome ?? "nova vaga"}.`
      );
      messagesCache.current.delete(selected);
      setModal(null);
      setVagaDestinoMovido("");
      await loadCrm({ includeActivity: view === "funil", force: true });
      if (selected) await loadMessages(selected, { force: true });
    } catch (e) {
      setActionMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBulkProcessing(false);
    }
  }

  async function enviarMensagem() {
    if (!selected || !msgInput.trim() || enviandoMsg || manualSendEnabled === false) return;
    const texto = msgInput.trim();
    setMsgInput("");
    setEnviandoMsg(true);
    setActionMsg(null);
    try {
      const res = await fetch("/api/whatsapp/acoes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "enviar", sessaoId: selected, mensagem: texto }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Falha ao enviar");
      await loadMessages(selected, { force: true });
      setActionMsg(
        "Enviada à Kapso. Só chega no celular se a janela de 24h estiver aberta (candidato respondeu nas últimas 24h)."
      );
    } catch (e) {
      setActionMsg(e instanceof Error ? e.message : String(e));
      setMsgInput(texto);
    } finally {
      setEnviandoMsg(false);
    }
  }

  const podeReativar =
    selecionada &&
    !selecionada.reativacao_enviada &&
    diasSemResposta(selecionada.ultima_inbound_at, selecionada.ultima_outbound_at) >= 3;

  const janela24hAberta = selecionada
    ? dentroJanela24h(selecionada.ultima_inbound_at)
    : false;

  const agenteAtivo =
    Boolean(selecionada) &&
    selecionada!.status_sessao !== "encerrado" &&
    !["reprovado", "desistiu", "contratado", "inativo"].includes(selecionada!.etapa_funil);

  const classificacaoChat = selecionada
    ? [
        ETAPA_LABELS[selecionada.etapa_funil].toLowerCase(),
        selecionada.tags[0] ? labelTag(selecionada.tags[0]).toLowerCase() : null,
      ]
        .filter(Boolean)
        .join(" / ")
    : "";

  const vagaLabel =
    vagas.find((v) => v.id === vagaId)?.label ??
    (clienteId ? clientes.find(([id]) => id === clienteId)?.[1] ?? "Cliente" : "Todas as vagas");
  const kapsoPronto = manualSendEnabled === true;

  function renderBuscaFiltros(wrapperClass: string, opts?: { showListaMenu?: boolean }) {
    return (
      <div className={wrapperClass}>
        <input
          type="search"
          className="crm-search-input"
          placeholder={
            isConversasView ? "Buscar conversa ou telefone…" : "Buscar candidato ou telefone…"
          }
          value={buscaNome}
          onChange={(e) => setBuscaNome(e.target.value)}
        />
        {opts?.showListaMenu && (
          <button
            type="button"
            className={`fav-filter-btn${filtroFavoritos ? " active" : ""}`}
            title={
              filtroFavoritos ? "Mostrar todas as conversas" : "Mostrar só favoritos"
            }
            aria-pressed={filtroFavoritos}
            aria-label={
              filtroFavoritos ? "Mostrar todas as conversas" : "Mostrar só favoritos"
            }
            onClick={() => setFiltroFavoritos((v) => !v)}
          >
            {filtroFavoritos ? "★" : "☆"}
          </button>
        )}
        <div className="crm-filters-wrap" ref={filtrosRef}>
          <button
            type="button"
            className={`crm-filters-btn${filtrosOpen ? " open" : ""}${filtrosAtivos ? " has-active" : ""}`}
            onClick={() => setFiltrosOpen((v) => !v)}
            aria-expanded={filtrosOpen}
          >
            <IconFilter />
            Filtros
            {filtrosAtivos > 0 && (
              <span className="crm-filters-count">{filtrosAtivos}</span>
            )}
          </button>
          {filtrosOpen && (
            <div className="crm-filters-panel" role="dialog" aria-label="Filtros">
              <label className="crm-filters-field">
                <span>Cliente</span>
                <select
                  className="crm-toolbar-select"
                  value={clienteId}
                  onChange={(e) => {
                    const next = e.target.value;
                    setClienteId(next);
                    if (next && vagaId) {
                      const vaga = vagas.find((v) => v.id === vagaId);
                      if (vaga && vaga.cliente_id !== next) setVagaId("");
                    }
                    selectSessao(null);
                  }}
                >
                  <option value="">Todos os clientes</option>
                  {clientes.map(([id, nome]) => (
                    <option key={id} value={id}>
                      {nome}
                    </option>
                  ))}
                </select>
              </label>
              <label className="crm-filters-field">
                <span>Vaga</span>
                <select
                  className="crm-toolbar-select"
                  value={vagaId}
                  onChange={(e) => {
                    setVagaId(e.target.value);
                    selectSessao(null);
                  }}
                >
                  <option value="">Todas as vagas</option>
                  {vagasFiltradas.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.cliente_nome} — {v.titulo ?? v.cargo}
                    </option>
                  ))}
                </select>
              </label>
              <label className="crm-filters-field">
                <span>Etapa</span>
                <select
                  className="crm-toolbar-select"
                  value={filtroEtapa}
                  onChange={(e) => setFiltroEtapa(e.target.value as EtapaFunil | "")}
                >
                  <option value="">Todas etapas</option>
                  {[...FUNIL_PRINCIPAL, ...FUNIL_SAIDAS].map((e) => (
                    <option key={e} value={e}>
                      {ETAPA_LABELS[e]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="crm-filters-field">
                <span>Ordenar por</span>
                <select
                  className="crm-toolbar-select"
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as SortKey)}
                >
                  <option value="recente">Mais recente</option>
                  <option value="score_cv">Nota CV ↓</option>
                  <option value="score_entrevista">Nota entrevista ↓</option>
                  {view !== "kanban" && <option value="etapa">Etapa</option>}
                </select>
              </label>
            </div>
          )}
        </div>
        {opts?.showListaMenu && (
          <div className="lista-menu-wrap" ref={listaMenuRef}>
            <button
              type="button"
              className={`lista-menu-btn${multiselectMode ? " active" : ""}${listaMenuOpen ? " open" : ""}`}
              aria-label="Mais opções da lista"
              aria-expanded={listaMenuOpen}
              onClick={() => setListaMenuOpen((v) => !v)}
            >
              ⋯
            </button>
            {listaMenuOpen && (
              <div className="lista-menu-dropdown" role="menu">
                {!multiselectMode ? (
                  <button
                    type="button"
                    className="lista-menu-item"
                    role="menuitem"
                    onClick={() => {
                      setMultiselectMode(true);
                      setCheckedIds([]);
                      prevCheckedCountRef.current = 0;
                      setListaMenuOpen(false);
                    }}
                  >
                    Selecionar candidatos
                  </button>
                ) : (
                  <button
                    type="button"
                    className="lista-menu-item"
                    role="menuitem"
                    onClick={sairMultiselect}
                  >
                    Cancelar seleção
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className={`crm-app${sidebarOpen ? "" : " crm-sidebar-collapsed"}${isConversasView ? " crm-app--conversas" : ""}`}
    >
      <CrmSidebar
        view={view}
        onNavigate={switchView}
        alertasCount={alertas.length}
      />

      <div className={`crm-main${isConversasView ? " crm-main--conversas" : ""}`}>
        <div className="crm-topbar">
          <div className="crm-topbar-left">
            <button
              type="button"
              className="crm-topbar-icon-btn"
              onClick={() => setSidebarOpen((open) => !open)}
              aria-label={sidebarOpen ? "Recolher menu" : "Abrir menu"}
            >
              <IconPanelLeft />
            </button>
            <span className="crm-topbar-path">
              {isConversasView ? (
                <>
                  Gegê <span className="crm-topbar-sep">›</span> {VIEW_LABELS[view]}
                </>
              ) : (
                "Gegê"
              )}
            </span>
          </div>
          <div className="crm-topbar-right">
            <button
              type="button"
              className="crm-topbar-icon-btn"
              onClick={() => setTheme((t) => (t === "light" ? "dark" : "light"))}
              aria-label={theme === "light" ? "Ativar modo noturno" : "Ativar modo claro"}
            >
              {theme === "light" ? <IconSun /> : <IconMoon />}
            </button>
            <div className="crm-topbar-user" aria-label="Usuário logado">
              <span className="crm-topbar-avatar" aria-hidden="true">
                {crmUserInitials(CRM_USER)}
              </span>
              <span className="crm-topbar-name">{CRM_USER}</span>
            </div>
          </div>
        </div>

        {!isConversasView && (
        <header className="crm-page-header">
          <div className="crm-page-heading">
            <h1 className="crm-page-title">{VIEW_LABELS[view]}</h1>
            <p className={`crm-page-subtitle${view === "funil" ? " crm-page-subtitle-pipeline" : ""}`}>
              {view === "funil" ? "Pipeline operacional" : vagaLabel}
            </p>
          </div>
          {view === "funil" && (
          <div className="crm-page-toolbar">
            <select
              className="crm-select"
              value={clienteId}
              onChange={(e) => {
                const next = e.target.value;
                setClienteId(next);
                if (next && vagaId) {
                  const vaga = vagas.find((v) => v.id === vagaId);
                  if (vaga && vaga.cliente_id !== next) setVagaId("");
                }
                selectSessao(null);
              }}
            >
              <option value="">Todos os clientes</option>
              {clientes.map(([id, nome]) => (
                <option key={id} value={id}>
                  {nome}
                </option>
              ))}
            </select>
            <select
              className="crm-select crm-select-wide"
              value={vagaId}
              onChange={(e) => {
                setVagaId(e.target.value);
                selectSessao(null);
              }}
            >
              <option value="">Todas as vagas</option>
              {vagasFiltradas.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.cliente_nome} — {v.titulo ?? v.cargo}
                </option>
              ))}
            </select>
          </div>
          )}
        </header>
        )}

        <div className="crm-shell">

      {view === "kanban" && renderBuscaFiltros("crm-toolbar-panel")}

      {manualSendEnabled === false && (
        <div className="crm-alert">
          Envio manual desligado: falta Kapso no servidor. Copie{" "}
          <code>KAPSO_API_KEY</code> e <code>KAPSO_PHONE_NUMBER_ID</code> para{" "}
          <code>whatsapp-analytics/.env.local</code> (iguais ao bot) e reinicie{" "}
          <code>npm run dev</code>.
        </div>
      )}
      {kapsoPronto && view === "kanban" && (
        <div className="crm-kapso-ok crm-kapso-ok-subtle" role="status">
          Envio manual ativo via Ana.
        </div>
      )}

      {error && <div className="crm-alert crm-alert-error">Erro: {error}</div>}
      {refreshingCrm && !loadingCrm && !isConversasView && (
        <div className="crm-loading crm-loading-subtle">Sincronizando…</div>
      )}

      <div className="content-area">
        {view === "kanban" && loadingCrm && rows.length === 0 && (
          <div className="crm-loading crm-loading-board">Carregando pipeline…</div>
        )}
        {view === "kanban" && !(loadingCrm && rows.length === 0) && (
          <div className="kanban-board">
            {[...FUNIL_PRINCIPAL, ...FUNIL_SAIDAS]
              .filter((etapa) => !filtroEtapa || etapa === filtroEtapa)
              .map((etapa) => {
              const cards = byEtapa.get(etapa) ?? [];
              return (
                <div
                  key={etapa}
                  className={`kanban-col kanban-col--${etapa}${dropEtapa === etapa ? " kanban-col--drop-target" : ""}`}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                    setDropEtapa(etapa);
                  }}
                  onDragLeave={() => setDropEtapa((prev) => (prev === etapa ? null : prev))}
                  onDrop={(e) => {
                    e.preventDefault();
                    const sid = e.dataTransfer.getData("text/sessao-id") || dragSessaoId;
                    if (sid) void moverEtapaKanban(sid, etapa);
                    setDragSessaoId(null);
                    setDropEtapa(null);
                  }}
                >
                  <div className="col-header">
                    <div className="col-header-accent" aria-hidden="true">
                      <div className="col-header-accent-fill" />
                    </div>
                    <div className="col-header-row">
                      <div className="col-title-group">
                        <span className="col-name">{ETAPA_LABELS[etapa]}</span>
                        <span className="col-count-pill">{cards.length}</span>
                      </div>
                    </div>
                  </div>
                  <div className="kanban-col-body">
                    {cards.length === 0 ? (
                      <div className="kanban-col-empty">Nenhum candidato</div>
                    ) : (
                      cards.map((c) => (
                        <KanbanCard
                          key={c.sessao_id}
                          row={c}
                          active={selected === c.sessao_id}
                          dragging={dragSessaoId === c.sessao_id}
                          onSelect={() => {
                            selectSessao(c.sessao_id, c);
                            switchView("conversas");
                          }}
                          onDragStart={() => setDragSessaoId(c.sessao_id)}
                          onDragEnd={() => {
                            setDragSessaoId(null);
                            setDropEtapa(null);
                          }}
                        />
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {isConversasView && (
          <div className="lista-view">
            <div className="lista-sidebar">
              {refreshingCrm && !loadingCrm && (
                <div className="lista-sync-pill" role="status">
                  <span className="lista-sync-dot" aria-hidden="true" />
                  Sincronizando…
                </div>
              )}
              {multiselectMode ? (
                <div className="lista-select-bar">
                  <button
                    type="button"
                    className="lista-select-close"
                    aria-label="Cancelar seleção"
                    disabled={bulkProcessing}
                    onClick={sairMultiselect}
                  >
                    ×
                  </button>
                  <span className="lista-select-count">
                    Selecionadas: {checkedIds.length}
                  </span>
                  <button
                    type="button"
                    className="lista-select-all-btn"
                    disabled={bulkProcessing || listaFiltrada.length === 0}
                    onClick={selecionarTudoLista}
                  >
                    {todasListaSelecionadas ? "Desmarcar tudo" : "Selecionar tudo"}
                  </button>
                  <div className="lista-select-menu-wrap" ref={bulkMenuRef}>
                    <button
                      type="button"
                      className={`lista-select-menu-btn${bulkMenuOpen ? " open" : ""}`}
                      aria-label="Ações em lote"
                      aria-expanded={bulkMenuOpen}
                      disabled={bulkProcessing || checkedIds.length === 0}
                      onClick={() => setBulkMenuOpen((v) => !v)}
                    >
                      ⋮
                    </button>
                    {bulkMenuOpen && checkedIds.length > 0 && (
                      <div className="lista-menu-dropdown lista-menu-dropdown--bulk" role="menu">
                        <button
                          type="button"
                          className="lista-menu-item"
                          role="menuitem"
                          onClick={() => {
                            setBulkMenuOpen(false);
                            void bulkFavoritar();
                          }}
                        >
                          Favoritar
                        </button>
                        <button
                          type="button"
                          className="lista-menu-item"
                          role="menuitem"
                          onClick={() => {
                            setBulkMenuOpen(false);
                            abrirModal("resumo_lote");
                          }}
                        >
                          Ver resumo
                        </button>
                        <button
                          type="button"
                          className="lista-menu-item"
                          role="menuitem"
                          onClick={() => {
                            setBulkMenuOpen(false);
                            abrirModal("copiar_contatos");
                          }}
                        >
                          Copiar contatos
                        </button>
                        <button
                          type="button"
                          className="lista-menu-item"
                          role="menuitem"
                          onClick={() => {
                            setBulkMenuOpen(false);
                            abrirModal("mover_vaga");
                          }}
                        >
                          Mudar de vaga
                        </button>
                        <button
                          type="button"
                          className="lista-menu-item"
                          role="menuitem"
                          onClick={() => {
                            setBulkMenuOpen(false);
                            setEtapaDestinoLote("");
                            abrirModal("mover_etapa_lote");
                          }}
                        >
                          Mudar de etapa
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                renderBuscaFiltros("lista-sidebar-tools", { showListaMenu: true })
              )}
              <div
                className={`lista-items${multiselectMode ? " lista-items-multiselect" : ""}`}
              >
                {loadingCrm && rows.length === 0 ? (
                  <ListaSkeleton />
                ) : listaFiltrada.length === 0 ? (
                  <EmptyState
                    title="Nenhum candidato encontrado"
                    hint={
                      filtroFavoritos
                        ? "Nenhuma conversa favoritada ainda. Clique na estrela ao lado do nome."
                        : buscaNome || filtroEtapa
                        ? "Tente limpar os filtros ou escolher outra vaga."
                        : "Selecione um cliente ou vaga nos filtros para ver candidatos."
                    }
                  />
                ) : (
                  listaFiltrada.map((c) => (
                    <ListaConversaItem
                      key={c.sessao_id}
                      row={c}
                      selected={!multiselectMode && selected === c.sessao_id}
                      checked={checkedIds.includes(c.sessao_id)}
                      multiselectMode={multiselectMode}
                      aberta={conversasAbertas.has(c.sessao_id)}
                      onSelect={(e) => handleListaItemClick(c, e)}
                      onToggleFavorito={(e) =>
                        toggleFavorito(c.sessao_id, c.favorito_crm, e)
                      }
                    />
                  ))
                )}
              </div>
              {rowsFiltrados.length > 0 && (
                <div className="lista-footer">
                  {emDestaque} em destaque · {listaFiltrada.length} de {rowsFiltrados.length}{" "}
                  conversas
                </div>
              )}
            </div>

            <div className="conversa-panel">
              {!selecionada ? (
                <EmptyState
                  title="Selecione um candidato"
                  hint="Escolha alguém na lista à esquerda para ver a conversa e as ações."
                />
              ) : (
                <>
                  <div className="cand-header cand-header-nola">
                    <div className="cand-identity">
                      <div className="cand-hname-row">
                        <span className="cand-hname">{selecionada.candidato_nome}</span>
                        <span className="cand-hmeta">
                          {selecionada.telefone ?? "sem telefone"}
                        </span>
                        <span className="cand-hmeta">Gegê</span>
                        {candidatoLocalizacao && (
                          <span className="cand-hmeta">{candidatoLocalizacao}</span>
                        )}
                        {selecionada.vaga_nome && selecionada.vaga_nome !== "Sem vaga" && (
                          <span className="cand-hmeta">{selecionada.vaga_nome}</span>
                        )}
                      </div>
                    </div>
                    <div className="cand-header-meta">
                      {selecionada.score_cv != null && (
                        <span className="ctx-pill ctx-pill-neutral">CV {selecionada.score_cv}</span>
                      )}
                      {selecionada.score_entrevista != null && (
                        <span className="ctx-pill ctx-pill-neutral">
                          Ent {selecionada.score_entrevista}
                        </span>
                      )}
                      {selecionada.tags.slice(0, 2).map((t) => (
                        <span key={t} className="ctx-pill ctx-pill-neutral">
                          {labelTag(t)}
                        </span>
                      ))}
                      <span
                        className={`lista-status-pill etapa-tag ${listaStatusClass(selecionada.etapa_funil)}`}
                      >
                        {ETAPA_LABELS[selecionada.etapa_funil]}
                      </span>
                      {selecionada.curriculo_url && (
                        <a
                          href={selecionada.curriculo_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="ctx-drive-link"
                        >
                          CV Drive
                        </a>
                      )}
                      <div className="cand-actions-menu-wrap" ref={acoesMenuRef}>
                        <button
                          type="button"
                          className="cand-menu-btn"
                          aria-expanded={menuAcoesOpen}
                          aria-label="Ações do candidato"
                          onClick={() => setMenuAcoesOpen((v) => !v)}
                        >
                          ⋯
                        </button>
                        {menuAcoesOpen && (
                          <div className="cand-actions-dropdown" role="menu">
                            <button
                              type="button"
                              className="cand-actions-item"
                              role="menuitem"
                              onClick={() => {
                                setMenuAcoesOpen(false);
                                void toggleFavorito(
                                  selecionada.sessao_id,
                                  selecionada.favorito_crm
                                );
                              }}
                            >
                              Favoritar
                            </button>
                            <button
                              type="button"
                              className="cand-actions-item"
                              role="menuitem"
                              onClick={() => {
                                setMenuAcoesOpen(false);
                                abrirModal("resumo_lote");
                              }}
                            >
                              Ver resumo
                            </button>
                            <button
                              type="button"
                              className="cand-actions-item"
                              role="menuitem"
                              onClick={() => {
                                setMenuAcoesOpen(false);
                                abrirModal("copiar_contatos");
                              }}
                            >
                              Copiar contatos
                            </button>
                            <button
                              type="button"
                              className="cand-actions-item"
                              role="menuitem"
                              onClick={() => {
                                setMenuAcoesOpen(false);
                                setVagaDestinoMovido("");
                                setEnviarMsgMovido(false);
                                abrirModal("mover_vaga", { resetEnviarMsg: false });
                              }}
                            >
                              Mudar de vaga
                            </button>
                            <button
                              type="button"
                              className="cand-actions-item"
                              role="menuitem"
                              onClick={() => {
                                setMenuAcoesOpen(false);
                                setEtapaDestinoLote("");
                                abrirModal("mover_etapa_lote");
                              }}
                            >
                              Mudar de etapa
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {(selecionada.perfil_resumo ||
                    selecionada.analise_completa ||
                    selecionada.experiencias_cv.length > 0) && (
                    <CandidatoCvResumoToggle
                      key={selecionada.sessao_id}
                      analiseCompleta={selecionada.analise_completa}
                      perfilResumo={selecionada.perfil_resumo}
                      experiencias={selecionada.experiencias_cv}
                    />
                  )}

                  <div className="wa-chat-wrap">
                    <div
                      className={`chat-msgs wa-chat-bg${chatLoading ? " wa-chat-loading" : ""}`}
                      ref={threadRef}
                    >
                      {chatLoading && chatMessages.length === 0 && (
                        <div className="crm-loading-inline">Carregando conversa…</div>
                      )}
                      {!chatLoading && chatMessages.length === 0 && (
                        <div className="wa-day-pill">Nenhuma mensagem nesta sessão</div>
                      )}
                      {!chatLoading &&
                        chatMessages.length > 0 &&
                        selecionada.sessao_atualizado_em && (
                          <div className="wa-state-change">
                            ↹ Mudança de estado ·{" "}
                            {formatHoraMsg(selecionada.sessao_atualizado_em)}
                          </div>
                        )}
                      {chatMessages.map((m, idx) => {
                        const isOut = m.direcao === "outbound";
                        const manualPainel = isMensagemManualCrm(m.direcao, m.tipo_mensagem);
                        const diaAtual = chaveDiaConversa(m.criado_em);
                        const diaAnterior =
                          idx > 0 ? chaveDiaConversa(chatMessages[idx - 1].criado_em) : null;
                        const mostrarDia = diaAtual && diaAtual !== diaAnterior;
                        const senderLabel = isOut
                          ? manualPainel
                            ? "Você"
                            : "Ana"
                          : primeiroNome(selecionada.candidato_nome);
                        const senderRowClass = isOut
                          ? manualPainel
                            ? "wa-sender-manual"
                            : "wa-sender-agent"
                          : "wa-sender-lead";
                        return (
                          <div key={m.id} className="wa-msg-group">
                            {mostrarDia && (
                              <div className="wa-day-pill">{formatDiaConversa(m.criado_em)}</div>
                            )}
                            <div className={`wa-msg ${isOut ? "wa-msg-out" : "wa-msg-in"}`}>
                              <div
                                className={`wa-bubble${manualPainel ? " wa-bubble-manual" : ""}${isOut && !manualPainel ? " wa-bubble-agent" : ""}`}
                              >
                                <div className={`wa-sender-row ${senderRowClass}`}>
                                  <span className="wa-sender-label">{senderLabel}</span>
                                </div>
                                <span className="wa-text">{formatMensagemExibicao(m.conteudo)}</span>
                                <span className="wa-meta">
                                  <span className="wa-time">{formatHoraMsg(m.criado_em)}</span>
                                  {isOut && !manualPainel && (
                                    <IconRobot className="wa-meta-icon" />
                                  )}
                                  {isOut && manualPainel && (
                                    <IconHuman className="wa-meta-icon" />
                                  )}
                                  {isOut && !manualPainel && (
                                    <span className="wa-ticks" aria-hidden>
                                      ✓✓
                                    </span>
                                  )}
                                  {manualPainel && (
                                    <span
                                      className="wa-ticks wa-ticks-pending"
                                      title="Enviada à Kapso — entrega só dentro da janela de 24h"
                                    >
                                      ✓
                                    </span>
                                  )}
                                </span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                      {!chatLoading && classificacaoChat && (
                        <div className="wa-classification-tag">
                          Classificação: {classificacaoChat}
                          {selecionada.sessao_atualizado_em
                            ? ` · ${formatHoraMsg(selecionada.sessao_atualizado_em)}`
                            : ""}
                        </div>
                      )}
                    </div>

                    <div className="wa-composer-wrap">
                      {agenteAtivo && (
                        <div className="wa-agent-bar">
                          <span>Agente ativo nesta sessão</span>
                          <button
                            type="button"
                            className="wa-agent-pause-btn"
                            onClick={() => void runAction("pausar_agente")}
                          >
                            Pausar Agente
                          </button>
                        </div>
                      )}

                      <div className="wa-composer-bar">
                        <div className="wa-composer-field">
                          <input
                            className="wa-composer-input"
                            placeholder="Enviar mensagem como SDR..."
                            value={msgInput}
                            onChange={(e) => setMsgInput(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && !e.shiftKey) {
                                e.preventDefault();
                                enviarMensagem();
                              }
                            }}
                            disabled={
                              enviandoMsg ||
                              !selecionada.telefone ||
                              manualSendEnabled === false ||
                              !janela24hAberta
                            }
                          />
                          <button
                            type="button"
                            className="wa-composer-field-btn"
                            title="Reordenar"
                            aria-label="Reordenar"
                          >
                            <IconComposerReorder />
                          </button>
                        </div>
                        <div className="wa-composer-actions">
                          <button
                            type="button"
                            className="wa-composer-tool"
                            title="Anexar documento"
                            aria-label="Anexar documento"
                          >
                            <IconComposerDoc />
                          </button>
                          <button
                            type="button"
                            className="wa-composer-tool"
                            title="Gravar áudio"
                            aria-label="Gravar áudio"
                          >
                            <IconComposerMic />
                          </button>
                          <button
                            type="button"
                            className="wa-send-btn-red"
                            onClick={enviarMensagem}
                            disabled={
                              enviandoMsg ||
                              !msgInput.trim() ||
                              manualSendEnabled === false ||
                              !janela24hAberta
                            }
                            title={
                              kapsoPronto
                                ? "Enviar pelo WhatsApp"
                                : "Configure Kapso no .env.local"
                            }
                            aria-label="Enviar mensagem"
                          >
                            {enviandoMsg ? "…" : <IconSend />}
                          </button>
                        </div>
                      </div>
                      {!janela24hAberta && (
                        <p className="wa-composer-hint">
                          Janela de 24h fechada — texto livre não entrega no celular.
                        </p>
                      )}
                    </div>
                    {actionMsg && <p className="crm-action-hint">{actionMsg}</p>}
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {view === "alertas" && (
          <div className="alertas-view" role="region" aria-label="Alertas operacionais">
            {alertas.length === 0 ? (
              <EmptyState
                title="Nenhum alerta ativo"
                hint="Quando houver candidatos parados ou pendências, elas aparecem aqui."
              />
            ) : (
              <>
                <div className="crm-alertas-head">
                  <strong>Alertas ({alertas.length})</strong>
                  {alertasResumo && (
                    <span className="crm-alertas-chips">
                      {(alertasResumo.sem_resposta_ana_1h ?? 0) > 0 && (
                        <span className="chip-warn">
                          {alertasResumo.sem_resposta_ana_1h} Ana &gt;1h
                        </span>
                      )}
                      {(alertasResumo.sem_resposta_gege_24h ?? 0) > 0 && (
                        <span className="chip-muted">
                          {alertasResumo.sem_resposta_gege_24h} sem resp. 24h
                        </span>
                      )}
                      {(alertasResumo.entrevista_marcada ?? 0) > 0 && (
                        <span className="chip-ok">
                          {alertasResumo.entrevista_marcada} encaminhados
                        </span>
                      )}
                    </span>
                  )}
                </div>
                <ul className="crm-alertas-list">
                  {alertas.map((a) => (
                    <li key={a.id}>
                      <button
                        type="button"
                        className="crm-alerta-item"
                        onClick={() => {
                          if (a.sessao_id) {
                            const row = rows.find((r) => r.sessao_id === a.sessao_id);
                            selectSessao(a.sessao_id, row ?? null);
                            switchView("conversas");
                          }
                        }}
                      >
                        <span className="crm-alerta-tipo">{a.tipo.replace(/_/g, " ")}</span>
                        {a.candidato_nome && <span>{a.candidato_nome}</span>}
                        <span className="crm-alerta-detalhe">{a.detalhe ?? a.titulo}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}

        {view === "funil" && (
          <VisaoGeralDashboard
            rows={rows}
            metrics={metrics}
            dashboard={dashboard}
            onOpenCandidato={(id) => {
              const row = rows.find((r) => r.sessao_id === id);
              selectSessao(id, row ?? null);
              switchView("conversas");
            }}
            onVerTodosProntos={() => switchView("kanban")}
          />
        )}
      </div>

      {modal === "reprovar" && (
        <div className="modal-overlay" onClick={() => !bulkProcessing && setModal(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h3>
              {checkedIds.length > 0
                ? `Reprovar ${checkedIds.length} candidato(s)`
                : "Reprovar candidato"}
            </h3>
            <label className="crm-filters-field">
              Motivo
              <select
                className="crm-toolbar-select"
                value={motivoReprovar}
                onChange={(e) => setMotivoReprovar(e.target.value)}
                disabled={bulkProcessing}
              >
                <option value="">Selecione o motivo</option>
                {MOTIVOS_REPROVACAO.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>
            <OpcaoEnviarMensagem
              checked={enviarMsgAcao}
              onChange={setEnviarMsgAcao}
              preview={motivoReprovar ? previewMsgReprovar : undefined}
              disabled={bulkProcessing}
            />
            <div className="modal-actions">
              <button
                type="button"
                className="btn-ghost"
                disabled={bulkProcessing}
                onClick={() => setModal(null)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="btn-primary"
                disabled={!motivoReprovar || bulkProcessing}
                onClick={() => {
                  if (checkedIds.length > 0) {
                    runBulkAction("reprovar_lote", {
                      motivo: motivoReprovar,
                      enviarMensagem: enviarMsgAcao,
                    });
                    return;
                  }
                  runAction("reprovar", {
                    motivo: motivoReprovar,
                    enviarMensagem: enviarMsgAcao,
                  });
                }}
              >
                {bulkProcessing ? "Processando…" : "Confirmar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {modal === "mover_vaga" && (
        <div className="modal-overlay" onClick={() => !bulkProcessing && setModal(null)}>
          <div className="modal-card modal-wide" onClick={(e) => e.stopPropagation()}>
            <h3>
              {checkedIds.length > 0
                ? `Mover ${checkedIds.length} candidato(s) de vaga`
                : `Mover ${selecionada?.candidato_nome ?? "candidato"} de vaga`}
            </h3>
            <p className="modal-hint">
              A candidatura atual fica como <strong>movido</strong> na vaga de origem. O candidato
              passa a aparecer na nova vaga com etapa <strong>abordado</strong>. Por padrão{" "}
              <strong>não envia mensagem</strong> — marque abaixo se quiser avisar o candidato.
            </p>
            <label className="crm-filters-field" htmlFor="vaga-destino-movido">
              Nova vaga
              <select
                id="vaga-destino-movido"
                className="crm-toolbar-select"
                value={vagaDestinoMovido}
                onChange={(e) => setVagaDestinoMovido(e.target.value)}
                disabled={bulkProcessing}
              >
                <option value="">Selecione a vaga de destino</option>
                {vagasDestinoMovido.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="lista-check-label modal-check-row">
              <input
                type="checkbox"
                checked={enviarMsgMovido}
                onChange={(e) => setEnviarMsgMovido(e.target.checked)}
                disabled={bulkProcessing}
              />
              <span>Enviar mensagem ao candidato</span>
            </label>
            {enviarMsgMovido && vagaDestinoMovido && (
              <p className="modal-hint modal-preview-msg">{previewMensagemMovido}</p>
            )}
            {enviarMsgMovido && (
              <p className="modal-hint">
                Com janela de 24h fechada, usa o template Meta <strong>crm_mover_vaga</strong>{" "}
                (quando cadastrado na Kapso).
              </p>
            )}
            <div className="modal-actions">
              <button
                type="button"
                className="btn-ghost"
                disabled={bulkProcessing}
                onClick={() => setModal(null)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="btn-primary"
                disabled={!vagaDestinoMovido || bulkProcessing}
                onClick={() => runMoverVaga()}
              >
                {bulkProcessing ? "Movendo…" : "Confirmar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {modal === "resumo_lote" && (
        <div className="modal-overlay" onClick={() => !bulkProcessing && setModal(null)}>
          <div className="modal-card modal-wide" onClick={(e) => e.stopPropagation()}>
            <h3>Ver resumo — {alvoAcaoRows.length} candidato(s)</h3>
            <p className="muted">
              Nome, telefone, análise da IA e link do CV. Copie para enviar ao cliente.
            </p>
            <textarea
              className="modal-contatos-textarea"
              readOnly
              rows={Math.min(18, Math.max(8, alvoAcaoRows.length * 6))}
              value={detalhesCopiarTexto}
              onFocus={(e) => e.target.select()}
            />
            <div className="modal-actions">
              <button type="button" className="btn-ghost" onClick={() => setModal(null)}>
                Fechar
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={() => {
                  void navigator.clipboard.writeText(detalhesCopiarTexto).then(() => {
                    setActionMsg("Detalhamento copiado.");
                  });
                }}
              >
                Copiar tudo
              </button>
            </div>
          </div>
        </div>
      )}

      {modal === "copiar_contatos" && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal-card modal-wide" onClick={(e) => e.stopPropagation()}>
            <h3>Copiar contatos — {alvoAcaoRows.length} candidato(s)</h3>
            <p className="muted">Nome e telefone, um por linha:</p>
            <textarea
              className="modal-contatos-textarea"
              readOnly
              rows={Math.min(14, Math.max(5, alvoAcaoRows.length + 1))}
              value={contatosCopiarTexto}
              onFocus={(e) => e.target.select()}
            />
            <div className="modal-actions">
              <button type="button" className="btn-ghost" onClick={() => setModal(null)}>
                Fechar
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={() => {
                  void navigator.clipboard.writeText(contatosCopiarTexto).then(() => {
                    setActionMsg("Contatos copiados.");
                  });
                }}
              >
                Copiar tudo
              </button>
            </div>
          </div>
        </div>
      )}

      {modal === "mover_etapa_lote" && (
        <div className="modal-overlay" onClick={() => !bulkProcessing && setModal(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h3>Mudar etapa — {alvoAcaoIds.length} candidato(s)</h3>
            <label className="crm-filters-field" htmlFor="etapa-destino-lote">
              Nova etapa
              <select
                id="etapa-destino-lote"
                className="crm-toolbar-select"
                value={etapaDestinoLote}
                onChange={(e) => setEtapaDestinoLote(e.target.value as EtapaFunil)}
                disabled={bulkProcessing}
              >
                <option value="">Selecione a etapa</option>
                {[...FUNIL_PRINCIPAL, ...FUNIL_SAIDAS].map((e) => (
                  <option key={e} value={e}>
                    {ETAPA_LABELS[e]}
                  </option>
                ))}
              </select>
            </label>
            <div className="modal-actions">
              <button
                type="button"
                className="btn-ghost"
                disabled={bulkProcessing}
                onClick={() => setModal(null)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="btn-primary"
                disabled={!etapaDestinoLote || bulkProcessing}
                onClick={() => void runBulkMoverEtapa()}
              >
                {bulkProcessing ? "Atualizando…" : "Confirmar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {modal === "desistir" && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h3>Marcar desistência — {selecionada?.candidato_nome}</h3>
            <p className="modal-hint">O candidato passará para status <strong>desistiu</strong>.</p>
            <OpcaoEnviarMensagem
              checked={enviarMsgAcao}
              onChange={setEnviarMsgAcao}
              preview={previewMensagemAcao("desistencia", previewMsgContexto)}
            />
            <div className="modal-actions">
              <button type="button" className="btn-ghost" onClick={() => setModal(null)}>
                Cancelar
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={() =>
                  runAction("desistir", { enviarMensagem: enviarMsgAcao })
                }
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      {modal === "encaminhar" && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h3>Encaminhar — {selecionada?.candidato_nome}</h3>
            <p className="modal-hint">
              O candidato passará para status <strong>encaminhado</strong>.
            </p>
            <OpcaoEnviarMensagem
              checked={enviarMsgAcao}
              onChange={setEnviarMsgAcao}
              preview={previewMensagemAcao("encaminhado", previewMsgContexto)}
            />
            <div className="modal-actions">
              <button type="button" className="btn-ghost" onClick={() => setModal(null)}>
                Cancelar
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={() =>
                  runAction("encaminhar", { enviarMensagem: enviarMsgAcao })
                }
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      {modal === "avancar" && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h3>Avançar etapa — {selecionada?.candidato_nome}</h3>
            <p className="modal-hint">
              Próxima etapa:{" "}
              <strong>
                {proximaEtapaSelecionada
                  ? ETAPA_LABELS[proximaEtapaSelecionada]
                  : "—"}
              </strong>
            </p>
            {proximaEtapaSelecionada === "encaminhado" ? (
              <OpcaoEnviarMensagem
                checked={enviarMsgAcao}
                onChange={setEnviarMsgAcao}
                preview={previewMensagemAcao("encaminhado", previewMsgContexto)}
              />
            ) : (
              <p className="modal-hint">Esta etapa não tem mensagem padrão.</p>
            )}
            <div className="modal-actions">
              <button type="button" className="btn-ghost" onClick={() => setModal(null)}>
                Cancelar
              </button>
              <button
                type="button"
                className="btn-primary"
                disabled={!proximaEtapaSelecionada}
                onClick={() =>
                  runAction("avancar", {
                    enviarMensagem:
                      proximaEtapaSelecionada === "encaminhado" && enviarMsgAcao,
                  })
                }
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      {modal === "mandar_mensagem" && (
        <div className="modal-overlay" onClick={() => !bulkProcessing && setModal(null)}>
          <div className="modal-card modal-wide" onClick={(e) => e.stopPropagation()}>
            <h3>Mandar mensagem — {selecionada?.candidato_nome}</h3>
            <p className="modal-hint">
              Envia WhatsApp sem alterar o status. Texto livre se a janela de 24h estiver aberta;
              senão usa template Meta (se cadastrado).
            </p>
            <label className="crm-filters-field" htmlFor="modelo-mensagem-manual">
              Mensagem
              <select
                id="modelo-mensagem-manual"
                className="crm-toolbar-select"
                value={modeloMensagemManual}
                onChange={(e) =>
                  setModeloMensagemManual(e.target.value as ModeloMensagemAcao | "")
                }
                disabled={bulkProcessing}
              >
                <option value="">Selecione o tipo de mensagem</option>
                {MODELOS_MENSAGEM_ACAO.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>
            {modeloMensagemManual && (
              <p className="modal-hint modal-preview-msg">
                {previewMensagemAcao(modeloMensagemManual, previewMsgContexto)}
              </p>
            )}
            <div className="modal-actions">
              <button
                type="button"
                className="btn-ghost"
                disabled={bulkProcessing}
                onClick={() => setModal(null)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="btn-primary"
                disabled={!modeloMensagemManual || bulkProcessing}
                onClick={() => runMandarMensagem()}
              >
                {bulkProcessing ? "Enviando…" : "Enviar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {modal === "copiar_shortlist" && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal-card modal-wide" onClick={(e) => e.stopPropagation()}>
            <h3>Copiar shortlist p/ cliente</h3>
            <p className="muted">Qualificados da vaga selecionada:</p>
            <div className="encaminhar-list">
              {qualificadosEncaminhar.map((c) => (
                <EncaminharCard
                  key={c.sessao_id}
                  row={c}
                  resumoCache={c.perfil_resumo ?? c.resumo_ia}
                />
              ))}
            </div>
            <div className="modal-actions">
              <button type="button" className="btn-ghost" onClick={() => setModal(null)}>
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
        </div>
      </div>
    </div>
  );
}

function OpcaoEnviarMensagem({
  checked,
  onChange,
  preview,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  preview?: string;
  disabled?: boolean;
}) {
  return (
    <>
      <label className="lista-check-label modal-check-row">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          disabled={disabled}
        />
        <span>Enviar mensagem ao candidato</span>
      </label>
      {checked && preview && <p className="modal-hint modal-preview-msg">{preview}</p>}
      {checked && (
        <p className="modal-hint">
          Fora da janela de 24h, só entrega se o template Meta correspondente estiver cadastrado
          na Kapso (parâmetros nomeados: <strong>nome</strong>, <strong>cliente</strong>,{" "}
          <strong>vaga</strong>).
        </p>
      )}
    </>
  );
}

const ListaConversaItem = memo(function ListaConversaItem({
  row,
  selected,
  checked,
  multiselectMode,
  aberta,
  onSelect,
  onToggleFavorito,
}: {
  row: CrmCandidatoRow;
  selected: boolean;
  checked: boolean;
  multiselectMode: boolean;
  aberta: boolean;
  onSelect: (e: React.MouseEvent) => void;
  onToggleFavorito: (e: React.MouseEvent) => void;
}) {
  const destaque = row.precisa_resposta;
  const preview = previewListaMsg(row);
  const etapaLabel = ETAPA_LABELS[row.etapa_funil].toLowerCase();
  const nova = !aberta;

  return (
    <div
      className={`lista-item${selected ? " sel" : ""}${checked ? " lista-item-checked" : ""}${multiselectMode ? " lista-item-multiselect" : ""}${row.favorito_crm ? " lista-item-fav" : ""}${nova ? " lista-item-nova" : ""}${destaque ? " lista-item-pendente" : ""}`}
      onClick={onSelect}
    >
      {multiselectMode && (
        <span
          className={`lista-check-box${checked ? " is-checked" : ""}`}
          aria-hidden="true"
        />
      )}
      <div className="lista-avatar-wrap">
        <div className={`avatar lista-avatar ${avatarClass(row.candidato_nome)}`}>
          {iniciais(row.candidato_nome)}
        </div>
        <span
          className={`lista-avatar-dot lista-avatar-dot--${row.status_dot}`}
          aria-hidden="true"
        />
      </div>
      <div className="lista-info">
        <div className="lista-top-row">
          <div className="lista-name-row">
            <span className="lista-name">{nomePrimeiroUltimo(row.candidato_nome)}</span>
            <button
              type="button"
              className={`fav-star-btn sm${row.favorito_crm ? " on" : ""}`}
              title={row.favorito_crm ? "Remover dos favoritos" : "Favoritar conversa"}
              aria-pressed={row.favorito_crm}
              aria-label={row.favorito_crm ? "Remover dos favoritos" : "Favoritar conversa"}
              onClick={onToggleFavorito}
            >
              {row.favorito_crm ? "★" : "☆"}
            </button>
          </div>
          <span className={`lista-status-pill ${listaStatusClass(row.etapa_funil)}`}>
            {etapaLabel}
          </span>
          <span className="lista-agent-pill">Ana</span>
          {destaque && <span className="lista-status-pill lista-status-handoff">handoff</span>}
          <span className="lista-time">{tempoRelativo(row.ultima_data)}</span>
        </div>
        {preview && <div className="lista-last">{preview}</div>}
      </div>
    </div>
  );
});

function KanbanCard({
  row,
  active,
  dragging,
  onSelect,
  onDragStart,
  onDragEnd,
}: {
  row: CrmCandidatoRow;
  active: boolean;
  dragging?: boolean;
  onSelect: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  const when = row.ultima_data ?? row.sessao_atualizado_em ?? row.sessao_criado_em;
  const phone = row.telefone?.replace(/\D/g, "") ?? "";
  const subline = phone || truncar(row.vaga_nome, 28) || "Sem telefone";

  return (
    <div
      className={`cand-card cand-card--${row.etapa_funil}${active ? " active" : ""}${dragging ? " cand-card--dragging" : ""}`}
      draggable
      title="Arrastar para outra coluna"
      onDragStart={(e) => {
        e.dataTransfer.setData("text/sessao-id", row.sessao_id);
        e.dataTransfer.effectAllowed = "move";
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      onClick={onSelect}
    >
      <div className="cand-name">{nomePrimeiroUltimo(row.candidato_nome)}</div>
      <div className={`cand-subline${phone ? "" : " cand-subline--muted"}`}>{subline}</div>
      <div className="cand-time">{formatKanbanCardTime(when)}</div>
    </div>
  );
}

function EncaminharCard({
  row,
  resumoCache,
}: {
  row: CrmCandidatoRow;
  resumoCache: string | null;
}) {
  const texto = [
    `*${row.candidato_nome}*`,
    `CV: ${row.score_cv ?? "—"} | Entrevista: ${row.score_entrevista ?? "—"}`,
    resumoCache ? `Resumo: ${resumoCache}` : "",
    `Vaga: ${row.vaga_nome}`,
  ]
    .filter(Boolean)
    .join("\n");

  return (
    <div className="encaminhar-card">
      <pre>{texto}</pre>
      <button
        type="button"
        className="action-btn primary"
        onClick={() => navigator.clipboard.writeText(texto)}
      >
        Copiar
      </button>
    </div>
  );
}
