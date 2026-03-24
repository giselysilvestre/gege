import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseRouteHandlerClient } from "@/lib/supabase/server";
import { getCurrentCliente } from "@/lib/data";

function bearerToken(request: Request): string | null {
  const h = request.headers.get("authorization");
  if (!h?.startsWith("Bearer ")) return null;
  const t = h.slice(7).trim();
  return t || null;
}

export const dynamic = "force-dynamic";

function parseSalarioInput(raw: string | undefined): number | null {
  if (raw == null || !String(raw).trim()) return null;
  let s = String(raw).trim().replace(/\s/g, "");
  if (s.includes(",")) {
    s = s.replace(/\./g, "").replace(",", ".");
  }
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
}

export async function POST(request: Request) {
  let body: {
    cargo: string;
    salario?: string;
    beneficios?: string;
    escala?: string;
    horario?: string;
    cep?: string;
    descricao?: string;
    slug: string;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ message: "JSON inválido" }, { status: 400 });
  }

  if (!body.cargo?.trim()) {
    return NextResponse.json({ message: "Cargo é obrigatório" }, { status: 400 });
  }
  if (!body.slug?.trim()) {
    return NextResponse.json({ message: "Slug inválido" }, { status: 400 });
  }

  const token = bearerToken(request);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const supabase =
    token && url && anon
      ? createClient(url, anon, {
          global: { headers: { Authorization: `Bearer ${token}` } },
          auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
        })
      : await getSupabaseRouteHandlerClient();

  const cliente = await getCurrentCliente(supabase, { accessToken: token });
  if (!cliente?.id) {
    return NextResponse.json(
      { message: "Sessão inválida ou cliente não encontrado. Faça login de novo." },
      { status: 401 }
    );
  }
  const cepDigits = body.cep?.replace(/\D/g, "") ?? "";

  const { data, error } = await supabase
    .from("vagas")
    .insert({
      cliente_id: cliente.id,
      cargo: body.cargo.trim(),
      salario: parseSalarioInput(body.salario),
      beneficios: body.beneficios?.trim() || null,
      escala: body.escala?.trim() || null,
      horario: body.horario?.trim() || null,
      status_vaga: "aberta",
      slug: body.slug.trim(),
      cep_loja: cepDigits || null,
      descricao: body.descricao?.trim() || null,
    })
    .select("id")
    .single();

  if (error) {
    console.error("[api/vagas/create]", error);
    const hint =
      error.message?.includes("slug") || error.message?.includes("column")
        ? " Rode no Supabase (SQL Editor) as migrations 006_vagas_slug_cep_desc.sql e 007 se ainda não rodou."
        : "";
    return NextResponse.json({ message: `${error.message}${hint}` }, { status: 500 });
  }

  return NextResponse.json({ id: data.id });
}
