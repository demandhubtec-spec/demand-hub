-- 21/11/2026 (Kelvin): todo card do funil tem uma próxima ação (ligação, WhatsApp, visita, reunião, proposta...)
-- com data e descrição. Cada ação vira também uma tarefa (atividades, departamento comercial) para ele não esquecer.
create table if not exists public.comercial_card_acoes (
  id uuid primary key default gen_random_uuid(),
  card text not null,
  empresa text,
  tipo text not null check (tipo in ('ligacao', 'whatsapp', 'visita', 'reuniao', 'proposta', 'email', 'outro')),
  quando timestamptz,
  descricao text,
  atividade_id uuid references public.atividades(id) on delete set null,
  feita_em timestamptz,
  criado_em timestamptz not null default now()
);
create index if not exists comercial_card_acoes_card on public.comercial_card_acoes (card);
alter table public.comercial_card_acoes enable row level security;
create policy comercial_card_acoes_dono on public.comercial_card_acoes for all to authenticated using (meu_papel() = 'dono') with check (meu_papel() = 'dono');

-- Comentário editado
alter table public.comercial_card_notas add column if not exists editado_em timestamptz;
