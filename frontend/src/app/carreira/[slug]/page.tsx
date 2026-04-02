import { notFound } from "next/navigation";
import CarreiraPublicaView from "@/app/carreira/ui/CarreiraPublicaView";
import { getCarreiraPublicaBySlug } from "@/lib/data/carreira-publica";

type Props = {
  params: Promise<{ slug: string }>;
};

export default async function CarreiraSlugPage({ params }: Props) {
  const { slug } = await params;
  const data = await getCarreiraPublicaBySlug(slug);

  if (!data) notFound();

  return <CarreiraPublicaView data={data} />;
}
