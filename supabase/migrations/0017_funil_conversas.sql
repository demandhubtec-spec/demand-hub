-- Funil das conversas da prospecção (Agenda + funil reorganizado, 02/11/2026)
--  * retorno combinado: quando e com quem retomar (ex.: "Adriano, terça depois das 10h")
--  * marcadores do objetivo: diagnóstico enviado e contato do responsável
--  * retomadas: quantas vezes a Ana propôs retomar uma conversa parada (com o ok do Kelvin)

alter table public.outreach_leads
  add column if not exists retorno_em timestamptz,
  add column if not exists retorno_nota text,
  add column if not exists diag_enviado_em timestamptz,
  add column if not exists responsavel_contato text,
  add column if not exists retomadas int not null default 0,
  add column if not exists retomada_em timestamptz;

-- Agrofera: o Adriano volta terça (03/11) depois das 10h
update public.outreach_leads
   set retorno_em = '2026-11-03 10:30:00-03', retorno_nota = 'Adriano volta terça depois das 10h'
 where empresa ilike 'Agrofera%' and retorno_em is null;

-- Quem pediu para sair no WhatsApp não fica mais em "Respondeu"
update public.outreach_leads o
   set status_comercial = 'descartado', cadencia = 'parada', wa_status = 'optout',
       proximo_toque_em = null, proximo_canal = null
  from public.sdr_leads s
 where right(regexp_replace(s.phone, '\D', '', 'g'), 8) = right(regexp_replace(o.whatsapp, '\D', '', 'g'), 8)
   and s.status = 'opt_out'
   and o.cadencia = 'respondeu';
