export type CrmViewId = "kanban" | "conversas" | "funil" | "alertas";

export const FUNIL_ETAPAS = [
  "abordado",
  "respondeu",
  "interessado",
  "qualificado",
  "encaminhado",
  "contratado",
  "reprovado",
  "desistiu",
  "inativo",
] as const;

export type EtapaFunil = (typeof FUNIL_ETAPAS)[number];

export const FUNIL_PRINCIPAL: EtapaFunil[] = [
  "abordado",
  "respondeu",
  "interessado",
  "qualificado",
  "encaminhado",
  "contratado",
];

export const FUNIL_SAIDAS: EtapaFunil[] = ["reprovado", "desistiu", "inativo"];

export const ETAPA_LABELS: Record<EtapaFunil, string> = {
  abordado: "Abordado",
  respondeu: "Respondeu",
  interessado: "Interessado",
  qualificado: "Qualificado",
  encaminhado: "Encaminhado",
  contratado: "Contratado",
  reprovado: "Reprovado",
  desistiu: "Desistiu",
  inativo: "Inativo",
};

export const ETAPA_BADGE_CLASS: Record<EtapaFunil, string> = {
  abordado: "badge-gray",
  respondeu: "badge-blue",
  interessado: "badge-amber",
  qualificado: "badge-purple",
  encaminhado: "badge-teal",
  contratado: "badge-green",
  reprovado: "badge-red",
  desistiu: "badge-red",
  inativo: "badge-red",
};

export const MOTIVOS_REPROVACAO = [
  { value: "score_entrevista", label: "Score entrevista" },
  { value: "distancia", label: "Distância" },
  { value: "horario", label: "Horário" },
  { value: "desistiu", label: "Desistiu" },
  { value: "eliminatorio", label: "Eliminatório" },
] as const;

export type MotivoReprovacao = (typeof MOTIVOS_REPROVACAO)[number]["value"];

export const CRM_TEMPLATES_WHATSAPP = [
  { value: "fup_mensagem", label: "FUP — oiii, não esquece de me responder?" },
  { value: "abordagem_candidatura_gege", label: "Abordagem inicial (nome + vaga)" },
] as const;

export type CrmTemplateWhatsapp = (typeof CRM_TEMPLATES_WHATSAPP)[number]["value"];

export type VagaOption = {
  id: string;
  label: string;
  cargo: string;
  cliente_id: string;
  cliente_nome: string;
  titulo: string | null;
};

export type CandidatoExperiencia = {
  empresa: string;
  cargo: string | null;
  data_inicio: string | null;
  data_fim: string | null;
  meses: number | null;
};

export type CrmCandidatoRow = {
  sessao_id: string;
  candidato_id: string;
  candidatura_id: string | null;
  candidato_nome: string;
  telefone: string | null;
  etapa_funil: EtapaFunil;
  etapa_atual: string | null;
  status_sessao: string | null;
  vaga_id: string | null;
  vaga_nome: string;
  score_cv: number | null;
  score_entrevista: number | null;
  distancia_km: number | null;
  cidade: string | null;
  bairro: string | null;
  regiao: string | null;
  data_nascimento: string | null;
  disponibilidade: string | null;
  situacao: string | null;
  tags: string[];
  ultima_mensagem: string | null;
  ultima_direcao: "inbound" | "outbound" | null;
  ultima_data: string | null;
  ultima_inbound_at: string | null;
  ultima_outbound_at: string | null;
  precisa_resposta: boolean;
  status_dot: "green" | "amber" | "red" | "gray";
  resumo_ia: string | null;
  perfil_resumo: string | null;
  analise_completa: string | null;
  experiencias_cv: CandidatoExperiencia[];
  curriculo_url: string | null;
  reativacao_enviada: boolean;
  motivo_reprovacao: string | null;
  candidatura_status: string | null;
  favorito_crm: boolean;
  sessao_criado_em: string | null;
  /** Valor gravado em whatsapp_sessoes.etapa_funil (sem inferência por etapa_atual). */
  sessao_etapa_funil: EtapaFunil | null;
  sessao_atualizado_em: string | null;
  candidatura_atualizado_em: string | null;
};

export type CrmMetrics = {
  todos: number;
  abordados: number;
  responderam: number;
  interessados: number;
  qualificados: number;
  encaminhados: number;
  reprovados: number;
  pct_responderam: number;
  pct_interessados: number;
  pct_qualificados: number;
  pct_encaminhados: number;
};

export type CrmDashboard = {
  taxa_resposta: number;
  taxa_qualificacao: number;
  tempo_medio_qualificado_horas: number | null;
  funil_counts: Record<EtapaFunil, number>;
  atividade_7d: { dia: string; inbound: number; outbound: number }[];
  motivos_reprovacao: { motivo: string; count: number }[];
};

export type WhatsappMessage = {
  id: string;
  direcao: "inbound" | "outbound";
  conteudo: string | null;
  criado_em: string;
  tipo_mensagem: string | null;
};
