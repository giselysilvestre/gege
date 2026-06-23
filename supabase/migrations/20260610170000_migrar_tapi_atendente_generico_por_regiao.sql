-- Vaga fantasma Tapí Atendente (slug atendente-1774391236929):
-- candidatos no RJ -> Atendente Tapí Botafogo
-- fora do RJ -> remove candidatura (volta pro banco de talentos)

DO $$
DECLARE
  v_origem uuid;
  v_botafogo uuid;
  v_movidos integer := 0;
  v_banco integer := 0;
BEGIN
  SELECT id INTO v_origem
  FROM public.vagas
  WHERE slug = 'atendente-1774391236929'
     OR (
       cliente_id IN (SELECT id FROM public.clientes WHERE nome_empresa ILIKE 'Tapí%')
       AND cargo = 'Atendente'
       AND titulo_publicacao IS NULL
       AND status_vaga = 'cancelada'
     )
  ORDER BY CASE WHEN slug = 'atendente-1774391236929' THEN 0 ELSE 1 END
  LIMIT 1;

  SELECT id INTO v_botafogo
  FROM public.vagas
  WHERE titulo_publicacao = 'Atendente Tapí Botafogo'
     OR slug = 'atendente-tapi-botafogo-2026-06-09'
  ORDER BY CASE WHEN titulo_publicacao = 'Atendente Tapí Botafogo' THEN 0 ELSE 1 END
  LIMIT 1;

  IF v_origem IS NULL THEN
    RAISE EXCEPTION 'Vaga origem Tapí Atendente (genérica) não encontrada';
  END IF;
  IF v_botafogo IS NULL THEN
    RAISE EXCEPTION 'Vaga destino Atendente Tapí Botafogo não encontrada';
  END IF;

  CREATE TEMP TABLE tmp_tapi_atendente_class ON COMMIT DROP AS
  SELECT
    cd.id AS candidatura_id,
    cd.candidato_id,
    CASE
      WHEN lower(trim(coalesce(cand.cidade, ''))) IN (
        'são paulo', 'sao paulo', 'guarulhos', 'osasco', 'cotia', 'taboão da serra', 'taboao da serra',
        'carapicuíba', 'carapicuiba', 'embu das artes', 'itaquaquecetuba', 'são mateus', 'sao mateus'
      ) THEN 'fora_rj'
      WHEN lower(trim(coalesce(cand.cidade, ''))) IN (
        'rio de janeiro', 'niterói', 'niteroi', 'são gonçalo', 'sao goncalo', 'duque de caxias',
        'são joão de meriti', 'sao joao de meriti', 'nova iguaçu', 'nova iguacu'
      ) THEN 'rj'
      WHEN regexp_replace(coalesce(cand.cep, ''), '[^0-9]', '', 'g') ~ '^0[0-9]{8}$' THEN 'fora_rj'
      WHEN regexp_replace(coalesce(cand.cep, ''), '[^0-9]', '', 'g') ~ '^2[0-3][0-9]{7}$' THEN 'rj'
      WHEN cand.regiao IS NOT NULL AND cand.regiao LIKE 'sp_%' THEN 'fora_rj'
      WHEN cand.regiao IS NOT NULL AND cand.regiao NOT IN ('indefinido') THEN 'rj'
      WHEN lower(coalesce(cand.bairro, '')) LIKE '%maré%'
        OR lower(coalesce(cand.bairro, '')) LIKE '%mare%' THEN 'rj'
      ELSE 'fora_rj'
    END AS bucket
  FROM public.candidaturas cd
  JOIN public.candidatos cand ON cand.id = cd.candidato_id
  WHERE cd.vaga_id = v_origem;

  DELETE FROM public.candidaturas cd
  USING tmp_tapi_atendente_class t, public.candidaturas cd_b
  WHERE cd.id = t.candidatura_id
    AND t.bucket = 'rj'
    AND cd_b.vaga_id = v_botafogo
    AND cd_b.candidato_id = t.candidato_id;

  UPDATE public.candidaturas cd
  SET vaga_id = v_botafogo,
      atualizado_em = now()
  FROM tmp_tapi_atendente_class t
  WHERE cd.id = t.candidatura_id
    AND t.bucket = 'rj';
  GET DIAGNOSTICS v_movidos = ROW_COUNT;

  DELETE FROM public.candidaturas cd
  USING tmp_tapi_atendente_class t
  WHERE cd.id = t.candidatura_id
    AND t.bucket = 'fora_rj';
  GET DIAGNOSTICS v_banco = ROW_COUNT;

  UPDATE public.candidatos c
  SET disponivel = true,
      atualizado_em = now()
  WHERE c.id IN (
    SELECT DISTINCT t.candidato_id
    FROM tmp_tapi_atendente_class t
    WHERE t.bucket = 'fora_rj'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.candidaturas cd2
    WHERE cd2.candidato_id = c.id
      AND cd2.status IN ('em_triagem', 'em_entrevista', 'em_teste', 'contratado')
  );

  RAISE NOTICE 'Tapí Atendente genérica: % -> Botafogo, % -> Banco', v_movidos, v_banco;
END $$;
