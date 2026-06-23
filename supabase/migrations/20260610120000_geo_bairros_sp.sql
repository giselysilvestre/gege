-- Dicionário de bairros de São Paulo (capital) em geo_bairros.
-- Regiões reutilizam o mesmo enum do RJ (zona_oeste, zona_leste, etc.).
-- Seed completo também via job-classificar-geografia.js (listarSeedGeoBairrosSp).

comment on table public.geo_bairros is
  'Mapeamento bairro+cidade → região macro (RJ e SP).';

-- Lojas SP: região correta é zona_oeste (Pinheiros), não zona_sul herdada do default RJ.
update public.cliente_unidades
set
  regiao = 'zona_oeste',
  bairro = case when lower(trim(bairro)) = 'copacabana' then 'Pinheiros' else bairro end
where lower(trim(cidade)) in ('são paulo', 'sao paulo');
