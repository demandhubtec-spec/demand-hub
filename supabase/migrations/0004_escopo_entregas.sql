-- Demand Hub — aba Projetos por cliente (ficha do cliente com o escopo do contrato)
-- Rode com: npx supabase db push  (ou cole no SQL editor do painel Supabase)

-- Dados do contrato exibidos na ficha do cliente
alter table clientes add column if not exists contrato_resumo text;
alter table clientes add column if not exists mensalidade text;

-- Projeto pode corresponder a uma entrega numerada do escopo do contrato
alter table projetos add column if not exists entrega_numero int;
alter table projetos add column if not exists subtitulo text;

-- Projeto também pode estar "a fazer" (ainda não iniciado), igual às atividades
alter table projetos drop constraint if exists projetos_status_check;
alter table projetos
  add constraint projetos_status_check
  check (status in ('a-fazer', 'andamento', 'concluido', 'atrasado'));

-- Escopo do contrato: lista fechada de entregas por cliente (roadmap da ficha)
create table if not exists escopo_entregas (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clientes(id) on delete cascade,
  numero int not null,
  nome text not null,
  resumo text,
  unique (cliente_id, numero)
);

alter table escopo_entregas enable row level security;

-- Mesma visibilidade do cliente (a RLS de clientes vale dentro da subconsulta).
drop policy if exists "escopo_select" on escopo_entregas;
create policy "escopo_select" on escopo_entregas for select
  using (exists (select 1 from clientes c where c.id = escopo_entregas.cliente_id));

drop policy if exists "escopo_write" on escopo_entregas;
create policy "escopo_write" on escopo_entregas for all
  using (not public.sou_colaborador())
  with check (not public.sou_colaborador());
