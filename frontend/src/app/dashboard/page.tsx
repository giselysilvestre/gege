"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { BottomNav } from "@/components/BottomNav";
import { JobCard, type JobCardVaga } from "@/components/JobCard";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { ensureClienteForUser, type ClienteEmpresa } from "@/lib/ensureClienteBrowser";

function formatCompactPt(n: number) {
  return new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

function isTapiIpanema(nomeEmpresa: string | undefined) {
  if (!nomeEmpresa) return false;
  const n = nomeEmpresa.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
  return n.includes("tapi") && n.includes("ipanema");
}

const ATIVAS = ["aberta", "em_selecao"] as const;

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [cliente, setCliente] = useState<ClienteEmpresa | null>(null);
  const [vagas, setVagas] = useState<JobCardVaga[]>([]);
  const [poolDisplay, setPoolDisplay] = useState("0");
  const [candidatosHoje, setCandidatosHoje] = useState(0);
  const [totalInscritos, setTotalInscritos] = useState(0);
  const [inscritosHoje, setInscritosHoje] = useState(0);
  const [quentes, setQuentes] = useState(0);

  useEffect(() => {
    void (async () => {
      const supabase = getSupabaseBrowserClient();
      const { data: sessWrap } = await supabase.auth.getSession();
      const session = sessWrap.session;
      if (!session?.user) {
        setLoading(false);
        return;
      }

      const cli = await ensureClienteForUser(supabase, session.user);
      setCliente(cli);

      if (cli?.id) {
        const { data: vagasData } = await supabase
          .from("vagas")
          .select("*, candidaturas ( id, status, candidatos ( id, score ) )")
          .eq("cliente_id", cli.id)
          .in("status_vaga", [...ATIVAS])
          .order("criado_em", { ascending: false });
        setVagas((vagasData as JobCardVaga[]) ?? []);

        const { data: todasVagasIds } = await supabase.from("vagas").select("id").eq("cliente_id", cli.id);
        const vagaIds = todasVagasIds?.map((r) => r.id) ?? [];

        const { count: totalCandidatos } = await supabase.from("candidatos").select("*", { count: "exact", head: true });

        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);

        const { count: ch } = await supabase
          .from("candidatos")
          .select("*", { count: "exact", head: true })
          .gte("criado_em", startOfDay.toISOString());
        setCandidatosHoje(ch ?? 0);

        const { count: q } = await supabase
          .from("candidatos")
          .select("*", { count: "exact", head: true })
          .eq("disponivel", true)
          .gte("score", 70);
        setQuentes(q ?? 0);

        const pool = totalCandidatos ?? 0;
        setPoolDisplay(pool >= 1000 ? formatCompactPt(pool) : String(pool));

        if (vagaIds.length > 0) {
          const { count: cTotal } = await supabase
            .from("candidaturas")
            .select("*", { count: "exact", head: true })
            .in("vaga_id", vagaIds);
          setTotalInscritos(cTotal ?? 0);
          const { count: cHoje } = await supabase
            .from("candidaturas")
            .select("*", { count: "exact", head: true })
            .in("vaga_id", vagaIds)
            .gte("enviado_em", startOfDay.toISOString());
          setInscritosHoje(cHoje ?? 0);
        }
      } else {
        const { count: totalCandidatos } = await supabase.from("candidatos").select("*", { count: "exact", head: true });
        const pool = totalCandidatos ?? 0;
        setPoolDisplay(pool >= 1000 ? formatCompactPt(pool) : String(pool));
      }

      setLoading(false);
    })();
  }, []);

  const nomeContato =
    (cliente?.nome_contato && cliente.nome_contato.trim()) ||
    (cliente?.nome_empresa && cliente.nome_empresa.trim()) ||
    "recrutador";
  const nomeEmpresa = cliente?.nome_empresa ?? "Tapí Ipanema";
  const showTapiLogo = isTapiIpanema(nomeEmpresa);

  const metrics = [
    { label: "Vagas", value: String(vagas?.length ?? 0), badge: `${vagas?.length ?? 0} ativas`, solid: false },
    { label: "Banco de talentos", value: poolDisplay, badge: `+${candidatosHoje} hoje`, solid: false },
    { label: "Inscritos", value: String(totalInscritos), badge: `+${inscritosHoje} hoje`, solid: false },
    { label: "Quentes", value: String(quentes), badge: "disponíveis", solid: true },
  ];

  if (loading) {
    return (
      <div style={{ background: "#F9FAFB", minHeight: "100vh", padding: "24px 16px" }}>
        <p style={{ fontSize: "14px", color: "#667085" }}>Carregando…</p>
      </div>
    );
  }

  return (
    <div style={{ background: "#F9FAFB", minHeight: "100vh", paddingBottom: "80px" }}>
      <div
        style={{
          background: "#fff",
          padding: "10px 16px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderBottom: "1px solid #EAECF0",
        }}
      >
        <Link href="/dashboard" aria-label="Gegê — início">
          <Image src="/branding/logo-gege.png" alt="Gegê" width={120} height={36} className="h-8 w-auto object-contain" />
        </Link>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: 0 }}>
          {showTapiLogo ? (
            <Image src="/branding/logo-tapi-ipanema.png" alt={nomeEmpresa} width={100} height={28} className="h-7 w-auto shrink-0 object-contain" />
          ) : null}
          <span style={{ fontSize: "12px", color: "#667085", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {nomeEmpresa}
          </span>
        </div>
      </div>

      <div style={{ background: "#fff", padding: "16px 16px 20px", borderBottom: "1px solid #EAECF0" }}>
        <p style={{ fontSize: "13px", color: "#667085", marginBottom: "4px" }}>oie, {nomeContato}</p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", padding: "16px" }}>
        {metrics.map((m, i) => (
          <div key={i} style={{ background: "#fff", borderRadius: "12px", border: "1px solid #EAECF0", padding: "16px" }}>
            <p style={{ fontSize: "11px", color: "#667085", marginBottom: "6px" }}>{m.label}</p>
            <p style={{ fontSize: "32px", fontWeight: 700, color: "#101828", marginBottom: "8px", lineHeight: 1 }}>{m.value}</p>
            <span
              style={{
                fontSize: "10px",
                fontWeight: 500,
                padding: "3px 10px",
                borderRadius: "20px",
                display: "inline-block",
                ...(m.solid
                  ? { background: "#101828", color: "#fff" }
                  : { background: "#F9FAFB", border: "1px solid #EAECF0", color: "#667085" }),
              }}
            >
              {m.badge}
            </span>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "4px 16px 10px" }}>
        <span style={{ fontSize: "14px", fontWeight: 700, color: "#101828" }}>Vagas ativas</span>
        <Link href="/vagas" style={{ fontSize: "12px", color: "#667085", textDecoration: "underline", textUnderlineOffset: "2px" }}>
          Ver todas
        </Link>
      </div>
      <div style={{ padding: "0 16px" }}>{vagas?.slice(0, 3).map((vaga) => <JobCard key={vaga.id} vaga={vaga} />)}</div>
      <div style={{ padding: "8px 16px 16px" }}>
        <Link
          href="/vagas/nova"
          style={{
            display: "block",
            textAlign: "center",
            background: "#101828",
            color: "#fff",
            fontSize: "14px",
            fontWeight: 600,
            height: "48px",
            lineHeight: "48px",
            borderRadius: "8px",
            textDecoration: "none",
          }}
        >
          + Abrir nova vaga
        </Link>
      </div>

      <BottomNav />
    </div>
  );
}
