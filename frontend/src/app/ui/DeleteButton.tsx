"use client";

import { useRouter } from "next/navigation";
import { deleteCandidatoAction } from "../actions";

type Props = { id: string };

export function DeleteButton({ id }: Props) {
  const router = useRouter();

  return (
    <button
      className="btn btn-danger"
      type="button"
      onClick={async () => {
        if (!confirm("Excluir este candidato?")) return;
        try {
          await deleteCandidatoAction(id);
          router.refresh();
        } catch (e) {
          alert(e instanceof Error ? e.message : "Erro ao excluir");
        }
      }}
    >
      Excluir
    </button>
  );
}
