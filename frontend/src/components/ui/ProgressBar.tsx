export function ProgressBar({ value }: { value: number }) {
  const clamped = Math.max(0, Math.min(value, 100));
  return (
    <div className="h-[3px] w-full rounded-full bg-black/10">
      <div className="h-[3px] rounded-full bg-ink" style={{ width: `${clamped}%` }} />
    </div>
  );
}