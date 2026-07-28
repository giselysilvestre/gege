export const ETAPAS_PIPELINE = [
  "disparo_template",
  "apresentacao_vaga",
  "confirma_endereco",
  "mini_entrevista",
  "agendamento_entrevista",
  "encerramento",
] as const;

export const ETAPA_LABELS: Record<string, string> = {
  disparo_template: "Disparo template",
  apresentacao_vaga: "Apresentação vaga",
  confirma_endereco: "Confirma endereço",
  mini_entrevista: "Mini entrevista",
  agendamento_entrevista: "Agendamento",
  encerramento: "Encerramento",
  sem_etapa: "Sem etapa",
  outras: "Outras",
};

export const TAG_LABELS: Record<string, string> = {
  crescimento: "Crescimento",
  food: "Food service",
  lideranca: "Liderança",
  alerta_instabilidade: "Instabilidade",
  primeiro_emprego: "Primeiro emprego",
  acima_de_45: "Acima de 45",
};

export function labelEtapa(etapa: string | null) {
  if (!etapa) return ETAPA_LABELS.sem_etapa;
  return ETAPA_LABELS[etapa] ?? etapa.replace(/_/g, " ");
}

export function labelTag(tag: string) {
  return TAG_LABELS[tag] ?? tag.replace(/_/g, " ");
}

export function iniciais(nome: string) {
  const parts = nome.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export function nomePrimeiroUltimo(nome: string) {
  const parts = nome.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return parts[0] ?? nome;
  return `${parts[0]} ${parts[parts.length - 1]}`;
}

export function primeiroNome(nome: string) {
  return nome.trim().split(/\s+/).filter(Boolean)[0] ?? nome;
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
