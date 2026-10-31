-- 0016 · Análise própria da landing page (mapa de calor, rolagem, funil e origem)
--
-- O rastreador da página /diagnostico manda eventos anônimos para /api/lp/track
-- (servidor da Ana), que grava aqui com a chave de serviço. Nada de nome, telefone,
-- e-mail ou texto digitado: só cliques, rolagem, seções vistas e etapas do formulário.
-- Só o dono lê, e pelas funções de resumo abaixo.
--
-- Para desfazer: drop function public.lp_resumo(int,text); drop function public.lp_cliques(int,text,text);
--                drop table public.lp_eventos;

create table if not exists public.lp_eventos (
  id             bigint generated always as identity primary key,
  criado_em      timestamptz not null default now(),
  pagina         text not null default 'diagnostico',
  visitante      text not null,
  sessao         text not null,
  tipo           text not null check (tipo in ('view','click','section','form_start','form_step','form_submit','leave')),
  dispositivo    text check (dispositivo in ('mobile','tablet','desktop')),
  largura        int,
  altura_pagina  int,
  x_pct          real,   -- clique: posição horizontal em % da largura (celular)
  x_centro       int,    -- clique: distância em px do centro da página (computador)
  y_px           int,    -- clique: altura em px desde o topo da página
  alvo           text,   -- clique: texto curto do botão/link (nunca o que a pessoa digitou)
  rage           boolean not null default false,
  secao          text,
  etapa          int,
  profundidade   int,    -- saída: % máximo da página rolado
  duracao_ms     int,    -- saída: tempo na página
  origem         text,
  utm_source     text,
  utm_medium     text,
  utm_campaign   text,
  utm_content    text,
  referrer       text
);

create index if not exists lp_eventos_pagina_data on public.lp_eventos (pagina, criado_em desc);
create index if not exists lp_eventos_tipo on public.lp_eventos (tipo, criado_em desc);

alter table public.lp_eventos enable row level security;
drop policy if exists lp_eventos_dono on public.lp_eventos;
create policy lp_eventos_dono on public.lp_eventos for select to authenticated
  using (public.meu_papel() = 'dono');

-- Resumo para a aba "Landing page" do portal
create or replace function public.lp_resumo(p_dias int default 7, p_pagina text default 'diagnostico')
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  desde timestamptz := now() - make_interval(days => greatest(1, least(p_dias, 365)));
  r jsonb;
begin
  if coalesce(public.meu_papel(), '') <> 'dono' then raise exception 'sem acesso'; end if;

  with e as (select * from lp_eventos where pagina = p_pagina and criado_em >= desde),
  s as (
    select sessao,
           max(visitante) visitante,
           max(dispositivo) dispositivo,
           max(coalesce(nullif(utm_source,''), nullif(origem,''), 'direto')) origem,
           max(utm_campaign) campanha,
           bool_or(tipo = 'form_start') iniciou,
           bool_or(tipo = 'form_step' and etapa >= 2) etapa2,
           bool_or(tipo = 'form_step' and etapa >= 3) etapa3,
           bool_or(tipo = 'form_submit') enviou,
           max(profundidade) profundidade,
           max(duracao_ms) duracao,
           min(criado_em) inicio
    from e group by sessao
  )
  select jsonb_build_object(
    'visitantes', (select count(distinct visitante) from s),
    'sessoes', (select count(*) from s),
    'envios', (select count(*) from s where enviou),
    'rolagem_media', (select round(avg(profundidade)) from s where profundidade is not null),
    'tempo_medio_s', (select round(avg(duracao) / 1000.0) from s where duracao is not null),
    'dispositivos', (select coalesce(jsonb_object_agg(d, n), '{}') from (select coalesce(dispositivo,'?') d, count(*) n from s group by 1) x),
    'funil', jsonb_build_array(
      jsonb_build_object('etapa','Entraram na página','n',(select count(*) from s)),
      jsonb_build_object('etapa','Começaram o formulário','n',(select count(*) from s where iniciou)),
      jsonb_build_object('etapa','Chegaram na etapa 2','n',(select count(*) from s where etapa2)),
      jsonb_build_object('etapa','Chegaram na etapa 3','n',(select count(*) from s where etapa3)),
      jsonb_build_object('etapa','Enviaram','n',(select count(*) from s where enviou))
    ),
    'secoes', (select coalesce(jsonb_agg(jsonb_build_object('secao', secao, 'sessoes', n) order by ordem), '[]')
               from (select secao, count(distinct sessao) n, min(coalesce(etapa, 99)) ordem from e where tipo = 'section' group by secao) x),
    'origens', (select coalesce(jsonb_agg(jsonb_build_object('origem', origem, 'sessoes', n, 'envios', env) order by n desc), '[]')
                from (select origem, count(*) n, count(*) filter (where enviou) env from s group by origem order by n desc limit 12) x),
    'campanhas', (select coalesce(jsonb_agg(jsonb_build_object('campanha', campanha, 'sessoes', n, 'envios', env) order by n desc), '[]')
                  from (select campanha, count(*) n, count(*) filter (where enviou) env from s where campanha is not null group by campanha order by n desc limit 12) x),
    'cliques', (select coalesce(jsonb_agg(jsonb_build_object('alvo', alvo, 'n', n, 'raiva', rg) order by n desc), '[]')
                from (select alvo, count(*) n, count(*) filter (where rage) rg from e where tipo = 'click' and alvo is not null group by alvo order by count(*) desc limit 15) x),
    'por_dia', (select coalesce(jsonb_agg(jsonb_build_object('dia', dia, 'sessoes', n, 'envios', env) order by dia), '[]')
                from (select (inicio at time zone 'America/Sao_Paulo')::date dia, count(*) n, count(*) filter (where enviou) env from s group by 1) x)
  ) into r;
  return r;
end $$;

-- Pontos do mapa de calor
create or replace function public.lp_cliques(p_dias int default 7, p_dispositivo text default 'mobile', p_pagina text default 'diagnostico')
returns table (x_pct real, x_centro int, y_px int, rage boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  if coalesce(public.meu_papel(), '') <> 'dono' then raise exception 'sem acesso'; end if;
  return query
    select e.x_pct, e.x_centro, e.y_px, e.rage from lp_eventos e
    where e.pagina = p_pagina and e.tipo = 'click' and e.dispositivo = p_dispositivo
      and e.criado_em >= now() - make_interval(days => greatest(1, least(p_dias, 365)))
      and e.y_px is not null
    order by e.criado_em desc
    limit 8000;
end $$;

revoke all on function public.lp_resumo(int, text) from public, anon;
revoke all on function public.lp_cliques(int, text, text) from public, anon;
grant execute on function public.lp_resumo(int, text) to authenticated;
grant execute on function public.lp_cliques(int, text, text) to authenticated;
