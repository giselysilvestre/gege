import { Router } from "express";
import { getSupabase } from "../lib/supabase.js";
import { safeClientMessage } from "../lib/safeClientMessage.js";
import type { CandidatoInsert, CandidatoUpdate } from "../types/candidato.js";

export const candidatosRouter = Router();
const CANDIDATO_COLUMNS = "id,nome,telefone,email,cargo,cidade,score,criado_em";

/** Compat: API expõe `created_at` como alias de `criado_em` (coluna real no Postgres). */
function mapCandidatoApi(row: Record<string, unknown>) {
  const { criado_em, ...rest } = row;
  return { ...rest, created_at: criado_em };
}

function dbOr503(res: import("express").Response) {
  try {
    return getSupabase();
  } catch (e) {
    res.status(503).json({ message: safeClientMessage(e) });
    return null;
  }
}

candidatosRouter.get("/", async (_req, res) => {
  const supabase = dbOr503(res);
  if (!supabase) return;
  const { data, error } = await supabase
    .from("candidatos")
    .select(CANDIDATO_COLUMNS)
    .order("criado_em", { ascending: false });

  if (error) {
    res.status(500).json({ message: safeClientMessage(error) });
    return;
  }
  const rows = (data as Record<string, unknown>[] | null) ?? [];
  res.json(rows.map(mapCandidatoApi));
});

candidatosRouter.get("/:id", async (req, res) => {
  const supabase = dbOr503(res);
  if (!supabase) return;
  const { id } = req.params;
  const { data, error } = await supabase
    .from("candidatos")
    .select(CANDIDATO_COLUMNS)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    res.status(500).json({ message: safeClientMessage(error) });
    return;
  }
  if (!data) {
    res.status(404).json({ message: "Candidato não encontrado" });
    return;
  }
  res.json(mapCandidatoApi(data as Record<string, unknown>));
});

candidatosRouter.post("/", async (req, res) => {
  const supabase = dbOr503(res);
  if (!supabase) return;
  const body = req.body as Partial<CandidatoInsert>;
  if (!body.nome || typeof body.nome !== "string") {
    res.status(400).json({ message: "Campo obrigatório: nome" });
    return;
  }
  if (!body.telefone || typeof body.telefone !== "string" || !body.telefone.trim()) {
    res.status(400).json({ message: "Campo obrigatório: telefone" });
    return;
  }

  const row: CandidatoInsert = {
    nome: body.nome.trim(),
    telefone: body.telefone.trim(),
    email: body.email ?? null,
    cargo: body.cargo ?? null,
    cidade: body.cidade ?? null,
    score: typeof body.score === "number" ? body.score : Number(body.score) || 0,
  };

  const { data, error } = await supabase
    .from("candidatos")
    .insert(row)
    .select(CANDIDATO_COLUMNS)
    .single();

  if (error) {
    res.status(500).json({ message: safeClientMessage(error) });
    return;
  }
  res.status(201).json(mapCandidatoApi(data as Record<string, unknown>));
});

candidatosRouter.put("/:id", async (req, res) => {
  const supabase = dbOr503(res);
  if (!supabase) return;
  const { id } = req.params;
  const body = req.body as CandidatoUpdate;

  const patch: CandidatoUpdate = {};
  if (body.nome !== undefined) {
    if (typeof body.nome !== "string" || !body.nome.trim()) {
      res.status(400).json({ message: "nome inválido" });
      return;
    }
    patch.nome = body.nome.trim();
  }
  if (body.telefone !== undefined) {
    if (typeof body.telefone !== "string" || !body.telefone.trim()) {
      res.status(400).json({ message: "telefone inválido" });
      return;
    }
    patch.telefone = body.telefone.trim();
  }
  if (body.email !== undefined) patch.email = body.email;
  if (body.cargo !== undefined) patch.cargo = body.cargo;
  if (body.cidade !== undefined) patch.cidade = body.cidade;
  if (body.score !== undefined) {
    const n = typeof body.score === "number" ? body.score : Number(body.score);
    if (Number.isNaN(n)) {
      res.status(400).json({ message: "score inválido" });
      return;
    }
    patch.score = n;
  }

  if (Object.keys(patch).length === 0) {
    res.status(400).json({ message: "Nenhum campo para atualizar" });
    return;
  }

  const { data, error } = await supabase
    .from("candidatos")
    .update(patch)
    .eq("id", id)
    .select(CANDIDATO_COLUMNS)
    .maybeSingle();

  if (error) {
    res.status(500).json({ message: safeClientMessage(error) });
    return;
  }
  if (!data) {
    res.status(404).json({ message: "Candidato não encontrado" });
    return;
  }
  res.json(mapCandidatoApi(data as Record<string, unknown>));
});

candidatosRouter.delete("/:id", async (req, res) => {
  const supabase = dbOr503(res);
  if (!supabase) return;
  const { id } = req.params;
  const { data, error } = await supabase
    .from("candidatos")
    .delete()
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error) {
    res.status(500).json({ message: safeClientMessage(error) });
    return;
  }
  if (!data) {
    res.status(404).json({ message: "Candidato não encontrado" });
    return;
  }
  res.status(204).send();
});
