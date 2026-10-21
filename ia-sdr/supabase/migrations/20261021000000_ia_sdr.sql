-- IA SDR DemandIA — estrutura do banco
-- Tabelas com prefixo sdr_ para não colidir com as tabelas do portal/CRM.
-- O acesso do backend é via service role (ignora RLS). O portal pode ganhar
-- policies de leitura depois, conforme o modelo de usuários dele.

create extension if not exists pgcrypto;

-- ───────────────────────── Leads ─────────────────────────
create table if not exists sdr_leads (
  id                  uuid primary key default gen_random_uuid(),
  phone               text not null unique,          -- só dígitos, ex: 5511999999999
  whatsapp_jid        text,                           -- ex: 5511999999999@s.whatsapp.net
  nome                text,
  empresa             text,
  email               text,
  segmento            text,
  origem              text default 'whatsapp',

  -- BANT
  faturamento_mensal  numeric,                        -- B
  autoridade          text check (autoridade in ('decisor','decisor_vai_participar','sem_decisor')), -- A
  dores               text[] default '{}',            -- N
  necessidade_resumo  text,
  prazo               text check (prazo in ('imediato','ate_3_meses','3_a_6_meses','sem_previsao')), -- T
  bant_score          int default 0,                  -- 0 a 4
  qualificacao_resumo text,

  status              text not null default 'novo' check (status in (
                        'novo','em_qualificacao','qualificado','desqualificado',
                        'agendado','humano','sem_resposta','opt_out','cliente')),

  ai_paused           boolean not null default false, -- true = humano assumiu
  processing_until    timestamptz,                    -- trava para não responder em duplicidade

  followup_attempts   int not null default 0,
  next_followup_at    timestamptz,

  last_inbound_at     timestamptz,
  last_outbound_at    timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists sdr_leads_followup_idx on sdr_leads (next_followup_at)
  where next_followup_at is not null and ai_paused = false;
create index if not exists sdr_leads_status_idx on sdr_leads (status);

-- ───────────────────────── Mensagens ─────────────────────────
create table if not exists sdr_messages (
  id                   uuid primary key default gen_random_uuid(),
  lead_id              uuid not null references sdr_leads(id) on delete cascade,
  direction            text not null check (direction in ('in','out')),
  author               text not null check (author in ('lead','ia','humano','sistema')),
  kind                 text not null default 'conversa' check (kind in ('conversa','followup','confirmacao','lembrete')),
  content              text not null,
  evolution_message_id text unique,
  created_at           timestamptz not null default now()
);
create index if not exists sdr_messages_lead_idx on sdr_messages (lead_id, created_at);

-- ───────────────────────── Reuniões ─────────────────────────
create table if not exists sdr_meetings (
  id                 uuid primary key default gen_random_uuid(),
  lead_id            uuid not null references sdr_leads(id) on delete cascade,
  starts_at          timestamptz not null,
  ends_at            timestamptz not null,
  google_event_id    text,
  meet_link          text,
  attendee_emails    text[] default '{}',
  decisor_presente   boolean not null default true,
  status             text not null default 'agendada' check (status in (
                       'agendada','confirmada','cancelada','realizada','no_show')),
  confirm_at         timestamptz,   -- quando mandar a mensagem de confirmação
  confirm_sent_at    timestamptz,
  reminder_at        timestamptz,   -- quando mandar o lembrete (1h antes)
  reminder_sent_at   timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists sdr_meetings_lead_idx on sdr_meetings (lead_id);
create index if not exists sdr_meetings_starts_idx on sdr_meetings (starts_at);
-- Garante no banco que não existem duas reuniões ativas no mesmo horário
create unique index if not exists sdr_meetings_no_double_booking
  on sdr_meetings (starts_at) where status in ('agendada','confirmada');

-- ───────────────────────── Eventos (auditoria / indicadores) ─────────────────────────
create table if not exists sdr_events (
  id         bigserial primary key,
  lead_id    uuid references sdr_leads(id) on delete cascade,
  type       text not null,     -- ex: tool:agendar_reuniao, followup_enviado, handoff
  payload    jsonb default '{}',
  created_at timestamptz not null default now()
);
create index if not exists sdr_events_lead_idx on sdr_events (lead_id, created_at);
create index if not exists sdr_events_type_idx on sdr_events (type, created_at);

-- ───────────────────────── Integrações (token do Google) ─────────────────────────
create table if not exists sdr_integrations (
  key        text primary key,  -- 'google'
  value      jsonb not null,
  updated_at timestamptz not null default now()
);

-- ───────────────────────── updated_at automático ─────────────────────────
create or replace function sdr_touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists sdr_leads_touch on sdr_leads;
create trigger sdr_leads_touch before update on sdr_leads
  for each row execute function sdr_touch_updated_at();
drop trigger if exists sdr_meetings_touch on sdr_meetings;
create trigger sdr_meetings_touch before update on sdr_meetings
  for each row execute function sdr_touch_updated_at();

-- ───────────────────────── Trava de processamento ─────────────────────────
-- Retorna true se conseguiu a trava (ninguém mais está respondendo esse lead).
create or replace function sdr_try_lock(p_lead uuid, p_seconds int default 90)
returns boolean language plpgsql as $$
declare ok boolean;
begin
  update sdr_leads
     set processing_until = now() + make_interval(secs => p_seconds)
   where id = p_lead
     and (processing_until is null or processing_until < now())
  returning true into ok;
  return coalesce(ok, false);
end $$;

-- ───────────────────────── RLS ─────────────────────────
alter table sdr_leads        enable row level security;
alter table sdr_messages     enable row level security;
alter table sdr_meetings     enable row level security;
alter table sdr_events       enable row level security;
alter table sdr_integrations enable row level security;
-- (sem policies = só a service role acessa; sdr_integrations nunca deve ter policy pública)

-- ───────────────────────── Indicadores para o portal ─────────────────────────
create or replace view sdr_funil_diario with (security_invoker = true) as
select
  date_trunc('day', l.created_at at time zone 'America/Sao_Paulo')::date as dia,
  count(*)                                                     as leads,
  count(*) filter (where l.status <> 'novo')                   as engajados,
  count(*) filter (where l.bant_score = 4)                     as qualificados,
  count(*) filter (where l.status = 'desqualificado')          as desqualificados,
  count(distinct m.lead_id)                                    as agendados,
  count(*) filter (where l.status = 'sem_resposta')            as sem_resposta
from sdr_leads l
left join sdr_meetings m on m.lead_id = l.id and m.status <> 'cancelada'
group by 1
order by 1 desc;

create or replace view sdr_reunioes_resumo with (security_invoker = true) as
select
  date_trunc('week', starts_at at time zone 'America/Sao_Paulo')::date as semana,
  count(*) filter (where status in ('agendada','confirmada','realizada','no_show')) as marcadas,
  count(*) filter (where status = 'realizada') as realizadas,
  count(*) filter (where status = 'no_show')   as no_show,
  count(*) filter (where status = 'cancelada') as canceladas
from sdr_meetings
group by 1
order by 1 desc;
