-- Demand Hub — chat e anexos por projeto/atividade (modal de detalhe do projeto)
-- Rode com: npx supabase db push  (ou cole no SQL editor do painel Supabase)

-- ---------------------------------------------------------------------------
-- Novas colunas em projetos (campos que o modal de detalhe edita)
-- ---------------------------------------------------------------------------

alter table projetos add column if not exists briefing text;
alter table projetos add column if not exists responsavel_id uuid references perfis(id) on delete set null;
alter table projetos
  add column if not exists prioridade text not null default 'media'
    check (prioridade in ('baixa', 'media', 'alta', 'urgente'));
alter table projetos add column if not exists prazo_inicio date;
alter table projetos add column if not exists prazo_fim date;

-- ---------------------------------------------------------------------------
-- Tabelas novas: mensagens (chat) e anexos
-- ---------------------------------------------------------------------------

create table if not exists mensagens (
  id uuid primary key default gen_random_uuid(),
  projeto_id uuid references projetos(id) on delete cascade,
  atividade_id uuid references atividades(id) on delete cascade,
  autor_id uuid references perfis(id) on delete set null,
  texto text not null,
  criado_em timestamptz not null default now(),
  constraint mensagens_alvo_check check (
    (projeto_id is not null and atividade_id is null)
    or (projeto_id is null and atividade_id is not null)
  )
);

create index if not exists mensagens_projeto_idx on mensagens(projeto_id);
create index if not exists mensagens_atividade_idx on mensagens(atividade_id);

create table if not exists anexos (
  id uuid primary key default gen_random_uuid(),
  projeto_id uuid not null references projetos(id) on delete cascade,
  nome text not null,
  tipo text,
  tamanho bigint,
  storage_path text not null,
  criado_por uuid references perfis(id) on delete set null,
  criado_em timestamptz not null default now()
);

create index if not exists anexos_projeto_idx on anexos(projeto_id);

-- ---------------------------------------------------------------------------
-- Helper de RLS: projeto visível pro usuário atual (mesma regra de projetos_select)
-- ---------------------------------------------------------------------------

create or replace function public.projeto_visivel(p_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from projetos p
    where p.id = p_id
      and (
        p.cliente_id is null
        or exists (
          select 1 from clientes c
          where c.id = p.cliente_id
            and (not c.privado or public.tenho_acesso_privado())
        )
      )
  );
$$;

-- ---------------------------------------------------------------------------
-- RLS — mensagens
-- ---------------------------------------------------------------------------

alter table mensagens enable row level security;

drop policy if exists "mensagens_select" on mensagens;
create policy "mensagens_select" on mensagens for select
  using (
    (projeto_id is not null and public.projeto_visivel(projeto_id))
    or (
      atividade_id is not null
      and exists (
        select 1 from atividades a
        where a.id = mensagens.atividade_id
          and (a.projeto_id is null or public.projeto_visivel(a.projeto_id))
      )
    )
  );

drop policy if exists "mensagens_insert" on mensagens;
create policy "mensagens_insert" on mensagens for insert
  with check (
    autor_id = auth.uid()
    and (
      (projeto_id is not null and public.projeto_visivel(projeto_id))
      or (
        atividade_id is not null
        and exists (
          select 1 from atividades a
          where a.id = mensagens.atividade_id
            and (a.projeto_id is null or public.projeto_visivel(a.projeto_id))
        )
      )
    )
  );

-- ---------------------------------------------------------------------------
-- RLS — anexos
-- ---------------------------------------------------------------------------

alter table anexos enable row level security;

drop policy if exists "anexos_select" on anexos;
create policy "anexos_select" on anexos for select
  using (public.projeto_visivel(projeto_id));

drop policy if exists "anexos_insert" on anexos;
create policy "anexos_insert" on anexos for insert
  with check (public.projeto_visivel(projeto_id) and criado_por = auth.uid());

drop policy if exists "anexos_delete" on anexos;
create policy "anexos_delete" on anexos for delete
  using (
    public.projeto_visivel(projeto_id)
    and (not public.sou_colaborador() or criado_por = auth.uid())
  );

-- ---------------------------------------------------------------------------
-- Storage — bucket "anexos" (privado) + políticas
-- Caminho dos arquivos: {projeto_id}/{anexo_id}-{nome-do-arquivo}
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('anexos', 'anexos', false)
on conflict (id) do nothing;

drop policy if exists "anexos_storage_select" on storage.objects;
create policy "anexos_storage_select" on storage.objects for select
  using (bucket_id = 'anexos' and public.projeto_visivel((storage.foldername(name))[1]::uuid));

drop policy if exists "anexos_storage_insert" on storage.objects;
create policy "anexos_storage_insert" on storage.objects for insert
  with check (bucket_id = 'anexos' and public.projeto_visivel((storage.foldername(name))[1]::uuid));

drop policy if exists "anexos_storage_delete" on storage.objects;
create policy "anexos_storage_delete" on storage.objects for delete
  using (bucket_id = 'anexos' and public.projeto_visivel((storage.foldername(name))[1]::uuid));

-- ---------------------------------------------------------------------------
-- Realtime: chat atualiza sozinho quando outra pessoa manda mensagem
-- ---------------------------------------------------------------------------

do $$
begin
  alter publication supabase_realtime add table mensagens;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;
