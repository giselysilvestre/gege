export function iniciais(nome: string) {
  const parts = nome.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export function avatarClass(nome: string) {
  const n = nome.charCodeAt(0) % 5;
  return ["av-berry", "av-olive", "av-blue", "av-teal", "av-purple"][n];
}

/** Data/hora compacta para cards do Kanban (estilo Nola: 27/07, 10:25). */
export function formatKanbanCardTime(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const day = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  const time = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return `${day}, ${time}`;
}

export function tempoRelativo(iso: string | null) {
  if (!iso) return "";
  const diff = Date.now() - Date.parse(iso);
  if (Number.isNaN(diff) || diff < 0) return "agora";
  const min = Math.floor(diff / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min}min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h}h`;
  const d = Math.floor(h / 24);
  if (d === 1) return "ontem";
  if (d < 7) return `há ${d}d`;
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

export function formatHoraMsg(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

/** Separador de dia no estilo WhatsApp (Hoje / Ontem / data). */
export function formatDiaConversa(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const hoje = new Date();
  const ontem = new Date();
  ontem.setDate(hoje.getDate() - 1);
  const mesmoDia = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
  if (mesmoDia(d, hoje)) return "Hoje";
  if (mesmoDia(d, ontem)) return "Ontem";
  return d.toLocaleDateString("pt-BR", {
    day: "numeric",
    month: "numeric",
    year: "numeric",
  });
}

export function chaveDiaConversa(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

export function idadeDe(dataNasc: string | null | undefined): number | null {
  if (!dataNasc) return null;
  const b = new Date(dataNasc);
  if (Number.isNaN(b.getTime())) return null;
  const t = new Date();
  let a = t.getFullYear() - b.getFullYear();
  const m = t.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && t.getDate() < b.getDate())) a--;
  return a >= 0 ? a : null;
}

export function formatIdade(dataNasc: string | null | undefined): string | null {
  const idade = idadeDe(dataNasc);
  return idade != null ? `${idade} anos` : null;
}

const REGIAO_LABELS: Record<string, string> = {
  rj_zona_sul: "Zona Sul",
  rj_zona_norte: "Zona Norte",
  rj_zona_oeste: "Zona Oeste",
  rj_zona_leste: "Zona Leste",
  rj_centro: "Centro",
  rj_baixada: "Baixada",
  rj_niteroi: "Niterói",
  sp_zona_sul: "Zona Sul",
  sp_zona_norte: "Zona Norte",
  sp_zona_oeste: "Zona Oeste",
  sp_zona_leste: "Zona Leste",
  sp_centro: "Centro",
  sp_baixada: "Baixada",
  zona_sul: "Zona Sul",
  zona_norte: "Zona Norte",
  zona_oeste: "Zona Oeste",
  zona_leste: "Zona Leste",
  centro: "Centro",
  baixada: "Baixada",
  niteroi: "Niterói",
};

export function formatRegiaoLabel(regiao: string | null | undefined): string | null {
  if (!regiao || regiao === "indefinido") return null;
  if (REGIAO_LABELS[regiao]) return REGIAO_LABELS[regiao];
  const semUf = regiao.replace(/^(rj|sp)_/, "").replace(/_/g, " ");
  return semUf.replace(/\b\w/g, (c) => c.toUpperCase());
}

export function formatLocalizacao(
  cidade: string | null | undefined,
  bairro: string | null | undefined,
  regiao: string | null | undefined
): string | null {
  const cidadeTxt = cidade?.trim() || null;
  const bairroTxt = bairro?.trim() || null;
  const regiaoTxt = formatRegiaoLabel(regiao);
  const local =
    bairroTxt && cidadeTxt
      ? `${bairroTxt}, ${cidadeTxt}`
      : cidadeTxt ?? bairroTxt ?? null;
  if (local && regiaoTxt) return `${local} · ${regiaoTxt}`;
  return local ?? regiaoTxt ?? null;
}

export function truncar(texto: string | null, max = 80) {
  if (!texto) return "";
  const t = texto.replace(/\s+/g, " ").trim();
  return t.length <= max ? t : `${t.slice(0, max)}…`;
}

export function diasSemResposta(
  ultimaInbound: string | null,
  ultimaOutbound: string | null
) {
  const ref = ultimaOutbound || ultimaInbound;
  if (!ref) return 0;
  return Math.floor((Date.now() - Date.parse(ref)) / 86400000);
}

export function precisaResposta(
  ultimaInbound: string | null,
  ultimaOutbound: string | null,
  ultimaDirecao: "inbound" | "outbound" | null
) {
  if (ultimaDirecao === "inbound") return true;
  if (!ultimaInbound) return false;
  if (!ultimaOutbound) return true;
  return Date.parse(ultimaInbound) > Date.parse(ultimaOutbound);
}

/** Evita buscar milhares de eventos só para timestamp/direção da última msg. */
export function ultimaAtividadeFromSessao(
  ultimaInbound: string | null,
  ultimaOutbound: string | null
): {
  ultima_data: string | null;
  ultima_direcao: "inbound" | "outbound" | null;
} {
  const inT = ultimaInbound ? Date.parse(ultimaInbound) : 0;
  const outT = ultimaOutbound ? Date.parse(ultimaOutbound) : 0;
  if (!inT && !outT) return { ultima_data: null, ultima_direcao: null };
  if (inT >= outT) {
    return { ultima_data: ultimaInbound, ultima_direcao: inT > outT ? "inbound" : "outbound" };
  }
  return { ultima_data: ultimaOutbound, ultima_direcao: "outbound" };
}

/** Janela de 24h do WhatsApp: texto livre só entrega se o candidato respondeu nas últimas 24h. */
export const JANELA_WHATSAPP_MS = 24 * 60 * 60 * 1000;

export function dentroJanela24h(ultimaInboundAt: string | null, agora = Date.now()) {
  if (!ultimaInboundAt) return false;
  const t = Date.parse(ultimaInboundAt);
  if (Number.isNaN(t)) return false;
  return agora - t < JANELA_WHATSAPP_MS;
}

export function horasDesdeUltimaResposta(ultimaInboundAt: string | null, agora = Date.now()) {
  if (!ultimaInboundAt) return null;
  const t = Date.parse(ultimaInboundAt);
  if (Number.isNaN(t)) return null;
  return Math.floor((agora - t) / (60 * 60 * 1000));
}

/** Só no painel: enviada por você no CRM (não aparece no WhatsApp do candidato). */
export function isMensagemManualCrm(direcao: string, tipoMensagem: string | null) {
  return direcao === "outbound" && tipoMensagem === "manual_crm";
}

export function normalizarBuscaNome(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .trim();
}

export function normalizarBuscaTelefone(s: string) {
  return s.replace(/\D/g, "");
}

export function candidatoMatchBusca(
  row: { candidato_nome: string; telefone: string | null },
  query: string
) {
  const q = query.trim();
  if (!q) return true;
  const qNome = normalizarBuscaNome(q);
  if (qNome && normalizarBuscaNome(row.candidato_nome).includes(qNome)) return true;
  const qTel = normalizarBuscaTelefone(q);
  if (qTel.length > 0) {
    const tel = normalizarBuscaTelefone(row.telefone ?? "");
    if (tel.includes(qTel)) return true;
  }
  return false;
}
