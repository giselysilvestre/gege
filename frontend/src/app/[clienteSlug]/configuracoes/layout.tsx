import { requireAuth } from "@/app/_private/require-auth";

export default async function ConfiguracoesLayout({ children }: { children: React.ReactNode }) {
  await requireAuth();
  return <>{children}</>;
}
