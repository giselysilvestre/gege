export type MockCandidato = {
  id: string;
  nome: string;
  telefone: string;
  cidade: string;
  bairro: string;
  situacao_emprego: string;
  disponibilidade_horario: string;
  escolaridade: string;
  exp_resumo: string;
  exp_alimentacao_meses: number;
  exp_atendimento_meses: number;
  exp_cozinha_meses: number;
  exp_lideranca_meses: number;
  score: number;
  score_compatibilidade: number;
  disponivel: boolean;
};

const base = [
  "Adriele Santos",
  "Carla Souza",
  "Diego Lima",
  "Fernanda Alves",
  "Guilherme Nunes",
  "Helena Costa",
  "Igor Reis",
  "Juliana Melo",
  "Kaio Rocha",
  "Larissa Pinto",
];

export const mockCandidatos: MockCandidato[] = base.map((nome, idx) => ({
  id: String(idx + 1),
  nome,
  telefone: `21 9${6600 + idx}-47${10 + idx}`,
  cidade: "Rio de Janeiro",
  bairro: idx % 2 ? "Bangu" : "Madureira",
  situacao_emprego: idx % 2 ? "desempregada" : "empregada",
  disponibilidade_horario: idx % 3 ? "manh� e noite" : "integral",
  escolaridade: "ensino m�dio completo",
  exp_resumo: "Experi�ncia em atendimento e opera��o de cozinha.",
  exp_alimentacao_meses: 24 + idx * 3,
  exp_atendimento_meses: 18 + idx * 2,
  exp_cozinha_meses: 8 + idx,
  exp_lideranca_meses: idx > 6 ? 6 + idx : 0,
  score: 70 + idx,
  score_compatibilidade: 78 + idx,
  disponivel: true,
}));
