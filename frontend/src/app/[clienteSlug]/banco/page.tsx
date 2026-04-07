"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { normalizePercentScore } from "@/lib/score";
import { ALLOWED_CANDIDATE_TAGS, toAllowedCandidateTags } from "@/lib/candidate-tags";
import { ActiveFilterChips } from "@/components/ui/ActiveFilterChips";
import { devWarn } from "@/lib/devLog";
import { useClienteSlug } from "@/lib/context/ClienteSlugContext";

type Talento = {
  id: string;
  nome: string;
  telefone: string | null;
  email?: string | null;
  score: number | null;
  bairro: string | null;
  exp_resumo: string | null;
  cidade: string | null;
  data_nascimento?: string | null;
  cargo_principal?: string | null;
  distancia_km?: number | null;
  criado_em?: string | null;
  tags: string[];
  exp_total_meses?: number | null;
  exp_alimentacao_meses?: number | null;
  exp_cozinha_meses?: number | null;
  exp_lideranca_meses?: number | null;
  exp_instabilidade_pct?: number | null;
};

const WHATSAPP_ICON = "🟢";

function BancoScore({ score }: { score: number | null }) {
  const n = normalizePercentScore(score);
  if (n == null) {
    return (
      <div className="banco-score" style={{ borderColor: "var(--gray-300)", background: "var(--gray-50)", color: "var(--gray-500)" }}>
        —
      </div>
    );
  }
  const cls = n >= 70 ? "banco-score" : n >= 50 ? "banco-score mid" : "banco-score low";
  return <div className={cls}>{n}</div>;
}

export default function BancoPage() {
  const slug = useClienteSlug();
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [talentos, setTalentos] = useState<Talento[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState<"data" | "score">("data");
  const [openFilters, setOpenFilters] = useState(false);

  useEffect(() => {
    void (async () => {
      const sb = getSupabaseBrowserClient();
      const selectTiers = [
        "id,nome,telefone,email,bairro,cidade,data_nascimento,cargo_principal,criado_em,situacao_emprego,disponivel",
        "id,nome,telefone,email,bairro,cidade,data_nascimento,criado_em,situacao_emprego,disponivel",
        "id,nome,telefone,email,bairro,cidade,data_nascimento,criado_em,disponivel",
        "id,nome,telefone,email,bairro,cidade,data_nascimento,criado_em",
        "id,nome,telefone,score,bairro,exp_resumo,cidade,exp_total_meses,exp_alimentacao_meses,exp_cozinha_meses,exp_lideranca_meses,exp_instabilidade_pct,criado_em",
      ];
      let data: Talento[] | null = null;
      let error: { message: string } | null = null;
      for (const sel of selectTiers) {
        const res = await sb
          .from("candidatos")
          .select(sel)
          .eq("disponivel", true)
          .order("criado_em", { ascending: false })
          .limit(200);
        if (!res.error) {
          data = (res.data as unknown as Talento[] | null) ?? [];
          error = null;
          break;
        }
        error = { message: res.error.message };
      }
      if (error) {
        devWarn("[banco] candidatos:", error.message);
        const fallback = await sb
          .from("candidatos")
          .select("id,nome,telefone,bairro,cidade")
          .eq("disponivel", true)
          .limit(200);
        const baseFallback = ((fallback.data as Talento[] | null) ?? []).map((t) => ({ ...t, tags: [], distancia_km: null }));
        setTalentos(baseFallback);
        return;
      }
      const base = ((data as Talento[] | null) ?? []).map((t) => ({ ...t, tags: [], distancia_km: null }));
      const ids = base.map((t) => t.id);
      if (!ids.length) {
        setTalentos(base);
        return;
      }
      const candTags = await sb.from("candidaturas").select("candidato_id,tags").in("candidato_id", ids).limit(1000);
      const byCand = new Map<string, string[]>();
      const distByCand = new Map<string, number | null>();
      for (const row of (candTags.data as Array<{ candidato_id: string; tags: string[] | null }> | null) ?? []) {
        const prev = byCand.get(row.candidato_id) ?? [];
        byCand.set(row.candidato_id, [...prev, ...((row.tags ?? []).map((x) => String(x)))]);
      }
      const distRows = await sb.from("candidaturas").select("candidato_id,distancia_km").in("candidato_id", ids).limit(1000);
      for (const row of (distRows.data as Array<{ candidato_id: string; distancia_km: number | null }> | null) ?? []) {
        const km = row.distancia_km;
        if (km == null || !Number.isFinite(Number(km))) continue;
        const prev = distByCand.get(row.candidato_id);
        if (prev == null || Number(km) < prev) distByCand.set(row.candidato_id, Number(km));
      }
      const analise = await sb
        .from("vw_candidato_score_ia_atual")
        .select("candidato_id,score_ia_atual")
        .in("candidato_id", ids);
      const iaMap = new Map<string, number | null>();
      for (const row of (analise.data as Array<Record<string, unknown>> | null) ?? []) {
        const id = String(row.candidato_id ?? "");
        if (!id || iaMap.has(id)) continue;
        iaMap.set(id, normalizePercentScore(row.score_ia_atual as number | string | null | undefined));
      }

      const withTags = base.map((t) => {
        return {
          ...t,
          score: iaMap.get(t.id) ?? null,
          distancia_km: distByCand.get(t.id) ?? null,
          tags: toAllowedCandidateTags([...(byCand.get(t.id) ?? [])]),
        };
      });
      setTalentos(withTags);
    })();
  }, []);

  const filtered = talentos.filter((t) => {
    if (selectedTags.length > 0 && !selectedTags.some((tag) => t.tags.includes(tag))) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      t.nome?.toLowerCase().includes(q) ||
      (t.telefone?.includes(search) ?? false) ||
      (t.email?.toLowerCase().includes(q) ?? false) ||
      (t.cidade?.toLowerCase().includes(q) ?? false) ||
      (t.cargo_principal?.toLowerCase().includes(q) ?? false)
    );
  });
  const sorted = [...filtered].sort((a, b) => {
    if (sortBy === "score") {
      return (normalizePercentScore(b.score) ?? -1) - (normalizePercentScore(a.score) ?? -1);
    }
    const ta = a.criado_em ? new Date(a.criado_em).getTime() : 0;
    const tb = b.criado_em ? new Date(b.criado_em).getTime() : 0;
    return tb - ta;
  });

  const availableTags = [...ALLOWED_CANDIDATE_TAGS];
  const activeChips = [
    ...(search.trim()
      ? [{ key: "q", label: `Busca: ${search.trim()}`, onRemove: () => setSearch("") }]
      : []),
    ...(sortBy !== "data" ? [{ key: "sort", label: `Ordenação: ${sortBy}`, onRemove: () => setSortBy("data") }] : []),
    ...selectedTags.map((tag) => ({
      key: `tag:${tag}`,
      label: `Tag: ${tag}`,
      onRemove: () => setSelectedTags((prev) => prev.filter((x) => x !== tag)),
    })),
  ];
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
    if (km == null || !Number.isFinite(Number(km))) return null;
    const n = Number(km);
    return `${n % 1 === 0 ? String(Math.round(n)) : n.toFixed(1).replace(".", ",")} km`;
  }

  function toggleTag(tag: string) {
    setSelectedTags((prev) => (prev.includes(tag) ? prev.filter((x) => x !== tag) : [...prev, tag]));
  }

  return (
    <div style={{ minHeight: "100%" }}>
      <div className="flex aic jsb mb16">
        <Link href={`/${slug}/dashboard`} className="btn btn-ghost btn-sm">
          ← Voltar
        </Link>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpenFilters(true)}>
          ⚙ Filtros
        </button>
      </div>
      <div className="flex aic jsb mb16">
        <div className="fs13 c600">
          <strong>{filtered.length}</strong> candidatos no banco
        </div>
      </div>
      <div className="search-row mb16">
        <input
          className="search-input"
          type="text"
          placeholder="🔍  Buscar por nome, cargo, cidade..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select className="search-input" style={{ maxWidth: 170 }} value={sortBy} onChange={(e) => setSortBy(e.target.value as "data" | "score")}>
          <option value="data">Ordenar: Data</option>
          <option value="score">Ordenar: Score</option>
        </select>
      </div>
      <ActiveFilterChips chips={activeChips} onClearAll={() => { setSearch(""); setSelectedTags([]); setSortBy("data"); }} />
      {availableTags.length ? (
        <div className="flex aic g8 mb16" style={{ flexWrap: "wrap" }}>
          {availableTags.map((tag) => {
            const active = selectedTags.includes(tag);
            return (
              <button
                key={tag}
                type="button"
                onClick={() => toggleTag(tag)}
                className={active ? "badge b-olive" : "badge b-gray"}
                style={{ border: "none", cursor: "pointer" }}
              >
                {tag}
              </button>
            );
          })}
        </div>
      ) : null}
      <div className="banco-grid">
        {sorted.map((t) => (
          <article
            key={t.id}
            className="banco-card"
            style={{ textDecoration: "none", color: "inherit", cursor: "pointer" }}
            role="button"
            tabIndex={0}
            onClick={() => router.push(`/${slug}/candidatos/${t.id}`)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                router.push(`/${slug}/candidatos/${t.id}`);
              }
            }}
          >
            <div className="banco-card-top">
              <div className="flex aic g12" style={{ flex: 1, minWidth: 0 }}>
                <div className="av">{t.nome?.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase()}</div>
                <div style={{ minWidth: 0 }}>
                  <div className="fw6 fs13" style={{ color: "var(--gray-900)" }}>
                    {t.nome}
                  </div>
                </div>
              </div>
              <BancoScore score={t.score} />
            </div>
            <div className="fs12 c600" style={{ lineHeight: 1.45, marginTop: 10, display: "grid", gap: 3 }}>
              {([t.bairro?.trim(), t.cidade?.trim()].filter(Boolean).join(", ") || fmtKm(t.distancia_km)) ? (
                <span>
                  Endereço: {[t.bairro?.trim(), t.cidade?.trim()].filter(Boolean).join(", ")}
                  {fmtKm(t.distancia_km) ? ` · ${fmtKm(t.distancia_km)}` : ""}
                </span>
              ) : null}
              {t.cargo_principal?.trim() ? <span>Cargo principal: {t.cargo_principal.trim()}</span> : null}
              {t.telefone?.trim() ? (
                <span>
                  Telefone:{" "}
                  <a
                    href={`https://wa.me/${t.telefone.replace(/\D/g, "").startsWith("55") ? t.telefone.replace(/\D/g, "") : `55${t.telefone.replace(/\D/g, "")}`}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    style={{ color: "inherit", textDecoration: "underline" }}
                  >
                    {WHATSAPP_ICON} {t.telefone.trim()}
                  </a>
                </span>
              ) : null}
              {idadeDe(t.data_nascimento) != null ? <span>Idade: {idadeDe(t.data_nascimento)}</span> : null}
            </div>
            {t.tags.length ? (
              <div className="tag-row" style={{ marginTop: 10 }}>
                {t.tags.slice(0, 5).map((tag) => (
                  <span key={tag} className="badge b-olive">{tag}</span>
                ))}
              </div>
            ) : null}
          </article>
        ))}
      </div>
      {openFilters ? (
        <>
          <div
            role="presentation"
            style={{ position: "fixed", inset: 0, background: "var(--overlay-dark)", zIndex: 60 }}
            onClick={() => setOpenFilters(false)}
          />
          <aside
            style={{
              position: "fixed",
              top: 0,
              right: 0,
              height: "100%",
              width: "min(100vw - 48px, 340px)",
              maxWidth: "100vw",
              background: "var(--white)",
              zIndex: 70,
              boxShadow: "var(--panel-shadow)",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: 16, borderBottom: "1px solid var(--n200)" }}>
              <span style={{ fontSize: 16, fontWeight: 700, color: "var(--n900)" }}>Filtros</span>
              <button type="button" onClick={() => setOpenFilters(false)} className="btn btn-ghost btn-sm">Fechar</button>
            </div>
            <div style={{ padding: 16 }}>
              <p className="fs12 c500 mb8">Tags</p>
              <div className="flex aic g8" style={{ flexWrap: "wrap" }}>
                {availableTags.map((tag) => {
                  const active = selectedTags.includes(tag);
                  return (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => toggleTag(tag)}
                      className={active ? "badge b-olive" : "badge b-gray"}
                      style={{ border: "none", cursor: "pointer" }}
                    >
                      {tag}
                    </button>
                  );
                })}
              </div>
            </div>
          </aside>
        </>
      ) : null}
    </div>
  );
}
