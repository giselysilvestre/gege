type Props = { score: number; label?: string };

export function ScoreBadge({ score, label = "score" }: Props) {
  return (
    <div className="text-right shrink-0">
      <div className="font-serif text-2xl font-normal leading-none text-ink">{Math.round(score)}</div>
      <div className="text-[9px] text-mid">{label}</div>
    </div>
  );
}