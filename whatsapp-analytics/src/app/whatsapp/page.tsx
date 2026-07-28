import WhatsappCrmClient from "./WhatsappCrmClient";
import type { CrmViewId } from "@/lib/crm/types";

const VALID_VIEWS: CrmViewId[] = ["kanban", "conversas", "funil", "alertas"];

function parseInitialView(raw?: string): CrmViewId {
  if (raw && VALID_VIEWS.includes(raw as CrmViewId)) return raw as CrmViewId;
  return "conversas";
}

export default async function WhatsappPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const { view } = await searchParams;
  return <WhatsappCrmClient initialView={parseInitialView(view)} />;
}
