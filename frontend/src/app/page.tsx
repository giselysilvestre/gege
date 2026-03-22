import Link from "next/link";
import { fetchCandidatos } from "@/lib/api";
import { DeleteButton } from "./ui/DeleteButton";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  let candidatos: Awaited<ReturnType<typeof fetchCandidatos>> = [];
  let loadError: string | null = null;
  try {
    candidatos = await fetchCandidatos();
  } catch (e) {
    loadError = e instanceof Error ? e.message : "Erro ao carregar candidatos";
  }

  return (
    <>
      <h1>Gegê</h1>
      <p className="sub">CRUD de candidatos conectado ao Supabase via API Express.</p>

      <div className="toolbar">
        <Link href="/candidatos/novo" className="btn btn-primary">
          Novo candidato
        </Link>
      </div>

      {loadError && <p className="error">{loadError}</p>}

      {!loadError && candidatos.length === 0 && (
        <p className="sub">Nenhum candidato cadastrado ainda.</p>
      )}

      {!loadError && candidatos.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Nome</th>
              <th>Email</th>
              <th>Cargo</th>
              <th>Cidade</th>
              <th>Score</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {candidatos.map((c) => (
              <tr key={c.id}>
                <td>{c.nome}</td>
                <td>{c.email ?? "—"}</td>
                <td>{c.cargo ?? "—"}</td>
                <td>{c.cidade ?? "—"}</td>
                <td>{c.score}</td>
                <td>
                  <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                    <Link href={`/candidatos/${c.id}/editar`} className="btn">
                      Editar
                    </Link>
                    <DeleteButton id={c.id} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
