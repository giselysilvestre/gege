import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

function normalizarTelefone(raw: string) {
  return raw.replace(/\D/g, "");
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const sessionId = url.searchParams.get("sessionId");
    const supabase = getSupabaseAdmin();

    let query = supabase
      .from("whatsapp_mensagens_agendadas")
      .select("id,sessao_id,conteudo,agendado_para,status,criado_em,erro")
      .in("status", ["pendente", "erro"])
      .order("agendado_para", { ascending: true })
      .limit(100);

    if (sessionId) query = query.eq("sessao_id", sessionId);

    const { data, error } = await query;
    if (error) {
      if (error.message.includes("whatsapp_mensagens_agendadas")) {
        return NextResponse.json({
          agendamentos: [],
          aviso: "Tabela de agendamentos ainda não existe no Supabase. Rode a migration em supabase/migrations.",
        });
      }
      throw error;
    }

    return NextResponse.json({ agendamentos: data ?? [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const sessaoId = String(body.sessaoId ?? "").trim();
    const conteudo = String(body.conteudo ?? "").trim();
    const agendadoPara = String(body.agendadoPara ?? "").trim();

    if (!sessaoId || !conteudo || !agendadoPara) {
      return NextResponse.json(
        { error: "sessaoId, conteudo e agendadoPara são obrigatórios" },
        { status: 400 }
      );
    }

    const quando = Date.parse(agendadoPara);
    if (Number.isNaN(quando) || quando <= Date.now()) {
      return NextResponse.json(
        { error: "agendadoPara deve ser uma data/hora futura válida" },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();
    const { data: sessao, error: sessaoError } = await supabase
      .from("whatsapp_sessoes")
      .select("id,candidato_id")
      .eq("id", sessaoId)
      .maybeSingle();

    if (sessaoError) throw sessaoError;
    if (!sessao) {
      return NextResponse.json({ error: "Sessão não encontrada" }, { status: 404 });
    }

    let telefone = normalizarTelefone(String(body.telefone ?? ""));
    if (!telefone && sessao.candidato_id) {
      const { data: cand } = await supabase
        .from("candidatos")
        .select("telefone")
        .eq("id", sessao.candidato_id)
        .maybeSingle();
      telefone = normalizarTelefone(String(cand?.telefone ?? ""));
    }

    if (!telefone) {
      return NextResponse.json({ error: "Telefone do candidato não encontrado" }, { status: 400 });
    }

    const { data: inserted, error: insertError } = await supabase
      .from("whatsapp_mensagens_agendadas")
      .insert({
        sessao_id: sessaoId,
        candidato_id: sessao.candidato_id,
        telefone,
        conteudo,
        agendado_para: new Date(quando).toISOString(),
        status: "pendente",
      })
      .select("id,agendado_para,status")
      .single();

    if (insertError) {
      if (insertError.message.includes("whatsapp_mensagens_agendadas")) {
        return NextResponse.json(
          {
            error:
              "Tabela whatsapp_mensagens_agendadas não existe. Aplique a migration no Supabase antes de agendar.",
          },
          { status: 503 }
        );
      }
      throw insertError;
    }

    return NextResponse.json({ ok: true, agendamento: inserted });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
