import { createClient } from "@/lib/supabase/server";
import { notFound, redirect } from "next/navigation";

/** Se parecer UUID de vaga, manda para a lista de candidatos (fluxo do painel). */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function VagaPorIdOuSlugPage({ params }: { params: Promise<{ id: string; clienteSlug: string }> }) {
  const { id: segment, clienteSlug } = await params;
  const raw = segment.trim();

  if (UUID_RE.test(raw)) {
    redirect(`/${clienteSlug}/candidatos?vaga=${encodeURIComponent(raw)}`);
  }

  const supabase = await createClient();

  const { data: vaga } = await supabase
    .from("vagas")
    .select(
      `
      id,
      slug,
      cargo,
      titulo_publicacao,
      descricao,
      salario,
      modelo_contratacao,
      criado_em,
      prazo_contratacao,
      clientes ( nome_empresa ),
      cliente_unidades ( cidade, uf )
    `
    )
    .eq("slug", raw)
    .eq("status_vaga", "aberta")
    .single();

  if (!vaga) notFound();

  const titulo = vaga.titulo_publicacao ?? vaga.cargo;
  const empresa = (vaga.clientes as { nome_empresa?: string } | null)?.nome_empresa ?? "Empresa";
  const cidade = (vaga.cliente_unidades as { cidade?: string } | null)?.cidade ?? "";
  const uf = (vaga.cliente_unidades as { uf?: string } | null)?.uf ?? "";

  const jsonLd = {
    "@context": "https://schema.org/",
    "@type": "JobPosting",
    title: titulo,
    description: vaga.descricao ?? titulo,
    datePosted: vaga.criado_em,
    validThrough: vaga.prazo_contratacao ?? null,
    employmentType: vaga.modelo_contratacao === "CLT" ? "FULL_TIME" : "CONTRACTOR",
    hiringOrganization: {
      "@type": "Organization",
      name: empresa,
      sameAs: "https://gege.ia.br",
    },
    jobLocation: {
      "@type": "Place",
      address: {
        "@type": "PostalAddress",
        addressLocality: cidade,
        addressRegion: uf,
        addressCountry: "BR",
      },
    },
    baseSalary: vaga.salario
      ? {
          "@type": "MonetaryAmount",
          currency: "BRL",
          value: {
            "@type": "QuantitativeValue",
            value: Number(vaga.salario),
            unitText: "MONTH",
          },
        }
      : undefined,
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <main style={{ maxWidth: 640, margin: "0 auto", padding: "2rem 1rem" }}>
        <h1>{titulo}</h1>
        <p>
          {empresa} · {cidade}
          {uf ? `, ${uf}` : ""}
        </p>
        {vaga.salario && (
          <p>
            R$ {Number(vaga.salario).toLocaleString("pt-BR")}/mês · {vaga.modelo_contratacao}
          </p>
        )}
        <hr />
        <pre style={{ whiteSpace: "pre-wrap" }}>{vaga.descricao}</pre>
      </main>
    </>
  );
}
