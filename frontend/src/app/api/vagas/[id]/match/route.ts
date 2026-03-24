import { NextResponse } from "next/server";
import { assertAdminEnv, getSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    assertAdminEnv();
  } catch (e) {
    return NextResponse.json(
      { message: e instanceof Error ? e.message : "Configuração do Supabase ausente" },
      { status: 500 }
    );
  }

  const { id } = await context.params;
  const supabaseAdmin = getSupabaseAdmin();

  const { data: vaga, error: vagaError } = await supabaseAdmin.from("vagas").select("id").eq("id", id).single();

  if (vagaError || !vaga) {
    return NextResponse.json({ message: vagaError?.message ?? "Vaga não encontrada" }, { status: 404 });
  }

  const { data: candidatosRaw, error } = await supabaseAdmin
    .from("candidatos")
    .select("id, score, exp_alimentacao_meses, cidade")
    .eq("disponivel", true)
    .limit(80);

  if (error) return NextResponse.json({ message: error.message }, { status: 500 });

  const candidatos = (candidatosRaw ?? []) as Array<{
    id: string;
    score: number | null;
    exp_alimentacao_meses: number | null;
    cidade: string | null;
  }>;

  const top = candidatos
    .map((c) => {
      const baseScore = c.score != null && c.score > 0 ? c.score : 55;
      const score =
        baseScore * 0.4 + Math.min((c.exp_alimentacao_meses ?? 0) / 60, 1) * 100 * 0.3 + 100 * 0.3;
      return {
        candidato_id: c.id,
        vaga_id: id,
        status: "novo" as const,
        score_compatibilidade: Math.min(100, Math.round(score)),
      };
    })
    .sort((a, b) => b.score_compatibilidade - a.score_compatibilidade)
    .slice(0, 15);

  if (top.length) {
    const admin = supabaseAdmin as unknown as {
      from: (t: string) => {
        upsert: (
          rows: typeof top,
          opts?: { onConflict?: string; ignoreDuplicates?: boolean }
        ) => Promise<{ error: { message: string } | null }>;
      };
    };
    const { error: upsertError } = await admin.from("candidaturas").upsert(top, {
      onConflict: "candidato_id,vaga_id",
    });
    if (upsertError) return NextResponse.json({ message: upsertError.message }, { status: 500 });
  }

  return NextResponse.json({ matched: top.length });
}
