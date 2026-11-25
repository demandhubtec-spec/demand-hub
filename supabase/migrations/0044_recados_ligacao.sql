-- 24/11/2026 (Kelvin): ligação da Gabi que não foi atendida (ou que a pessoa desligou logo) vira recado no
-- WhatsApp. As que nem conectaram não chegam pelo webhook do Callface: a lista da campanha entra aqui e o
-- relógio (/api/cron/tick) põe cada recado na fila envios_agendados.
create table if not exists public.recados_ligacao (
  id uuid primary key default gen_random_uuid(),
  telefone text not null,
  empresa text,
  motivo text not null default 'nao_atendeu' check (motivo in ('nao_atendeu', 'desligou')),
  campanha text,
  status text not null default 'pendente' check (status in ('pendente', 'feito', 'erro')),
  resultado text,
  criado_em timestamptz not null default now(),
  feito_em timestamptz
);
create index if not exists recados_ligacao_pendentes on public.recados_ligacao (status, criado_em);
alter table public.recados_ligacao enable row level security;
create policy recados_ligacao_dono on public.recados_ligacao for all to authenticated using (meu_papel() = 'dono') with check (meu_papel() = 'dono');
