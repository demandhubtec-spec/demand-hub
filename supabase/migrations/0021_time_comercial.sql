-- Central do Time Comercial (Comercial > Time comercial): números reais da operação da Ana e do time,
-- num pacote só, para a tela do dono. sdr_events e sdr_meetings não têm leitura direta pelo portal,
-- por isso a função roda como definer e confere o papel antes de responder.

create or replace function public.time_comercial()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  hoje   timestamptz := (date_trunc('day',  now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo');
  semana timestamptz := (date_trunc('week', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo');
  r jsonb;
begin
  if public.meu_papel() is distinct from 'dono' then
    raise exception 'sem acesso';
  end if;

  select jsonb_build_object(
    'lista',            (select count(*) from outreach_leads),
    'com_whatsapp',     (select count(*) from outreach_leads where whatsapp is not null and coalesce(wa_status, '') <> 'sem_whatsapp'),
    'sem_whatsapp',     (select count(*) from outreach_leads where wa_status = 'sem_whatsapp'),
    'com_email',        (select count(*) from outreach_leads where email is not null),
    'com_diagnostico',  (select count(*) from outreach_leads where diagnostico is not null),
    'com_site',         (select count(*) from outreach_leads where site_preview is not null),
    'aguardando_ok',    (select count(*) from outreach_leads where cadencia = 'nao_iniciada' and msg_rascunho is not null and msg_aprovada_em is null),
    'fila_envio',       (select count(*) from outreach_leads where cadencia = 'nao_iniciada' and wa_status = 'pendente' and msg_aprovada_em is not null),
    'em_cadencia',      (select count(*) from outreach_leads where cadencia = 'ativa'),
    'contatados',       (select count(*) from outreach_leads where wa_status in ('enviado', 'respondeu', 'ignorado', 'optout')),
    'responderam',      (select count(*) from outreach_leads where wa_status in ('respondeu', 'optout') or cadencia = 'respondeu'),
    'sairam',           (select count(*) from outreach_leads where wa_status = 'optout'),
    'quentes',          (select count(distinct lead_id) from sdr_events where type = 'lead_quente'),
    'quentes_semana',   (select count(distinct lead_id) from sdr_events where type = 'lead_quente' and created_at >= semana),
    'reunioes',         (select count(*) from sdr_meetings where coalesce(status, '') <> 'cancelada'),
    'reunioes_semana',  (select count(*) from sdr_meetings where coalesce(status, '') <> 'cancelada' and starts_at >= semana and starts_at < semana + interval '7 days'),
    'hoje', jsonb_build_object(
      'primeiros', (select count(*) from outreach_log where channel = 'whatsapp' and event = 'sent' and created_at >= hoje),
      'toques',    (select count(*) from outreach_log where channel = 'whatsapp' and event = 'followup' and created_at >= hoje),
      'emails',    (select count(*) from outreach_log where channel = 'email' and event = 'sent' and created_at >= hoje),
      'respostas', (select count(distinct lead_id) from sdr_messages where direction = 'in' and created_at >= hoje),
      'robos',     (select count(*) from sdr_events where type = 'resposta_automatica' and created_at >= hoje),
      'conversas', (select count(distinct lead_id) from sdr_messages where direction = 'out' and created_at >= hoje)
    ),
    'agenda', (
      select coalesce(jsonb_agg(x order by x.starts_at), '[]'::jsonb)
      from (
        select m.starts_at, m.status, m.meet_link, l.nome, l.empresa, l.phone
        from sdr_meetings m left join sdr_leads l on l.id = m.lead_id
        where m.starts_at > now() - interval '2 hours' and coalesce(m.status, '') <> 'cancelada'
        order by m.starts_at
        limit 8
      ) x
    ),
    'atividade', (
      select coalesce(jsonb_agg(x order by x.em desc), '[]'::jsonb)
      from (
        select e.type as tipo, e.created_at as em, coalesce(l.empresa, l.nome, l.phone) as quem, left(e.payload::text, 400) as detalhe
        from sdr_events e left join sdr_leads l on l.id = e.lead_id
        where e.created_at > now() - interval '3 days'
          and e.type in ('lead_quente', 'retomada_proposta', 'resposta_automatica', 'tool:encerrar_contato', 'tool:agendar_reuniao',
                         'tool:combinar_retorno', 'tool:registrar_objetivo', 'pediu_orientacao', 'orientacao_aplicada', 'tool:ver_horarios')
        union all
        select 'envio:' || o.event, o.created_at, coalesce(o.detail->>'msg', o.detail->>'to'), null
        from outreach_log o
        where o.created_at > now() - interval '3 days'
          and ((o.channel = 'whatsapp' and o.event in ('sent', 'followup', 'reply', 'avulso')) or (o.channel = 'email' and o.event = 'sent'))
        order by 2 desc
        limit 60
      ) x
    )
  ) into r;
  return r;
end;
$$;

revoke all on function public.time_comercial() from public, anon;
grant execute on function public.time_comercial() to authenticated;
