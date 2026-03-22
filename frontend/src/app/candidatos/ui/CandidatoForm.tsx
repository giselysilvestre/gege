"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Candidato } from "@/lib/api";
import { createCandidato, updateCandidato } from "@/lib/api";

type Props =
  | { mode: "create"; initial?: undefined }
  | { mode: "edit"; initial: Candidato };

export function CandidatoForm(props: Props) {
  const router = useRouter();
  const initial = props.mode === "edit" ? props.initial : null;

  const [nome, setNome] = useState(initial?.nome ?? "");
  const [telefone, setTelefone] = useState(initial?.telefone ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [cargo, setCargo] = useState(initial?.cargo ?? "");
  const [cidade, setCidade] = useState(initial?.cidade ?? "");
  const [score, setScore] = useState(String(initial?.score ?? 0));
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const scoreNum = Number(score);
    if (Number.isNaN(scoreNum)) {
      setError("Score deve ser um número.");
      setLoading(false);
      return;
    }

    const emptyToNull = (v: string) => (v.trim() === "" ? null : v.trim());

    try {
      if (props.mode === "create") {
        await createCandidato({
          nome: nome.trim(),
          telefone: emptyToNull(telefone),
          email: emptyToNull(email),
          cargo: emptyToNull(cargo),
          cidade: emptyToNull(cidade),
          score: scoreNum,
        });
      } else {
        await updateCandidato(props.initial.id, {
          nome: nome.trim(),
          telefone: emptyToNull(telefone),
          email: emptyToNull(email),
          cargo: emptyToNull(cargo),
          cidade: emptyToNull(cidade),
          score: scoreNum,
        });
      }
      router.push("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card">
      <form className="form-grid" onSubmit={onSubmit}>
        <div>
          <label htmlFor="nome">Nome *</label>
          <input
            id="nome"
            name="nome"
            required
            value={nome}
            onChange={(e) => setNome(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="telefone">Telefone</label>
          <input
            id="telefone"
            name="telefone"
            value={telefone}
            onChange={(e) => setTelefone(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="email">Email</label>
          <input
            id="email"
            name="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="cargo">Cargo</label>
          <input id="cargo" name="cargo" value={cargo} onChange={(e) => setCargo(e.target.value)} />
        </div>
        <div>
          <label htmlFor="cidade">Cidade</label>
          <input
            id="cidade"
            name="cidade"
            value={cidade}
            onChange={(e) => setCidade(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="score">Score</label>
          <input
            id="score"
            name="score"
            type="number"
            step="any"
            value={score}
            onChange={(e) => setScore(e.target.value)}
          />
        </div>
        <div className="form-actions">
          <button className="btn btn-primary" type="submit" disabled={loading}>
            {loading ? "Salvando…" : "Salvar"}
          </button>
          <button
            className="btn"
            type="button"
            disabled={loading}
            onClick={() => router.push("/")}
          >
            Cancelar
          </button>
        </div>
      </form>
      {error && <p className="error">{error}</p>}
    </div>
  );
}
