"use client";

import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { ensureClienteForUser } from "@/lib/ensureClienteBrowser";
import { VagasLista } from "./VagasLista";
import type { JobCardVaga } from "@/components/JobCard";

export default function VagasPage() {
  const [vagas, setVagas] = useState<JobCardVaga[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      const supabase = getSupabaseBrowserClient();
      const { data: sessWrap, error: se } = await supabase.auth.getSession();
      if (se) console.error("[vagas] getSession:", se.message);
      const session = sessWrap.session;
      if (!session?.user) {
        setErrorMessage("Não foi possível identificar o cliente. Faça login de novo.");
        setLoading(false);
        return;
      }

      const cliente = await ensureClienteForUser(supabase, session.user);
      if (!cliente?.id) {
        setErrorMessage("Não foi possível identificar o cliente. Faça login de novo.");
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from("vagas")
        .select("*, candidaturas ( id, status, candidatos ( id, score ) )")
        .eq("cliente_id", cliente.id)
        .order("criado_em", { ascending: false });

      if (error) setErrorMessage(error.message);
      else setVagas((data as JobCardVaga[]) ?? []);
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return (
      <div style={{ background: "#F9FAFB", minHeight: "100vh", padding: "24px 16px" }}>
        <p style={{ fontSize: "14px", color: "#667085" }}>Carregando vagas…</p>
      </div>
    );
  }

  return <VagasLista initialVagas={vagas} errorMessage={errorMessage} />;
}
