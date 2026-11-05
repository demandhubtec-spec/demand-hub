-- 0023 · Acompanhamento do cliente (cronograma compartilhado em tempo real)
--
-- O que entra (nada é apagado ou alterado nos dados que já existem):
--   1. projetos.fase: implementação, teste, correção, aprovação ou concluído.
--   2. compartilhamentos: link secreto por cliente (portal.demandhub.com.br/acompanhar/<token>).
--   3. comentarios_cliente: comentários do cliente e respostas da equipe, por entrega.
--   4. Duas funções públicas que só funcionam com um link ativo:
--        acompanhamento_publico(token)  → devolve o cronograma (sem valores do contrato)
--        comentar_publico(token, ...)   → grava o comentário do cliente
--
-- Segurança: o visitante sem login NÃO lê nenhuma tabela. Ele só enxerga o que a
-- função devolve, e só se o link estiver ativo. Desligar o link corta o acesso na hora.
--
-- Para desfazer:
--   drop function if exists public.acompanhamento_publico(text);
--   drop function if exists public.comentar_publico(text, uuid, text, text);
--   drop table if exists public.comentarios_cliente;
--   drop table if exists public.compartilhamentos;
--   alter table public.projetos drop column if exists fase;

begin;

-- 1. Fase da entrega ---------------------------------------------------------
alter table public.projetos add column if not exists fase text;
alter table public.projetos drop constraint if exists projetos_fase_check;
alter table public.projetos
  add constraint projetos_fase_check
  check (fase is null or fase in ('implementacao', 'teste', 'correcao', 'aprovacao', 'concluido'));

-- 2. Link de acompanhamento --------------------------------------------------
create table if not exists public.compartilhamentos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  token text not null unique check (length(token) >= 16),
  ativo boolean not null default true,
  criado_por uuid references public.perfis(id) on delete set null,
  criado_em timestamptz not null default now()
);
create index if not exists compartilhamentos_cliente_idx on public.compartilhamentos(cliente_id);

alter table public.compartilhamentos enable row level security;
drop policy if exists compartilhamentos_dono on public.compartilhamentos;
create policy compartilhamentos_dono on public.compartilhamentos
  for all to authenticated
  using (not public.sou_colaborador()
         and exists (select 1 from public.clientes c where c.id = compartilhamentos.cliente_id))
  with check (not public.sou_colaborador()
              and exists (select 1 from public.clientes c where c.id = compartilhamentos.cliente_id));

-- 3. Comentários do cliente --------------------------------------------------
create table if not exists public.comentarios_cliente (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  projeto_id uuid references public.projetos(id) on delete cascade,  -- null = comentário geral
  autor_tipo text not null check (autor_tipo in ('cliente', 'equipe')),
  autor_nome text not null check (length(autor_nome) between 1 and 80),
  autor_id uuid references public.perfis(id) on delete set null,       -- só para a equipe
  texto text not null check (length(texto) between 1 and 2000),
  lido boolean not null default false,
  criado_em timestamptz not null default now()
);
create index if not exists comentarios_cliente_idx on public.comentarios_cliente(cliente_id, criado_em);

alter table public.comentarios_cliente enable row level security;
drop policy if exists comentarios_cliente_select on public.comentarios_cliente;
create policy comentarios_cliente_select on public.comentarios_cliente
  for select to authenticated
  using (not public.sou_colaborador()
         and exists (select 1 from public.clientes c where c.id = comentarios_cliente.cliente_id));

drop policy if exists comentarios_cliente_insert on public.comentarios_cliente;
create policy comentarios_cliente_insert on public.comentarios_cliente
  for insert to authenticated
  with check (not public.sou_colaborador()
              and autor_tipo = 'equipe'
              and autor_id = auth.uid()
              and exists (select 1 from public.clientes c where c.id = comentarios_cliente.cliente_id));

drop policy if exists comentarios_cliente_update on public.comentarios_cliente;
create policy comentarios_cliente_update on public.comentarios_cliente
  for update to authenticated
  using (not public.sou_colaborador()
         and exists (select 1 from public.clientes c where c.id = comentarios_cliente.cliente_id));

-- Painel interno atualiza sozinho quando o cliente comenta
do $$
begin
  alter publication supabase_realtime add table public.comentarios_cliente;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

-- 4a. Leitura pública pelo link ---------------------------------------------
create or replace function public.acompanhamento_publico(p_token text)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_cliente uuid;
begin
  select cliente_id into v_cliente
  from compartilhamentos
  where token = p_token and ativo
  limit 1;

  if v_cliente is null then
    return null;
  end if;

  return json_build_object(
    'cliente', (select json_build_object('nome', c.nome, 'segmento', c.segmento)
                from clientes c where c.id = v_cliente),
    'atualizado_em', now(),
    'entregas', coalesce((
      select json_agg(json_build_object(
        'numero', e.numero,
        'nome', coalesce(p.nome, e.nome),
        'resumo', coalesce(p.subtitulo, e.resumo),
        'projeto_id', p.id,
        'briefing', p.briefing,
        'status', coalesce(p.status, 'a-fazer'),
        'fase', p.fase,
        'inicio', p.prazo_inicio,
        'fim', coalesce(p.prazo_fim, p.prazo),
        'atividades', coalesce((
          select json_agg(json_build_object(
            'id', a.id, 'titulo', a.titulo, 'status', a.status, 'prazo', a.prazo
          ) order by (a.status <> 'concluido'), a.prazo nulls last, a.criado_em)
          from atividades a where a.projeto_id = p.id
        ), '[]'::json)
      ) order by e.numero)
      from escopo_entregas e
      left join lateral (
        select * from projetos px
        where px.cliente_id = v_cliente and px.entrega_numero = e.numero
        order by px.prazo_inicio nulls last
        limit 1
      ) p on true
      where e.cliente_id = v_cliente
    ), '[]'::json),
    'comentarios', coalesce((
      select json_agg(json_build_object(
        'id', k.id, 'projeto_id', k.projeto_id, 'autor_tipo', k.autor_tipo,
        'autor_nome', k.autor_nome, 'texto', k.texto, 'criado_em', k.criado_em
      ) order by k.criado_em)
      from comentarios_cliente k where k.cliente_id = v_cliente
    ), '[]'::json)
  );
end;
$$;

-- 4b. Comentário público pelo link ------------------------------------------
create or replace function public.comentar_publico(p_token text, p_projeto_id uuid, p_nome text, p_texto text)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_cliente uuid;
  v_id uuid;
  v_nome text := left(btrim(coalesce(p_nome, '')), 80);
  v_texto text := left(btrim(coalesce(p_texto, '')), 2000);
begin
  select cliente_id into v_cliente
  from compartilhamentos
  where token = p_token and ativo
  limit 1;

  if v_cliente is null then
    raise exception 'link_invalido';
  end if;
  if v_nome = '' or v_texto = '' then
    raise exception 'campos_vazios';
  end if;
  if p_projeto_id is not null and not exists (
    select 1 from projetos where id = p_projeto_id and cliente_id = v_cliente
  ) then
    raise exception 'entrega_invalida';
  end if;
  -- Trava contra abuso: no máximo 30 comentários por hora em cada link
  if (select count(*) from comentarios_cliente
      where cliente_id = v_cliente and autor_tipo = 'cliente'
        and criado_em > now() - interval '1 hour') >= 30 then
    raise exception 'limite_por_hora';
  end if;

  insert into comentarios_cliente (cliente_id, projeto_id, autor_tipo, autor_nome, texto)
  values (v_cliente, p_projeto_id, 'cliente', v_nome, v_texto)
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.acompanhamento_publico(text) from public;
revoke all on function public.comentar_publico(text, uuid, text, text) from public;
grant execute on function public.acompanhamento_publico(text) to anon, authenticated;
grant execute on function public.comentar_publico(text, uuid, text, text) to anon, authenticated;

commit;
