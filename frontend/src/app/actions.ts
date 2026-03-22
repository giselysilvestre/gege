"use server";

import { deleteCandidato } from "@/lib/api";

export async function deleteCandidatoAction(id: string): Promise<void> {
  await deleteCandidato(id);
}
