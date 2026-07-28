import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

export type AlertaTipo =
  | "sem_resposta_gege_24h"
  | "sem_resposta_ana_1h"
  | "entrevista_marcada";

export type WhatsappAlerta = {
  id: string;
  tipo: AlertaTipo;
  sessao_id: string | null;
  candidato_id: string | null;
  titulo: string;
  detalhe: string | null;
  metadata: Record<string, unknown>;
  status: string;
  criado_em: string;
  candidato_nome?: string | null;
};

const LABELS: Record<AlertaTipo, string> = {
  sem_resposta_gege_24h: "24h sem resposta ao Gegê",
  sem_resposta_ana_1h: "Ana sem responder (>1h)",
  entrevista_marcada: "Encaminhado p/ entrevista",
};

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const status = url.searchParams.get("status") || "ativo";
    const supabase = getSupabaseAdmin();

    let query = supabase
      .from("whatsapp_alertas")
      .select(
        "id,tipo,sessao_id,candidato_id,titulo,detalhe,metadata,status,criado_em"
      )
      .order("criado_em", { ascending: false })
      .limit(100);

    if (status !== "all") query = query.eq("status", status);

    const { data, error } = await query;
    if (error) {
      if (String(error.message).includes("whatsapp_alertas")) {
        return NextResponse.json({
          alertas: [],
          resumo: {},
          aviso: "Tabela whatsapp_alertas ainda não existe. Rode a migration.",
        });
      }
      throw error;
    }

    const candidatoIds = [
      ...new Set((data ?? []).map((a) => a.candidato_id).filter(Boolean)),
    ] as string[];
    const nomes = new Map<string, string>();
    if (candidatoIds.length) {
      const { data: cands } = await supabase
        .from("candidatos")
        .select("id,nome")
        .in("id", candidatoIds);
      for (const c of cands ?? []) nomes.set(c.id as string, c.nome as string);
    }

    const alertas: WhatsappAlerta[] = (data ?? []).map((a) => ({
      ...a,
      candidato_nome: a.candidato_id ? nomes.get(a.candidato_id) ?? null : null,
    }));

    const resumo = {
      total: alertas.length,
      sem_resposta_gege_24h: alertas.filter((a) => a.tipo === "sem_resposta_gege_24h")
        .length,
      sem_resposta_ana_1h: alertas.filter((a) => a.tipo === "sem_resposta_ana_1h")
        .length,
      entrevista_marcada: alertas.filter((a) => a.tipo === "entrevista_marcada").length,
    };

    return NextResponse.json({ alertas, resumo, labels: LABELS });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const id = String(body.id ?? "").trim();
    const status = String(body.status ?? "ack").trim();
    if (!id) {
      return NextResponse.json({ error: "id obrigatório" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const updates: Record<string, string> = { status };
    if (status === "ack") updates.ack_em = new Date().toISOString();
    if (status === "resolvido") updates.resolvido_em = new Date().toISOString();

    const { error } = await supabase.from("whatsapp_alertas").update(updates).eq("id", id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
