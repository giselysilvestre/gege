-- Regiões com prefixo de estado: rj_zona_sul ≠ sp_zona_sul (nunca ambíguo).

-- ---------------------------------------------------------------------------
-- geo_bairros
-- ---------------------------------------------------------------------------
update public.geo_bairros
set regiao = case
  when regiao = 'niteroi' then 'rj_niteroi'
  when uf = 'RJ' and regiao not like 'rj\_%' then 'rj_' || regiao
  when uf = 'SP' and regiao not like 'sp\_%' then 'sp_' || regiao
  else regiao
end
where regiao is not null and regiao <> 'indefinido';

alter table public.geo_bairros drop constraint if exists geo_bairros_regiao_check;
alter table public.geo_bairros add constraint geo_bairros_regiao_check check (
  regiao in (
    'indefinido',
    'rj_zona_sul', 'rj_zona_norte', 'rj_zona_oeste', 'rj_zona_leste', 'rj_centro', 'rj_baixada', 'rj_niteroi',
    'sp_zona_sul', 'sp_zona_norte', 'sp_zona_oeste', 'sp_zona_leste', 'sp_centro', 'sp_baixada'
  )
);

-- ---------------------------------------------------------------------------
-- candidatos.regiao — inferir UF pela cidade
-- ---------------------------------------------------------------------------
update public.candidatos c
set regiao = case
  when c.regiao is null or c.regiao = 'indefinido' then c.regiao
  when c.regiao like 'rj\_%' or c.regiao like 'sp\_%' then c.regiao
  when c.regiao = 'niteroi' then 'rj_niteroi'
  when lower(trim(coalesce(c.cidade, ''))) in (
    'sao paulo', 'são paulo', 'guarulhos', 'osasco', 'taboao da serra', 'taboão da serra',
    'embu das artes', 'diadema', 'santo andre', 'santo andré', 'sao bernardo do campo',
    'maua', 'mauá', 'carapicuiba', 'carapicuíba', 'cotia', 'itapevi', 'jandira', 'barueri',
    'ferraz de vasconcelos', 'itaquaquecetuba', 'suzano', 'mogi das cruzes', 'poa', 'poá',
    'franco da rocha', 'itapecerica da serra', 'embu-guacu', 'sao caetano do sul', 'sao caetano'
  ) then 'sp_' || c.regiao
  when lower(trim(coalesce(c.cidade, ''))) in (
    'rio de janeiro', 'niteroi', 'niterói', 'duque de caxias', 'nova iguacu', 'nova iguaçu',
    'belford roxo', 'sao joao de meriti', 'são joão de meriti', 'sao goncalo', 'são gonçalo',
    'queimados', 'japeri', 'itaguai', 'itaguaí', 'nilopolis', 'nilópolis'
  ) then 'rj_' || c.regiao
  else 'indefinido'
end
where c.regiao is not null and c.regiao <> 'indefinido'
  and c.regiao not like 'rj\_%' and c.regiao not like 'sp\_%';

alter table public.candidatos drop constraint if exists candidatos_regiao_check;
alter table public.candidatos add constraint candidatos_regiao_check check (
  regiao is null or regiao in (
    'indefinido',
    'rj_zona_sul', 'rj_zona_norte', 'rj_zona_oeste', 'rj_zona_leste', 'rj_centro', 'rj_baixada', 'rj_niteroi',
    'sp_zona_sul', 'sp_zona_norte', 'sp_zona_oeste', 'sp_zona_leste', 'sp_centro', 'sp_baixada'
  )
);

-- ---------------------------------------------------------------------------
-- cliente_unidades.regiao
-- ---------------------------------------------------------------------------
update public.cliente_unidades u
set regiao = case
  when u.regiao is null or u.regiao = 'indefinido' then u.regiao
  when u.regiao like 'rj\_%' or u.regiao like 'sp\_%' then u.regiao
  when lower(trim(coalesce(u.cidade, ''))) in ('sao paulo', 'são paulo') then
    case when u.regiao = 'niteroi' then 'indefinido' else 'sp_' || u.regiao end
  else
    case when u.regiao = 'niteroi' then 'rj_niteroi' else 'rj_' || u.regiao end
end
where u.regiao is not null and u.regiao <> 'indefinido'
  and u.regiao not like 'rj\_%' and u.regiao not like 'sp\_%';

alter table public.cliente_unidades drop constraint if exists cliente_unidades_regiao_check;
alter table public.cliente_unidades add constraint cliente_unidades_regiao_check check (
  regiao is null or regiao in (
    'indefinido',
    'rj_zona_sul', 'rj_zona_norte', 'rj_zona_oeste', 'rj_zona_leste', 'rj_centro', 'rj_baixada', 'rj_niteroi',
    'sp_zona_sul', 'sp_zona_norte', 'sp_zona_oeste', 'sp_zona_leste', 'sp_centro', 'sp_baixada'
  )
);

comment on column public.candidatos.regiao is
  'Região macro com UF explícito: rj_zona_sul, sp_zona_oeste, etc. Nunca ambíguo entre cidades.';
