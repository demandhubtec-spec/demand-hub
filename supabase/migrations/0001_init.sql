-- Demand Hub — schema inicial + RLS
-- Rode com: npx supabase db push  (ou cole no SQL editor do painel Supabase)

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------------

create table if not exists perfis (
  id uuid primary key references auth.users on delete cascade,
  nome text not null,
  papel text not null check (papel in ('dono', 'colaborador')),
  ativo boolean not null default true,
  -- true apenas para Kelvin: além de "dono", enxerga clientes.privado = true
  -- (Sentiari Music, K19 Barbearia). Matheus é "dono" com acesso_privado = false.
  acesso_privado boolean not null default false
);

create table if not exists clientes (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  segmento text,
  status text not null check (status in ('ativo', 'pausado', 'prospeccao')),
  privado boolean not null default false,
  criado_em timestamptz not null default now()
);

create table if not exists projetos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid references clientes(id) on delete set null,
  nome text not null,
  departamento text not null check (departamento in ('tecnologia', 'marketing', 'comercial')),
  status text not null check (status in ('andamento', 'concluido', 'atrasado')),
  progresso int not null default 0 check (progresso between 0 and 100),
  prazo date
);

create table if not exists atividades (
  id uuid primary key default gen_random_uuid(),
  projeto_id uuid references projetos(id) on delete cascade,
  titulo text not null,
  responsavel_id uuid references perfis(id) on delete set null,
  departamento text check (departamento in ('tecnologia', 'marketing', 'comercial')),
  prazo date,
  status text not null check (status in ('a-fazer', 'andamento', 'atrasado', 'concluido'))
);

create table if not exists financeiro_lancamentos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid references clientes(id) on delete set null,
  descricao text,
  categoria text,
  tipo text not null check (tipo in ('entrada', 'saida')),
  valor numeric(10, 2) not null,
  data date not null default current_date
);

create table if not exists contratos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid references clientes(id) on delete set null,
  tipo text,
  inicio date,
  renovacao text,
  status text not null check (status in ('ativo', 'pendente', 'encerrado'))
);

-- ---------------------------------------------------------------------------
-- Helpers de RLS
-- ---------------------------------------------------------------------------

create or replace function public.meu_papel()
returns text
language sql
security definer
stable
set search_path = public
as $$
  select papel from perfis where id = auth.uid();
$$;

create or replace function public.tenho_acesso_privado()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce((select acesso_privado from perfis where id = auth.uid()), false);
$$;

create or replace function public.sou_colaborador()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce((select papel = 'colaborador' from perfis where id = auth.uid()), false);
$$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table perfis enable row level security;
alter table clientes enable row level security;
alter table projetos enable row level security;
alter table atividades enable row level security;
alter table financeiro_lancamentos enable row level security;
alter table contratos enable row level security;

-- perfis: cada usuário autenticado enxerga a lista de perfis (necessário para
-- exibir responsáveis/participantes), mas só edita o próprio registro.
drop policy if exists "perfis_select" on perfis;
create policy "perfis_select" on perfis for select
  using (auth.role() = 'authenticated');

drop policy if exists "perfis_update_self" on perfis;
create policy "perfis_update_self" on perfis for update
  using (id = auth.uid());

-- clientes: dono enxerga tudo exceto que colaborador não enxerga nada;
-- clientes.privado = true só é visível a quem tem acesso_privado = true.
drop policy if exists "clientes_select" on clientes;
create policy "clientes_select" on clientes for select
  using (
    not public.sou_colaborador()
    and (not privado or public.tenho_acesso_privado())
  );

drop policy if exists "clientes_insert" on clientes;
create policy "clientes_insert" on clientes for insert
  with check (not public.sou_colaborador());

drop policy if exists "clientes_update" on clientes;
create policy "clientes_update" on clientes for update
  using (not public.sou_colaborador() and (not privado or public.tenho_acesso_privado()));

drop policy if exists "clientes_delete" on clientes;
create policy "clientes_delete" on clientes for delete
  using (not public.sou_colaborador() and (not privado or public.tenho_acesso_privado()));

-- projetos: todos os papéis autenticados enxergam projetos/atividades (Fabrício
-- inclusive), mas o vínculo com um cliente privado só aparece pra quem tem
-- acesso_privado — feito via join com clientes na própria policy.
drop policy if exists "projetos_select" on projetos;
create policy "projetos_select" on projetos for select
  using (
    cliente_id is null
    or exists (
      select 1 from clientes c
      where c.id = projetos.cliente_id
        and (not c.privado or public.tenho_acesso_privado())
    )
  );

drop policy if exists "projetos_write" on projetos;
create policy "projetos_write" on projetos for all
  using (not public.sou_colaborador())
  with check (not public.sou_colaborador());

-- atividades: mesma lógica de projetos — colaborador só enxerga e edita
-- atividades (não clientes/financeiro/contratos/acessos).
drop policy if exists "atividades_select" on atividades;
create policy "atividades_select" on atividades for select
  using (true);

drop policy if exists "atividades_write" on atividades;
create policy "atividades_write" on atividades for all
  using (true)
  with check (true);

-- financeiro e contratos: nunca visíveis para colaborador (Fabrício).
drop policy if exists "financeiro_select" on financeiro_lancamentos;
create policy "financeiro_select" on financeiro_lancamentos for select
  using (not public.sou_colaborador());

drop policy if exists "financeiro_write" on financeiro_lancamentos;
create policy "financeiro_write" on financeiro_lancamentos for all
  using (not public.sou_colaborador())
  with check (not public.sou_colaborador());

drop policy if exists "contratos_select" on contratos;
create policy "contratos_select" on contratos for select
  using (not public.sou_colaborador());

drop policy if exists "contratos_write" on contratos;
create policy "contratos_write" on contratos for all
  using (not public.sou_colaborador())
  with check (not public.sou_colaborador());

-- ---------------------------------------------------------------------------
-- Seed opcional de perfis (rode manualmente após criar os usuários no Auth)
-- ---------------------------------------------------------------------------
-- insert into perfis (id, nome, papel, acesso_privado) values
--   ('<uuid-do-kelvin>', 'Kelvin', 'dono', true),
--   ('<uuid-do-matheus>', 'Matheus', 'dono', false),
--   ('<uuid-do-fabricio>', 'Fabrício', 'colaborador', false);
