import { redirect } from "next/navigation";

/** URL antiga: redireciona para o perfil unificado. */
export default async function LegacyCandidatoRedirect({
  params,
}: {
  params: Promise<{ id: string; candidatoId: string; clienteSlug: string }>;
}) {
  const { id, candidatoId, clienteSlug } = await params;
  redirect(`/${clienteSlug}/candidatos/${candidatoId}?vaga=${id}`);
}
