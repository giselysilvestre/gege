-- Remove candidaturas duplicadas conforme regras operacionais.
-- Gisely: conta de teste → remove todas.
-- Demais: mantém apenas a vaga indicada.

DO $$
DECLARE
  v_la_panata uuid := '533592c1-6dc2-4e52-94ec-92df48042d73';
  v_atendente_botafogo uuid := 'c7c30b08-e5f7-4873-b5a5-e4dc6f2ec0db';
  v_deleted integer := 0;
  r record;
BEGIN
  DELETE FROM public.candidaturas cd
  USING public.candidatos c
  WHERE cd.candidato_id = c.id
    AND c.nome = 'Gisely';
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RAISE NOTICE 'Gisely (teste): % candidaturas removidas', v_deleted;

  FOR r IN
    SELECT cd.id
    FROM public.candidaturas cd
    JOIN public.candidatos c ON c.id = cd.candidato_id
    WHERE c.nome IN ('Fernanda Moraes Silva', 'Rafaella Carrozino Santos')
      AND cd.vaga_id <> v_la_panata
  LOOP
    DELETE FROM public.candidaturas WHERE id = r.id;
    v_deleted := v_deleted + 1;
  END LOOP;
  RAISE NOTICE 'Fernanda/Rafaella: duplicatas Tapí removidas';

  FOR r IN
    SELECT cd.id
    FROM public.candidaturas cd
    JOIN public.candidatos c ON c.id = cd.candidato_id
    WHERE c.nome IN ('Keltton Gomes do Amaral Bezerra', 'Leonardo Luiz Lopes da Silva')
      AND cd.vaga_id <> v_atendente_botafogo
  LOOP
    DELETE FROM public.candidaturas WHERE id = r.id;
    v_deleted := v_deleted + 1;
  END LOOP;
  RAISE NOTICE 'Keltton/Leonardo: duplicatas Supervisor removidas';
END $$;
