import Link from "next/link";
import { notFound } from "next/navigation";
import { fetchCandidato } from "@/lib/api";
import { CandidatoForm } from "../../ui/CandidatoForm";

type Props = { params: Promise<{ id: string }> };

export default async function EditarCandidatoPage({ params }: Props) {
  const { id } = await params;
  let candidato;
  try {
    candidato = await fetchCandidato(id);
  } catch {
    notFound();
  }

  return (
    <>
      <Link href="/" className="nav-back">
        ← Voltar
      </Link>
      <h1>Editar candidato</h1>
      <p className="sub">{candidato.nome}</p>
      <CandidatoForm mode="edit" initial={candidato} />
    </>
  );
}
