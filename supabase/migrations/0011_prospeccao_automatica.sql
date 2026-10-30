-- Prospecção automática: configuração do loop semanal (cidades, nichos, meta) e o agendamento de hora em hora.
alter table public.outreach_config
  add column if not exists auto_ativo boolean not null default false,
  add column if not exists auto_uf text not null default 'SP',
  add column if not exists auto_cidades text[] not null default array[
    'Indaiatuba','Salto','Itu','Elias Fausto','Sorocaba','Campinas','Itupeva','Jundiaí','Valinhos',
    'Vinhedo','Hortolândia','Sumaré','Monte Mor','Cabreúva','Porto Feliz'],
  add column if not exists auto_publico text not null default 'Empresas locais que dependem de clientes da própria cidade e região',
  add column if not exists auto_filtros jsonb not null default '{"so_com_site":false,"so_com_instagram":false,"nota_min":0,"avaliacoes_min":0,"avaliacoes_max":0}'::jsonb,
  add column if not exists auto_nichos jsonb not null default '[
    {"nicho":"Odontologia","termos":["dentista","clínica odontológica"]},
    {"nicho":"Clínica médica","termos":["clínica médica"]},
    {"nicho":"Advocacia","termos":["advogado"]},
    {"nicho":"Imobiliária","termos":["imobiliária"]},
    {"nicho":"Pet shop / Veterinária","termos":["pet shop","clínica veterinária"]},
    {"nicho":"Endocrinologia","termos":["endocrinologista"]}
  ]'::jsonb,
  add column if not exists auto_meta_dia int not null default 30,
  add column if not exists auto_lugares_por_busca int not null default 30,
  add column if not exists auto_cursor int not null default 0,
  add column if not exists auto_run_id text,
  add column if not exists auto_run_buscas jsonb,
  add column if not exists auto_ultima_coleta timestamptz,
  add column if not exists auto_datasets_pendentes text[] not null default '{}',
  add column if not exists auto_aviso_pendente boolean not null default false;

-- As 253 empresas da coleta de 28/10 que ainda não entraram na fila (aproveitadas sem custo novo).
-- Teto: 30 primeiros contatos + até 90 follow-ups por dia no WhatsApp (cada empresa recebe 4 toques
-- no WhatsApp; com 30 novas por dia, a cadência pede uns 90 follow-ups diários). Total: ~120 conversas frias/dia.
update public.outreach_config
   set auto_datasets_pendentes = array['e3g1ckB3qkbSB4YUR','eKaQ7eYFMqdA2Fttq'],
       wa_daily_cap = 30,
       followup_daily_cap = 90
 where id = 1;

-- Roda de hora em hora (minuto 20), com a mesma autenticação do job de e-mail
select cron.schedule(
  'outreach-auto',
  '20 * * * *',
  replace((select command from cron.job where jobname = 'outreach-email-tick'), '/api/prospeccao/email-tick', '/api/prospeccao/auto')
);
