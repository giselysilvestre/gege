type Status = "aberta" | "em_selecao" | "fechada" | "cancelada" | "novo" | "aprovado" | "reprovado";

const map: Record<Status, string> = {
  aberta: "bg-[#FDF0EB] text-orange",
  em_selecao: "bg-lavanda text-[#6B5FA0]",
  fechada: "bg-[#F2F2F4] text-mid",
  cancelada: "bg-[#F2F2F4] text-mid",
  novo: "bg-lavanda text-[#6B5FA0]",
  aprovado: "bg-[#DCFCE7] text-[#16A34A]",
  reprovado: "bg-[#EEEAEF] text-[#333]",
};

export function StatusPill({ status, children }: { status: Status; children?: React.ReactNode }) {
  return (
    <span className={`inline-flex rounded-full px-2 py-1 text-[10px] font-medium ${map[status]}`}>
      {children ?? status.replace("_", " ")}
    </span>
  );
}
