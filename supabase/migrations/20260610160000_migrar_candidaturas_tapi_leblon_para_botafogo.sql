-- Migra candidaturas da vaga "Supervisor Leblon" (Tapí) para "Supervisor Tapí Botafogo".
-- Preserva candidatura_id → histórico de whatsapp_sessoes / whatsapp_eventos e etapas do funil.

DO $$
DECLARE
  v_leblon uuid;
  v_botafogo uuid;
  v_deleted integer;
  v_moved integer;
BEGIN
  SELECT id INTO v_leblon
  FROM public.vagas
  WHERE titulo_publicacao = 'Supervisor Leblon'
     OR slug = 'supervisor-1776710346930'
  ORDER BY CASE WHEN titulo_publicacao = 'Supervisor Leblon' THEN 0 ELSE 1 END
  LIMIT 1;

  SELECT id INTO v_botafogo
  FROM public.vagas
  WHERE titulo_publicacao = 'Supervisor Tapí Botafogo'
     OR slug = 'supervisor-tapi-botafogo-2026-06-09'
  ORDER BY CASE WHEN titulo_publicacao = 'Supervisor Tapí Botafogo' THEN 0 ELSE 1 END
  LIMIT 1;

  IF v_leblon IS NULL THEN
    RAISE EXCEPTION 'Vaga origem Supervisor Leblon não encontrada';
  END IF;

  IF v_botafogo IS NULL THEN
    RAISE EXCEPTION 'Vaga destino Supervisor Tapí Botafogo não encontrada';
  END IF;

  IF v_leblon = v_botafogo THEN
    RAISE EXCEPTION 'Origem e destino são a mesma vaga (%)', v_leblon;
  END IF;

  DELETE FROM public.candidaturas cd_l
  USING public.candidaturas cd_b
  WHERE cd_l.vaga_id = v_leblon
    AND cd_b.vaga_id = v_botafogo
    AND cd_l.candidato_id = cd_b.candidato_id;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  UPDATE public.candidaturas
  SET vaga_id = v_botafogo,
      atualizado_em = now()
  WHERE vaga_id = v_leblon;
  GET DIAGNOSTICS v_moved = ROW_COUNT;

  RAISE NOTICE 'Tapí Leblon -> Botafogo: % duplicatas removidas, % candidaturas movidas', v_deleted, v_moved;
END $$;
