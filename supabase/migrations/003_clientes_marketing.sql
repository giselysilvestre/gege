-- Campos extras para página Carreira e perfil público do cliente
alter table public.clientes add column if not exists descricao text;
alter table public.clientes add column if not exists sobre text;
alter table public.clientes add column if not exists instagram text;
alter table public.clientes add column if not exists whatsapp text;
alter table public.clientes add column if not exists slug text;

comment on column public.clientes.descricao is 'Linha curta abaixo do nome (ex.: segmento / cidade).';
comment on column public.clientes.sobre is 'Texto longo "Sobre nós", editável pelo cliente.';
comment on column public.clientes.instagram is 'URL completa do perfil Instagram.';
comment on column public.clientes.whatsapp is 'Telefone WhatsApp (com DDD; pode incluir +55).';
comment on column public.clientes.slug is 'Identificador único opcional para URLs públicas.';
