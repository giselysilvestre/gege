import { getSupabaseAdmin } from "@/lib/supabase/admin";

export type CarreiraPublicaData = {
  cliente: {
    id: string;
    slug: string;
    nome_empresa: string | null;
  };
  config: {
    nome_marca: string | null;
    cor_primaria: string | null;
    carreira_trabalhe_texto: string | null;
    carreira_sobre_texto: string | null;
    carreira_logo_url: string | null;
    carreira_capa_url: string | null;
    carreira_texto_cor: string | null;
    instagram_url: string | null;
    linkedin_url: string | null;
    site_url: string | null;
  } | null;
  vagas: Array<{
    id: string;
    slug: string;
    cargo: string;
    titulo_publicacao: string | null;
    salario: number | string | null;
    modelo_contratacao: string | null;
    escala: string | null;
    horario: string | null;
    quantidade_vagas: number | null;
    descricao: string | null;
  }>;
};

export async function getCarreiraPublicaBySlug(rawSlug: string): Promise<CarreiraPublicaData | null> {
  const slug = rawSlug.trim().toLowerCase();
  if (!slug) return null;

  const sb = getSupabaseAdmin();
  const { data: clienteDataBySlug, error } = await sb
    .from("clientes")
    .select("id,slug,nome_empresa")
    .eq("slug", slug)
    .maybeSingle();
  let clienteRow = clienteDataBySlug as
    | {
        id: string;
        slug: string | null;
        nome_empresa: string | null;
      }
    | null;

  console.log("[carreira-debug]", { slug, clienteRow, error });

  // Fallback: muitos clientes antigos guardam URL pública em cliente_configuracoes.carreira_url.
  if (!clienteRow?.id) {
    const { data: cfgByUrl } = await sb
      .from("cliente_configuracoes")
      .select("cliente_id,carreira_url")
      .ilike("carreira_url", `%/${slug}`)
      .maybeSingle();

    const cfgUrlRow = cfgByUrl as
      | {
          cliente_id: string | null;
          carreira_url: string | null;
        }
      | null;

    if (cfgUrlRow?.cliente_id) {
      const { data: clienteDataById } = await sb
        .from("clientes")
        .select("id,slug,nome_empresa")
        .eq("id", cfgUrlRow.cliente_id)
        .maybeSingle();

      clienteRow = clienteDataById as
        | {
            id: string;
            slug: string | null;
            nome_empresa: string | null;
          }
        | null;
    }
  }

  if (!clienteRow?.id) return null;

  const clienteId = String(clienteRow.id);
  const [{ data: cfgData }, { data: vagasData }] = await Promise.all([
    sb
      .from("cliente_configuracoes")
      .select(
        "nome_marca,cor_primaria,carreira_trabalhe_texto,carreira_sobre_texto,carreira_logo_url,carreira_capa_url,carreira_texto_cor,instagram_url,linkedin_url,site_url"
      )
      .eq("cliente_id", clienteId)
      .maybeSingle(),
    sb
      .from("vagas")
      .select("id,slug,cargo,titulo_publicacao,salario,modelo_contratacao,escala,horario,quantidade_vagas,descricao,status_vaga")
      .eq("cliente_id", clienteId)
      .in("status_vaga", ["aberta", "em_selecao"])
      .order("criado_em", { ascending: false }),
  ]);

  const cfgRow = cfgData as
    | {
        nome_marca: string | null;
        cor_primaria: string | null;
        carreira_trabalhe_texto: string | null;
        carreira_sobre_texto: string | null;
        carreira_logo_url: string | null;
        carreira_capa_url: string | null;
        carreira_texto_cor: string | null;
        instagram_url: string | null;
        linkedin_url: string | null;
        site_url: string | null;
      }
    | null;
  const vagasRows = vagasData as
    | Array<{
        id: string;
        slug: string;
        cargo: string;
        titulo_publicacao: string | null;
        salario: number | string | null;
        modelo_contratacao: string | null;
        escala: string | null;
        horario: string | null;
        quantidade_vagas: number | null;
        descricao: string | null;
      }>
    | null;

  return {
    cliente: {
      id: clienteId,
      slug: String(clienteRow.slug ?? slug),
      nome_empresa: (clienteRow.nome_empresa as string | null) ?? null,
    },
    config: cfgRow
      ? {
          nome_marca: (cfgRow.nome_marca as string | null) ?? null,
          cor_primaria: (cfgRow.cor_primaria as string | null) ?? null,
          carreira_trabalhe_texto: (cfgRow.carreira_trabalhe_texto as string | null) ?? null,
          carreira_sobre_texto: (cfgRow.carreira_sobre_texto as string | null) ?? null,
          carreira_logo_url: (cfgRow.carreira_logo_url as string | null) ?? null,
          carreira_capa_url: (cfgRow.carreira_capa_url as string | null) ?? null,
          carreira_texto_cor: (cfgRow.carreira_texto_cor as string | null) ?? null,
          instagram_url: (cfgRow.instagram_url as string | null) ?? null,
          linkedin_url: (cfgRow.linkedin_url as string | null) ?? null,
          site_url: (cfgRow.site_url as string | null) ?? null,
        }
      : null,
    vagas: vagasRows ?? [],
  };
}
