-- Etapa 1: adiciona novos valores no enum.
-- Importante: nesta migration NÃO usar os novos valores em UPDATE/INDEX.
-- Isso evita o erro "unsafe use of new value ... must be committed before they can be used".

do $$
begin
  begin
    alter type public.status_candidatura add value if not exists 'em_entrevista';
  exception when duplicate_object then null;
  end;
  begin
    alter type public.status_candidatura add value if not exists 'em_teste';
  exception when duplicate_object then null;
  end;
  begin
    alter type public.status_candidatura add value if not exists 'desistiu';
  exception when duplicate_object then null;
  end;
end $$;
