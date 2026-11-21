-- Backup resumido do histórico das rotinas (pg_cron) antes da limpeza diária.
-- O resumo (1 linha por dia e rotina) fica guardado para sempre; o detalhe bruto, só 2 dias.
create table if not exists public.rotinas_resumo_diario (
  dia date not null,
  rotina text not null,
  execucoes int not null default 0,
  falhas int not null default 0,
  ultima_falha text,
  primary key (dia, rotina)
);
alter table public.rotinas_resumo_diario enable row level security;
create policy rotinas_resumo_leitura on public.rotinas_resumo_diario for select to authenticated using (not public.sou_colaborador());

create or replace function public.limpar_historico_rotinas() returns void
language plpgsql security definer set search_path = public, cron as $$
begin
  insert into public.rotinas_resumo_diario (dia, rotina, execucoes, falhas, ultima_falha)
  select (d.start_time at time zone 'America/Sao_Paulo')::date, coalesce(j.jobname, d.jobid::text),
         count(*), count(*) filter (where d.status <> 'succeeded'),
         (array_agg(left(d.return_message, 300) order by d.start_time desc) filter (where d.status <> 'succeeded'))[1]
  from cron.job_run_details d left join cron.job j on j.jobid = d.jobid
  where d.end_time < now() - interval '2 days'
  group by 1, 2
  on conflict (dia, rotina) do update set
    execucoes = rotinas_resumo_diario.execucoes + excluded.execucoes,
    falhas = rotinas_resumo_diario.falhas + excluded.falhas,
    ultima_falha = coalesce(excluded.ultima_falha, rotinas_resumo_diario.ultima_falha);
  delete from cron.job_run_details where end_time < now() - interval '2 days';
end $$;
revoke all on function public.limpar_historico_rotinas() from public, anon, authenticated;

select cron.schedule('limpeza-historico-rotinas', '0 6 * * *', 'select public.limpar_historico_rotinas()');
