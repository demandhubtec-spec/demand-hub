-- Landing page do diagnóstico gratuito: cada envio do formulário vira uma linha aqui
-- e o lead entra (ou é atualizado) em sdr_leads para a IA SDR chamar no WhatsApp.

create table if not exists sdr_diagnosticos (
  id                   uuid primary key default gen_random_uuid(),
  created_at           timestamptz not null default now(),
  lead_id              uuid references sdr_leads(id) on delete set null,

  -- Respostas do formulário
  nome                 text not null,
  whatsapp             text not null,          -- só dígitos, com 55
  email                text,
  empresa              text not null,
  segmento             text,
  cargo                text,                   -- dono | diretor | colaborador
  faturamento_faixa    text,                   -- ate_30k | 30k_50k | 50k_100k | 100k_300k | 300k_1mi | 1mi_mais
  faturamento_estimado numeric,                -- piso da faixa, em reais
  equipe               text,
  canais               text[] default '{}',
  dores                text[] default '{}',
  tempo_resposta       text,                   -- quanto tempo leva para responder um novo contato
  invest_marketing     text,                   -- quanto investe em marketing por mês
  prazo                text,
  desafio              text,

  -- Origem (anúncio)
  utm_source           text,
  utm_medium           text,
  utm_campaign         text,
  utm_content          text,
  utm_term             text,
  utm_id               text,
  fbclid               text,
  gclid                text,
  ttclid               text,
  utm_primeiro_clique  jsonb,                  -- UTMs da primeira visita (30 dias)
  landing_url          text,
  referrer             text,
  page_url             text,
  fbp                  text,
  fbc                  text,
  event_id             text,                   -- mesmo ID do evento Lead do Pixel (para a API de Conversões)
  ip                   text,
  user_agent           text,

  -- Acompanhamento
  status               text not null default 'novo' check (status in ('novo','em_analise','entregue','descartado')),
  resultado            text,
  entregue_em          timestamptz
);

create index if not exists sdr_diagnosticos_created_idx on sdr_diagnosticos (created_at desc);
create index if not exists sdr_diagnosticos_whatsapp_idx on sdr_diagnosticos (whatsapp);
create index if not exists sdr_diagnosticos_campaign_idx on sdr_diagnosticos (utm_campaign);

-- Só o backend (service role) lê e escreve.
alter table sdr_diagnosticos enable row level security;

-- Resumo por campanha para o portal
create or replace view sdr_diagnosticos_por_campanha with (security_invoker = true) as
select
  date_trunc('day', d.created_at at time zone 'America/Sao_Paulo')::date as dia,
  coalesce(d.utm_source, '(direto)')   as origem,
  coalesce(d.utm_campaign, '(sem campanha)') as campanha,
  count(*)                                                   as cadastros,
  count(*) filter (where d.faturamento_estimado >= 30000)    as no_perfil,
  count(*) filter (where l.status in ('qualificado','agendado','cliente')) as qualificados,
  count(*) filter (where l.status in ('agendado','cliente')) as agendados
from sdr_diagnosticos d
left join sdr_leads l on l.id = d.lead_id
group by 1, 2, 3;
