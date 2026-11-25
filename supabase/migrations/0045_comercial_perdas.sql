-- 24/11/2026 (Kelvin): coluna Perdido sempre à vista no funil, e todo card que vai para lá leva um motivo
-- (preço, sem interesse, já tem agência...). Um registro por card (g:place_id, l:id, i:id).
create table if not exists public.comercial_perdas (
  card text primary key,
  empresa text,
  motivo text not null,
  detalhe text,
  criado_em timestamptz not null default now()
);
alter table public.comercial_perdas enable row level security;
create policy comercial_perdas_dono on public.comercial_perdas for all to authenticated using (meu_papel() = 'dono') with check (meu_papel() = 'dono');
