import Link from "next/link";
import { CandidatoForm } from "../ui/CandidatoForm";

export default function NovoCandidatoPage() {
  return (
    <>
      <Link href="/" className="nav-back">
        ← Voltar
      </Link>
      <h1>Novo candidato</h1>
      <p className="sub">Preencha os dados abaixo.</p>
      <CandidatoForm mode="create" />
    </>
  );
}
