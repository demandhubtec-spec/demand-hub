-- 0024 · Estúdio no relógio de 1 minuto
-- O time de marketing passa a ter um relógio só dele (pg_cron a cada minuto, rota /api/cron/estudio).
-- Para duas rodadas nunca trabalharem ao mesmo tempo na mesma pauta, cada rodada pega a "vez" por
-- alguns minutos e devolve ao terminar. Se a rodada cair no meio, a vez expira sozinha.
--
-- Para desfazer: alter table public.estudio_config drop column rodando_ate;
--   drop function public.estudio_pegar_vez(int); drop function public.estudio_soltar_vez();

alter table public.estudio_config add column if not exists rodando_ate timestamptz;

create or replace function public.estudio_pegar_vez(segundos int default 290)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare ok boolean;
begin
  update estudio_config
     set rodando_ate = now() + make_interval(secs => segundos)
   where id = 1 and (rodando_ate is null or rodando_ate < now())
  returning true into ok;
  return coalesce(ok, false);
end $$;

create or replace function public.estudio_soltar_vez()
returns void
language sql
security definer
set search_path = public
as $$ update estudio_config set rodando_ate = null where id = 1 $$;

revoke all on function public.estudio_pegar_vez(int) from public, anon, authenticated;
revoke all on function public.estudio_soltar_vez() from public, anon, authenticated;
grant execute on function public.estudio_pegar_vez(int) to service_role;
grant execute on function public.estudio_soltar_vez() to service_role;
