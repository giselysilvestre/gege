"use client";

import type { CSSProperties } from "react";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Search, MessageCircle, Phone } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { ensureClienteForUser } from "@/lib/ensureClienteBrowser";
import { BottomNav } from "@/components/BottomNav";

function waDigits(v: string | null | undefined): string {
  if (!v) return "";
  const d = v.replace(/\D/g, "");
  return d.startsWith("55") ? d : `55${d}`;
}

const iconBtn: CSSProperties = {
  width: "40px",
  height: "40px",
  borderRadius: "10px",
  border: "1px solid #EAECF0",
  background: "#fff",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  color: "#344054",
};

function IconInstagram({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
    </svg>
  );
}

function IconLinkedin({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
    </svg>
  );
}

type ClienteCarreira = {
  nome_empresa: string | null;
  descricao: string | null;
  sobre: string | null;
  instagram: string | null;
  whatsapp: string | null;
  cidade: string | null;
  logo: string | null;
  telefone: string | null;
};

type VagaRow = {
  id: string;
  cargo: string;
  salario: number | string | null;
};

export default function CareerPage() {
  const [loading, setLoading] = useState(true);
  const [cliente, setCliente] = useState<ClienteCarreira | null>(null);
  const [vagas, setVagas] = useState<VagaRow[]>([]);

  useEffect(() => {
    void (async () => {
      const supabase = getSupabaseBrowserClient();
      const { data: sessWrap } = await supabase.auth.getSession();
      const session = sessWrap.session;

      let q = supabase.from("vagas").select("id, cargo, salario").eq("status_vaga", "aberta").order("criado_em", { ascending: false });

      if (session?.user) {
        const cli = await ensureClienteForUser(supabase, session.user);
        if (cli?.id) {
          const { data: cRow } = await supabase
            .from("clientes")
            .select("nome_empresa, descricao, sobre, instagram, whatsapp, cidade, logo, telefone")
            .eq("id", cli.id)
            .maybeSingle();
          setCliente((cRow as ClienteCarreira) ?? null);
          q = q.eq("cliente_id", cli.id);
        }
      }

      const { data: v } = await q;
      setVagas((v as VagaRow[]) ?? []);
      setLoading(false);
    })();
  }, []);

  const wa = waDigits(cliente?.whatsapp ?? undefined);
  const nomeEmpresa = cliente?.nome_empresa ?? "Tapí Ipanema";
  const linhaSobreEmpresa =
    cliente?.descricao?.trim() ||
    "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.";
  const logoUrl = cliente?.logo?.trim();
  const telLimpo = cliente?.telefone?.replace(/\D/g, "") ?? "";

  if (loading) {
    return (
      <div style={{ background: "#F9FAFB", minHeight: "100vh", padding: "24px 16px" }}>
        <p style={{ fontSize: "14px", color: "#667085" }}>Carregando…</p>
      </div>
    );
  }

  return (
    <div style={{ background: "#F9FAFB", minHeight: "100vh", paddingBottom: "88px" }}>
      <div style={{ background: "#fff", padding: "20px 16px", borderBottom: "1px solid #EAECF0" }}>
        <div style={{ marginBottom: "14px", display: "flex", alignItems: "center", gap: "12px" }}>
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="" className="h-14 w-14 shrink-0 rounded-full object-cover" style={{ border: "1px solid #F2F4F7" }} />
          ) : (
            <div
              className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full"
              style={{ background: "#F2F4F7", fontSize: "18px", fontWeight: 700, color: "#475467", border: "1px solid #EAECF0" }}
            >
              {nomeEmpresa.slice(0, 2).toUpperCase() || "GE"}
            </div>
          )}
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: "19px", fontWeight: 700, color: "#101828", letterSpacing: "-0.02em" }}>{nomeEmpresa}</div>
            <div style={{ fontSize: "13px", color: "#667085", lineHeight: 1.45, marginTop: "4px" }}>{linhaSobreEmpresa}</div>
          </div>
        </div>

        <div className="mb-4 flex items-center" style={{ gap: "10px" }}>
          {cliente?.instagram ? (
            <a href={cliente.instagram} target="_blank" rel="noopener noreferrer" style={iconBtn} aria-label="Instagram">
              <IconInstagram size={22} />
            </a>
          ) : (
            <span style={{ ...iconBtn, opacity: 0.45, pointerEvents: "none" }} aria-hidden>
              <IconInstagram size={22} />
            </span>
          )}
          <span style={{ ...iconBtn, opacity: 0.45, pointerEvents: "none" }} aria-hidden>
            <IconLinkedin size={20} />
          </span>
          {wa ? (
            <a href={`https://wa.me/${wa}`} target="_blank" rel="noopener noreferrer" style={iconBtn} aria-label="WhatsApp">
              <MessageCircle className="h-5 w-5" />
            </a>
          ) : telLimpo ? (
            <a href={`tel:${telLimpo}`} style={iconBtn} aria-label="Telefone">
              <Phone className="h-5 w-5" />
            </a>
          ) : (
            <span style={{ ...iconBtn, opacity: 0.45, pointerEvents: "none" }} aria-hidden>
              <Phone className="h-5 w-5" />
            </span>
          )}
        </div>

        {cliente?.sobre ? (
          <div style={{ marginBottom: "16px", borderRadius: "12px", border: "1px solid #EAECF0", background: "#fff", padding: "16px" }}>
            <div
              style={{
                fontSize: "10px",
                fontWeight: 600,
                color: "#98A2B3",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                marginBottom: "8px",
              }}
            >
              Sobre nós
            </div>
            <div style={{ fontSize: "13px", color: "#667085", lineHeight: 1.5 }}>{cliente.sobre}</div>
          </div>
        ) : null}

        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: "#98A2B3" }} />
          <input
            type="text"
            placeholder="Buscar por cargo…"
            readOnly
            className="w-full rounded-xl border pl-10 pr-3"
            style={{
              borderColor: "#EAECF0",
              background: "#fff",
              height: "48px",
              fontSize: "14px",
              color: "#101828",
              outline: "none",
            }}
          />
        </div>
      </div>

      <div className="space-y-3 px-4 pb-4 pt-4">
        {vagas.length === 0 ? (
          <div
            style={{
              borderRadius: "12px",
              border: "1px solid #EAECF0",
              background: "#fff",
              padding: "24px 16px",
              textAlign: "center",
              boxShadow: "0 1px 2px rgba(16, 24, 40, 0.06)",
            }}
          >
            <p style={{ fontSize: "14px", fontWeight: 600, color: "#101828", marginBottom: "8px" }}>Nenhuma vaga aberta</p>
            <p style={{ fontSize: "13px", color: "#667085", lineHeight: 1.45, marginBottom: "16px" }}>
              Quando houver vagas com status &quot;aberta&quot; para esta empresa, elas aparecem aqui.
            </p>
            <Link
              href="/vagas/nova"
              style={{
                display: "inline-block",
                fontSize: "13px",
                fontWeight: 600,
                color: "#101828",
                textDecoration: "underline",
                textUnderlineOffset: "3px",
              }}
            >
              Abrir nova vaga (painel)
            </Link>
          </div>
        ) : null}
        {vagas.map((vaga) => (
          <div
            key={vaga.id}
            style={{
              borderRadius: "12px",
              border: "1px solid #EAECF0",
              background: "#fff",
              padding: "18px",
              boxShadow: "0 1px 2px rgba(16, 24, 40, 0.06)",
            }}
          >
            <div style={{ fontSize: "16px", fontWeight: 700, color: "#101828", marginBottom: "6px" }}>{vaga.cargo}</div>
            <div style={{ fontSize: "12px", color: "#667085", marginBottom: "6px" }}>
              Presencial · {cliente?.cidade ?? "Rio de Janeiro"}
            </div>
            {vaga.salario != null && vaga.salario !== "" && (
              <div style={{ fontSize: "13px", color: "#667085", marginBottom: "14px", fontWeight: 500 }}>
                R${" "}
                {Number(vaga.salario).toLocaleString("pt-BR", {
                  minimumFractionDigits: 0,
                  maximumFractionDigits: 2,
                })}
              </div>
            )}
            {wa ? (
              <a
                href={`https://wa.me/${wa}?text=${encodeURIComponent(`Olá, quero me candidatar para ${vaga.cargo}`)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex min-h-[48px] w-full items-center justify-center rounded-lg font-semibold"
                style={{ border: "2px solid #101828", color: "#101828", fontSize: "14px", background: "#fff" }}
              >
                Candidatar-se
              </a>
            ) : (
              <div
                className="flex min-h-[48px] w-full items-center justify-center rounded-lg border text-center"
                style={{ borderColor: "#EAECF0", color: "#667085", fontSize: "13px", fontWeight: 600, background: "#F9FAFB" }}
              >
                Configure o WhatsApp do cliente
              </div>
            )}
          </div>
        ))}
      </div>
      <BottomNav />
    </div>
  );
}
