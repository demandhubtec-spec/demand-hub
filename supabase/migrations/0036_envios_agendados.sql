-- 17/11 (Kelvin): mensagens aprovadas para sair num horário certo, pelo número da SDR do lead (ou por e-mail)
create table if not exists envios_agendados (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references sdr_leads(id) on delete cascade,
  place_id text,
  canal text not null default 'whatsapp' check (canal in ('whatsapp','email')),
  para text,
  assunto text,
  texto text not null,
  com_pdf boolean not null default false,
  enviar_em timestamptz not null,
  status text not null default 'agendado' check (status in ('agendado','enviando','enviado','erro','cancelado')),
  enviado_em timestamptz,
  erro text,
  created_at timestamptz not null default now()
);
alter table envios_agendados enable row level security;
-- Lead antigo (já contatado) que pediu o diagnóstico: a Rita e a Duda geram o PDF dele também
alter table outreach_leads add column if not exists pdf_pedido boolean not null default false;
