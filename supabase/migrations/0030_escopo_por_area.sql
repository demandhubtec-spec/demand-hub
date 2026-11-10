-- Demand Hub — escopo organizado por área (departamento do cliente)
-- Cada entrega do escopo pode ganhar: rótulo próprio (ex.: "09.1"), área do cliente
-- (portal, estoque, comercial, financeiro, expedicao...), ordem de exibição, marca de
-- "painel de indicadores" e um aviso curto para o cliente.
-- Rode com: npx supabase db push  (ou cole no SQL editor do painel Supabase)

alter table escopo_entregas add column if not exists rotulo text;
alter table escopo_entregas add column if not exists area text;
alter table escopo_entregas add column if not exists ordem int;
alter table escopo_entregas add column if not exists painel boolean not null default false;
alter table escopo_entregas add column if not exists aviso text;

-- Página pública: devolve também rótulo, área, ordem, painel e aviso (continua sem valores do contrato).
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
        'rotulo', e.rotulo,
        'area', e.area,
        'ordem', e.ordem,
        'painel', e.painel,
        'aviso', e.aviso,
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
      ) order by e.ordem nulls last, e.numero)
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

revoke all on function public.acompanhamento_publico(text) from public;
grant execute on function public.acompanhamento_publico(text) to anon, authenticated;
