"use client";

import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { ensureClienteForUser } from "@/lib/ensureClienteBrowser";
import { VagasLista } from "./VagasLista";
import { devError } from "@/lib/devLog";
import type { JobCardVaga } from "@/components/JobCard";

export default function VagasPage() {
  const [vagas, setVagas] = useState<JobCardVaga[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      const supabase = getSupabaseBrowserClient();
      const { data: sessWrap, error: se } = await supabase.auth.getSession();
      if (se) devError("[vagas] getSession:", se.message);
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
        .select(
          "id,cargo,titulo_publicacao,salario,escala,horario,endereco,status_vaga,criado_em,fechada_em, cliente_unidades ( nome ), candidaturas ( id, status, score_compatibilidade, candidatos ( id ) )"
        )
        .eq("cliente_id", cliente.id)
        .order("criado_em", { ascending: false });

      if (error) setErrorMessage(error.message);
      else setVagas((data as unknown as JobCardVaga[]) ?? []);
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return (
      <div className="fs14 c600" style={{ padding: 8 }}>
        Carregando vagas…
      </div>
    );
  }

  return <VagasLista initialVagas={vagas} errorMessage={errorMessage} />;
}
