"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { X } from "lucide-react";
import { STATUS_FILTRO_DB, STATUS_FILTRO_LABELS, type StatusFiltroKey } from "./candidatosConstants";
import { vagaLabelLista, type VagaOpcaoFiltro } from "@/lib/vaga-display";

const sectionTitle: CSSProperties = {
  fontSize: "12px",
  fontWeight: 700,
  color: "var(--n900)",
  marginBottom: "10px",
  marginTop: "4px",
};

const labelRow: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "10px",
  fontSize: "13px",
  padding: "10px 0",
  borderBottom: "1px solid var(--n100)",
  cursor: "pointer",
  color: "var(--n700)",
};

export type CandidatosFiltersBarProps = {
  vagasAtivas: VagaOpcaoFiltro[];
  selectedVagaIds: string[];
  onChangeVagas: (ids: string[]) => void;
  availableTags: string[];
  selectedTags: string[];
  onToggleTag: (tag: string) => void;
  statusTodos: boolean;
  statusKeys: StatusFiltroKey[];
  onChangeStatusTodos: (v: boolean) => void;
  onToggleStatusKey: (k: StatusFiltroKey) => void;
  kmMax: number;
  onChangeKmMax: (v: number) => void;
};

function computeFiltersActive(
  vagasAtivas: VagaOpcaoFiltro[],
  selectedVagaIds: string[],
  selectedTags: string[],
  statusTodos: boolean,
  statusKeys: StatusFiltroKey[],
  kmMax: number
) {
  const vagaFiltered = selectedVagaIds.length > 0 && selectedVagaIds.length < vagasAtivas.length;
  const tagsFiltered = selectedTags.length > 0;
  const statusFiltered = !statusTodos && statusKeys.length > 0;
  const kmFiltered = kmMax < 50;
  return vagaFiltered || tagsFiltered || statusFiltered || kmFiltered;
}

export function CandidatosFiltersBar(props: CandidatosFiltersBarProps) {
  const {
    vagasAtivas,
    selectedVagaIds,
    onChangeVagas,
    availableTags,
    selectedTags,
    onToggleTag,
    statusTodos,
    statusKeys,
    onChangeStatusTodos,
    onToggleStatusKey,
    kmMax,
    onChangeKmMax,
  } = props;

  const [open, setOpen] = useState(false);

  const filtersActive = computeFiltersActive(
    vagasAtivas,
    selectedVagaIds,
    selectedTags,
    statusTodos,
    statusKeys,
    kmMax
  );

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  function toggleVaga(id: string) {
    const set = new Set(selectedVagaIds);
    if (set.has(id)) set.delete(id);
    else set.add(id);
    onChangeVagas([...set]);
  }

  function selectAllVagas() {
    onChangeVagas([]);
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label="Abrir filtros" className="btn btn-ghost btn-sm" style={{ position: "relative" }}>
        ⚙ Filtros
        {filtersActive ? (
          <span
            style={{
              position: "absolute",
              top: "-2px",
              right: "-2px",
              width: "8px",
              height: "8px",
              borderRadius: "50%",
              background: "var(--danger-strong)",
              border: "2px solid var(--white)",
            }}
            aria-hidden
          />
        ) : null}
      </button>

      {open ? (
        <>
          <div
            role="presentation"
            style={{
              position: "fixed",
              inset: 0,
              background: "var(--overlay-dark)",
              zIndex: 85,
            }}
            onClick={() => setOpen(false)}
            onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
          />
          <aside
            style={{
              position: "fixed",
              top: 0,
              right: 0,
              height: "100%",
              width: "min(100vw - 48px, 340px)",
              maxWidth: "100vw",
              background: "var(--white)",
              zIndex: 90,
              boxShadow: "var(--panel-shadow)",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "16px",
                borderBottom: "1px solid var(--n200)",
              }}
            >
              <span style={{ fontSize: "16px", fontWeight: 700, color: "var(--n900)" }}>Filtros</span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Fechar"
                style={{
                  width: "40px",
                  height: "40px",
                  borderRadius: "8px",
                  border: "none",
                  background: "var(--n50)",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <X size={20} color="var(--n500)" />
              </button>
            </div>

            <div
              style={{
                padding: "12px 16px 14px",
                borderBottom: "1px solid var(--n200)",
                background: "var(--white)",
              }}
            >
              <button
                type="button"
                onClick={() => setOpen(false)}
                style={{
                  width: "100%",
                  height: "46px",
                  borderRadius: "10px",
                  border: "none",
                  background: "var(--olive)",
                  color: "var(--berry-dark)",
                  fontSize: "14px",
                  fontWeight: 700,
                  cursor: "pointer",
                  boxShadow: "0 2px 8px rgba(175, 171, 35, 0.35)",
                }}
              >
                Aplicar filtros
              </button>
            </div>

            <div style={{ flex: 1, overflowY: "auto", padding: "16px", paddingBottom: "28px" }}>
              <p style={sectionTitle}>Vaga</p>
              <label style={labelRow}>
                <input type="checkbox" checked={selectedVagaIds.length === 0} onChange={() => selectAllVagas()} />
                Todas as vagas ativas
              </label>
              {vagasAtivas.map((v) => (
                <label key={v.id} style={labelRow}>
                  <input
                    type="checkbox"
                    checked={selectedVagaIds.length > 0 && selectedVagaIds.includes(v.id)}
                    onChange={() => toggleVaga(v.id)}
                  />
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{vagaLabelLista(v)}</span>
                </label>
              ))}

              <p style={{ ...sectionTitle, marginTop: "20px" }}>Tag</p>
              {availableTags.length ? (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
                  {availableTags.map((tag) => {
                    const active = selectedTags.includes(tag);
                    return (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => onToggleTag(tag)}
                        className={active ? "badge b-olive" : "badge b-gray"}
                        style={{ border: "none", cursor: "pointer" }}
                      >
                        {tag}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="fs12 c500" style={{ marginTop: 0, marginBottom: 8 }}>
                  Sem tags no filtro atual.
                </p>
              )}
              <p style={{ ...sectionTitle, marginTop: "20px" }}>Status</p>
              <label style={labelRow}>
                <input
                  type="checkbox"
                  checked={statusTodos}
                  onChange={(e) => onChangeStatusTodos(e.target.checked)}
                />
                Todos
              </label>
              {(Object.keys(STATUS_FILTRO_DB) as StatusFiltroKey[]).map((k, i, arr) => (
                <label
                  key={k}
                  style={{
                    ...labelRow,
                    borderBottom: i === arr.length - 1 ? "none" : labelRow.borderBottom,
                  }}
                >
                  <input type="checkbox" checked={!statusTodos && statusKeys.includes(k)} onChange={() => onToggleStatusKey(k)} />
                  {STATUS_FILTRO_LABELS[k]}
                </label>
              ))}

              <p style={{ ...sectionTitle, marginTop: "20px", marginBottom: "8px" }}>Distância máxima</p>
              <div style={{ padding: "6px 2px 2px" }}>
                <input
                  type="range"
                  min={0}
                  max={50}
                  step={1}
                  value={kmMax}
                  onChange={(e) => onChangeKmMax(Number(e.target.value))}
                  style={{ width: "100%", accentColor: "var(--olive)" }}
                />
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--n400)", marginTop: 6 }}>
                  <span>0km</span>
                  <span>25km</span>
                  <span>{kmMax}km</span>
                </div>
              </div>
            </div>
          </aside>
        </>
      ) : null}
    </>
  );
}
