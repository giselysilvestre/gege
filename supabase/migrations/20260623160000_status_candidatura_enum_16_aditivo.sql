-- Fatia aditiva (estratégia iii): enum status_candidatura passa a aceitar os 15 valores
-- novos do modelo etapa_situacao, mantendo os 15 legados. Sem UPDATE, sem default,
-- sem coluna etapa, sem alteração de view.
--
-- "contratado" já existe no enum — não é adicionado de novo.
-- PG 17: ADD VALUE IF NOT EXISTS é idempotente (pode re-rodar com segurança).

alter type public.status_candidatura add value if not exists 'inscrito_aguardando_disparo';
alter type public.status_candidatura add value if not exists 'inscrito_avancar';
alter type public.status_candidatura add value if not exists 'inscrito_reprovado';
alter type public.status_candidatura add value if not exists 'inscrito_falha';

alter type public.status_candidatura add value if not exists 'abordado_em_conversa';
alter type public.status_candidatura add value if not exists 'abordado_avancar';
alter type public.status_candidatura add value if not exists 'abordado_sem_resposta';
alter type public.status_candidatura add value if not exists 'abordado_reprovado_sem_resposta';
alter type public.status_candidatura add value if not exists 'abordado_negativa';

alter type public.status_candidatura add value if not exists 'qualificado_pendente_entrevista';
alter type public.status_candidatura add value if not exists 'qualificado_avancar';
alter type public.status_candidatura add value if not exists 'qualificado_reprovado_entrevista';

alter type public.status_candidatura add value if not exists 'encaminhado_aguardando';
alter type public.status_candidatura add value if not exists 'encaminhado_avancar';
alter type public.status_candidatura add value if not exists 'encaminhado_reprovado';

-- Verificação pós-migration (auditoria manual)
-- SELECT enumlabel FROM pg_enum
-- WHERE enumtypid = 'public.status_candidatura'::regtype
-- ORDER BY enumsortorder;
