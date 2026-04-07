import { requireAuth } from "@/app/_private/require-auth";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  await requireAuth();
  return <>{children}</>;
}
