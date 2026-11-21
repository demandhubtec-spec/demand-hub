-- Liga/desliga das rotinas automáticas que não são essenciais (Bot do Instagram, Disparo de e-mail, Estúdio).
-- Desligada, a rotina sai da agenda do banco (cron.job.active = false) e não consome nada do plano.
create or replace function public.rotinas_status() returns jsonb
language sql stable security definer set search_path = public, cron as $$
  select coalesce(jsonb_object_agg(jobname, jsonb_build_object('ativa', active, 'agenda', schedule)), '{}'::jsonb)
  from cron.job where jobname in ('ig-bot-tick', 'outreach-email-tick', 'estudio-tick');
$$;

create or replace function public.rotina_ligar(p_nome text, p_ativa boolean) returns jsonb
language plpgsql security definer set search_path = public, cron as $$
declare j bigint;
begin
  if auth.uid() is null or public.sou_colaborador() then raise exception 'Sem permissão para mudar rotinas'; end if;
  if p_nome not in ('ig-bot-tick', 'outreach-email-tick', 'estudio-tick') then raise exception 'Rotina inválida'; end if;
  select jobid into j from cron.job where jobname = p_nome;
  if j is null then raise exception 'Rotina não encontrada'; end if;
  perform cron.alter_job(j, active := p_ativa);
  return public.rotinas_status();
end $$;

revoke all on function public.rotinas_status() from public, anon;
revoke all on function public.rotina_ligar(text, boolean) from public, anon;
grant execute on function public.rotinas_status() to authenticated;
grant execute on function public.rotina_ligar(text, boolean) to authenticated;

-- Começam desligadas (pedido de 21/11) e a temperatura dos leads passa a rodar 1 vez por dia (7h).
update cron.job set active = false where jobname in ('ig-bot-tick', 'outreach-email-tick', 'estudio-tick');
select cron.alter_job(jobid, schedule := '0 10 * * *') from cron.job where jobname = 'sdr-temperatura';
