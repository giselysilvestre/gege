type Props = { nome: string; size?: number };

const colors = [
  { bg: "#C8DDD4", color: "#2D5C4A" },
  { bg: "#C8D4E8", color: "#2D3F5C" },
  { bg: "#E8D4D0", color: "#5C2D2D" },
];

export function Avatar({ nome, size = 40 }: Props) {
  const index = nome.charCodeAt(0) % colors.length;
  const initials = nome
    .split(" ")
    .slice(0, 2)
    .map((v) => v[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <div
      className="inline-flex items-center justify-center rounded-full font-semibold"
      style={{
        width: size,
        height: size,
        background: colors[index].bg,
        color: colors[index].color,
        fontSize: size < 44 ? 12 : 14,
      }}
    >
      {initials}
    </div>
  );
}