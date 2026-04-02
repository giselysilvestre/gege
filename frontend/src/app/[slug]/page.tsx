import { notFound } from "next/navigation";
import CarreiraPublicaView from "@/app/carreira/ui/CarreiraPublicaView";
import { getCarreiraPublicaBySlug } from "@/lib/data/carreira-publica";

type Props = {
  params: Promise<{ slug: string }>;
};

const RESERVED = new Set([
  "login",
  "dashboard",
  "vagas",
  "candidatos",
  "banco",
  "configuracoes",
  "carreira",
  "api",
]);

export default async function PublicSlugPage({ params }: Props) {
  const { slug } = await params;
  const normalized = slug.trim().toLowerCase();

  if (!normalized || RESERVED.has(normalized)) {
    notFound();
  }

  const data = await getCarreiraPublicaBySlug(normalized);
  if (!data) notFound();

  return <CarreiraPublicaView data={data} />;
}
