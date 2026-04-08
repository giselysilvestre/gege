"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { vagaTituloPublico } from "@/lib/vaga-display";
import type { CarreiraPublicaData } from "@/lib/data/carreira-publica";

function waDigits(v: string | null | undefined) {
  if (!v) return "";
  const d = v.replace(/\D/g, "");
  return d.startsWith("55") ? d : `55${d}`;
}

export default function CarreiraPublicaView({ data }: { data: CarreiraPublicaData }) {
  const [busca, setBusca] = useState("");
  const [cidadeFiltro, setCidadeFiltro] = useState("");

  const nome =
    data.config?.nome_marca?.trim() || data.cliente.nome_empresa || "Empresa";
  /** WhatsApp público: config primeiro, depois telefone de contato. */
  const wa = useMemo(() => {
    const cfg = data.config;
    if (!cfg) return "";
    const w = cfg.contato_whatsapp?.trim();
    if (w) return waDigits(w);
    const t = cfg.contato_telefone?.trim();
    return t ? waDigits(t) : "";
  }, [data.config]);
  const heroTextColor = data.config?.carreira_texto_cor?.trim() || "#ffffff";

  const cidades = useMemo(() => {
    return [] as string[];
  }, []);

  const filtered = data.vagas.filter((v) => {
    if (cidadeFiltro) return false;
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

  return (
    <div className="career-wrap">
      <div className="career-hero mb24">
        {data.config?.carreira_capa_url?.trim() ? (
          <div
            aria-hidden
            style={{
              position: "absolute",
              inset: 0,
              backgroundImage: `linear-gradient(rgba(17,24,39,0.45), rgba(17,24,39,0.45)), url(${data.config.carreira_capa_url.trim()})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
              borderRadius: 18,
            }}
          />
        ) : null}
        <div className="career-hero-content" style={{ color: heroTextColor }}>
          {data.config?.carreira_logo_url?.trim() ? (
            <img
              src={data.config.carreira_logo_url.trim()}
              alt={nome}
              style={{ width: 64, height: 64, borderRadius: 12, objectFit: "cover", background: "#fff" }}
            />
          ) : (
            <div className="career-logo-box">{initials.slice(0, 1) || "E"}</div>
          )}
          <div className="career-title">Trabalhe com a gente</div>
          <div className="career-desc">
            {data.config?.carreira_trabalhe_texto?.trim() ||
              "Buscamos pessoas dispostas, comprometidas e com vontade de crescer no food service."}
          </div>
          <div className="career-chips">
            <div className="career-chip hi">{filtered.length} vagas abertas</div>
            <div className="career-chip">CLT</div>
          </div>
        </div>
      </div>

      <div className="career-about mb24">
        <div className="fs11 fw7 muted" style={{ textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 10 }}>
          Sobre nos
        </div>
        <div style={{ fontSize: 14, color: "var(--gray-700)", lineHeight: 1.7 }}>
          {data.config?.carreira_sobre_texto?.trim() ||
            `${nome} esta contratando pessoas comprometidas e com vontade de crescer.`}
        </div>
      </div>

      <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 16 }}>Vagas abertas</div>
      <div className="search-row mb16">
        <input className="search-input" type="text" placeholder="Buscar vagas..." value={busca} onChange={(e) => setBusca(e.target.value)} />
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
          <Link
            key={v.id}
            href={`/vagas/${v.slug}`}
            className="career-job-card"
            style={{ textDecoration: "none", color: "inherit" }}
          >
            <div className="career-job-header">
              <div>
                <div className="career-job-title">{vagaTituloPublico(v)}</div>
                <div className="career-job-meta">
                  {[
                    v.salario ? `R$ ${Number(v.salario).toLocaleString("pt-BR")}` : null,
                    v.escala?.trim() || null,
                    v.horario?.trim() || null,
                    "Sao Paulo",
                    `${v.quantidade_vagas && v.quantidade_vagas > 1 ? v.quantidade_vagas : 1} vaga${
                      v.quantidade_vagas && v.quantidade_vagas > 1 ? "s" : ""
                    }`,
                  ]
                    .filter(Boolean)
                    .join(" - ")}
                </div>
              </div>
            </div>
            <div className="career-job-body open">
              {v.descricao ? <div className="career-job-desc">{v.descricao}</div> : null}
              {wa ? (
                <a
                  href={`https://wa.me/${wa}?text=${encodeURIComponent(`Ola, quero me candidatar para ${vagaTituloPublico(v)}`)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-whatsapp"
                  style={{ marginTop: 14, width: "100%", justifyContent: "center" }}
                  onClick={(e) => e.stopPropagation()}
                >
                  Candidatar-se via WhatsApp
                </a>
              ) : null}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
