-- 18/11/2026 (Kelvin): no funil comercial, cada card ganha comentários do Kelvin (histórico com data)
-- e temperatura escolhida à mão (quente, morno, frio), que vale acima da calculada pela conversa.
-- O card é identificado como no portal: "g:<place_id>" (Google), "l:<id>" (listas e cadastro manual), "i:<id>" (anúncios).
-- Não altera nenhuma tabela existente.
create table if not exists public.comercial_card_notas (
  id uuid primary key default gen_random_uuid(),
  card text not null,
  texto text not null check (length(trim(texto)) > 0),
  criado_em timestamptz not null default now()
);
create index if not exists comercial_card_notas_card on public.comercial_card_notas (card, criado_em desc);

create table if not exists public.comercial_card_temperatura (
  card text primary key,
  temperatura text not null check (temperatura in ('quente', 'morno', 'frio')),
  atualizado_em timestamptz not null default now()
);

alter table public.comercial_card_notas enable row level security;
alter table public.comercial_card_temperatura enable row level security;
create policy comercial_card_notas_dono on public.comercial_card_notas for all to authenticated using (meu_papel() = 'dono') with check (meu_papel() = 'dono');
create policy comercial_card_temperatura_dono on public.comercial_card_temperatura for all to authenticated using (meu_papel() = 'dono') with check (meu_papel() = 'dono');
