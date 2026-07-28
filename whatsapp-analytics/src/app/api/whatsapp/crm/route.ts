import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import {
  buildDashboard,
  buildMetrics,
  countCandidaturas,
  enrichDashboardActivity,
  fetchCrmRows,
  fetchMessages,
  fetchVagas,
} from "@/lib/crm/fetchCrmData";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const vagaId = url.searchParams.get("vagaId");
    const clienteId = url.searchParams.get("clienteId");
    const sessionId = url.searchParams.get("sessionId");
    const messagesOnly = url.searchParams.get("messagesOnly") === "1";
    const includeActivity = url.searchParams.get("includeActivity") === "1";
    const skipVagas = url.searchParams.get("skipVagas") === "1";

    const supabase = getSupabaseAdmin();

    if (messagesOnly && sessionId) {
      const mensagens = await fetchMessages(supabase, sessionId);
      return NextResponse.json(
        { mensagens },
        {
          headers: {
            "Cache-Control": "no-store, no-cache, must-revalidate",
          },
        }
      );
    }

    const skipPreview = url.searchParams.get("skipPreview") !== "0";

    const rowsPromise = fetchCrmRows(supabase, vagaId, clienteId, { skipPreview });
    const vagasPromise = skipVagas ? Promise.resolve(null) : fetchVagas(supabase);
    const todosPromise = countCandidaturas(supabase, { vagaId, clienteId });
    const [vagasResult, rows, todos] = await Promise.all([
      vagasPromise,
      rowsPromise,
      todosPromise,
    ]);
    const vagas = vagasResult ?? [];

    const metrics = buildMetrics(rows, todos);
    let dashboard = buildDashboard(rows);

    if (includeActivity) {
      dashboard = await enrichDashboardActivity(
        supabase,
        vagaId,
        dashboard,
        rows.map((r) => r.sessao_id)
      );
    }

    let mensagens: Awaited<ReturnType<typeof fetchMessages>> = [];
    if (sessionId) {
      mensagens = await fetchMessages(supabase, sessionId);
    }

    return NextResponse.json(
      { vagas, rows, metrics, dashboard, mensagens },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      }
    );
  } catch (error) {
    const err = error as { message?: string; details?: string; hint?: string; code?: string };
    const message =
      err?.details ||
      err?.hint ||
      err?.message ||
      (error instanceof Error ? error.message : null) ||
      err?.code ||
      "Erro desconhecido";
    console.error("[crm]", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
