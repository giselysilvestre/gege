export interface Candidato {
  id: string;
  nome: string;
  telefone: string | null;
  email: string | null;
  cargo: string | null;
  cidade: string | null;
  score: number;
  created_at: string;
}

export type CandidatoInsert = Omit<Candidato, "id" | "created_at"> & {
  id?: string;
  created_at?: string;
};

export type CandidatoUpdate = Partial<
  Pick<Candidato, "nome" | "telefone" | "email" | "cargo" | "cidade" | "score">
>;
