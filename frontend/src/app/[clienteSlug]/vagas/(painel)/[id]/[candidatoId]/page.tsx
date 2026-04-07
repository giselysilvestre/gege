import { redirect } from "next/navigation";

/** URL antiga: redireciona para o perfil unificado. */
export default async function LegacyCandidatoRedirect({
  params,
}: {
  params: Promise<{ id: string; candidatoId: string }>;
}) {
  const { id, candidatoId } = await params;
  redirect(`/candidatos/${candidatoId}?vaga=${id}`);
}
