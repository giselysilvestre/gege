"use client";

import { useMemo, useState } from "react";
import type { CandidatoExperiencia } from "@/lib/crm/types";
import {
  formatExperienciaDuracao,
  periodoExperienciaLabel,
  resumoCvPreview,
  textoAnaliseCorrida,
} from "@/lib/crm/experiencia";
import "./CandidatoCvResumoToggle.css";

type Props = {
  analiseCompleta: string | null;
  perfilResumo: string | null;
  experiencias: CandidatoExperiencia[];
};

function IconChevron({ open }: { open: boolean }) {
  return (
    <svg
      className={`cv-resumo-chevron${open ? " is-open" : ""}`}
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden
    >
      <path
        d="m4 6 4 4 4-4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function CandidatoCvResumoToggle({
  analiseCompleta,
  perfilResumo,
  experiencias,
}: Props) {
  const [open, setOpen] = useState(false);

  const textoAnalise = useMemo(
    () => textoAnaliseCorrida(analiseCompleta, perfilResumo),
    [analiseCompleta, perfilResumo]
  );

  const hasContent = Boolean(textoAnalise || experiencias.length > 0);
  if (!hasContent) return null;

  const preview = resumoCvPreview(analiseCompleta, perfilResumo);

  return (
    <div className="cv-resumo-panel">
      <div className="cv-resumo-wrap">
        <button
          type="button"
          className="cv-resumo-trigger"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <span className="cv-resumo-trigger-label">Resumo do CV</span>
          <IconChevron open={open} />
        </button>

        {!open && <p className="cv-resumo-preview">{preview}</p>}

        {open && (
          <div className="cv-resumo-expanded">
            {textoAnalise && (
              <section aria-label="Análise da IA">
                <p className="cv-section-kicker">ANÁLISE DA IA</p>
                <div className="cv-analise-card">
                  <p className="cv-analise-text">{textoAnalise}</p>
                </div>
              </section>
            )}

            {experiencias.length > 0 && (
              <section aria-label="Experiência profissional">
                <p className="cv-section-kicker">EXPERIÊNCIA PROFISSIONAL</p>
                <div className="cv-exp-card">
                  <ul className="cv-exp-timeline">
                    {experiencias.map((exp, idx) => {
                      const duracao = formatExperienciaDuracao(exp.meses);
                      const periodo = periodoExperienciaLabel(exp.data_inicio, exp.data_fim);
                      const titulo = exp.empresa || exp.cargo || "Experiência";
                      const detalhe = [exp.cargo, duracao].filter(Boolean).join(" · ");
                      return (
                        <li key={`${exp.empresa}-${idx}`} className="cv-exp-item">
                          <div className="cv-exp-rail" aria-hidden>
                            <span className="cv-exp-dot" />
                          </div>
                          <div>
                            <div className="cv-exp-titulo">{titulo}</div>
                            {detalhe && <div className="cv-exp-detalhe">{detalhe}</div>}
                            {periodo && <div className="cv-exp-datas">{periodo}</div>}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
