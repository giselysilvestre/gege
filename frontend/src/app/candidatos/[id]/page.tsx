"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useSupabaseBrowser } from "@/lib/supabase/useSupabaseBrowser";
import { normalizePercentScore } from "@/lib/score";
import { vagaTituloPublico } from "@/lib/vaga-display";
import { devError } from "@/lib/devLog";

type Candidato = {
  id: string;
  nome: string;
  telefone: string;
  email: string | null;
  bairro: string | null;
  cidade: string | null;
  data_nascimento: string | null;
  score: number | null;
  disponivel: boolean | null;
  situacao_emprego: string | null;
  disponibilidade_horario: string | null;
  escolaridade: string | null;
  exp_resumo: string | null;
  exp_total_meses: number | null;
  exp_total_empregos: number | null;
  exp_alimentacao_meses: number | null;
  exp_atendimento_meses: number | null;
  exp_cozinha_meses: number | null;
  exp_lideranca_meses: number | null;
  curriculo_url: string | null;
  competencias_gerais: string | null;
  competencias_comportamentais: string | null;
  competencias_tecnicas: string | null;
};

type CandidaturaRow = {
  id: string;
  status: string;
  score_compatibilidade: number | null;
  distancia_km: number | null;
  enviado_em: string | null;
  atualizado_em: string | null;
  tags: string | null;
  observacao: string | null;
};

type CandidatoAnalise = {
  perfil_resumo: string | null;
  analise_completa: string | null;
  tags: string[] | null;
  score_ia: number | null;
  score_pos_entrevista: number | null;
  score_final: number | string | null;
  processado_em: string | null;
};

type CandidatoExperiencia = {
  empresa: string;
  cargo: string | null;
  meses: number | null;
  data_inicio: string | null;
  data_fim: string | null;
  eh_lideranca: boolean | null;
};

type HistoricoEmpItem = {
  empresa: string;
  cargo?: string;
  duracao?: string;
  food?: boolean;
  atual?: boolean;
};

function initialsFromNome(nome: string) {
  return (
    nome
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0])
      .join("")
      .toUpperCase() || "?"
  );
}

function idadeDe(dataNasc: string | null | undefined): number | null {
  if (!dataNasc?.trim()) return null;
  const d = new Date(dataNasc.trim());
  if (Number.isNaN(d.getTime())) return null;
  const t = new Date();
  let age = t.getFullYear() - d.getFullYear();
  const m = t.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && t.getDate() < d.getDate())) age--;
  return age >= 0 && age < 120 ? age : null;
}

function formatDistanciaKm(km: number | null | undefined): string | null {
  if (km == null || !Number.isFinite(Number(km))) return null;
  const n = Number(km);
  const t = n % 1 === 0 ? String(Math.round(n)) : n.toFixed(1).replace(".", ",");
  return `${t} km`;
}

function digitsTel(s: string) {
  return s.replace(/\D/g, "");
}

function parseHistoricoEmpregos(raw: string | null): HistoricoEmpItem[] {
  if (!raw?.trim()) return [];
  try {
    const j = JSON.parse(raw.trim()) as unknown;
    if (!Array.isArray(j)) return [];
    const out: HistoricoEmpItem[] = [];
    for (const item of j) {
      if (typeof item === "string") {
        const e = item.trim();
        if (e) out.push({ empresa: e });
        continue;
      }
      if (item && typeof item === "object") {
        const o = item as Record<string, unknown>;
        const empresa = String(o.empresa ?? o.company ?? o.empregador ?? "").trim();
        if (!empresa) continue;
        const cargoRaw = o.cargo ?? o.role;
        const cargo = cargoRaw != null ? String(cargoRaw).trim() : undefined;
        const meses = o.meses ?? o.months ?? o.duracao_meses;
        let duracao: string | undefined;
        if (typeof o.duracao === "string" && o.duracao.trim()) duracao = o.duracao.trim();
        else if (typeof meses === "number" && meses > 0) duracao = `${meses} ${meses === 1 ? "mês" : "meses"}`;
        const food =
          o.food_service === true ||
          o.foodService === true ||
          (typeof o.area === "string" && /aliment|food|cozinha|restaur|food\s*service/i.test(o.area)) ||
          (typeof o.segmento === "string" && /aliment|food|cozinha/i.test(o.segmento)) ||
          (typeof cargo === "string" && /barista|garçom|atend|cozinha|kitchen|food/i.test(cargo));
        const df = o.data_fim ?? o.date_fim ?? o.end_date;
        const hasEndKey = "data_fim" in o || "date_fim" in o || "end_date" in o;
        const atual = hasEndKey && (df == null || (typeof df === "string" && !String(df).trim()));
        out.push({ empresa, cargo: cargo || undefined, duracao, food: !!food, atual: !!atual });
      }
    }
    return out;
  } catch {
    return [];
  }
}

function competenciasBullets(c: Candidato): string[] {
  const parts = [c.competencias_gerais, c.competencias_comportamentais, c.competencias_tecnicas]
    .filter(Boolean)
    .map((t) => String(t).split(/\n|;/).map((s) => s.trim()).filter(Boolean))
    .flat();
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of parts) {
    const cleaned = line.replace(/^[•\-\*\u2022]\s*/, "").trim();
    if (cleaned.length === 0 || seen.has(cleaned.toLowerCase())) continue;
    seen.add(cleaned.toLowerCase());
    out.push(cleaned);
  }
  return out;
}

function etapaPill(status: string): { className: string; label: string } {
  switch (status) {
    case "contratado":
      return { className: "ep ep-contratado", label: "Contratado" };
    case "reprovado":
      return { className: "ep ep-reprovado", label: "Reprovado" };
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

/** Número do círculo "Score IA": sempre o score de currículo (score_ia), não score_final. */
function cvIaScoreForDisplay(a: CandidatoAnalise | null): number | null {
  if (!a) return null;
  const ia = normalizePercentScore(a.score_ia);
  if (ia != null) return ia;
  const pos = normalizePercentScore(a.score_pos_entrevista);
  if (pos != null) return pos;
  return normalizePercentScore(a.score_final);
}

/** Só quando há IA + pós-entrevista: mostrar combinado (usa coluna ou fórmula). */
function combinedAnaliseScoreForDisplay(a: CandidatoAnalise | null): number | null {
  if (!a) return null;
  const ia = normalizePercentScore(a.score_ia);
  const pos = normalizePercentScore(a.score_pos_entrevista);
  if (ia == null || pos == null) return null;
  const db = normalizePercentScore(a.score_final);
  if (db != null) return db;
  return normalizePercentScore(0.4 * ia + 0.6 * pos);
}

function scoreCircleClass(score: number | null): string {
  const n = normalizePercentScore(score);
  if (n == null) return "score score-xl score-na";
  if (n >= 70) return "score score-xl";
  if (n >= 50) return "score score-xl mid";
  return "score score-xl low";
}

function nextDbStatus(current: string): string | null {
  switch (current) {
    case "novo":
      return "em_triagem";
    case "em_triagem":
      return "em_entrevista";
    case "em_entrevista":
      return "em_teste";
    case "em_teste":
    case "aprovado":
      return "contratado";
    default:
      return null;
  }
}

function parseTagList(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map((x) => String(x).trim()).filter(Boolean);
  if (raw == null) return [];
  const t = String(raw).trim();
  if (!t) return [];
  try {
    const j = JSON.parse(t) as unknown;
    if (Array.isArray(j)) return j.map((x) => String(x).trim()).filter(Boolean);
  } catch {
    /* fallthrough */
  }
  return t.split(/[,;|]/).map((s) => s.trim()).filter(Boolean);
}

function formatTsPt(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDatePt(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR");
}

function formatMonthYear(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("pt-BR", { month: "2-digit", year: "numeric" });
}

function isAtualLike(v: string | null | undefined): boolean {
  if (!v) return true;
  const t = v.trim().toLowerCase();
  return t === "atual" || t === "presente" || t === "current" || t === "em andamento";
}

function parseSortableDate(value: string | null | undefined): number {
  if (!value) return Number.NEGATIVE_INFINITY;
  const raw = value.trim();
  if (!raw || /^atual$/i.test(raw)) return Number.NEGATIVE_INFINITY;
  const isoTs = new Date(raw).getTime();
  if (Number.isFinite(isoTs)) return isoTs;
  const mmYyyy = /^(\d{1,2})\/(\d{4})$/.exec(raw);
  if (mmYyyy) {
    const mm = Number(mmYyyy[1]);
    const yyyy = Number(mmYyyy[2]);
    if (mm >= 1 && mm <= 12) return new Date(yyyy, mm - 1, 1).getTime();
  }
  const yyyyMm = /^(\d{4})-(\d{1,2})$/.exec(raw);
  if (yyyyMm) {
    const yyyy = Number(yyyyMm[1]);
    const mm = Number(yyyyMm[2]);
    if (mm >= 1 && mm <= 12) return new Date(yyyy, mm - 1, 1).getTime();
  }
  return Number.NEGATIVE_INFINITY;
}

function endDateSortInfo(value: string | null | undefined): { isCurrent: boolean; ts: number } {
  if (isAtualLike(value)) return { isCurrent: true, ts: Number.POSITIVE_INFINITY };
  const ts = parseSortableDate(value);
  if (!Number.isFinite(ts) || ts === Number.NEGATIVE_INFINITY) {
    // Dados legados às vezes salvam "fim" em texto livre; tratamos como atual para manter UX consistente.
    return { isCurrent: true, ts: Number.POSITIVE_INFINITY };
  }
  return { isCurrent: false, ts };
}

function sortRankFromEnd(value: string | null | undefined): number {
  const end = endDateSortInfo(value);
  // "Atual" sempre no topo.
  if (end.isCurrent) return Number.POSITIVE_INFINITY;
  return end.ts;
}

function buildIaCallout(c: Candidato, bullets: string[]): string {
  const total = c.exp_total_meses ?? 0;
  const anos = total >= 12 ? Math.floor(total / 12) : 0;
  const meses = total % 12;
  const tempo =
    total <= 0
      ? ""
      : anos > 0
        ? `${anos} ${anos === 1 ? "ano" : "anos"}${meses > 0 ? ` e ${meses} ${meses === 1 ? "mês" : "meses"}` : ""} de experiência registrada`
        : `${total} ${total === 1 ? "mês" : "meses"} de experiência registrada`;
  const hist = parseHistoricoEmpregos(c.exp_resumo);
  const empresas = hist
    .slice(0, 3)
    .map((h) => h.empresa)
    .filter(Boolean);
  const onde = empresas.length ? ` Trajetória em ${empresas.join(", ")}.` : "";
  const comp = bullets.length ? ` Destaques: ${bullets.slice(0, 4).join("; ")}.` : "";
  const base = tempo ? `Candidato(a) com ${tempo}.${onde}` : `Perfil cadastrado.${onde}`;
  return (base + comp).trim() || "Análise resumida a partir dos dados do cadastro.";
}

function triagemLabel(status: string): string {
  if (status === "reprovado" || status === "desistiu") return "Reprovada";
  if (status === "em_triagem" || status === "novo") return "Em análise";
  return "Aprovada IA";
}

function entrevistaLabel(status: string): string {
  if (status === "contratado") return "Concluída";
  if (status === "em_entrevista" || status === "entrevista" || status === "entrevistado") return "Ag. agendamento";
  if (status === "reprovado" || status === "desistiu") return "—";
  return "—";
}

function CandidatoPerfilInner() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const id = String(params.id ?? "");
  const vagaId = searchParams.get("vaga");

  const backHref = vagaId ? `/vagas/${encodeURIComponent(vagaId)}` : "/candidatos";

  const [c, setC] = useState<Candidato | null>(null);
  const [candidatura, setCandidatura] = useState<CandidaturaRow | null>(null);
  const [analise, setAnalise] = useState<CandidatoAnalise | null>(null);
  const [experiencias, setExperiencias] = useState<CandidatoExperiencia[]>([]);
  const [vagaCargo, setVagaCargo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const supabase = useSupabaseBrowser();

  const load = useCallback(async () => {
    if (!id || !supabase) return;
    const tiers = [
      "id, nome, telefone, email, bairro, cidade, data_nascimento, disponivel, situacao_emprego, escolaridade, curriculo_url",
      "id, nome, telefone, email, bairro, cidade, situacao_emprego, escolaridade",
      "id, nome, telefone, bairro, cidade, situacao_emprego",
      "id, nome, telefone, email, bairro, cidade, data_nascimento, score, disponivel, situacao_emprego, disponibilidade_horario, escolaridade, exp_resumo, exp_total_meses, exp_total_empregos, exp_alimentacao_meses, exp_atendimento_meses, exp_cozinha_meses, exp_lideranca_meses, curriculo_url, competencias_gerais, competencias_comportamentais, competencias_tecnicas",
    ];
    let cand: Candidato | null = null;
    for (const sel of tiers) {
      const res = await supabase.from("candidatos").select(sel).eq("id", id).single();
      if (!res.error) {
        cand = (res.data as unknown as Candidato) ?? null;
        break;
      }
    }
    setC((cand as Candidato) ?? null);

    const analisePromise = supabase
      .from("candidatos_analise")
      .select("perfil_resumo,analise_completa,tags,score_ia,score_pos_entrevista,score_final,processado_em,atualizado_em")
      .eq("candidato_id", id)
      .order("processado_em", { ascending: false, nullsFirst: false })
      .order("atualizado_em", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();
    const experienciaPromise = supabase
      .from("candidatos_experiencia")
      .select("empresa,cargo,meses,data_inicio,data_fim,eh_lideranca")
      .eq("candidato_id", id)
      // "Atual" (data_fim nula) vem primeiro; depois os encerrados mais recentes.
      .order("data_fim", { ascending: false, nullsFirst: true })
      .order("data_inicio", { ascending: false, nullsFirst: false })
      .limit(50);

    if (vagaId) {
      const [{ data: candRow }, { data: vagaRow }, { data: analiseRow }, { data: expRows }] = await Promise.all([
        supabase
          .from("candidaturas")
          .select("id, status, score_compatibilidade, distancia_km, enviado_em, atualizado_em, tags, observacao")
          .eq("candidato_id", id)
          .eq("vaga_id", vagaId)
          .maybeSingle(),
        supabase.from("vagas").select("cargo, titulo_publicacao").eq("id", vagaId).maybeSingle(),
        analisePromise,
        experienciaPromise,
      ]);
      setCandidatura((candRow as CandidaturaRow) ?? null);
      const vr = vagaRow as { cargo: string; titulo_publicacao?: string | null } | null;
      setVagaCargo(vr ? vagaTituloPublico(vr) : null);
      setAnalise((analiseRow as CandidatoAnalise) ?? null);
      setExperiencias((expRows as CandidatoExperiencia[] | null) ?? []);
    } else {
      const [{ data: analiseRow }, { data: expRows }] = await Promise.all([analisePromise, experienciaPromise]);
      setCandidatura(null);
      setVagaCargo(null);
      setAnalise((analiseRow as CandidatoAnalise) ?? null);
      setExperiencias((expRows as CandidatoExperiencia[] | null) ?? []);
    }
  }, [id, vagaId, supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  const displayIaScore = useMemo(() => cvIaScoreForDisplay(analise), [analise]);
  const displayCombinedAnaliseScore = useMemo(() => combinedAnaliseScoreForDisplay(analise), [analise]);

  const distStr = formatDistanciaKm(candidatura?.distancia_km ?? null);
  const historico = useMemo(() => parseHistoricoEmpregos(c?.exp_resumo ?? null), [c?.exp_resumo]);
  const bullets = useMemo(() => (c ? competenciasBullets(c) : []), [c]);
  const tagItems = useMemo(() => {
    const fromAnalise = parseTagList(analise?.tags ?? null);
    const fromCandidatura = parseTagList(candidatura?.tags ?? null);
    return [...new Set([...fromAnalise, ...fromCandidatura])];
  }, [analise?.tags, candidatura?.tags]);
  const wa = c?.telefone ? digitsTel(c.telefone) : "";
  const experienciasOrdenadas = useMemo(() => {
    return [...experiencias].sort((a, b) => {
      const aEndRank = sortRankFromEnd(a.data_fim);
      const bEndRank = sortRankFromEnd(b.data_fim);
      if (aEndRank !== bEndRank) return bEndRank - aEndRank;

      const aStart = parseSortableDate(a.data_inicio);
      const bStart = parseSortableDate(b.data_inicio);
      if (aStart !== bStart) return bStart - aStart;

      const aMeses = a.meses ?? Number.NEGATIVE_INFINITY;
      const bMeses = b.meses ?? Number.NEGATIVE_INFINITY;
      if (aMeses !== bMeses) return bMeses - aMeses;

      return (b.empresa ?? "").localeCompare(a.empresa ?? "", "pt-BR");
    });
  }, [experiencias]);
  const ultimaExperiencia = experienciasOrdenadas[0] ?? null;
  const idade = idadeDe(c?.data_nascimento ?? null);

  const proxDb = candidatura ? nextDbStatus(candidatura.status) : null;
  const ep = candidatura ? etapaPill(candidatura.status) : null;

  const locLine = useMemo(() => {
    if (!c) return "";
    const parts: string[] = [];
    const age = idadeDe(c.data_nascimento);
    if (age != null) parts.push(`${age} anos`);
    const loc = [c.cidade?.trim(), c.bairro?.trim() ? c.bairro.trim() : null].filter(Boolean).join(", ");
    if (loc) parts.push(loc);
    if (distStr) parts.push(distStr);
    if (c.email?.trim()) parts.push(c.email.trim());
    return parts.join(" · ");
  }, [c, distStr]);

  const historicoProcesso = useMemo(() => {
    if (!candidatura) return [];
    const rows: { date: string; text: string; dot: "" | "berry" | "gray" }[] = [];
    const ia = cvIaScoreForDisplay(analise);
    if (candidatura.enviado_em) {
      rows.push({
        date: formatTsPt(candidatura.enviado_em),
        text: "Inscrição registrada no processo",
        dot: "",
      });
    }
    if (ia != null) {
      rows.push({
        date: formatTsPt(analise?.processado_em ?? candidatura.enviado_em),
        text: `Análise IA (currículo) — score ${ia}`,
        dot: "berry",
      });
    }
    if (candidatura.atualizado_em && candidatura.enviado_em !== candidatura.atualizado_em) {
      const pill = etapaPill(candidatura.status);
      rows.push({
        date: formatTsPt(candidatura.atualizado_em),
        text: `Status: ${pill.label}`,
        dot: "gray",
      });
    }
    return rows;
  }, [candidatura, analise]);

  async function onReprovar() {
    if (!supabase || !candidatura?.id) return;
    setBusy(true);
    try {
      const { error } = await supabase.from("candidaturas").update({ status: "reprovado" }).eq("id", candidatura.id);
      if (error) {
        devError("[perfil] reprovar", error);
        return;
      }
      await load();
      router.push(backHref);
    } finally {
      setBusy(false);
    }
  }

  async function onProximaEtapa() {
    if (!supabase || !candidatura?.id || !proxDb) return;
    setBusy(true);
    try {
      const { error } = await supabase.from("candidaturas").update({ status: proxDb }).eq("id", candidatura.id);
      if (error) {
        devError("[perfil] próxima etapa", error);
        return;
      }
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function onActionChange(action: string) {
    if (action === "proxima") await onProximaEtapa();
    if (action === "reprovar") await onReprovar();
    if (action === "whatsapp" && wa) window.open(`https://wa.me/${wa}`, "_blank", "noopener,noreferrer");
  }

  return (
    <div style={{ minHeight: "100%", paddingBottom: 32 }}>
      <div className="mb16">
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => router.push(backHref)}>
          ← Voltar
        </button>
      </div>

      {!c ? (
        <p className="fs13 c600" style={{ padding: 8 }}>
          Carregando…
        </p>
      ) : (
        <>
          <div className="cand-split-layout">
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div className="card cand-profile-hero">
                <div className="cand-profile-main">
                  <div className="flex aic g16" style={{ minWidth: 0, flex: 1 }}>
                    <div className="av av-lg cand-profile-avatar">{initialsFromNome(c.nome)}</div>
                    <div style={{ minWidth: 0 }}>
                      <h1 className="cand-profile-name">{c.nome}</h1>
                      <div className="cand-profile-meta">{locLine || "—"}</div>
                      <div className="cand-profile-meta" style={{ marginTop: 6, display: "grid", gap: 4 }}>
                        {[c.bairro?.trim(), c.cidade?.trim(), distStr].filter(Boolean).length > 0 ? (
                          <span>{[c.bairro?.trim(), c.cidade?.trim(), distStr].filter(Boolean).join(" · ")}</span>
                        ) : null}
                        {c.email?.trim() ? <span>Email: {c.email.trim()}</span> : null}
                        {c.telefone?.trim() ? (
                          <span>
                            Telefone:{" "}
                            {wa ? (
                              <a href={`https://wa.me/${wa}`} target="_blank" rel="noopener noreferrer" className="cand-profile-wa">
                                <span style={{ marginRight: 4 }}>🟢</span>
                                {c.telefone.trim()}
                              </a>
                            ) : (
                              c.telefone.trim()
                            )}
                          </span>
                        ) : null}
                        {idade != null ? <span>Idade: {idade}</span> : null}
                      </div>
                      <div className="flex g6" style={{ marginTop: 10, flexWrap: "wrap" }}>
                        {ep ? <span className={ep.className}>{ep.label}</span> : null}
                        {tagItems.slice(0, 6).map((t) => (
                          <span key={t} className="badge b-olive">
                            {t}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="cand-score-block">
                    <div className={scoreCircleClass(displayIaScore)}>{displayIaScore != null ? displayIaScore : "—"}</div>
                    <div className="cand-score-label">Score IA</div>
                    <div className="cand-score-hint">Currículo / análise automática</div>
                    {displayCombinedAnaliseScore != null ? (
                      <div className="cand-score-combined">
                        Final (IA + entrevista)
                        <strong>{displayCombinedAnaliseScore}</strong>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="card">
                <div className="fs11 fw7 muted" style={{ textTransform: "uppercase", letterSpacing: "0.7px", marginBottom: 12 }}>
                  Análise da IA
                </div>
                <div className="ia-callout">{analise?.analise_completa?.trim() || buildIaCallout(c, bullets)}</div>
              </div>

              <div className="card">
                <div className="fs11 fw7 muted" style={{ textTransform: "uppercase", letterSpacing: "0.7px", marginBottom: 12 }}>
                  Experiência Profissional
                </div>
                {experienciasOrdenadas.length > 0 ? (
                  <div className="tl">
                    {experienciasOrdenadas.map((h, i) => {
                      const isLast = i === experienciasOrdenadas.length - 1;
                      const linha2 = [h.cargo?.trim() || null, h.meses ? `${h.meses} ${h.meses === 1 ? "mês" : "meses"}` : null]
                        .filter(Boolean)
                        .join(" · ");
                      const inicio = formatMonthYear(h.data_inicio);
                      const fim = formatMonthYear(h.data_fim) ?? "Atual";
                      const linha3 = inicio ? `${inicio} até ${fim}` : null;
                      return (
                        <div key={`${h.empresa}-${i}`} className="tl-row">
                          <div className="tl-spine">
                            <div className={i === 0 ? "tl-dot berry" : "tl-dot"} />
                            {!isLast ? <div className="tl-line" /> : null}
                          </div>
                          <div className="tl-body">
                            <div className="fw7 fs13">{h.empresa}</div>
                            {linha2 ? <div className="tl-text">{linha2}</div> : null}
                            {linha3 ? <div className="tl-date">{linha3}</div> : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : historico.length > 0 ? (
                  <div className="tl">
                    {historico.map((h, i) => {
                      const isLast = i === historico.length - 1;
                      const meta = [h.cargo, h.duracao, h.atual ? "atual" : null].filter(Boolean).join(" · ");
                      return (
                        <div key={`${h.empresa}-${i}`} className="tl-row">
                          <div className="tl-spine">
                            <div className={i === historico.length - 1 ? "tl-dot berry" : "tl-dot"} />
                            {!isLast ? <div className="tl-line" /> : null}
                          </div>
                          <div className="tl-body">
                            <div className="fw7 fs13">{h.empresa}{h.cargo ? ` — ${h.cargo}` : ""}</div>
                            {meta ? <div className="tl-date">{meta}</div> : null}
                            {h.food ? <div className="tl-text">Experiência em food service</div> : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="fs13 c600">Nenhum histórico estruturado. Veja o currículo ou observações.</p>
                )}
              </div>
            </div>

            <div className="cand-right-panel">
              <div className="card">
                <div className="fs11 fw7 muted" style={{ textTransform: "uppercase", letterSpacing: "0.7px", marginBottom: 12 }}>
                  Ações
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <button type="button" className="btn btn-ghost" disabled={busy || !candidatura || !proxDb} onClick={() => void onActionChange("proxima")}>
                    {proxDb === "em_triagem"
                      ? "Avançar p/ Triagem"
                      : proxDb === "em_entrevista"
                        ? "Avançar p/ Entrevista"
                        : proxDb === "em_teste"
                          ? "Avançar p/ Teste"
                          : proxDb === "contratado"
                            ? "Avançar p/ Contratado"
                            : "Sem próxima etapa"}
                  </button>
                  <button type="button" className="btn btn-ghost" disabled={busy || !candidatura} onClick={() => void onActionChange("reprovar")}>
                    Reprovar
                  </button>
                  {c.curriculo_url?.trim() ? (
                    <Link href={c.curriculo_url.trim()} target="_blank" rel="noopener noreferrer" className="btn btn-ghost">
                      Ver currículo
                    </Link>
                  ) : (
                    <span className="btn btn-ghost" style={{ opacity: 0.55, pointerEvents: "none" }}>Sem currículo</span>
                  )}
                </div>
              </div>

              <div className="card">
                <div className="fs11 fw7 muted" style={{ textTransform: "uppercase", letterSpacing: "0.7px", marginBottom: 12 }}>
                  Vaga
                </div>
                <div className="tag-row">
                  {vagaCargo ? <span className="badge b-gray">Cargo: {vagaCargo}</span> : null}
                  {ep ? <span className={ep.className}>Etapa: {ep.label}</span> : null}
                  <span className="badge b-olive">Triagem: {candidatura ? triagemLabel(candidatura.status) : "—"}</span>
                  <span className="badge b-amber">Entrevista: {candidatura ? entrevistaLabel(candidatura.status) : "—"}</span>
                </div>
              </div>

              <div className="card">
                <div className="fs11 fw7 muted" style={{ textTransform: "uppercase", letterSpacing: "0.7px", marginBottom: 12 }}>
                  Progresso
                </div>
                {historicoProcesso.length > 0 ? (
                  <div className="tl">
                    {historicoProcesso.map((row, i) => {
                      const isLast = i === historicoProcesso.length - 1;
                      const dot = row.dot === "berry" ? "tl-dot berry" : row.dot === "gray" ? "tl-dot gray" : "tl-dot";
                      return (
                        <div key={`${row.text}-${i}`} className="tl-row">
                          <div className="tl-spine">
                            <div className={dot} />
                            {!isLast ? <div className="tl-line" /> : null}
                          </div>
                          <div className="tl-body">
                            <div className="tl-date">{row.date}</div>
                            <div className="tl-text">{row.text}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="fs13 c600">Sem eventos registrados para esta candidatura.</p>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default function CandidatoPerfilPage() {
  return (
    <Suspense
      fallback={
        <div style={{ minHeight: "50vh", padding: "24px", color: "var(--gray-600)" }}>
          Carregando…
        </div>
      }
    >
      <CandidatoPerfilInner />
    </Suspense>
  );
}
