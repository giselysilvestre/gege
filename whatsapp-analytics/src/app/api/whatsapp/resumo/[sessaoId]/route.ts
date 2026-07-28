import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

const PROMPT = `Você é assistente de RH. Com base na conversa abaixo entre a assistente Gê e o candidato,
escreva um resumo objetivo em 3-4 linhas sobre: interesse confirmado, disponibilidade,
distância/localização, situação atual de emprego, experiência mencionada e próximos passos.
Seja factual, sem inferências. Se alguma informação não foi mencionada, não inclua.`;

export async function GET(
  _request: Request,
  context: { params: Promise<{ sessaoId: string }> }
) {
  try {
    const { sessaoId } = await context.params;
    const supabase = getSupabaseAdmin();

    const { data: sessao, error: sessError } = await supabase
      .from("whatsapp_sessoes")
      .select("id,resumo_ia,candidato_id")
      .eq("id", sessaoId)
      .maybeSingle();

    if (sessError) throw sessError;
    if (!sessao) {
      return NextResponse.json({ error: "Sessão não encontrada" }, { status: 404 });
    }

    if (sessao.resumo_ia) {
      return NextResponse.json({ resumo: sessao.resumo_ia, cached: true });
    }

    const { data: eventos, error: evError } = await supabase
      .from("whatsapp_eventos")
      .select("direcao,conteudo,criado_em")
      .eq("sessao_id", sessaoId)
      .order("criado_em", { ascending: true });

    if (evError) throw evError;

    const historico = (eventos ?? [])
      .map((e) => {
        const quem = e.direcao === "inbound" ? "Candidato" : "Gê";
        return `[${e.criado_em}] ${quem}: ${e.conteudo ?? ""}`;
      })
      .join("\n");

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "ANTHROPIC_API_KEY não configurada no whatsapp-analytics" },
        { status: 503 }
      );
    }

    const model = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-20250514";

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 512,
        messages: [
          {
            role: "user",
            content: `${PROMPT}\n\n---\n${historico}`,
          },
        ],
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Anthropic ${response.status}: ${text}`);
    }

    const json = (await response.json()) as {
      content?: { type: string; text?: string }[];
    };
    const resumo =
      json.content?.find((c) => c.type === "text")?.text?.trim() ??
      "Resumo indisponível.";

    await supabase
      .from("whatsapp_sessoes")
      .update({ resumo_ia: resumo })
      .eq("id", sessaoId);

    return NextResponse.json({ resumo, cached: false });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
