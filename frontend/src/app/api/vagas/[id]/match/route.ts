import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { assertAdminEnv, getSupabaseAdmin } from "@/lib/supabase/admin";
import { getSupabaseRouteHandlerClient } from "@/lib/supabase/server";
import { getCurrentCliente } from "@/lib/data";
import { calcularScore, type ScoreCalcCandidato } from "@/lib/score-calc";

export const dynamic = "force-dynamic";

type CandidatoMatchRow = ScoreCalcCandidato & { id: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function bearerToken(request: Request): string | null {
  const h = request.headers.get("authorization");
  if (!h?.startsWith("Bearer ")) return null;
  const t = h.slice(7).trim();
  return t || null;
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    assertAdminEnv();
  } catch (e) {
    return NextResponse.json(
      { message: e instanceof Error ? e.message : "Configuração do Supabase ausente" },
      { status: 500 }
    );
  }

  const { id: vagaIdRaw } = await context.params;
  const vagaId = String(vagaIdRaw ?? "").trim();
  if (!UUID_RE.test(vagaId)) {
    return NextResponse.json({ message: "ID de vaga inválido" }, { status: 400 });
  }

  const token = bearerToken(request);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const supabaseUser =
    token && url && anon
      ? createClient(url, anon, {
          global: { headers: { Authorization: `Bearer ${token}` } },
          auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
        })
      : await getSupabaseRouteHandlerClient();

  const cliente = await getCurrentCliente(supabaseUser, { accessToken: token });
  if (!cliente?.id) {
    return NextResponse.json({ message: "Não autorizado" }, { status: 401 });
  }

  const { data: vagaOwned, error: ownErr } = await supabaseUser
    .from("vagas")
    .select("id")
    .eq("id", vagaId)
    .eq("cliente_id", cliente.id)
    .maybeSingle();

  if (ownErr || !vagaOwned) {
    return NextResponse.json({ message: "Vaga não encontrada" }, { status: 404 });
  }

  const supabaseAdmin = getSupabaseAdmin();

  const { data: vagaRowRaw, error: vagaError } = await supabaseAdmin
    .from("vagas")
    .select("id, cargo, horario")
    .eq("id", vagaId)
    .single();

  const vagaRow = vagaRowRaw as { id: string; cargo: string; horario: string | null } | null;

  if (vagaError || !vagaRow) {
    return NextResponse.json({ message: vagaError?.message ?? "Vaga não encontrada" }, { status: 404 });
  }

  const vaga = { cargo: String(vagaRow.cargo), horario: vagaRow.horario };

  const { data: candidatosRaw, error } = await supabaseAdmin
    .from("candidatos")
    .select(
      `id, disponivel, disponibilidade_horario, escolaridade, situacao_emprego,
       exp_total_meses, exp_total_empregos, exp_instabilidade_pct,
       exp_alimentacao_meses, exp_atendimento_meses, exp_cozinha_meses, exp_lideranca_meses`
    )
    .eq("disponivel", true)
    .limit(80);

  if (error) return NextResponse.json({ message: error.message }, { status: 500 });

  const candidatos = (candidatosRaw ?? []) as CandidatoMatchRow[];

  const ranked = candidatos
    .map((c) => {
      const { score: score_compatibilidade, tags } = calcularScore(c, vaga);
      return {
        candidato_id: c.id,
        vaga_id: vagaId,
        status: "novo" as const,
        score_compatibilidade,
        tags,
      };
    })
    .sort((a, b) => b.score_compatibilidade - a.score_compatibilidade)
    .slice(0, 15);

  if (!ranked.length) {
    return NextResponse.json({ matched: 0 });
  }

  const ids = ranked.map((r) => r.candidato_id);
  const { data: existingRows } = await supabaseAdmin
    .from("candidaturas")
    .select("candidato_id, status")
    .eq("vaga_id", vagaId)
    .in("candidato_id", ids);

  const statusByCand = new Map<string, string>(
    (existingRows ?? []).map((r: { candidato_id: string; status: string }) => [r.candidato_id, r.status])
  );

  const top = ranked.map((r) => ({
    candidato_id: r.candidato_id,
    vaga_id: r.vaga_id,
    status: (statusByCand.get(r.candidato_id) ?? "novo") as string,
    score_compatibilidade: r.score_compatibilidade,
    tags: r.tags,
  }));

  const db = supabaseAdmin as unknown as {
    from: (t: string) => {
      upsert: (
        rows: typeof top,
        opts?: { onConflict?: string }
      ) => Promise<{ error: { message: string } | null }>;
    };
  };
  const { error: upsertError } = await db.from("candidaturas").upsert(top, {
    onConflict: "candidato_id,vaga_id",
  });
  if (upsertError) return NextResponse.json({ message: upsertError.message }, { status: 500 });

  return NextResponse.json({ matched: top.length });
}
