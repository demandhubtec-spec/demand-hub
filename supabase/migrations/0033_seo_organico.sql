-- 0033 · SEO e orgânico (Marketing > SEO e orgânico no portal)
--
-- 1) seo_gsc_diario: o que o Google Search Console mostra do demandhub.com.br, por dia,
--    palavra-chave e página (cliques, impressões, CTR e posição média). Preenchido pelo
--    servidor da Ana (/api/seo) todo dia, com a conta demandhubtec@gmail.com conectada.
-- 2) seo_ia_perguntas / seo_ia_checagens: perguntas que um empresário faria ao ChatGPT
--    e, toda semana, se a resposta citou a DemandIA e quais sites ela usou de fonte.
-- 3) Funções de resumo para o portal (só o dono): seo_resumo, seo_origens e seo_ia_resumo.
-- 4) Relógio diário às 6h20 de Brasília chamando /api/cron/seo.
--
-- Para desfazer:
--   select cron.unschedule('seo-diario');
--   drop function public.seo_resumo(int); drop function public.seo_origens(int); drop function public.seo_ia_resumo();
--   drop table public.seo_ia_checagens; drop table public.seo_ia_perguntas; drop table public.seo_gsc_diario;

create table if not exists public.seo_gsc_diario (
  data          date not null,
  consulta      text not null,
  pagina        text not null,
  cliques       int  not null default 0,
  impressoes    int  not null default 0,
  ctr           real,
  posicao       real,
  atualizado_em timestamptz not null default now(),
  primary key (data, consulta, pagina)
);
create index if not exists seo_gsc_diario_data on public.seo_gsc_diario (data desc);

create table if not exists public.seo_ia_perguntas (
  id        uuid primary key default gen_random_uuid(),
  pergunta  text not null,
  ativa     boolean not null default true,
  criado_em timestamptz not null default now()
);

create table if not exists public.seo_ia_checagens (
  id          bigint generated always as identity primary key,
  criado_em   timestamptz not null default now(),
  pergunta_id uuid references public.seo_ia_perguntas(id) on delete cascade,
  pergunta    text not null,
  motor       text not null default 'chatgpt',
  citou       boolean not null default false,
  posicao     int,        -- em que ordem o demandhub.com.br apareceu entre as fontes (quando apareceu)
  fontes      text[],     -- sites que a IA usou de fonte
  resposta    text,
  erro        text
);
create index if not exists seo_ia_checagens_pergunta on public.seo_ia_checagens (pergunta_id, criado_em desc);

alter table public.seo_gsc_diario   enable row level security;
alter table public.seo_ia_perguntas enable row level security;
alter table public.seo_ia_checagens enable row level security;

drop policy if exists seo_gsc_diario_dono on public.seo_gsc_diario;
create policy seo_gsc_diario_dono on public.seo_gsc_diario for select to authenticated using (public.meu_papel() = 'dono');
drop policy if exists seo_ia_perguntas_dono on public.seo_ia_perguntas;
create policy seo_ia_perguntas_dono on public.seo_ia_perguntas for all to authenticated
  using (public.meu_papel() = 'dono') with check (public.meu_papel() = 'dono');
drop policy if exists seo_ia_checagens_dono on public.seo_ia_checagens;
create policy seo_ia_checagens_dono on public.seo_ia_checagens for select to authenticated using (public.meu_papel() = 'dono');

-- Perguntas iniciais (o Kelvin pode editar no portal)
insert into public.seo_ia_perguntas (pergunta)
select p from (values
  ('Qual a melhor empresa de inteligência artificial para marketing e vendas para pequenas e médias empresas no Brasil?'),
  ('Quais empresas fazem atendimento com IA no WhatsApp para empresas no Brasil?'),
  ('Quem faz agentes de IA para prospecção de clientes por WhatsApp e ligação?'),
  ('Empresa de automação de processos e CRM sob medida em Campinas ou Indaiatuba'),
  ('Qual agência de marketing com inteligência artificial vocês recomendam para clínicas?'),
  ('Como aumentar as vendas da minha empresa com IA sem contratar mais funcionários? Indique empresas que fazem isso.'),
  ('Empresas que desenvolvem sistemas e CRM personalizados com IA no interior de São Paulo'),
  ('O que é a DemandIA e o que ela faz?')
) v(p)
where not exists (select 1 from public.seo_ia_perguntas);

-- Resumo do Google (Search Console). Período termina no último dia com dados (o Google atrasa 2 a 3 dias).
create or replace function public.seo_resumo(p_dias int default 28)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  n    int := greatest(1, least(p_dias, 480));
  fim  date;
  ini  date;
  ini0 date;
  r    jsonb;
  conectado boolean;
begin
  if coalesce(public.meu_papel(), '') <> 'dono' then raise exception 'sem acesso'; end if;
  select coalesce((value->>'refresh_token') is not null, false) into conectado from sdr_integrations where key = 'searchconsole';
  select max(data) into fim from seo_gsc_diario;
  if fim is null then
    return jsonb_build_object('conectado', coalesce(conectado, false), 'ultimo_dia', null);
  end if;
  ini  := fim - (n - 1);
  ini0 := ini - n;

  with atual as (select * from seo_gsc_diario where data between ini and fim),
       antes as (select * from seo_gsc_diario where data between ini0 and ini - 1),
       tot as (
         select sum(cliques) c, sum(impressoes) i,
                case when sum(impressoes) > 0 then sum(posicao * impressoes) / sum(impressoes) end p
         from atual),
       tot0 as (
         select sum(cliques) c, sum(impressoes) i,
                case when sum(impressoes) > 0 then sum(posicao * impressoes) / sum(impressoes) end p
         from antes),
       cons as (
         select consulta, sum(cliques) c, sum(impressoes) i,
                sum(posicao * impressoes) / nullif(sum(impressoes), 0) p
         from atual group by consulta),
       cons0 as (
         select consulta, sum(posicao * impressoes) / nullif(sum(impressoes), 0) p
         from antes group by consulta),
       pags as (
         select pagina, sum(cliques) c, sum(impressoes) i,
                sum(posicao * impressoes) / nullif(sum(impressoes), 0) p
         from atual group by pagina)
  select jsonb_build_object(
    'conectado', coalesce(conectado, false),
    'ultimo_dia', fim,
    'de', ini, 'ate', fim,
    'cliques', coalesce((select c from tot), 0),
    'impressoes', coalesce((select i from tot), 0),
    'posicao', (select round(p::numeric, 1) from tot),
    'cliques_ant', coalesce((select c from tot0), 0),
    'impressoes_ant', coalesce((select i from tot0), 0),
    'posicao_ant', (select round(p::numeric, 1) from tot0),
    'palavras', (select count(*) from cons),
    'por_dia', (select coalesce(jsonb_agg(jsonb_build_object('dia', data, 'cliques', c, 'impressoes', i, 'posicao', round(p::numeric, 1)) order by data), '[]')
                from (select data, sum(cliques) c, sum(impressoes) i, sum(posicao * impressoes) / nullif(sum(impressoes), 0) p
                      from atual group by data) x),
    'consultas', (select coalesce(jsonb_agg(jsonb_build_object(
                      'consulta', cons.consulta, 'cliques', cons.c, 'impressoes', cons.i,
                      'ctr', case when cons.i > 0 then round(100.0 * cons.c / cons.i, 1) end,
                      'posicao', round(cons.p::numeric, 1), 'posicao_ant', round(cons0.p::numeric, 1))
                    order by cons.c desc, cons.i desc), '[]')
                  from (select * from cons order by c desc, i desc limit 100) cons left join cons0 using (consulta)),
    'paginas', (select coalesce(jsonb_agg(jsonb_build_object(
                    'pagina', pagina, 'cliques', c, 'impressoes', i,
                    'ctr', case when i > 0 then round(100.0 * c / i, 1) end, 'posicao', round(p::numeric, 1))
                  order by c desc, i desc), '[]')
                from (select * from pags order by c desc, i desc limit 30) x)
  ) into r;
  return r;
end $$;

-- De onde vêm as visitas do site e da página do diagnóstico (rastreador próprio, lp_eventos)
create or replace function public.seo_origens(p_dias int default 28)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  desde timestamptz := now() - make_interval(days => greatest(1, least(p_dias, 365)));
  r jsonb;
begin
  if coalesce(public.meu_papel(), '') <> 'dono' then raise exception 'sem acesso'; end if;

  with e as (select * from lp_eventos where criado_em >= desde and pagina in ('site', 'diagnostico')),
  s as (
    select sessao,
           max(visitante) visitante,
           bool_or(tipo = 'view' and pagina = 'site') viu_site,
           bool_or(tipo = 'view' and pagina = 'diagnostico') viu_diag,
           -- origem = de onde veio na PRIMEIRA página vista da visita (ir do site para o diagnóstico não conta como origem nova)
           (array_agg(case
                 when nullif(utm_source, '') is not null then
                   lower(utm_source) || case when lower(coalesce(utm_medium, '')) ~ '(cpc|paid|ads|anuncio|ad$)' then ' (anúncio)' else '' end
                 else coalesce(nullif(origem, ''), 'direto')
               end order by criado_em) filter (where tipo = 'view'))[1] origem,
           bool_or(tipo = 'click' and pagina = 'site' and alvo ilike '%diagn%') clicou_diag,
           bool_or(tipo = 'click' and pagina = 'site' and alvo ilike '%whatsapp%') clicou_wa,
           bool_or(tipo = 'form_submit') enviou,
           min(criado_em) inicio
    from e group by sessao
  )
  select jsonb_build_object(
    'visitas_site', (select count(*) from s where viu_site),
    'visitantes_site', (select count(distinct visitante) from s where viu_site),
    'visitas_diagnostico', (select count(*) from s where viu_diag),
    'cliques_diagnostico', (select count(*) from s where clicou_diag),
    'cliques_whatsapp', (select count(*) from s where clicou_wa),
    'diagnosticos', (select count(*) from s where enviou),
    'origens', (select coalesce(jsonb_agg(jsonb_build_object(
                    'origem', origem, 'site', site, 'diagnostico', diag, 'cliques_diag', cd, 'cliques_wa', cw, 'envios', env)
                  order by site + diag desc), '[]')
                from (select origem,
                             count(*) filter (where viu_site) site,
                             count(*) filter (where viu_diag) diag,
                             count(*) filter (where clicou_diag) cd,
                             count(*) filter (where clicou_wa) cw,
                             count(*) filter (where enviou) env
                      from s where origem is not null group by origem order by count(*) desc limit 20) x),
    'por_dia', (select coalesce(jsonb_agg(jsonb_build_object('dia', dia, 'site', site, 'diagnostico', diag, 'envios', env) order by dia), '[]')
                from (select (inicio at time zone 'America/Sao_Paulo')::date dia,
                             count(*) filter (where viu_site) site,
                             count(*) filter (where viu_diag) diag,
                             count(*) filter (where enviou) env
                      from s group by 1) x)
  ) into r;
  return r;
end $$;

-- Presença nas IAs: última checagem de cada pergunta e a taxa de citação nas últimas 8 semanas
create or replace function public.seo_ia_resumo()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare r jsonb;
begin
  if coalesce(public.meu_papel(), '') <> 'dono' then raise exception 'sem acesso'; end if;
  with ult as (
    select distinct on (pergunta_id) * from seo_ia_checagens
    where erro is null order by pergunta_id, criado_em desc),
  hist as (
    select pergunta_id, count(*) n, count(*) filter (where citou) cit
    from seo_ia_checagens where erro is null and criado_em >= now() - interval '56 days' group by pergunta_id),
  fontes as (
    select f, count(*) n from seo_ia_checagens c, unnest(c.fontes) f
    where c.erro is null and c.criado_em >= now() - interval '56 days' group by f order by n desc limit 15)
  select jsonb_build_object(
    'ultima_checagem', (select max(criado_em) from seo_ia_checagens),
    'checagens', (select coalesce(sum(n), 0) from hist),
    'citacoes', (select coalesce(sum(cit), 0) from hist),
    'perguntas', (select coalesce(jsonb_agg(jsonb_build_object(
                     'id', p.id, 'pergunta', p.pergunta, 'ativa', p.ativa,
                     'citou', u.citou, 'quando', u.criado_em, 'posicao', u.posicao, 'fontes', u.fontes,
                     'resposta', left(u.resposta, 1200),
                     'vezes', coalesce(h.n, 0), 'citou_vezes', coalesce(h.cit, 0))
                   order by p.criado_em), '[]')
                  from seo_ia_perguntas p left join ult u on u.pergunta_id = p.id left join hist h on h.pergunta_id = p.id),
    'fontes', (select coalesce(jsonb_agg(jsonb_build_object('site', f, 'vezes', n) order by n desc), '[]') from fontes)
  ) into r;
  return r;
end $$;

grant execute on function public.seo_resumo(int) to authenticated;
grant execute on function public.seo_origens(int) to authenticated;
grant execute on function public.seo_ia_resumo() to authenticated;

-- Relógio: todo dia às 6h20 de Brasília (9h20 UTC), com a mesma autenticação dos outros jobs
do $$
begin
  if exists (select 1 from cron.job where jobname = 'outreach-email-tick') and not exists (select 1 from cron.job where jobname = 'seo-diario') then
    perform cron.schedule(
      'seo-diario',
      '20 9 * * *',
      replace((select command from cron.job where jobname = 'outreach-email-tick'), '/api/prospeccao/email-tick', '/api/cron/seo')
    );
  end if;
end $$;
