import { requireAuth } from "@/app/_private/require-auth";

type CarreiraLayoutProps = {
  children: React.ReactNode;
  params: Promise<{ slug?: string }>;
};

export default async function CarreiraLayout({ children, params }: CarreiraLayoutProps) {
  const { slug } = await params;

  // /carreira/[slug] é público; /carreira (gestão interna) exige sessão.
  if (!slug) {
    await requireAuth();
  }

  return <>{children}</>;
}
