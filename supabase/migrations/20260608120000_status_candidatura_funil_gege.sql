-- Etapa 1: novos valores do enum (commit separado antes dos UPDATEs — ver 20260608120100).

do $$
begin
  if not exists (
    select 1 from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    where t.typname = 'status_candidatura' and e.enumlabel = 'inscrito'
  ) then
    alter type public.status_candidatura add value 'inscrito';
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    where t.typname = 'status_candidatura' and e.enumlabel = 'abordado'
  ) then
    alter type public.status_candidatura add value 'abordado';
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    where t.typname = 'status_candidatura' and e.enumlabel = 'qualificado'
  ) then
    alter type public.status_candidatura add value 'qualificado';
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    where t.typname = 'status_candidatura' and e.enumlabel = 'encaminhado'
  ) then
    alter type public.status_candidatura add value 'encaminhado';
  end if;
end $$;
