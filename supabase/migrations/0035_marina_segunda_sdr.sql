-- 0035 · Marina, segunda SDR com número próprio de WhatsApp (16/11/2026, pedido do Kelvin)
--
-- A Marina faz o mesmo que a Gabi (primeiro contato, follow-up e agendamento), num número próprio.
-- - Cada lead tem a SDR responsável (sdr_leads.agente e outreach_leads.agente). O lead fica com quem
--   fez o primeiro contato, ou com o número em que a pessoa chamou.
-- - Os números (instâncias do Evolution GO) ficam em wa_instancias. O token só é lido pelo servidor:
--   a tabela tem RLS ligado e nenhuma política (o portal vê o status pela API do ia-sdr).
-- - Teto de primeiros contatos da Marina: 10 por dia para aquecer o número (outreach_config.marina_daily_cap).
-- Pode rodar mais de uma vez.

-- 1) SDR responsável por lead
alter table public.sdr_leads add column if not exists agente text not null default 'gabi';
alter table public.sdr_leads drop constraint if exists sdr_leads_agente_check;
alter table public.sdr_leads add constraint sdr_leads_agente_check check (agente in ('gabi', 'marina'));
create index if not exists sdr_leads_agente_idx on public.sdr_leads (agente);

alter table public.outreach_leads add column if not exists agente text;
alter table public.outreach_leads drop constraint if exists outreach_leads_agente_check;
alter table public.outreach_leads add constraint outreach_leads_agente_check check (agente is null or agente in ('gabi', 'marina'));
update public.outreach_leads set agente = 'gabi' where agente is null and wa_sent_at is not null;

-- 2) Números de WhatsApp das SDRs (Evolution GO)
create table if not exists public.wa_instancias (
  agente      text primary key check (agente in ('gabi', 'marina')),
  nome        text,                 -- nome da instância no Evolution GO
  token       text,                 -- token da instância (a da Gabi fica na variável EVOLUTION_INSTANCE_TOKEN)
  numero      text,                 -- número conectado (preenchido quando conecta)
  criado_em   timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
alter table public.wa_instancias enable row level security;
-- sem políticas: só o servidor (service role) lê e grava
insert into public.wa_instancias (agente, nome) values ('gabi', null) on conflict (agente) do nothing;

-- 3) Disparo da Marina: teto próprio, ligar/desligar e o intervalo entre os envios dela
alter table public.outreach_config add column if not exists marina_enabled boolean not null default false;
alter table public.outreach_config add column if not exists marina_daily_cap int not null default 10;
alter table public.outreach_config add column if not exists next_wa_at_marina timestamptz;

-- 4) Prompt System da Marina: começa como cópia do da Gabi, com o nome trocado
insert into public.comercial_playbook (id, secoes)
select 'prompt_marina',
       replace(secoes::text, 'Gabi', 'Marina')::jsonb
from public.comercial_playbook
where id = 'prompt_gabi'
on conflict (id) do nothing;
