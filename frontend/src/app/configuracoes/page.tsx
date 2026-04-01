"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { ensureClienteForUser } from "@/lib/ensureClienteBrowser";
import { devError } from "@/lib/devLog";

type ConfiguracoesCliente = {
  cliente_id: string;
  nome_marca: string | null;
  logo_url: string | null;
  cor_primaria: string | null;
  carreira_trabalhe_texto: string | null;
  carreira_sobre_texto: string | null;
  carreira_url: string | null;
  carreira_capa_url: string | null;
  carreira_texto_cor: string | null;
  instagram_url: string | null;
  linkedin_url: string | null;
  site_url: string | null;
  contato_whatsapp: string | null;
  contato_telefone: string | null;
};

type Unidade = { id: string; nome: string; cep: string | null; endereco_linha: string | null; cidade: string | null; uf: string | null; ativo: boolean };
type Cargo = {
  id: string;
  nome: string;
  descricao_padrao: string | null;
  salario_referencia: number | null;
  modalidade: string | null;
  atividades: string | null;
  requisitos_obrigatorios: string | null;
  requisitos_desejaveis: string | null;
  ativo: boolean;
};
type TabKey = "gerais" | "unidades" | "cargos";

const CLIENTE_CONFIG_COLS =
  "cliente_id,nome_marca,logo_url,cor_primaria,carreira_trabalhe_texto,carreira_sobre_texto,carreira_url,carreira_capa_url,carreira_texto_cor,instagram_url,linkedin_url,site_url,contato_whatsapp,contato_telefone";

const MOBILE_MAX = "(max-width: 900px)";

function subscribeNarrow(cb: () => void) {
  const mq = window.matchMedia(MOBILE_MAX);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

function getNarrowSnapshot() {
  return window.matchMedia(MOBILE_MAX).matches;
}

function getNarrowServer() {
  return false;
}

const EMPTY_CONFIG: Omit<ConfiguracoesCliente, "cliente_id"> = {
  nome_marca: "",
  logo_url: "",
  cor_primaria: "",
  carreira_trabalhe_texto: "",
  carreira_sobre_texto: "",
  carreira_url: "",
  carreira_capa_url: "",
  carreira_texto_cor: "#FFFFFF",
  instagram_url: "",
  linkedin_url: "",
  site_url: "",
  contato_whatsapp: "",
  contato_telefone: "",
};

export default function ConfiguracoesPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<TabKey>("gerais");
  const [clienteId, setClienteId] = useState<string | null>(null);
  const [form, setForm] = useState<Omit<ConfiguracoesCliente, "cliente_id">>(EMPTY_CONFIG);
  const [unidades, setUnidades] = useState<Unidade[]>([]);
  const [cargos, setCargos] = useState<Cargo[]>([]);
  const [novaUnidade, setNovaUnidade] = useState({ nome: "", cep: "", endereco_linha: "", cidade: "", uf: "" });
  const [novoCargo, setNovoCargo] = useState({
    nome: "",
    salario_referencia: "",
    modalidade: "",
    atividades: "",
    requisitos_obrigatorios: "",
    requisitos_desejaveis: "",
  });
  const [editingCargoId, setEditingCargoId] = useState<string | null>(null);
  const [uploadingField, setUploadingField] = useState<"logo_url" | "carreira_capa_url" | null>(null);
  const [loadingCep, setLoadingCep] = useState(false);
  const [initialSnapshot, setInitialSnapshot] = useState<string>("");
  const [previewTextColor, setPreviewTextColor] = useState<"light" | "dark">("light");
  const isNarrow = useSyncExternalStore(subscribeNarrow, getNarrowSnapshot, getNarrowServer);
  const [cargoDetailOpen, setCargoDetailOpen] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (isNarrow) setEditingCargoId(null);
  }, [isNarrow]);

  async function loadAll() {
    const sb = getSupabaseBrowserClient();
    const { data: s } = await sb.auth.getSession();
    if (!s.session?.user) return setLoading(false);
    const cli = await ensureClienteForUser(sb, s.session.user);
    if (!cli?.id) return setLoading(false);
    setClienteId(cli.id);

    const [cfgRes, uniRes, carRes] = await Promise.all([
      sb.from("cliente_configuracoes").select(CLIENTE_CONFIG_COLS).eq("cliente_id", cli.id).maybeSingle(),
      sb.from("cliente_unidades").select("id,nome,cep,endereco_linha,cidade,uf,ativo").eq("cliente_id", cli.id).order("nome"),
      sb
        .from("cliente_cargos")
        .select("id,nome,descricao_padrao,salario_referencia,modalidade,atividades,requisitos_obrigatorios,requisitos_desejaveis,ativo")
        .eq("cliente_id", cli.id)
        .order("nome"),
    ]);

    if (!cfgRes.error && cfgRes.data) {
      const c = cfgRes.data as ConfiguracoesCliente;
      const nextForm = {
        nome_marca: c.nome_marca ?? "",
        logo_url: c.logo_url ?? "",
        cor_primaria: c.cor_primaria ?? "",
        carreira_trabalhe_texto: c.carreira_trabalhe_texto ?? "",
        carreira_sobre_texto: c.carreira_sobre_texto ?? "",
        carreira_url: c.carreira_url ?? "",
        carreira_capa_url: c.carreira_capa_url ?? "",
        carreira_texto_cor: c.carreira_texto_cor ?? "#FFFFFF",
        instagram_url: c.instagram_url ?? "",
        linkedin_url: c.linkedin_url ?? "",
        site_url: c.site_url ?? "",
        contato_whatsapp: c.contato_whatsapp ?? "",
        contato_telefone: c.contato_telefone ?? "",
      };
      setForm(nextForm);
      setInitialSnapshot(JSON.stringify({ nextForm }));
    } else {
      setInitialSnapshot(JSON.stringify({ nextForm: EMPTY_CONFIG }));
    }

    setUnidades((uniRes.data as Unidade[] | null) ?? []);
    setCargos((carRes.data as Cargo[] | null) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    void loadAll();
  }, []);

  useEffect(() => {
    const cover = form.carreira_capa_url?.trim();
    if (!cover) {
      setPreviewTextColor("light");
      return;
    }
    let cancelled = false;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (cancelled) return;
      try {
        const canvas = document.createElement("canvas");
        canvas.width = 32;
        canvas.height = 32;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, 32, 32);
        const data = ctx.getImageData(0, 0, 32, 32).data;
        let totalLum = 0;
        let pixels = 0;
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
          totalLum += lum;
          pixels++;
        }
        const avgLum = pixels > 0 ? totalLum / pixels : 0;
        setPreviewTextColor(avgLum >= 150 ? "dark" : "light");
      } catch {
        setPreviewTextColor("light");
      }
    };
    img.onerror = () => {
      if (!cancelled) setPreviewTextColor("light");
    };
    img.src = cover;
    return () => {
      cancelled = true;
    };
  }, [form.carreira_capa_url]);

  const carreiraUrlPreview = useMemo(() => form.carreira_url?.trim() || "https://seu-dominio.com/carreira", [form.carreira_url]);

  async function uploadAsset(file: File, kind: "logo" | "carreira-logo" | "carreira-capa"): Promise<string> {
    if (!clienteId) throw new Error("cliente_id ausente");
    const sb = getSupabaseBrowserClient();
    const ext = (file.name.split(".").pop() || "bin").toLowerCase();
    const path = `${clienteId}/${kind}-${Date.now()}.${ext}`;
    const { error } = await sb.storage.from("cliente-assets").upload(path, file, {
      cacheControl: "3600",
      upsert: true,
      contentType: file.type || undefined,
    });
    if (error) throw error;
    const { data } = sb.storage.from("cliente-assets").getPublicUrl(path);
    if (!data.publicUrl) throw new Error("URL pública não gerada");
    return data.publicUrl;
  }

  async function onPickAsset(field: "logo_url" | "carreira_capa_url", file: File | null) {
    if (!file) return;
    setUploadingField(field);
    try {
      const kind = field === "logo_url" ? "logo" : "carreira-capa";
      const url = await uploadAsset(file, kind);
      setForm((p) => ({ ...p, [field]: url }));
    } catch (e) {
      devError("[configuracoes.uploadAsset]", e);
      alert("Não foi possível enviar a imagem.");
    } finally {
      setUploadingField(null);
    }
  }

  async function saveGerais() {
    if (!clienteId) return;
    setSaving(true);
    const sb = getSupabaseBrowserClient();
    const cfgPayload = {
      cliente_id: clienteId,
      nome_marca: (form.nome_marca ?? "").trim() || null,
      logo_url: (form.logo_url ?? "").trim() || null,
      cor_primaria: (form.cor_primaria ?? "").trim() || null,
      carreira_trabalhe_texto: (form.carreira_trabalhe_texto ?? "").trim() || null,
      carreira_sobre_texto: (form.carreira_sobre_texto ?? "").trim() || null,
      carreira_url: (form.carreira_url ?? "").trim() || null,
      carreira_logo_url: (form.logo_url ?? "").trim() || null,
      carreira_capa_url: (form.carreira_capa_url ?? "").trim() || null,
      carreira_texto_cor: (form.carreira_texto_cor ?? "").trim() || null,
      instagram_url: (form.instagram_url ?? "").trim() || null,
      linkedin_url: (form.linkedin_url ?? "").trim() || null,
      site_url: (form.site_url ?? "").trim() || null,
      contato_whatsapp: (form.contato_whatsapp ?? "").trim() || null,
      contato_telefone: (form.contato_telefone ?? "").trim() || null,
    };
    const { error: cfgErr } = await sb.from("cliente_configuracoes").upsert(cfgPayload, { onConflict: "cliente_id" });
    setSaving(false);
    if (cfgErr) {
      devError("[configuracoes.saveGerais]", cfgErr);
      return alert(`Não foi possível salvar configurações gerais. ${cfgErr.message ?? ""}`.trim());
    }
    setInitialSnapshot(JSON.stringify({ nextForm: form }));
    alert("Configurações gerais salvas.");
  }

  async function addUnidade() {
    if (!clienteId || !novaUnidade.nome.trim()) return;
    const sb = getSupabaseBrowserClient();
    const { error } = await sb.from("cliente_unidades").insert({
      cliente_id: clienteId,
      nome: novaUnidade.nome.trim(),
      cep: novaUnidade.cep.trim() || null,
      endereco_linha: novaUnidade.endereco_linha.trim() || null,
      cidade: novaUnidade.cidade.trim() || null,
      uf: novaUnidade.uf.trim().toUpperCase() || null,
    });
    if (error) return alert("Não foi possível criar unidade.");
    setNovaUnidade({ nome: "", cep: "", endereco_linha: "", cidade: "", uf: "" });
    await loadAll();
  }

  async function preencherEnderecoPorCep(cepRaw: string) {
    const cep = (cepRaw || "").replace(/\D/g, "");
    if (cep.length !== 8) return;
    setLoadingCep(true);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      if (!res.ok) return;
      const data = (await res.json()) as {
        erro?: boolean;
        logradouro?: string;
        localidade?: string;
        uf?: string;
      };
      if (data?.erro) return;
      setNovaUnidade((prev) => ({
        ...prev,
        endereco_linha: prev.endereco_linha?.trim() ? prev.endereco_linha : (data.logradouro ?? ""),
        cidade: prev.cidade?.trim() ? prev.cidade : (data.localidade ?? ""),
        uf: prev.uf?.trim() ? prev.uf : (data.uf ?? ""),
      }));
    } catch {
      // silencioso para não interromper preenchimento manual
    } finally {
      setLoadingCep(false);
    }
  }

  async function addCargo() {
    if (!clienteId || !novoCargo.nome.trim()) return;
    const sb = getSupabaseBrowserClient();
    const salario = Number((novoCargo.salario_referencia || "").replace(",", "."));
    const { error } = await sb.from("cliente_cargos").insert({
      cliente_id: clienteId,
      nome: novoCargo.nome.trim(),
      descricao_padrao: null,
      salario_referencia: Number.isFinite(salario) && salario > 0 ? salario : null,
      modalidade: novoCargo.modalidade.trim() || null,
      atividades: novoCargo.atividades.trim() || null,
      requisitos_obrigatorios: novoCargo.requisitos_obrigatorios.trim() || null,
      requisitos_desejaveis: novoCargo.requisitos_desejaveis.trim() || null,
    });
    if (error) return alert("Não foi possível criar cargo.");
    setNovoCargo({
      nome: "",
      salario_referencia: "",
      modalidade: "",
      atividades: "",
      requisitos_obrigatorios: "",
      requisitos_desejaveis: "",
    });
    await loadAll();
  }

  async function saveUnidade(u: Unidade) {
    const sb = getSupabaseBrowserClient();
    await sb.from("cliente_unidades").update({ nome: u.nome.trim(), cep: u.cep?.trim() || null, endereco_linha: u.endereco_linha?.trim() || null, cidade: u.cidade?.trim() || null, uf: u.uf?.trim().toUpperCase() || null, ativo: u.ativo }).eq("id", u.id);
  }
  async function saveCargo(c: Cargo) {
    const sb = getSupabaseBrowserClient();
    await sb
      .from("cliente_cargos")
      .update({
        nome: c.nome.trim(),
        descricao_padrao: c.descricao_padrao?.trim() || null,
        salario_referencia: c.salario_referencia,
        modalidade: c.modalidade?.trim() || null,
        atividades: c.atividades?.trim() || null,
        requisitos_obrigatorios: c.requisitos_obrigatorios?.trim() || null,
        requisitos_desejaveis: c.requisitos_desejaveis?.trim() || null,
        ativo: c.ativo,
      })
      .eq("id", c.id);
  }
  async function deleteUnidade(id: string) {
    if (!window.confirm("Excluir unidade?")) return;
    const sb = getSupabaseBrowserClient();
    await sb.from("cliente_unidades").delete().eq("id", id);
    await loadAll();
  }
  async function deleteCargo(id: string) {
    if (!window.confirm("Excluir cargo?")) return;
    const sb = getSupabaseBrowserClient();
    await sb.from("cliente_cargos").delete().eq("id", id);
    await loadAll();
  }

  if (loading) return <div className="fs14 c600">Carregando configurações…</div>;

  const slug = (form.nome_marca || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const hasChanges = initialSnapshot !== JSON.stringify({ nextForm: form });
  const initials = (form.nome_marca || "GE").split(/\s+/).filter(Boolean).slice(0, 2).map((x) => x[0]).join("").toUpperCase();

  return (
    <div className="config-page" style={{ maxWidth: 980 }}>
      <div className="config-page-tabs">
        {(
          [
            { key: "unidades" as const, label: "Unidades", short: "Unidades" },
            { key: "cargos" as const, label: "Cargos", short: "Cargos" },
            { key: "gerais" as const, label: "Página de Carreira", short: "Pág. carreira" },
          ] as const
        ).map((t) => {
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              className={`config-tab-btn${active ? " config-tab-btn--active" : ""}`}
              onClick={() => setTab(t.key)}
            >
              <span className="config-tab-label-long">{t.label}</span>
              <span className="config-tab-label-short">{t.short}</span>
            </button>
          );
        })}
      </div>

      {tab === "unidades" ? (
        <div className="card config-unidades-card" style={{ display: "grid", gap: 14 }}>
          <div className="flex aic jsb config-unidades-header">
            <div>
              <div className="fw7 fs18">Unidades</div>
            </div>
            <button type="button" className="btn btn-primary btn-sm config-btn-nova-unidade" onClick={() => void addUnidade()}>
              <span className="config-btn-nova-long">+ Nova unidade</span>
              <span className="config-btn-nova-short">+ Nova</span>
            </button>
          </div>
          <div className="grid-2 config-nova-unidade-grid" style={{ gap: 10 }}>
            <input className="search-input" placeholder="Nome da unidade" value={novaUnidade.nome} onChange={(e) => setNovaUnidade((p) => ({ ...p, nome: e.target.value }))} />
            <input
              className="search-input"
              placeholder="CEP"
              value={novaUnidade.cep}
              onChange={(e) => setNovaUnidade((p) => ({ ...p, cep: e.target.value }))}
              onBlur={() => void preencherEnderecoPorCep(novaUnidade.cep)}
            />
            <input className="search-input" placeholder="Endereço" value={novaUnidade.endereco_linha} onChange={(e) => setNovaUnidade((p) => ({ ...p, endereco_linha: e.target.value }))} />
            <div className="flex g8 config-cidade-uf-row">
              <input className="search-input" placeholder="Cidade" value={novaUnidade.cidade} onChange={(e) => setNovaUnidade((p) => ({ ...p, cidade: e.target.value }))} />
              <input className="search-input config-uf-input" placeholder="UF" value={novaUnidade.uf} onChange={(e) => setNovaUnidade((p) => ({ ...p, uf: e.target.value }))} />
            </div>
          </div>
          {loadingCep ? <div className="fs12 c500">Buscando endereço pelo CEP...</div> : null}
          <div style={{ display: "grid", gap: 8 }}>
            {unidades.length === 0 ? (
              <div className="fs13 c500" style={{ textAlign: "center", padding: 26 }}>
                Nenhuma unidade cadastrada.
              </div>
            ) : (
              unidades.map((u) => (
                <div key={u.id} className="config-unidade-card">
                  <div className="config-unidade-card-info">
                    <div className="fw7 fs14">{u.nome}</div>
                    <div className="fs12 c500">{[u.endereco_linha, u.cidade, u.uf].filter(Boolean).join(" · ") || "Sem endereço"}</div>
                  </div>
                  <div className="flex aic g8 config-unidade-card-actions">
                    <label className="fs12 c500 flex aic g6 config-unidade-ativa">
                      <input type="checkbox" checked={u.ativo} onChange={(e) => setUnidades((prev) => prev.map((x) => (x.id === u.id ? { ...x, ativo: e.target.checked } : x)))} />
                      Ativa
                    </label>
                    <button type="button" className="btn btn-ghost btn-xs" onClick={() => void saveUnidade(u)}>
                      Salvar
                    </button>
                    <button type="button" className="btn btn-ghost btn-xs" onClick={() => void deleteUnidade(u.id)}>
                      Excluir
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      ) : null}

      {tab === "cargos" ? (
        <div className="card config-cargos-card" style={{ display: "grid", gap: 14 }}>
          <div className="flex aic jsb config-cargos-header">
            <div>
              <div className="fw7 fs18">Cargos</div>
            </div>
            <button type="button" className="btn btn-primary btn-sm config-btn-nova-cargo" onClick={() => void addCargo()}>
              <span className="config-btn-nova-cargo-long">+ Novo cargo</span>
              <span className="config-btn-nova-cargo-short">+ Novo</span>
            </button>
          </div>
          <div className="grid-2" style={{ gap: 10 }}>
            <input className="search-input" placeholder="Nome do cargo" value={novoCargo.nome} onChange={(e) => setNovoCargo((p) => ({ ...p, nome: e.target.value }))} />
            <input className="search-input" placeholder="Salário (ex.: 2500)" value={novoCargo.salario_referencia} onChange={(e) => setNovoCargo((p) => ({ ...p, salario_referencia: e.target.value }))} />
            <select className="search-input" value={novoCargo.modalidade} onChange={(e) => setNovoCargo((p) => ({ ...p, modalidade: e.target.value }))}>
              <option value="">Modalidade (selecione)</option>
              <option value="CLT">CLT</option>
              <option value="PJ">PJ</option>
              <option value="Híbrido">Híbrido</option>
              <option value="Remoto">Remoto</option>
            </select>
            <textarea className="search-input" rows={2} placeholder="Atividades (texto livre ou bullets)" value={novoCargo.atividades} onChange={(e) => setNovoCargo((p) => ({ ...p, atividades: e.target.value }))} />
            <textarea className="search-input" rows={3} placeholder="Requisitos obrigatórios (separe em bullets/linhas)" value={novoCargo.requisitos_obrigatorios} onChange={(e) => setNovoCargo((p) => ({ ...p, requisitos_obrigatorios: e.target.value }))} />
            <textarea className="search-input" rows={3} placeholder="Requisitos desejáveis (separe em bullets/linhas)" value={novoCargo.requisitos_desejaveis} onChange={(e) => setNovoCargo((p) => ({ ...p, requisitos_desejaveis: e.target.value }))} />
          </div>
          <div style={{ display: "grid", gap: 8 }}>
            {cargos.length === 0 ? (
              <div className="fs13 c500" style={{ textAlign: "center", padding: 26 }}>
                Nenhum cargo cadastrado.
              </div>
            ) : (
              cargos.map((c) => {
                const editing = editingCargoId === c.id && !isNarrow;
                const subline =
                  [c.salario_referencia != null ? `R$ ${Number(c.salario_referencia).toLocaleString("pt-BR")}` : null, c.modalidade || null].filter(Boolean).join(" · ") ||
                  "Sem salário/modalidade";
                const detailBlocks = (
                  <>
                    {c.atividades?.trim() ? <div className="fs12 c600 config-cargo-text-block">{c.atividades.trim()}</div> : null}
                    {c.requisitos_obrigatorios?.trim() ? (
                      <div className="fs12 c500 config-cargo-text-block">
                        <strong>Obrigatórios:</strong> {c.requisitos_obrigatorios.trim()}
                      </div>
                    ) : null}
                    {c.requisitos_desejaveis?.trim() ? (
                      <div className="fs12 c500 config-cargo-text-block">
                        <strong>Desejáveis:</strong> {c.requisitos_desejaveis.trim()}
                      </div>
                    ) : null}
                  </>
                );
                const hasDetail = Boolean(c.atividades?.trim() || c.requisitos_obrigatorios?.trim() || c.requisitos_desejaveis?.trim());
                return (
                  <div key={c.id} className="config-cargo-card">
                    {editing ? (
                      <>
                        <div className="config-cargo-edit-col">
                          <div className="grid-2 config-cargo-edit-grid" style={{ gap: 8 }}>
                            <input className="search-input" value={c.nome} onChange={(e) => setCargos((prev) => prev.map((x) => (x.id === c.id ? { ...x, nome: e.target.value } : x)))} />
                            <input
                              className="search-input"
                              value={c.salario_referencia != null ? String(c.salario_referencia) : ""}
                              placeholder="Salário"
                              onChange={(e) =>
                                setCargos((prev) =>
                                  prev.map((x) =>
                                    x.id === c.id
                                      ? {
                                          ...x,
                                          salario_referencia: e.target.value.trim()
                                            ? Number.isFinite(Number(e.target.value.replace(",", ".")))
                                              ? Number(e.target.value.replace(",", "."))
                                              : null
                                            : null,
                                        }
                                      : x
                                  )
                                )
                              }
                            />
                            <select
                              className="search-input"
                              value={c.modalidade ?? ""}
                              onChange={(e) => setCargos((prev) => prev.map((x) => (x.id === c.id ? { ...x, modalidade: e.target.value } : x)))}
                            >
                              <option value="">Modalidade</option>
                              <option value="CLT">CLT</option>
                              <option value="PJ">PJ</option>
                              <option value="Híbrido">Híbrido</option>
                              <option value="Remoto">Remoto</option>
                            </select>
                            <input className="search-input" value={c.atividades ?? ""} placeholder="Atividades" onChange={(e) => setCargos((prev) => prev.map((x) => (x.id === c.id ? { ...x, atividades: e.target.value } : x)))} />
                          </div>
                          <textarea className="search-input" rows={2} value={c.requisitos_obrigatorios ?? ""} placeholder="Requisitos obrigatórios" onChange={(e) => setCargos((prev) => prev.map((x) => (x.id === c.id ? { ...x, requisitos_obrigatorios: e.target.value } : x)))} />
                          <textarea className="search-input" rows={2} value={c.requisitos_desejaveis ?? ""} placeholder="Requisitos desejáveis" onChange={(e) => setCargos((prev) => prev.map((x) => (x.id === c.id ? { ...x, requisitos_desejaveis: e.target.value } : x)))} />
                        </div>
                        <div className="flex aic g8 config-cargo-actions-row">
                          <label className="fs12 c500 flex aic g6">
                            <input type="checkbox" checked={c.ativo} onChange={(e) => setCargos((prev) => prev.map((x) => (x.id === c.id ? { ...x, ativo: e.target.checked } : x)))} />
                            Ativo
                          </label>
                          <button
                            type="button"
                            className="btn btn-ghost btn-xs"
                            onClick={async () => {
                              await saveCargo(c);
                              setEditingCargoId(null);
                            }}
                          >
                            Salvar
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost btn-xs"
                            onClick={() => {
                              void loadAll();
                              setEditingCargoId(null);
                            }}
                          >
                            Cancelar
                          </button>
                          <button type="button" className="btn btn-ghost btn-xs" onClick={() => void deleteCargo(c.id)}>
                            Excluir
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="config-cargo-view-main">
                          <div className="config-cargo-view-head">
                            <div className="config-cargo-view-titles">
                              <div className="fw7 fs14">{c.nome}</div>
                              <div className="fs12 c500">{subline}</div>
                            </div>
                            <div className="flex aic g8 config-cargo-actions-row">
                              <label className="fs12 c500 flex aic g6">
                                <input type="checkbox" checked={c.ativo} onChange={(e) => setCargos((prev) => prev.map((x) => (x.id === c.id ? { ...x, ativo: e.target.checked } : x)))} />
                                Ativo
                              </label>
                              {!isNarrow ? (
                                <button type="button" className="btn btn-ghost btn-xs" onClick={() => setEditingCargoId(c.id)}>
                                  Editar
                                </button>
                              ) : null}
                              <button type="button" className="btn btn-ghost btn-xs" onClick={() => void deleteCargo(c.id)}>
                                Excluir
                              </button>
                            </div>
                          </div>
                          {isNarrow ? (
                            <>
                              {hasDetail ? (
                                <button
                                  type="button"
                                  className="btn btn-ghost btn-xs config-cargo-ver-detalhes"
                                  onClick={() =>
                                    setCargoDetailOpen((prev) => ({
                                      ...prev,
                                      [c.id]: !prev[c.id],
                                    }))
                                  }
                                >
                                  {cargoDetailOpen[c.id] ? "Ocultar detalhes" : "Ver detalhes"}
                                </button>
                              ) : null}
                              {cargoDetailOpen[c.id] ? <div className="config-cargo-detail-mobile">{detailBlocks}</div> : null}
                            </>
                          ) : (
                            <div className="config-cargo-detail-desktop">{detailBlocks}</div>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      ) : null}

      {tab === "gerais" ? (
        <div style={{ display: "grid", gap: 16 }}>
          <div
            style={{
              background: form.carreira_capa_url?.trim()
                ? `url(${form.carreira_capa_url.trim()}) center / cover no-repeat`
                : (form.cor_primaria?.trim() || "var(--berry)"),
              borderRadius: 22,
              color: form.carreira_texto_cor?.trim() || (previewTextColor === "dark" ? "#1f2937" : "#fff"),
              padding: "28px 24px",
              position: "relative",
              overflow: "hidden",
            }}
          >
            {form.logo_url?.trim() ? (
              <img
                src={form.logo_url.trim()}
                alt="Logo da marca"
                style={{ width: 44, height: 44, borderRadius: 12, objectFit: "cover", background: "rgba(255,255,255,0.65)", marginBottom: 12 }}
              />
            ) : (
              <div style={{ width: 44, height: 44, borderRadius: 12, background: "rgba(255,255,255,0.18)", display: "grid", placeItems: "center", fontWeight: 800, marginBottom: 12 }}>
                {initials || "GE"}
              </div>
            )}
            <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: -0.4 }}>{form.nome_marca?.trim() || "Nome da empresa"}</div>
            <div style={{ fontSize: 13, opacity: 0.86, marginTop: 6, maxWidth: 640, lineHeight: 1.5 }}>
              {form.carreira_trabalhe_texto?.trim() || "Descrição da empresa..."}
            </div>
            {!form.carreira_capa_url?.trim() ? (
              <div style={{ position: "absolute", top: -60, right: -30, width: 220, height: 220, borderRadius: "50%", background: "rgba(255,255,255,0.08)" }} />
            ) : (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  pointerEvents: "none",
                  background: previewTextColor === "dark"
                    ? "linear-gradient(180deg, rgba(255,255,255,0.32) 0%, rgba(255,255,255,0.16) 100%)"
                    : "linear-gradient(180deg, rgba(16,24,40,0.30) 0%, rgba(16,24,40,0.16) 100%)",
                }}
              />
            )}
          </div>

          <div className="card" style={{ display: "grid", gap: 12 }}>
            <div className="fw7 fs15">Informações gerais</div>
            <div className="grid-2" style={{ gap: 12 }}>
              <div style={{ display: "grid", gap: 6 }}>
                <label className="fs11 fw7 muted" style={{ textTransform: "uppercase" }}>Nome da empresa</label>
                <input className="search-input" value={form.nome_marca ?? ""} onChange={(e) => setForm((p) => ({ ...p, nome_marca: e.target.value }))} />
              </div>
              <div style={{ display: "grid", gap: 6 }}>
                <label className="fs11 fw7 muted" style={{ textTransform: "uppercase" }}>Slug da URL</label>
                <input className="search-input" value={slug} readOnly />
              </div>
            </div>
            <div style={{ display: "grid", gap: 6 }}>
              <label className="fs11 fw7 muted" style={{ textTransform: "uppercase" }}>Descrição</label>
              <textarea className="search-input" rows={3} value={form.carreira_trabalhe_texto ?? ""} onChange={(e) => setForm((p) => ({ ...p, carreira_trabalhe_texto: e.target.value }))} />
            </div>
          </div>

          <div className="card" style={{ display: "grid", gap: 12 }}>
            <div className="fw7 fs15">Redes sociais</div>
            <div className="grid-2" style={{ gap: 12 }}>
              <div style={{ display: "grid", gap: 6 }}>
                <label className="fs11 fw7 muted" style={{ textTransform: "uppercase" }}>Instagram</label>
                <input className="search-input" value={form.instagram_url ?? ""} onChange={(e) => setForm((p) => ({ ...p, instagram_url: e.target.value }))} />
              </div>
              <div style={{ display: "grid", gap: 6 }}>
                <label className="fs11 fw7 muted" style={{ textTransform: "uppercase" }}>LinkedIn</label>
                <input className="search-input" value={form.linkedin_url ?? ""} onChange={(e) => setForm((p) => ({ ...p, linkedin_url: e.target.value }))} />
              </div>
              <div style={{ display: "grid", gap: 6 }}>
                <label className="fs11 fw7 muted" style={{ textTransform: "uppercase" }}>Site</label>
                <input className="search-input" value={form.site_url ?? ""} onChange={(e) => setForm((p) => ({ ...p, site_url: e.target.value }))} />
              </div>
              <div style={{ display: "grid", gap: 6 }}>
                <label className="fs11 fw7 muted" style={{ textTransform: "uppercase" }}>Telefone</label>
                <input className="search-input" value={form.contato_telefone ?? ""} onChange={(e) => setForm((p) => ({ ...p, contato_telefone: e.target.value }))} />
              </div>
            </div>
          </div>

          <div className="card" style={{ display: "grid", gap: 12 }}>
            <div className="fw7 fs15">Aparência</div>
            <div className="grid-2" style={{ gap: 12 }}>
              <div style={{ display: "grid", gap: 6 }}>
                <label className="fs11 fw7 muted" style={{ textTransform: "uppercase" }}>Cor primária</label>
                <div className="flex aic g8">
                  <input
                    type="color"
                    value={(form.cor_primaria || "#6B2D5B").startsWith("#") ? (form.cor_primaria || "#6B2D5B") : "#6B2D5B"}
                    onChange={(e) => setForm((p) => ({ ...p, cor_primaria: e.target.value }))}
                    style={{ width: 36, height: 36, borderRadius: 8, border: "1px solid var(--n200)", background: "transparent", padding: 0, cursor: "pointer" }}
                  />
                  <input className="search-input" value={form.cor_primaria ?? ""} onChange={(e) => setForm((p) => ({ ...p, cor_primaria: e.target.value }))} />
                </div>
              </div>
              <div style={{ display: "grid", gap: 6 }}>
                <label className="fs11 fw7 muted" style={{ textTransform: "uppercase" }}>Cor da letra na capa</label>
                <div className="flex aic g8">
                  <input
                    type="color"
                    value={(form.carreira_texto_cor || "#FFFFFF").startsWith("#") ? (form.carreira_texto_cor || "#FFFFFF") : "#FFFFFF"}
                    onChange={(e) => setForm((p) => ({ ...p, carreira_texto_cor: e.target.value }))}
                    style={{ width: 36, height: 36, borderRadius: 8, border: "1px solid var(--n200)", background: "transparent", padding: 0, cursor: "pointer" }}
                  />
                  <input className="search-input" value={form.carreira_texto_cor ?? ""} onChange={(e) => setForm((p) => ({ ...p, carreira_texto_cor: e.target.value }))} />
                </div>
              </div>
            </div>
            <div className="fs12 c500">Aplicada somente no bloco principal da Página de Carreira.</div>
            <div className="grid-2" style={{ gap: 12 }}>
              <div style={{ display: "grid", gap: 6 }}>
                <label className="fs11 fw7 muted" style={{ textTransform: "uppercase" }}>Foto (logo)</label>
                <label className="search-input" style={{ display: "grid", placeItems: "center", minHeight: 44, cursor: "pointer", borderStyle: "dashed" }}>
                  Clique para enviar logo
                  <input type="file" accept="image/*" onChange={(e) => void onPickAsset("logo_url", e.target.files?.[0] ?? null)} style={{ display: "none" }} />
                </label>
              </div>
              <div style={{ display: "grid", gap: 6 }}>
                <label className="fs11 fw7 muted" style={{ textTransform: "uppercase" }}>Foto (capa)</label>
                <label className="search-input" style={{ display: "grid", placeItems: "center", minHeight: 44, cursor: "pointer", borderStyle: "dashed" }}>
                  Clique para enviar capa
                  <input type="file" accept="image/*" onChange={(e) => void onPickAsset("carreira_capa_url", e.target.files?.[0] ?? null)} style={{ display: "none" }} />
                </label>
              </div>
            </div>
            <input className="search-input" placeholder="Sobre nós (texto da página de carreira)" value={form.carreira_sobre_texto ?? ""} onChange={(e) => setForm((p) => ({ ...p, carreira_sobre_texto: e.target.value }))} />
            <div className="fs12 c500">Preview atual: {carreiraUrlPreview}</div>
            {uploadingField ? <div className="fs12 c500">Enviando imagem...</div> : null}
            <div className="flex aic g8" style={{ justifyContent: "flex-end" }}>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => void loadAll()} disabled={saving || uploadingField != null || !hasChanges}>Cancelar</button>
              <button type="button" className="btn btn-primary btn-sm" onClick={() => void saveGerais()} disabled={saving || uploadingField != null || !hasChanges}>{saving ? "Salvando..." : "Salvar alterações"}</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

