ALTER TABLE public.candidatos
  ADD COLUMN IF NOT EXISTS cargo text NULL,
  ADD COLUMN IF NOT EXISTS exp_crescimento_interno jsonb NULL,
  ADD COLUMN IF NOT EXISTS analise_ia text NULL,
  ADD COLUMN IF NOT EXISTS gmail_message_id text NULL;

