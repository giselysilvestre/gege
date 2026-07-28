"use client";

import { useMemo, type ReactNode } from "react";
import { buildVisaoGeralModel } from "@/lib/crm/visaoGeral";
import { labelTag } from "@/lib/crm";
import type { CrmCandidatoRow, CrmDashboard, CrmMetrics } from "@/lib/crm/types";

const AGENDA_VISIBLE = 4;

const FUNNEL_FILL_CLASS: Record<string, string> = {
  abordado: "fill-abordado",
  respondeu: "fill-respondeu",
  interessado: "fill-interessado",
  qualificado: "fill-qualificado",
  encaminhado: "fill-encaminhado",
  contratado: "fill-contratado",
};

function funnelBarWidthPct(count: number, max: number): number {
  if (count <= 0 || max <= 0) return 0;
  return Math.max(6, Math.round((count / max) * 100));
}

const METRIC_ICON = {
  viewBox: "0 0 24 24",
  fill: "none" as const,
  "aria-hidden": true,
};

function IconChat() {
  return (
    <svg {...METRIC_ICON}>
      <path
        d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconChatPlus() {
  return (
    <svg {...METRIC_ICON}>
      <path
        d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M12 8v8M8 12h8" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

function IconSend() {
  return (
    <svg {...METRIC_ICON}>
      <path
        d="m22 2-7 20-4-9-9-4 20-7z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M22 2 11 13" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconHeart() {
  return (
    <svg {...METRIC_ICON}>
      <path
        d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconChatDots() {
  return (
    <svg {...METRIC_ICON}>
      <path
        d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="8.5" cy="12" r="0.9" fill="currentColor" />
      <circle cx="12" cy="12" r="0.9" fill="currentColor" />
      <circle cx="15.5" cy="12" r="0.9" fill="currentColor" />
    </svg>
  );
}

function IconCheck() {
  return (
    <svg {...METRIC_ICON}>
      <path
        d="M20 6 9 17l-5-5"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconUsers() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="9" cy="7" r="4" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M19 8v6M22 11h-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function IconReply() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M9 14 4 9l5-5M4 9h11a4 4 0 0 1 4 4v6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconHandoff() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M7 8h10M7 16h10M17 5l3 3-3 3M7 19l-3-3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconBriefcase() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M8 7V6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v1M4 9h16v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V9Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M9 13h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}


function MetricCard({
  icon,
  value,
  label,
  hint,
}: {
  icon: ReactNode;
  value: string | number;
  label: string;
  hint?: string;
}) {
  return (
    <div className="nola-metric-card">
      <div className="nola-metric-head">
        <div className="nola-metric-label">{label}</div>
        <span className="nola-metric-icon">{icon}</span>
      </div>
      <div className="nola-metric-value">{typeof value === "number" ? value.toLocaleString("pt-BR") : value}</div>
      {hint && <div className="nola-metric-hint">{hint}</div>}
    </div>
  );
}

export default function VisaoGeralDashboard({
  rows,
  metrics,
  dashboard,
  onOpenCandidato,
  onVerTodosProntos,
}: {
  rows: CrmCandidatoRow[];
  metrics: CrmMetrics | null;
  dashboard: CrmDashboard | null;
  onOpenCandidato?: (sessaoId: string) => void;
  onVerTodosProntos?: () => void;
}) {
  const model = useMemo(
    () => buildVisaoGeralModel(rows, metrics, dashboard),
    [rows, metrics, dashboard]
  );

  const maxFunil = Math.max(...model.funil_progressao.map((s) => s.count), 1);
  const prontosVisiveis = model.prontos_cliente.slice(0, AGENDA_VISIBLE);
  const temMaisProntos = model.prontos_cliente.length > AGENDA_VISIBLE;

  return (
    <div className="dash-view nola-dash">
      <section className="nola-section">
        <div className="nola-section-header">
          <div className="nola-section-title-row">
            <span className="nola-section-title">Métricas do dia</span>
            <span className="nola-tag">Hoje</span>
          </div>
        </div>
        <div className="nola-metric-grid nola-metric-grid-4">
          <MetricCard
            icon={<IconChat />}
            value={model.metricas_dia.conversas_ativas}
            label="Conversas ativas"
            hint="Última interação há 24h"
          />
          <MetricCard
            icon={<IconChatPlus />}
            value={model.metricas_dia.abordados_hoje}
            label="Abordados hoje"
            hint={
              model.metricas_dia.abordados_hoje > 0
                ? `${model.metricas_dia.abordados_hoje_pct_resposta}% responderam`
                : undefined
            }
          />
          <MetricCard
            icon={<IconHeart />}
            value={model.metricas_dia.qualificados}
            label="Qualificados"
            hint={
              model.metricas_dia.abordados_hoje > 0
                ? `de ${model.metricas_dia.abordados_hoje} abordados hoje`
                : undefined
            }
          />
          <MetricCard
            icon={<IconSend />}
            value={model.metricas_dia.encaminhados_hoje}
            label="Encaminhados"
            hint="Marcados hoje no CRM"
          />
        </div>
      </section>

      <section className="nola-section">
        <div className="nola-section-header">
          <div className="nola-section-title-row">
            <span className="nola-section-title">Métricas do período</span>
          </div>
        </div>
        <div className="nola-metric-grid nola-metric-grid-4">
          <MetricCard
            icon={<IconChatPlus />}
            value={model.metricas_periodo.abordados}
            label="Abordados total"
          />
          <MetricCard
            icon={<IconChatDots />}
            value={model.metricas_periodo.respondidos}
            label="Respondidos"
            hint={`${model.metricas_periodo.pct_respondidos}% responderam`}
          />
          <MetricCard icon={<IconSend />} value={model.metricas_periodo.encaminhados} label="Encaminhados" />
          <MetricCard
            icon={<IconCheck />}
            value={model.metricas_periodo.contratados}
            label="Contratados"
            hint={`${model.metricas_periodo.pct_conversao_total}% de conversão total`}
          />
        </div>
      </section>

      <section className="nola-agenda-panel crm-panel">
        <div className="nola-agenda-head">
          <span className="nola-agenda-title">Prontos para o cliente</span>
          {model.prontos_cliente.length > 0 && (
            <button type="button" className="nola-link-action nola-agenda-link" onClick={() => onVerTodosProntos?.()}>
              Ver todas
              <svg viewBox="0 0 24 24" width="12" height="12" fill="none" aria-hidden="true">
                <path
                  d="M14 5h5v5M10 14 19 5M5 19v-5h5"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          )}
        </div>
        {model.prontos_cliente.length === 0 ? (
          <p className="nola-agenda-empty">Nenhum candidato interessado ou qualificado no momento.</p>
        ) : (
          <ul className="nola-agenda-list">
            {prontosVisiveis.map((c) => (
              <li key={c.sessao_id}>
                <button
                  type="button"
                  className="nola-agenda-row"
                  onClick={() => onOpenCandidato?.(c.sessao_id)}
                >
                  <span className="nola-agenda-icon">
                    <IconHeart />
                  </span>
                  <span className="nola-agenda-name">{c.nome}</span>
                  <span className="nola-agenda-tags">
                    <span className="nola-agenda-tag nola-agenda-tag-vaga" title={c.vaga_nome}>
                      {c.vaga_nome}
                    </span>
                    {c.tags[0] ? (
                      <span
                        className="nola-agenda-tag nola-agenda-tag-analise"
                        title={c.tags.map(labelTag).join(", ")}
                      >
                        {labelTag(c.tags[0])}
                      </span>
                    ) : null}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {temMaisProntos && (
          <div className="nola-agenda-footer">
            +{model.prontos_cliente.length - AGENDA_VISIBLE} candidatos
          </div>
        )}
      </section>

      <section className="crm-funnel-panel crm-panel">
        <div className="crm-funnel-head">
          <h2 className="crm-funnel-title">Funil de progressão</h2>
          <p className="nola-section-sub">Quantos candidatos atingiram cada etapa ou posterior</p>
        </div>

        <div className="crm-funnel-bars" role="img" aria-label="Funil de progressão de candidatos">
          {model.funil_progressao.map((step, i) => {
            const widthPct = funnelBarWidthPct(step.count, maxFunil);
            const conv =
              i < model.funil_progressao.length - 1 ? step.pct_para_proximo : null;
            const fillClass = FUNNEL_FILL_CLASS[step.etapa] ?? "fill-abordado";

            return (
              <div key={step.etapa} className="funnel-row">
                <span className="funnel-lbl">{step.label}</span>
                <div className="funnel-wrap">
                  <div
                    className={`funnel-fill ${fillClass}`}
                    style={{ width: `${widthPct}%` }}
                  />
                </div>
                <span className="funnel-val">{step.count.toLocaleString("pt-BR")}</span>
                <span className="funnel-pct">{conv != null ? `${Math.round(conv)}%` : ""}</span>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
