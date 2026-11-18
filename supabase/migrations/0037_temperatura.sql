-- 17/11/2026 (Kelvin): temperatura do lead no funil (quente, morno, frio), calculada pela conversa.
-- Quente: passou para o Kelvin/reunião, ou deu sinal de interesse nos últimos 14 dias (pediu o diagnóstico,
--         perguntou valor, falou de reunião/horário) sem recusar depois.
-- Morno:  respondeu de verdade (não é resposta automática) nos últimos 14 dias, sem sinal de interesse.
-- Frio:   nunca respondeu de verdade, sumiu há mais de 14 dias, recusou ou foi desqualificado.
alter table public.sdr_leads add column if not exists temperatura text check (temperatura in ('quente', 'morno', 'frio'));
alter table public.sdr_leads add column if not exists temperatura_motivo text;
alter table public.sdr_leads add column if not exists temperatura_em timestamptz;

create or replace function public.sdr_atualizar_temperatura() returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  with ins as (
    select m.lead_id, m.content, m.created_at
    from sdr_messages m
    where m.direction = 'in' and m.content not like '[resposta automática]%' and length(trim(m.content)) > 2
  ), r as (
    select l.id,
      max(i.created_at) as ultima,
      max(i.created_at) filter (where i.content ~* '(pode mandar|pode enviar|manda sim|envia sim|pode sim|tenho interesse|interessad|quanto custa|qual o valor|qual valor|pre[cç]o|or[cç]amento|reuni[aã]o|hor[aá]rio|agendar|vamos marcar|pode ser|me liga|liga pra mim|fala com (o|a) )') as sinal,
      max(i.created_at) filter (where i.content ~* '(n[aã]o tenho interesse|sem interesse|n[aã]o temos interesse|n[aã]o precisamos|j[aá] temos (uma )?ag[eê]ncia|estamos satisfeitos|n[aã]o quero|pode remover|me remov|parem de|n[aã]o mand(e|a) mais)') as recusa
    from sdr_leads l left join ins i on i.lead_id = l.id
    where l.lixeira_em is null
    group by l.id
  ), t as (
    select l.id,
      case
        when l.status in ('opt_out', 'desqualificado') or (r.recusa is not null and (r.sinal is null or r.recusa >= r.sinal)) then 'frio'
        when l.status in ('agendado', 'qualificado', 'cliente', 'humano') then 'quente'
        when r.sinal is not null and r.sinal > now() - interval '14 days' then 'quente'
        when r.ultima is not null and r.ultima > now() - interval '14 days' then 'morno'
        else 'frio'
      end as temp,
      case
        when l.status in ('opt_out', 'desqualificado') then 'Pediu para sair ou foi desqualificado'
        when r.recusa is not null and (r.sinal is null or r.recusa >= r.sinal) then 'Recusou na conversa'
        when l.status in ('agendado', 'qualificado', 'cliente', 'humano') then 'Com o Kelvin (reunião ou negociação)'
        when r.sinal is not null and r.sinal > now() - interval '14 days' then 'Deu sinal de interesse em ' || to_char(r.sinal at time zone 'America/Sao_Paulo', 'DD/MM')
        when r.ultima is not null and r.ultima > now() - interval '14 days' then 'Respondeu em ' || to_char(r.ultima at time zone 'America/Sao_Paulo', 'DD/MM') || ', sem sinal de interesse ainda'
        when r.ultima is not null then 'Sem resposta desde ' || to_char(r.ultima at time zone 'America/Sao_Paulo', 'DD/MM')
        else 'Nunca respondeu (ou só resposta automática)'
      end as motivo
    from sdr_leads l join r on r.id = l.id
  )
  update sdr_leads l set temperatura = t.temp, temperatura_motivo = t.motivo, temperatura_em = now()
  from t where t.id = l.id and (l.temperatura is distinct from t.temp or l.temperatura_motivo is distinct from t.motivo);
  get diagnostics n = row_count;
  return n;
end $$;

select public.sdr_atualizar_temperatura();
select cron.schedule('sdr-temperatura', '*/15 * * * *', $$select public.sdr_atualizar_temperatura()$$);
