"use client";

import { ETAPAS_PIPELINE, iniciais, labelEtapa, labelTag } from "@/lib/crm";
import { useEffect, useMemo, useRef, useState } from "react";

type Conversa = {
  id: string;
  candidato_id: string | null;
  candidato_nome: string;
  telefone: string | null;
  vaga_nome: string;
  etapa_atual: string | null;
  status: string | null;
  ultima_mensagem: string | null;
  ultima_direcao: "inbound" | "outbound" | null;
  ultima_data: string | null;
  precisa_resposta: boolean;
  score_pos_entrevista: number | null;
  score_final: number | null;
  score_ia: number | null;
  tags: string[];
};

type Msg = {
  id: string;
  direcao: "inbound" | "outbound";
  conteudo: string | null;
  criado_em: string;
  tipo_mensagem: string | null;
};

type Agendamento = {
  id: string;
  conteudo: string;
  agendado_para: string;
  status: string;
};

type SortKey =
  | "ultima_msg_recente"
  | "ultima_msg_antiga"
  | "maior_nota"
  | "menor_nota"
  | "status";

export default function ConversasClient() {
  const threadRef = useRef<HTMLDivElement | null>(null);
  const [conversas, setConversas] = useState<Conversa[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [mensagens, setMensagens] = useState<Msg[]>([]);
  const [agendamentos, setAgendamentos] = useState<Agendamento[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortKey>("ultima_msg_recente");
  const [busca, setBusca] = useState("");
  const [filtroEtapa, setFiltroEtapa] = useState("");
  const [soPendentes, setSoPendentes] = useState(false);
  const [agendarAberto, setAgendarAberto] = useState(false);
  const [textoAgendar, setTextoAgendar] = useState("");
  const [quandoAgendar, setQuandoAgendar] = useState("");
  const [agendarMsg, setAgendarMsg] = useState<string | null>(null);
  const [salvandoAgenda, setSalvandoAgenda] = useState(false);

  useEffect(() => {
    const sessionIdFromUrl =
      typeof window !== "undefined"
        ? new URLSearchParams(window.location.search).get("sessionId")
        : null;

    fetch("/api/whatsapp/snapshot", { cache: "no-store" })
      .then((r) => r.json())
      .then((json) => {
        if (json.error) {
          setError(json.error);
          return;
        }
        const lista = json.conversas ?? [];
        setConversas(lista);
        const alvoExiste = sessionIdFromUrl
          ? lista.some((c: Conversa) => c.id === sessionIdFromUrl)
          : false;
        setSelected(alvoExiste ? sessionIdFromUrl : (lista[0]?.id ?? null));
      })
      .catch((e) => setError(String(e)));
  }, []);

  const listaFiltrada = useMemo(() => {
    const q = busca.trim().toLowerCase();
    let copy = conversas.filter((c) => {
      if (soPendentes && !c.precisa_resposta) return false;
      if (filtroEtapa && (c.etapa_atual ?? "sem_etapa") !== filtroEtapa) return false;
      if (!q) return true;
      return (
        c.candidato_nome.toLowerCase().includes(q) ||
        c.vaga_nome.toLowerCase().includes(q) ||
        (c.telefone ?? "").includes(q) ||
        (c.ultima_mensagem ?? "").toLowerCase().includes(q)
      );
    });

    copy = [...copy];
    copy.sort((a, b) => {
      if (sortBy === "maior_nota") {
        return (b.score_pos_entrevista ?? -1) - (a.score_pos_entrevista ?? -1);
      }
      if (sortBy === "menor_nota") {
        return (a.score_pos_entrevista ?? 101) - (b.score_pos_entrevista ?? 101);
      }
      if (sortBy === "status") {
        return labelEtapa(a.etapa_atual).localeCompare(labelEtapa(b.etapa_atual), "pt-BR");
      }
      if (sortBy === "ultima_msg_antiga") {
        const ad = a.ultima_data ? Date.parse(a.ultima_data) : 0;
        const bd = b.ultima_data ? Date.parse(b.ultima_data) : 0;
        return ad - bd;
      }
      const ad = a.ultima_data ? Date.parse(a.ultima_data) : 0;
      const bd = b.ultima_data ? Date.parse(b.ultima_data) : 0;
      return bd - ad;
    });
    return copy;
  }, [conversas, sortBy, busca, filtroEtapa, soPendentes]);

  const selecionada = useMemo(
    () => conversas.find((c) => c.id === selected) ?? null,
    [conversas, selected]
  );

  useEffect(() => {
    if (!selected || listaFiltrada.some((c) => c.id === selected)) return;
    setSelected(listaFiltrada[0]?.id ?? null);
  }, [listaFiltrada, selected]);

  useEffect(() => {
    if (!selected) return;
    fetch(`/api/whatsapp/snapshot?sessionId=${selected}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((json) => setMensagens(json.mensagens ?? []));
    fetch(`/api/whatsapp/agendar?sessionId=${selected}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((json) => setAgendamentos(json.agendamentos ?? []));
  }, [selected]);

  useEffect(() => {
    if (!threadRef.current) return;
    threadRef.current.scrollTop = threadRef.current.scrollHeight;
  }, [mensagens, selected]);

  async function salvarAgendamento() {
    if (!selected || !textoAgendar.trim() || !quandoAgendar) return;
    setSalvandoAgenda(true);
    setAgendarMsg(null);
    try {
      const res = await fetch("/api/whatsapp/agendar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessaoId: selected,
          conteudo: textoAgendar.trim(),
          agendadoPara: new Date(quandoAgendar).toISOString(),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setAgendarMsg(json.error ?? "Erro ao agendar");
        return;
      }
      setAgendarMsg("Mensagem agendada. O bot envia quando o job rodar.");
      setTextoAgendar("");
      setQuandoAgendar("");
      setAgendarAberto(false);
      const list = await fetch(`/api/whatsapp/agendar?sessionId=${selected}`).then((r) => r.json());
      setAgendamentos(list.agendamentos ?? []);
    } catch (e) {
      setAgendarMsg(String(e));
    } finally {
      setSalvandoAgenda(false);
    }
  }

  const pendentesCount = conversas.filter((c) => c.precisa_resposta).length;

  return (
    <section className="crm-page">
      <header className="crm-header">
        <div>
          <h1 className="title">Inbox WhatsApp</h1>
          <p className="sub">
            CRM de conversas do Gege — classificação, filtros e agendamento de mensagens.
          </p>
        </div>
        <div className="crm-stats">
          <span className="stat-pill">{conversas.length} contatos</span>
          <span className="stat-pill stat-warn">{pendentesCount} aguardando resposta</span>
        </div>
      </header>

      <div className="crm-toolbar">
        <input
          className="crm-search"
          placeholder="Buscar nome, vaga, telefone ou mensagem..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
        <select value={filtroEtapa} onChange={(e) => setFiltroEtapa(e.target.value)}>
          <option value="">Todas as etapas</option>
          {ETAPAS_PIPELINE.map((e) => (
            <option key={e} value={e}>
              {labelEtapa(e)}
            </option>
          ))}
        </select>
        <label className="crm-check">
          <input
            type="checkbox"
            checked={soPendentes}
            onChange={(e) => setSoPendentes(e.target.checked)}
          />
          Só quem precisa resposta
        </label>
        <select value={sortBy} onChange={(e) => setSortBy(e.target.value as SortKey)}>
          <option value="ultima_msg_recente">Mais recentes</option>
          <option value="ultima_msg_antiga">Mais antigas</option>
          <option value="maior_nota">Maior score entrevista</option>
          <option value="menor_nota">Menor score entrevista</option>
          <option value="status">Por etapa</option>
        </select>
      </div>

      {error && <div className="card">Erro: {error}</div>}

      <div className="crm-inbox">
        <div className="list">
          {listaFiltrada.length === 0 && (
            <div className="conv empty-list">Nenhum contato com esses filtros.</div>
          )}
          {listaFiltrada.map((c) => (
            <div
              key={c.id}
              className={`conv ${selected === c.id ? "active" : ""}`}
              onClick={() => setSelected(c.id)}
            >
              <div className="conv-row">
                <span className="avatar">{iniciais(c.candidato_nome)}</span>
                <div className="conv-main">
                  <div className="conv-top">
                    <strong>{c.candidato_nome}</strong>
                    {c.precisa_resposta && <span className="badge-need">Responder</span>}
                  </div>
                  <div className="conv-meta">{c.vaga_nome}</div>
                  <div className="conv-tags">
                    <span className="pill stage-pill">{labelEtapa(c.etapa_atual)}</span>
                    {typeof c.score_pos_entrevista === "number" && (
                      <span className="pill score-pill">Entrevista {c.score_pos_entrevista}</span>
                    )}
                    {c.tags.slice(0, 2).map((t) => (
                      <span key={t} className="pill tag-pill">
                        {labelTag(t)}
                      </span>
                    ))}
                  </div>
                  <p className="conv-preview">{c.ultima_mensagem ?? "Sem mensagem"}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="crm-thread-wrap">
          {!selecionada ? (
            <div className="thread-empty">Selecione um contato na lista.</div>
          ) : (
            <>
              <div className="contact-panel">
                <span className="avatar avatar-lg">{iniciais(selecionada.candidato_nome)}</span>
                <div className="contact-info">
                  <h2>{selecionada.candidato_nome}</h2>
                  <p>{selecionada.vaga_nome}</p>
                  <p className="muted">{selecionada.telefone ?? "Sem telefone"}</p>
                  <div className="contact-tags">
                    <span className="pill stage-pill">{labelEtapa(selecionada.etapa_atual)}</span>
                    {selecionada.status && (
                      <span className="pill">{selecionada.status}</span>
                    )}
                    {typeof selecionada.score_ia === "number" && (
                      <span className="pill score-pill">IA {selecionada.score_ia}</span>
                    )}
                    {typeof selecionada.score_pos_entrevista === "number" && (
                      <span className="pill score-pill">
                        Entrevista {selecionada.score_pos_entrevista}
                      </span>
                    )}
                    {selecionada.tags.map((t) => (
                      <span key={t} className="pill tag-pill">
                        {labelTag(t)}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="contact-actions">
                  {selecionada.telefone && (
                    <a
                      className="btn-ghost"
                      href={`https://wa.me/${selecionada.telefone.replace(/\D/g, "")}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Abrir no WhatsApp
                    </a>
                  )}
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => setAgendarAberto((v) => !v)}
                  >
                    Agendar mensagem
                  </button>
                </div>
              </div>

              {agendarAberto && (
                <div className="schedule-box">
                  <textarea
                    rows={3}
                    placeholder="Texto que será enviado pelo Gege na data escolhida..."
                    value={textoAgendar}
                    onChange={(e) => setTextoAgendar(e.target.value)}
                  />
                  <input
                    type="datetime-local"
                    value={quandoAgendar}
                    onChange={(e) => setQuandoAgendar(e.target.value)}
                  />
                  <div className="schedule-actions">
                    <button
                      type="button"
                      className="btn-primary"
                      disabled={salvandoAgenda}
                      onClick={salvarAgendamento}
                    >
                      {salvandoAgenda ? "Salvando..." : "Confirmar agendamento"}
                    </button>
                    <button type="button" className="btn-ghost" onClick={() => setAgendarAberto(false)}>
                      Cancelar
                    </button>
                  </div>
                  {agendarMsg && <p className="schedule-hint">{agendarMsg}</p>}
                  <p className="schedule-hint muted">
                    O envio automático depende do job{" "}
                    <code>node job-enviar-agendadas.js</code> no servidor do bot.
                  </p>
                </div>
              )}

              {agendamentos.length > 0 && (
                <div className="scheduled-strip">
                  <strong>Agendadas:</strong>
                  {agendamentos.map((a) => (
                    <span key={a.id} className="scheduled-item">
                      {new Date(a.agendado_para).toLocaleString("pt-BR")} — {a.conteudo.slice(0, 40)}
                      {a.conteudo.length > 40 ? "…" : ""}
                    </span>
                  ))}
                </div>
              )}

              <div className="thread" ref={threadRef}>
                {mensagens.length === 0 && <div>Nenhuma mensagem para esta sessão.</div>}
                {mensagens.map((m) => (
                  <div key={m.id} className={`msg ${m.direcao === "inbound" ? "in" : "out"}`}>
                    <div>{m.conteudo ?? "[sem conteúdo]"}</div>
                    <div className="msg-meta">
                      {new Date(m.criado_em).toLocaleString("pt-BR")} · {m.tipo_mensagem ?? "texto"}
                    </div>
                  </div>
                ))}
              </div>

              <div className="composer-hint">
                Resposta manual pelo painel: em breve. Hoje a Ana responde automaticamente; use
                agendar ou o link do WhatsApp.
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
