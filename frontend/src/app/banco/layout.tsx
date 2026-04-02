import { requireAuth } from "@/app/_private/require-auth";

export default async function BancoLayout({ children }: { children: React.ReactNode }) {
  await requireAuth();
  return <>{children}</>;
}
