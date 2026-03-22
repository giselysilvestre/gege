import { Router } from "express";
import { supabase } from "../lib/supabase.js";
import type { CandidatoInsert, CandidatoUpdate } from "../types/candidato.js";

export const candidatosRouter = Router();

candidatosRouter.get("/", async (_req, res) => {
  const { data, error } = await supabase
    .from("candidatos")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    res.status(500).json({ message: error.message });
    return;
  }
  res.json(data);
});

candidatosRouter.get("/:id", async (req, res) => {
  const { id } = req.params;
  const { data, error } = await supabase
    .from("candidatos")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    res.status(500).json({ message: error.message });
    return;
  }
  if (!data) {
    res.status(404).json({ message: "Candidato não encontrado" });
    return;
  }
  res.json(data);
});

candidatosRouter.post("/", async (req, res) => {
  const body = req.body as Partial<CandidatoInsert>;
  if (!body.nome || typeof body.nome !== "string") {
    res.status(400).json({ message: "Campo obrigatório: nome" });
    return;
  }

  const row: CandidatoInsert = {
    nome: body.nome.trim(),
    telefone: body.telefone ?? null,
    email: body.email ?? null,
    cargo: body.cargo ?? null,
    cidade: body.cidade ?? null,
    score: typeof body.score === "number" ? body.score : Number(body.score) || 0,
  };

  const { data, error } = await supabase
    .from("candidatos")
    .insert(row)
    .select()
    .single();

  if (error) {
    res.status(500).json({ message: error.message });
    return;
  }
  res.status(201).json(data);
});

candidatosRouter.put("/:id", async (req, res) => {
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
  if (body.telefone !== undefined) patch.telefone = body.telefone;
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
    .select()
    .maybeSingle();

  if (error) {
    res.status(500).json({ message: error.message });
    return;
  }
  if (!data) {
    res.status(404).json({ message: "Candidato não encontrado" });
    return;
  }
  res.json(data);
});

candidatosRouter.delete("/:id", async (req, res) => {
  const { id } = req.params;
  const { data, error } = await supabase
    .from("candidatos")
    .delete()
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error) {
    res.status(500).json({ message: error.message });
    return;
  }
  if (!data) {
    res.status(404).json({ message: "Candidato não encontrado" });
    return;
  }
  res.status(204).send();
});
