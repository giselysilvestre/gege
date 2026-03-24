-- Importações antigas deixaram score = 0: valor determinístico 60–98 para ranking/match no painel.
-- Não altera linhas que já têm score > 0.

update public.candidatos
set score = 60 + (abs(hashtext(id::text)) % 39)
where coalesce(score, 0) = 0;
