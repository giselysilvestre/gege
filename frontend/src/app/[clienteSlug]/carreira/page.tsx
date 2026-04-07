"use client";

import { useEffect, useMemo, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { vagaTituloPublico } from "@/lib/vaga-display";
import { devWarn } from "@/lib/devLog";
import { useClienteSlug } from "@/lib/context/ClienteSlugContext";
import { getClienteBySlug } from "@/lib/getClienteBySlug";

function waDigits(v: string | null | undefined) {
  if (!v) return "";
  const d = v.replace(/\D/g, "");
  return d.startsWith("55") ? d : `55${d}`;
}

type Cliente = {
  nome_empresa: string | null;
  descricao: string | null;
  sobre: string | null;
  whatsapp: string | null;
  cidade: string | null;
};
type CarreiraConfig = {
  nome_marca: string | null;
  cor_primaria: string | null;
  carreira_trabalhe_texto: string | null;
  carreira_sobre_texto: string | null;
  carreira_logo_url: string | null;
  carreira_capa_url: string | null;
  carreira_texto_cor: string | null;
  instagram_url: string | null;
  linkedin_url: string | null;
  site_url: string | null;
};
type Vaga = {
  id: string;
  cargo: string;
  titulo_publicacao?: string | null;
  salario: number | string | null;
  modelo_contratacao?: string | null;
  escala?: string | null;
  horario?: string | null;
  quantidade_vagas?: number | null;
  descricao?: string | null;
};

export default function CarreiraPage() {
  const slug = useClienteSlug();
  const [loading, setLoading] = useState(true);
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [config, setConfig] = useState<CarreiraConfig | null>(null);
  const [vagas, setVagas] = useState<Vaga[]>([]);
  const [busca, setBusca] = useState("");
  const [cidadeFiltro, setCidadeFiltro] = useState("");
  const [heroTextColorAuto, setHeroTextColorAuto] = useState<"light" | "dark">("light");

  useEffect(() => {
    void (async () => {
      const sb = getSupabaseBrowserClient();
      const cli = await getClienteBySlug(slug);
      if (!cli?.id) {
        setVagas([]);
        setCliente(null);
        setConfig(null);
        setLoading(false);
        return;
      }

      const [{ data: cr }, { data: cfg }] = await Promise.all([
        sb
          .from("clientes")
          .select("nome_empresa,descricao,sobre,whatsapp,cidade")
          .eq("id", cli.id)
          .maybeSingle(),
        sb
          .from("cliente_configuracoes")
          .select("nome_marca,cor_primaria,carreira_trabalhe_texto,carreira_sobre_texto,carreira_logo_url,carreira_capa_url,carreira_texto_cor,instagram_url,linkedin_url,site_url")
          .eq("cliente_id", cli.id)
          .maybeSingle(),
      ]);
      setCliente((cr as Cliente) ?? null);
      setConfig((cfg as CarreiraConfig) ?? null);

      const q = sb
        .from("vagas")
        .select("id,cargo,titulo_publicacao,salario,modelo_contratacao,escala,horario,quantidade_vagas,descricao,status_vaga")
        .eq("cliente_id", cli.id)
        .in("status_vaga", ["aberta", "em_selecao"])
        .order("criado_em", { ascending: false });
      const { data: v, error: ve } = await q;
      if (ve) {
        devWarn("[carreira] fallback vagas:", ve.message);
        const fallback = await sb
          .from("vagas")
          .select("id,cargo,titulo_publicacao,salario,escala,horario,quantidade_vagas,descricao,status_vaga")
          .eq("cliente_id", cli.id)
          .in("status_vaga", ["aberta", "em_selecao"])
          .order("criado_em", { ascending: false });
        setVagas((fallback.data as Vaga[]) ?? []);
      } else {
        setVagas((v as Vaga[]) ?? []);
      }
      setLoading(false);
    })();
  }, [slug]);

  useEffect(() => {
    const cover = config?.carreira_capa_url?.trim();
    if (!cover) {
      setHeroTextColorAuto("light");
      return;
    }
    let cancelled = false;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (cancelled) return;
      try {
        const canvas = document.createElement("canvas");
        canvas.width = 32;
        canvas.height = 32;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, 32, 32);
        const data = ctx.getImageData(0, 0, 32, 32).data;
        let totalLum = 0;
        let pixels = 0;
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          totalLum += 0.2126 * r + 0.7152 * g + 0.0722 * b;
          pixels++;
        }
        const avgLum = pixels > 0 ? totalLum / pixels : 0;
        setHeroTextColorAuto(avgLum >= 150 ? "dark" : "light");
      } catch {
        setHeroTextColorAuto("light");
      }
    };
    img.onerror = () => {
      if (!cancelled) setHeroTextColorAuto("light");
    };
    img.src = cover;
    return () => {
      cancelled = true;
    };
  }, [config?.carreira_capa_url]);

  const cidades = useMemo(() => {
    const set = new Set<string>();
    if (cliente?.cidade?.trim()) set.add(cliente.cidade.trim());
    return [...set].sort((a, b) => a.localeCompare(b, "pt"));
  }, [vagas, cliente]);

  const nome = config?.nome_marca?.trim() || cliente?.nome_empresa || "Empresa";
  const heroTextColor = config?.carreira_texto_cor?.trim() || (heroTextColorAuto === "dark" ? "#1f2937" : "#ffffff");
  const wa = waDigits(cliente?.whatsapp);
  const filtered = vagas.filter((v) => {
    if (cidadeFiltro && (cliente?.cidade?.trim() ?? "") !== cidadeFiltro) return false;
    if (!busca.trim()) return true;
    const q = busca.toLowerCase();
    return vagaTituloPublico(v).toLowerCase().includes(q);
  });
  const initials = nome
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  if (loading) {
    return (
      <div className="career-wrap">
        <p className="fs14 c600">Carregando…</p>
      </div>
    );
  }

  return (
    <div className="career-wrap">
      <div className="career-hero mb24">
        {config?.carreira_capa_url?.trim() ? (
          <div
            aria-hidden
            style={{
              position: "absolute",
              inset: 0,
              backgroundImage: `linear-gradient(rgba(17,24,39,0.45), rgba(17,24,39,0.45)), url(${config.carreira_capa_url.trim()})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
              borderRadius: 18,
            }}
          />
        ) : null}
        <div className="career-hero-content" style={{ color: heroTextColor }}>
          {config?.carreira_logo_url?.trim() ? (
            <img
              src={config.carreira_logo_url.trim()}
              alt={nome}
              style={{ width: 64, height: 64, borderRadius: 12, objectFit: "cover", background: "#fff" }}
            />
          ) : (
            <div className="career-logo-box">{initials.slice(0, 1) || "E"}</div>
          )}
          <div className="career-title">Trabalhe com a gente</div>
          <div className="career-desc">
            {config?.carreira_trabalhe_texto?.trim() || cliente?.descricao || "Buscamos pessoas dispostas, comprometidas e com vontade de crescer no food service."}
          </div>
          <div className="career-chips">
            <div className="career-chip hi">{filtered.length} vagas abertas</div>
            {cliente?.cidade ? <div className="career-chip">{cliente.cidade}</div> : null}
            <div className="career-chip">CLT</div>
          </div>
        </div>
        {config?.carreira_capa_url?.trim() ? (
          <div
            aria-hidden
            style={{
              position: "absolute",
              inset: 0,
              pointerEvents: "none",
              borderRadius: 18,
              background: heroTextColorAuto === "dark"
                ? "linear-gradient(180deg, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0.1) 100%)"
                : "linear-gradient(180deg, rgba(16,24,40,0.26) 0%, rgba(16,24,40,0.12) 100%)",
            }}
          />
        ) : (
          <div
            aria-hidden
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: 18,
              pointerEvents: "none",
              background: (config?.cor_primaria?.trim() || "var(--berry)"),
              opacity: 1,
              zIndex: -1,
            }}
          />
        )}
      </div>

      <div className="career-about mb24">
        <div className="fs11 fw7 muted" style={{ textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 10 }}>
          Sobre nós
        </div>
        <div style={{ fontSize: 14, color: "var(--gray-700)", lineHeight: 1.7 }}>
          {config?.carreira_sobre_texto?.trim() || cliente?.sobre?.trim() || cliente?.descricao?.trim() || `${nome} está contratando pessoas comprometidas e com vontade de crescer.`}
        </div>
        <div className="flex aic g8" style={{ marginTop: 12, flexWrap: "wrap" }}>
          {config?.instagram_url?.trim() ? <a className="badge b-gray" href={config.instagram_url.trim()} target="_blank" rel="noopener noreferrer">Instagram</a> : null}
          {config?.linkedin_url?.trim() ? <a className="badge b-gray" href={config.linkedin_url.trim()} target="_blank" rel="noopener noreferrer">LinkedIn</a> : null}
          {config?.site_url?.trim() ? <a className="badge b-gray" href={config.site_url.trim()} target="_blank" rel="noopener noreferrer">Site</a> : null}
        </div>
      </div>

      <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 16 }}>Vagas abertas</div>
      <div className="search-row mb16">
        <input className="search-input" type="text" placeholder="🔍  Buscar vagas..." value={busca} onChange={(e) => setBusca(e.target.value)} />
        <select className="search-input" style={{ maxWidth: 160 }} value={cidadeFiltro} onChange={(e) => setCidadeFiltro(e.target.value)}>
          <option value="">Todas cidades</option>
          {cidades.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      <div className="career-jobs-list">
        {filtered.map((v) => (
          <div key={v.id} className="career-job-card">
            <div className="career-job-header">
              <div>
                <div className="career-job-title">{vagaTituloPublico(v)}</div>
                <div className="career-job-meta">
                  {[
                    v.salario ? `R$ ${Number(v.salario).toLocaleString("pt-BR")}` : null,
                    v.escala?.trim() || null,
                    v.horario?.trim() || null,
                    cliente?.cidade ?? "São Paulo",
                    `${v.quantidade_vagas && v.quantidade_vagas > 1 ? v.quantidade_vagas : 1} vaga${
                      v.quantidade_vagas && v.quantidade_vagas > 1 ? "s" : ""
                    }`,
                  ]
                    .filter(Boolean)
                    .join(" • ")}
                </div>
              </div>
            </div>
            <div className="career-job-body open">
              {v.descricao ? <div className="career-job-desc">{v.descricao}</div> : null}
              {wa ? (
                <a
                  href={`https://wa.me/${wa}?text=${encodeURIComponent(`Olá, quero me candidatar para ${vagaTituloPublico(v)}`)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-whatsapp"
                  style={{ marginTop: 14, width: "100%", justifyContent: "center" }}
                >
                  Candidatar-se via WhatsApp
                </a>
              ) : (
                <div className="fs13 muted" style={{ marginTop: 14 }}>
                  Configure o WhatsApp do cliente
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
