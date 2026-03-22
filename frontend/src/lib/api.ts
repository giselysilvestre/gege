export type Candidato = {
  id: string;
  nome: string;
  telefone: string | null;
  email: string | null;
  cargo: string | null;
  cidade: string | null;
  score: number;
  created_at: string;
};

export function getApiBase(): string {
  const base = process.env.NEXT_PUBLIC_API_URL;
  if (!base) {
    throw new Error("Defina NEXT_PUBLIC_API_URL no .env do frontend.");
  }
  return base.replace(/\/$/, "");
}

export async function fetchCandidatos(): Promise<Candidato[]> {
  const res = await fetch(`${getApiBase()}/api/candidatos`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function fetchCandidato(id: string): Promise<Candidato> {
  const res = await fetch(`${getApiBase()}/api/candidatos/${id}`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function createCandidato(
  body: Omit<Candidato, "id" | "created_at">
): Promise<Candidato> {
  const res = await fetch(`${getApiBase()}/api/candidatos`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function updateCandidato(
  id: string,
  body: Partial<
    Pick<Candidato, "nome" | "telefone" | "email" | "cargo" | "cidade" | "score">
  >
): Promise<Candidato> {
  const res = await fetch(`${getApiBase()}/api/candidatos/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function deleteCandidato(id: string): Promise<void> {
  const res = await fetch(`${getApiBase()}/api/candidatos/${id}`, {
    method: "DELETE",
  });
  if (!res.ok && res.status !== 204) throw new Error(await res.text());
}
