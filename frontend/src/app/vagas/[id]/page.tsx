"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

/**
 * Esta rota foi descontinuada: detalhe da vaga agora sempre
 * redireciona para lista de candidatos filtrada pela vaga.
 */
export default function VagaPageRedirect() {
  const params = useParams();
  const router = useRouter();
  const id = String(params.id ?? "").trim();

  useEffect(() => {
    if (!id) {
      router.replace("/candidatos");
      return;
    }
    router.replace(`/candidatos?vaga=${encodeURIComponent(id)}`);
  }, [id, router]);

  return (
    <div style={{ minHeight: "100%", padding: 24 }}>
      <p className="fs13 c600">Redirecionando para candidatos da vaga...</p>
    </div>
  );
}
