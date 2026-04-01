"use client";

type ActiveFilterChip = {
  key: string;
  label: string;
  onRemove: () => void;
};

type ActiveFilterChipsProps = {
  chips: ActiveFilterChip[];
  onClearAll?: () => void;
};

export function ActiveFilterChips({ chips, onClearAll }: ActiveFilterChipsProps) {
  if (!chips.length) return null;
  return (
    <div className="flex aic g8 mb12" style={{ flexWrap: "wrap" }}>
      {chips.map((chip) => (
        <button
          key={chip.key}
          type="button"
          className="badge b-gray"
          onClick={chip.onRemove}
          style={{ border: "none", cursor: "pointer" }}
          title={`Remover filtro: ${chip.label}`}
          aria-label={`Remover filtro: ${chip.label}`}
        >
          {chip.label} ×
        </button>
      ))}
      {onClearAll ? (
        <button type="button" className="btn btn-ghost btn-xs" onClick={onClearAll}>
          Limpar tudo
        </button>
      ) : null}
    </div>
  );
}
