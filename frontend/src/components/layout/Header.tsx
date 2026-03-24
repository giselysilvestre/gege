import { Menu } from "lucide-react";

type Props = { empresa?: string };

export function Header({ empresa = "Cliente" }: Props) {
  return (
    <header className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-bg px-5 py-3.5">
      <span className="font-serif text-xl font-normal tracking-tight text-ink">Gege</span>
      <div className="flex items-center gap-3">
        <span className="text-xs text-mid">{empresa}</span>
        <button
          type="button"
          className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-card text-ink"
        >
          <Menu size={16} />
        </button>
      </div>
    </header>
  );
}