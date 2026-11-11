-- Lixeira do Inbound (11/11/2026): o card sai do funil e dos indicadores, mas nada é apagado.
-- Restaurar = voltar lixeira_em para null. Só acrescenta uma coluna.
alter table public.sdr_leads add column if not exists lixeira_em timestamptz;
create index if not exists sdr_leads_lixeira on public.sdr_leads (lixeira_em) where lixeira_em is not null;
