"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toSlug } from "@/lib/slug";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { devWarn } from "@/lib/devLog";
import { useClienteSlug } from "@/lib/context/ClienteSlugContext";
import { getClienteBySlug } from "@/lib/getClienteBySlug";

const FALLBACK_CARGOS = [
  "Atendente",
  "Garçom / Garçonete",
  "Auxiliar de Cozinha",
  "Operador de Caixa",
  "Barista",
  "Entregador",
  "Repositor de Estoque",
  "Supervisor de Turno",
] as const;

const FALLBACK_UNIDADES = [
  "Tapí SP Norte",
  "Tapí SP Jardins",
  "Amélie Campinas",
  "Amélie SP Itaim",
  "Nola SP Sul",
  "Nola SP ABC",
] as const;

type RowUnidade = { id: string; nome: string; cep: string | null };
type RowCargo = {
  id: string;
  nome: string;
  descricao_padrao: string | null;
  salario_referencia?: number | null;
  modalidade?: string | null;
  atividades?: string | null;
  requisitos_obrigatorios?: string | null;
  requisitos_desejaveis?: string | null;
};

const DESCRICAO_INICIAL =
  "Estamos buscando um(a) profissional para integrar nosso time.\n\nResponsabilidades: atendimento ao cliente, operação e organização.\n\nRequisitos: ensino médio completo, disposição e vontade de crescer.";

function buildDescricaoFromCargo(row: RowCargo | undefined): string | null {
  if (!row) return null;
  const atividades = row.atividades?.trim() || "";
  const obrig = row.requisitos_obrigatorios?.trim() || "";
  const desej = row.requisitos_desejaveis?.trim() || "";
  const nome = row.nome?.trim() || "profissional";
  if (!atividades && !obrig && !desej && !(row.descricao_padrao?.trim())) return null;
  if (row.descricao_padrao?.trim()) return row.descricao_padrao.trim();
  const parts: string[] = [];
  parts.push(`Estamos buscando um(a) ${nome} para integrar nosso time.`);
  if (atividades) parts.push(`Atividades:\n${atividades}`);
  if (obrig) parts.push(`Requisitos obrigatórios:\n${obrig}`);
  if (desej) parts.push(`Requisitos desejáveis:\n${desej}`);
  return parts.join("\n\n");
}

function parseBenefitBrl(raw: string): number | null {
  let t = raw.trim().replace(/\s/g, "");
  if (!t) return null;
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  else t = t.replace(/[^\d.]/g, "");
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function buildBeneficiosSummaryLabel(
  flags: {
    benefPlanoSaude: boolean;
    benefOdonto: boolean;
    benefVt: boolean;
    benefRefeicao: boolean;
    benefVa: boolean;
    benefBonus: boolean;
    benefCarreira: boolean;
    benefOutros: boolean;
  },
): string {
  const labels: string[] = [];
  if (flags.benefPlanoSaude) labels.push("Plano de saúde");
  if (flags.benefOdonto) labels.push("Plano odontológico");
  if (flags.benefVt) labels.push("Vale transporte");
  if (flags.benefRefeicao) labels.push("Refeição no local");
  if (flags.benefVa) labels.push("Vale alimentação");
  if (flags.benefBonus) labels.push("Bônus por meta");
  if (flags.benefCarreira) labels.push("Plano de carreira");
  if (flags.benefOutros) labels.push("Outros");
  if (labels.length === 0) return "Selecione os benefícios…";
  if (labels.length <= 2) return labels.join(" · ");
  return `${labels.length} benefícios selecionados`;
}

export default function NovaVagaPage() {
  const slug = useClienteSlug();
  const [nomeVaga, setNomeVaga] = useState("");
  const [cargoCatalogoId, setCargoCatalogoId] = useState("");
  const [legacyCargo, setLegacyCargo] = useState("");
  const [unidadeCatalogoId, setUnidadeCatalogoId] = useState("");
  const [legacyUnidade, setLegacyUnidade] = useState("");
  const [posicoes, setPosicoes] = useState(1);
  const [salario, setSalario] = useState("");
  const [escala, setEscala] = useState("6×1");
  const [horario, setHorario] = useState("");
  const [modelo, setModelo] = useState("CLT");
  const [prazo, setPrazo] = useState("");
  const [benefPlanoSaude, setBenefPlanoSaude] = useState(true);
  const [benefOdonto, setBenefOdonto] = useState(false);
  const [benefVt, setBenefVt] = useState(true);
  const [benefRefeicao, setBenefRefeicao] = useState(false);
  const [benefVa, setBenefVa] = useState(true);
  const [benefVaVal, setBenefVaVal] = useState("R$ 500");
  const [benefBonus, setBenefBonus] = useState(false);
  const [benefBonusVal, setBenefBonusVal] = useState("R$ 300");
  const [benefCarreira, setBenefCarreira] = useState(false);
  const [benefOutros, setBenefOutros] = useState(false);
  const [descricao, setDescricao] = useState(DESCRICAO_INICIAL);
  const [descricaoTouched, setDescricaoTouched] = useState(false);
  const [cep, setCep] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [catalogUnidades, setCatalogUnidades] = useState<RowUnidade[]>([]);
  const [catalogCargos, setCatalogCargos] = useState<RowCargo[]>([]);
  const router = useRouter();

  useEffect(() => {
    void (async () => {
      const sb = getSupabaseBrowserClient();
      const { data: sess } = await sb.auth.getSession();
      if (!sess.session?.user) {
        return;
      }
      const cli = await getClienteBySlug(slug);
      if (!cli?.id) {
        return;
      }
      const [uRes, cRes] = await Promise.all([
        sb
          .from("cliente_unidades")
          .select("id,nome,cep")
          .eq("cliente_id", cli.id)
          .eq("ativo", true)
          .order("nome", { ascending: true }),
        sb
          .from("cliente_cargos")
          .select("id,nome,descricao_padrao,salario_referencia,modalidade,atividades,requisitos_obrigatorios,requisitos_desejaveis")
          .eq("cliente_id", cli.id)
          .eq("ativo", true)
          .order("ordem", { ascending: true })
          .order("nome", { ascending: true }),
      ]);
      setCatalogUnidades((uRes.data as RowUnidade[]) ?? []);
      setCatalogCargos((cRes.data as RowCargo[]) ?? []);
    })();
  }, [slug]);

  useEffect(() => {
    if (!cargoCatalogoId) return;
    const row = catalogCargos.find((c) => c.id === cargoCatalogoId);
    if (!row) return;

    // salário sugerido do cargo
    if (row.salario_referencia != null && Number.isFinite(Number(row.salario_referencia))) {
      setSalario(String(row.salario_referencia));
    }

    // modalidade sugerida do cargo
    if (row.modalidade?.trim()) {
      const mod = row.modalidade.trim();
      if (["CLT", "PJ", "Freelancer", "Temporário"].includes(mod)) {
        setModelo(mod);
      } else if (/h[íi]brid/i.test(mod)) {
        setModelo("CLT");
      } else if (/remot/i.test(mod)) {
        setModelo("PJ");
      }
    }

    // descrição com modelo estruturado do cargo (se usuário ainda não editou manualmente)
    if (!descricaoTouched) {
      const built = buildDescricaoFromCargo(row);
      if (built) setDescricao(built);
    }
  }, [cargoCatalogoId, catalogCargos, descricaoTouched]);

  useEffect(() => {
    if (!unidadeCatalogoId) return;
    const row = catalogUnidades.find((u) => u.id === unidadeCatalogoId);
    const digits = row?.cep?.replace(/\D/g, "") ?? "";
    if (digits.length < 8) return;
    setCep(digits.replace(/(\d{5})(\d{3})/, "$1-$2"));
  }, [unidadeCatalogoId, catalogUnidades]);

  function buildBeneficios(): string {
    const parts: string[] = [];
    if (benefPlanoSaude) parts.push("Plano de saúde");
    if (benefOdonto) parts.push("Plano odontológico");
    if (benefVt) parts.push("Vale transporte");
    if (benefRefeicao) parts.push("Refeição no local");
    if (benefVa) parts.push(`Vale alimentação${benefVaVal.trim() ? ` (${benefVaVal.trim()})` : ""}`);
    if (benefBonus) parts.push(`Bônus${benefBonusVal.trim() ? ` (${benefBonusVal.trim()})` : ""}`);
    if (benefCarreira) parts.push("Plano de carreira");
    if (benefOutros) parts.push("Outros benefícios");
    return parts.join("; ");
  }

  function buildBeneficiosJson(): Record<string, unknown> {
    return {
      plano_saude: benefPlanoSaude,
      plano_odontologico: benefOdonto,
      vale_transporte: benefVt,
      refeicao_local: benefRefeicao,
      vale_alimentacao: benefVa ? parseBenefitBrl(benefVaVal) : null,
      bonus_meta: benefBonus ? parseBenefitBrl(benefBonusVal) : null,
      plano_carreira: benefCarreira,
      outros: benefOutros,
    };
  }

  function resolveCargoNome(): string {
    if (cargoCatalogoId) {
      const row = catalogCargos.find((c) => c.id === cargoCatalogoId);
      if (row?.nome?.trim()) return row.nome.trim();
    }
    if (legacyCargo.trim()) return legacyCargo.trim();
    return nomeVaga.trim();
  }

  function resolveUnidadeTexto(): string | null {
    if (unidadeCatalogoId) {
      const row = catalogUnidades.find((u) => u.id === unidadeCatalogoId);
      if (row?.nome?.trim()) return row.nome.trim();
    }
    if (legacyUnidade.trim()) return legacyUnidade.trim();
    return null;
  }

  async function publicar() {
    setLoading(true);
    setError("");
    try {
      const cargoNome = resolveCargoNome();
      if (!nomeVaga.trim()) throw new Error("Nome da vaga é obrigatório.");
      if (!cargoNome) throw new Error("Cargo é obrigatório.");
      if (!(catalogUnidades.length ? unidadeCatalogoId : legacyUnidade.trim())) throw new Error("Unidade é obrigatória.");
      if (!salario.trim()) throw new Error("Salário é obrigatório.");
      if (!escala.trim()) throw new Error("Escala é obrigatória.");
      if (!horario.trim()) throw new Error("Horário é obrigatório.");
      if (!modelo.trim()) throw new Error("Modelo de contratação é obrigatório.");
      if (!prazo.trim()) throw new Error("Prazo para contratação é obrigatório.");
      if (!cep.trim()) throw new Error("CEP da loja é obrigatório.");
      if (!descricao.trim()) throw new Error("Descrição é obrigatória.");

      const supabase = getSupabaseBrowserClient();
      const { data: sess } = await supabase.auth.getSession();
      const accessToken = sess.session?.access_token;
      if (!accessToken) throw new Error("Sessão expirada. Faça login de novo.");

      const vagaSlug = `${toSlug(cargoNome)}-${Date.now()}`;
      const escalaApi = escala.replace("×", "x");
      const tituloPub = nomeVaga.trim() || null;
      const unidadeTxt = resolveUnidadeTexto();

      const createRes = await fetch("/api/vagas/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        credentials: "include",
        body: JSON.stringify({
          cargo: cargoNome,
          titulo_publicacao: tituloPub,
          quantidade_vagas: posicoes,
          modelo_contratacao: modelo,
          prazo_contratacao: prazo.trim() || null,
          beneficios_json: buildBeneficiosJson(),
          salario,
          escala: escalaApi,
          horario,
          beneficios: buildBeneficios(),
          cep,
          descricao: descricao.trim(),
          unidade: unidadeTxt,
          unidade_id: unidadeCatalogoId || null,
          cargo_catalogo_id: cargoCatalogoId || null,
          slug: vagaSlug,
          clienteSlug: slug,
        }),
      });
      const payload = (await createRes.json().catch(() => ({}))) as { message?: string; id?: string };
      if (!createRes.ok) throw new Error(payload.message || "Não foi possível criar a vaga");
      const id = payload.id;
      if (!id) throw new Error("Resposta da API sem id da vaga");
      const matchRes = await fetch(`/api/vagas/${id}/match?clienteSlug=${encodeURIComponent(slug)}`, { method: "POST", credentials: "include" });
      if (!matchRes.ok) {
        const m = (await matchRes.json().catch(() => ({}))) as { message?: string };
        devWarn("[vagas/nova] match:", m.message ?? matchRes.status);
      }
      router.push(`/${slug}/vagas/${id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao publicar vaga");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: "100%" }}>
      <div className="mb16">
        <Link href={`/${slug}/vagas`} className="btn btn-ghost btn-sm">
          ← Voltar
        </Link>
      </div>
      <div style={{ maxWidth: 660 }}>
        <div className="card">
          <div className="fw8 fs13" style={{ fontSize: 17, marginBottom: 4 }}>
            Nova vaga
          </div>
          <div className="fs12 muted mb20">Preencha as informações para publicar a vaga</div>

          <div className="grid-2 mb16">
            <div>
              <label className="flabel">Nome da Vaga</label>
              <input
                className="form-input"
                type="text"
                placeholder="Ex: Atendente de Loja"
                value={nomeVaga}
                onChange={(e) => setNomeVaga(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="flabel">Cargo</label>
              <select
                className="form-input"
                value={catalogCargos.length ? cargoCatalogoId : legacyCargo}
                onChange={(e) => {
                  const v = e.target.value;
                  if (catalogCargos.length) {
                    setCargoCatalogoId(v);
                    setLegacyCargo("");
                  } else {
                    setLegacyCargo(v);
                    setCargoCatalogoId("");
                  }
                }}
                required
              >
                <option value="">Selecionar cargo</option>
                {catalogCargos.length
                  ? catalogCargos.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nome}
                      </option>
                    ))
                  : FALLBACK_CARGOS.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
              </select>
            </div>
          </div>

          <div className="grid-2 mb16">
            <div>
              <label className="flabel">Unidade</label>
              <select
                className="form-input"
                value={catalogUnidades.length ? unidadeCatalogoId : legacyUnidade}
                onChange={(e) => {
                  const v = e.target.value;
                  if (catalogUnidades.length) {
                    setUnidadeCatalogoId(v);
                    setLegacyUnidade("");
                  } else {
                    setLegacyUnidade(v);
                    setUnidadeCatalogoId("");
                  }
                }}
                required
              >
                <option value="">Selecionar unidade</option>
                {catalogUnidades.length
                  ? catalogUnidades.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.nome}
                      </option>
                    ))
                  : FALLBACK_UNIDADES.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
              </select>
            </div>
            <div>
              <label className="flabel">Posições</label>
              <input
                className="form-input"
                type="number"
                min={1}
                value={posicoes}
                onChange={(e) => setPosicoes(Math.max(1, Number(e.target.value) || 1))}
              />
            </div>
          </div>

          <div className="grid-3 mb16">
            <div>
              <label className="flabel">Salário</label>
              <input
                className="form-input"
                type="text"
                inputMode="decimal"
                placeholder="1800"
                value={salario}
                onChange={(e) => setSalario(e.target.value.replace(/[^\d,.\s]/g, ""))}
                required
              />
            </div>
            <div>
              <label className="flabel">Escala</label>
              <select className="form-input" value={escala} onChange={(e) => setEscala(e.target.value)} required>
                <option>6×1</option>
                <option>5×2</option>
                <option>5×1</option>
                <option>4×3</option>
              </select>
            </div>
            <div>
              <label className="flabel">Horário</label>
              <input className="form-input" type="text" placeholder="08h–16h" value={horario} onChange={(e) => setHorario(e.target.value)} required />
            </div>
          </div>

          <div className="grid-2 mb16">
            <div>
              <label className="flabel">Modelo de contratação</label>
              <select className="form-input" value={modelo} onChange={(e) => setModelo(e.target.value)} required>
                <option>CLT</option>
                <option>Freelancer</option>
                <option>PJ</option>
                <option>Temporário</option>
              </select>
            </div>
            <div>
              <label className="flabel">Prazo para contratação</label>
              <input className="form-input" type="date" value={prazo} onChange={(e) => setPrazo(e.target.value)} required />
            </div>
          </div>

          <div className="mb16">
            <label className="flabel" id="beneficios-multiselect-label">
              Benefícios
            </label>
            <details className="benefit-multiselect">
              <summary className="benefit-multiselect-summary">
                <span className="benefit-multiselect-summary-text">
                  {buildBeneficiosSummaryLabel({
                    benefPlanoSaude,
                    benefOdonto,
                    benefVt,
                    benefRefeicao,
                    benefVa,
                    benefBonus,
                    benefCarreira,
                    benefOutros,
                  })}
                </span>
              </summary>
              <div className="benefit-multiselect-panel" role="group" aria-labelledby="beneficios-multiselect-label">
                <div className="benefit-ms-row">
                  <label className="benefit-ms-check">
                    <input type="checkbox" checked={benefPlanoSaude} onChange={(e) => setBenefPlanoSaude(e.target.checked)} />
                    <span>Plano de saúde</span>
                  </label>
                </div>
                <div className="benefit-ms-row">
                  <label className="benefit-ms-check">
                    <input type="checkbox" checked={benefOdonto} onChange={(e) => setBenefOdonto(e.target.checked)} />
                    <span>Plano odontológico</span>
                  </label>
                </div>
                <div className="benefit-ms-row">
                  <label className="benefit-ms-check">
                    <input type="checkbox" checked={benefVt} onChange={(e) => setBenefVt(e.target.checked)} />
                    <span>Vale transporte</span>
                  </label>
                </div>
                <div className="benefit-ms-row">
                  <label className="benefit-ms-check">
                    <input type="checkbox" checked={benefRefeicao} onChange={(e) => setBenefRefeicao(e.target.checked)} />
                    <span>Refeição no local</span>
                  </label>
                </div>
                <div className="benefit-ms-row">
                  <label className="benefit-ms-check">
                    <input type="checkbox" checked={benefVa} onChange={(e) => setBenefVa(e.target.checked)} />
                    <span>Vale alimentação</span>
                  </label>
                  {benefVa ? (
                    <div className="benefit-ms-value">
                      <input
                        className="benefit-val benefit-val--wide"
                        type="text"
                        inputMode="decimal"
                        placeholder="Ex.: R$ 500"
                        value={benefVaVal}
                        onChange={(e) => setBenefVaVal(e.target.value)}
                        aria-label="Valor do vale alimentação"
                      />
                    </div>
                  ) : null}
                </div>
                <div className="benefit-ms-row">
                  <label className="benefit-ms-check">
                    <input type="checkbox" checked={benefBonus} onChange={(e) => setBenefBonus(e.target.checked)} />
                    <span>Bônus por meta</span>
                  </label>
                  {benefBonus ? (
                    <div className="benefit-ms-value">
                      <input
                        className="benefit-val benefit-val--wide"
                        type="text"
                        inputMode="decimal"
                        placeholder="Ex.: R$ 300"
                        value={benefBonusVal}
                        onChange={(e) => setBenefBonusVal(e.target.value)}
                        aria-label="Valor do bônus por meta"
                      />
                    </div>
                  ) : null}
                </div>
                <div className="benefit-ms-row">
                  <label className="benefit-ms-check">
                    <input type="checkbox" checked={benefCarreira} onChange={(e) => setBenefCarreira(e.target.checked)} />
                    <span>Plano de carreira</span>
                  </label>
                </div>
                <div className="benefit-ms-row">
                  <label className="benefit-ms-check">
                    <input type="checkbox" checked={benefOutros} onChange={(e) => setBenefOutros(e.target.checked)} />
                    <span>Outros</span>
                  </label>
                </div>
              </div>
            </details>
          </div>

          <div className="mb16">
            <label className="flabel">CEP da loja *</label>
            <input className="form-input" value={cep} onChange={(e) => setCep(e.target.value)} placeholder="00000-000" required />
            <div className="fs11 muted" style={{ marginTop: 6 }}>
              Usado para calcular distância dos candidatos
            </div>
          </div>

          <div className="mb20">
            <label className="flabel">Descrição</label>
            <div className="fs11 muted" style={{ marginBottom: 6 }}>
              Gerada automaticamente — edite se quiser
            </div>
            <textarea
              className="form-input"
              rows={5}
              value={descricao}
              onChange={(e) => {
                setDescricaoTouched(true);
                setDescricao(e.target.value);
              }}
            />
          </div>

          <div className="flex g8">
            <button className="btn btn-primary" type="button" disabled={loading} onClick={() => void publicar()}>
              {loading ? "Publicando…" : "Publicar vaga"}
            </button>
            <Link href={`/${slug}/vagas`} className="btn btn-ghost">
              Cancelar
            </Link>
          </div>
          {error ? (
            <p className="fs13 mt16" style={{ color: "var(--danger-fg)" }} role="alert">
              {error}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
