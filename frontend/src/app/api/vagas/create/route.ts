import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseRouteHandlerClient } from "@/lib/supabase/server";
import { getCurrentCliente } from "@/lib/data";
import { devError } from "@/lib/devLog";

function bearerToken(request: Request): string | null {
  const h = request.headers.get("authorization");
  if (!h?.startsWith("Bearer ")) return null;
  const t = h.slice(7).trim();
  return t || null;
}

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parseSalarioInput(raw: string | undefined): number | null {
  if (raw == null || !String(raw).trim()) return null;
  let s = String(raw).trim().replace(/\s/g, "");
  if (s.includes(",")) {
    s = s.replace(/\./g, "").replace(",", ".");
  }
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
}

function parseUuid(raw: string | undefined | null): string | null {
  if (raw == null || !String(raw).trim()) return null;
  const s = String(raw).trim();
  return UUID_RE.test(s) ? s : null;
}

function parsePrazo(raw: string | undefined | null): string | null {
  if (raw == null || !String(raw).trim()) return null;
  const s = String(raw).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return s;
}

function parseQuantidade(raw: unknown): number | null {
  if (raw == null) return null;
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n) || n < 1) return null;
  return Math.floor(n);
}

function sanitizeBeneficiosJson(raw: unknown): Record<string, unknown> | null {
  if (raw == null) return null;
  if (typeof raw !== "object" || Array.isArray(raw)) return null;
  return raw as Record<string, unknown>;
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
    unidade?: string;
    slug: string;
    titulo_publicacao?: string | null;
    quantidade_vagas?: number | null;
    modelo_contratacao?: string | null;
    prazo_contratacao?: string | null;
    beneficios_json?: unknown;
    unidade_id?: string | null;
    cargo_catalogo_id?: string | null;
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

  const unidadeId = parseUuid(body.unidade_id ?? undefined);
  const cargoCatalogoId = parseUuid(body.cargo_catalogo_id ?? undefined);
  if (body.unidade_id && !unidadeId) {
    return NextResponse.json({ message: "unidade_id inválido" }, { status: 400 });
  }
  if (body.cargo_catalogo_id && !cargoCatalogoId) {
    return NextResponse.json({ message: "cargo_catalogo_id inválido" }, { status: 400 });
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

  const titulo = body.titulo_publicacao?.trim() || null;
  const qtd = parseQuantidade(body.quantidade_vagas);
  const modelo = body.modelo_contratacao?.trim() || null;
  const prazo = parsePrazo(body.prazo_contratacao ?? null);
  const bjson = sanitizeBeneficiosJson(body.beneficios_json);

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
      unidade: body.unidade?.trim() || null,
      titulo_publicacao: titulo,
      quantidade_vagas: qtd,
      modelo_contratacao: modelo,
      prazo_contratacao: prazo,
      beneficios_json: bjson,
      unidade_id: unidadeId,
      cargo_catalogo_id: cargoCatalogoId,
    })
    .select("id")
    .single();

  if (error) {
    devError("[api/vagas/create]", error);
    const hint =
      error.message?.includes("slug") || error.message?.includes("column")
        ? " Rode as migrations 006–007 e 012–013 se ainda não rodou."
        : "";
    return NextResponse.json({ message: `${error.message}${hint}` }, { status: 500 });
  }

  return NextResponse.json({ id: data.id });
}
