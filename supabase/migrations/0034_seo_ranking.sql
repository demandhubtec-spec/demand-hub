-- 0034 · SEO: em que página do Google o site aparece e o plano da semana para subir
--
-- 1) seo_palavras_alvo: as palavras que a DemandIA quer ganhar no Google (o Kelvin edita no portal).
--    Para cada uma o portal mostra a posição média e a página do Google (1ª, 2ª, 3ª...).
-- 2) seo_recomendacoes: toda segunda o servidor da Ana analisa os números do Google, as palavras-alvo,
--    o site e a presença nas IAs e grava as ações da semana para subir no ranking.
-- 3) seo_ranking(p_dias): palavras-alvo com página/posição, oportunidades (quase na 1ª página) e o plano.
-- 4) seo_origens: "ig" e "instagram" viram a mesma origem; visitas de teste ficam fora da conta.
--
-- Para desfazer:
--   drop function public.seo_ranking(int);
--   drop table public.seo_recomendacoes; drop table public.seo_palavras_alvo;
--   (seo_origens volta pela 0033)

create table if not exists public.seo_palavras_alvo (
  id        uuid primary key default gen_random_uuid(),
  palavra   text not null,
  ativa     boolean not null default true,
  criado_em timestamptz not null default now()
);

create table if not exists public.seo_recomendacoes (
  id        bigint generated always as identity primary key,
  criado_em timestamptz not null default now(),
  resumo    text,
  itens     jsonb not null default '[]',  -- [{prioridade, titulo, porque, como[], pagina, palavra}]
  base      jsonb                          -- números usados na análise (para conferência)
);
create index if not exists seo_recomendacoes_data on public.seo_recomendacoes (criado_em desc);

alter table public.seo_palavras_alvo enable row level security;
alter table public.seo_recomendacoes enable row level security;
drop policy if exists seo_palavras_alvo_dono on public.seo_palavras_alvo;
create policy seo_palavras_alvo_dono on public.seo_palavras_alvo for all to authenticated
  using (public.meu_papel() = 'dono') with check (public.meu_papel() = 'dono');
drop policy if exists seo_recomendacoes_dono on public.seo_recomendacoes;
create policy seo_recomendacoes_dono on public.seo_recomendacoes for select to authenticated using (public.meu_papel() = 'dono');

-- Palavras-alvo iniciais (marketing, vendas, IA, automação, CRM, sistema, agentes)
insert into public.seo_palavras_alvo (palavra)
select p from (values
  ('demandia'),
  ('agência de marketing com ia'),
  ('inteligência artificial para vendas'),
  ('automação de vendas'),
  ('automação de atendimento whatsapp'),
  ('agente de ia para empresas'),
  ('crm personalizado'),
  ('sistema sob medida para empresas'),
  ('agência de marketing indaiatuba'),
  ('marketing digital campinas')
) v(p)
where not exists (select 1 from public.seo_palavras_alvo);

-- texto sem acento e minúsculo, para comparar palavra-alvo com o que as pessoas buscaram
create or replace function public.seo_norm(t text) returns text language sql immutable as $$
  select translate(lower(coalesce(t, '')), 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc')
$$;

create or replace function public.seo_ranking(p_dias int default 28)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  n    int := greatest(1, least(p_dias, 480));
  fim  date;
  ini  date;
  ini0 date;
  r    jsonb;
begin
  if coalesce(public.meu_papel(), '') <> 'dono' then raise exception 'sem acesso'; end if;
  select max(data) into fim from seo_gsc_diario;
  if fim is null then fim := current_date - 3; end if;
  ini  := fim - (n - 1);
  ini0 := ini - n;

  with cons as (
         select consulta, seo_norm(consulta) cn, sum(cliques) c, sum(impressoes) i,
                sum(posicao * impressoes) / nullif(sum(impressoes), 0) p
         from seo_gsc_diario where data between ini and fim group by consulta),
       cons0 as (
         select seo_norm(consulta) cn, sum(impressoes) i, sum(posicao * impressoes) / nullif(sum(impressoes), 0) p
         from seo_gsc_diario where data between ini0 and ini - 1 group by consulta),
       -- página do site que mais aparece para cada busca
       pag as (
         select distinct on (consulta) consulta, pagina
         from (select consulta, pagina, sum(impressoes) i from seo_gsc_diario where data between ini and fim group by 1, 2) x
         order by consulta, i desc),
       alvos as (
         select a.id, a.palavra, a.ativa, a.criado_em, seo_norm(a.palavra) an from seo_palavras_alvo a),
       -- para cada palavra-alvo: a busca exata, se existir; senão todas as buscas que contêm a palavra
       casa as (
         select al.id, c.*,
                (c.cn = al.an) exata
         from alvos al join cons c on c.cn = al.an or c.cn like '%' || al.an || '%'),
       resumo_alvo as (
         select id,
                sum(c) c, sum(i) i,
                sum(p * i) / nullif(sum(i), 0) p,
                min(p) melhor,
                (array_agg(consulta order by exata desc, i desc))[1] busca,
                count(*) buscas
         from casa group by id),
       antes_alvo as (
         select al.id, sum(c0.p * c0.i) / nullif(sum(c0.i), 0) p
         from alvos al join cons0 c0 on c0.cn = al.an or c0.cn like '%' || al.an || '%'
         group by al.id)
  select jsonb_build_object(
    'de', ini, 'ate', fim,
    'tem_dados', exists (select 1 from seo_gsc_diario),
    'alvos', (select coalesce(jsonb_agg(jsonb_build_object(
                  'id', al.id, 'palavra', al.palavra, 'ativa', al.ativa,
                  'cliques', coalesce(ra.c, 0), 'impressoes', coalesce(ra.i, 0),
                  'posicao', round(ra.p::numeric, 1), 'melhor', round(ra.melhor::numeric, 1),
                  'posicao_ant', round(aa.p::numeric, 1),
                  'pagina_google', case when ra.p is not null then ceil(ra.p / 10.0)::int end,
                  'busca', ra.busca, 'buscas', coalesce(ra.buscas, 0))
                order by al.ativa desc, ra.p nulls last, al.criado_em), '[]')
              from alvos al left join resumo_alvo ra on ra.id = al.id left join antes_alvo aa on aa.id = al.id),
    -- quase lá: buscas entre a posição 4 e 20 com algumas impressões (subir um pouco já traz cliques)
    'oportunidades', (select coalesce(jsonb_agg(jsonb_build_object(
                          'consulta', c.consulta, 'impressoes', c.i, 'cliques', c.c,
                          'posicao', round(c.p::numeric, 1), 'pagina_google', ceil(c.p / 10.0)::int, 'pagina', pg.pagina)
                        order by c.i desc), '[]')
                      from (select * from cons where p >= 4 and p < 21 and i >= 3 order by i desc limit 12) c
                      left join pag pg using (consulta)),
    'plano', (select jsonb_build_object('criado_em', criado_em, 'resumo', resumo, 'itens', itens)
              from seo_recomendacoes order by criado_em desc limit 1)
  ) into r;
  return r;
end $$;

-- De onde vêm as visitas: igual à 0033, com a origem normalizada (ig = Instagram) e sem as visitas de teste
create or replace function public.seo_origens(p_dias int default 28)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  desde timestamptz := now() - make_interval(days => greatest(1, least(p_dias, 365)));
  r jsonb;
begin
  if coalesce(public.meu_papel(), '') <> 'dono' then raise exception 'sem acesso'; end if;

  with e as (
    select ev.*,
           case
             when nullif(ev.utm_source, '') is not null then
               (case lower(ev.utm_source)
                  when 'ig' then 'instagram' when 'insta' then 'instagram' when 'l.instagram.com' then 'instagram'
                  when 'fb' then 'facebook' when 'm.facebook.com' then 'facebook' when 'l.facebook.com' then 'facebook'
                  when 'gads' then 'google' when 'adwords' then 'google'
                  else lower(ev.utm_source) end)
               || case when lower(coalesce(ev.utm_medium, '')) ~ '(cpc|paid|ads|anuncio|ad$)' then ' (anúncio)' else '' end
             else coalesce(nullif(ev.origem, ''), 'direto')
           end origem_n
    from lp_eventos ev
    where ev.criado_em >= desde and ev.pagina in ('site', 'diagnostico')),
  teste as (select distinct sessao from e where lower(coalesce(utm_source, '')) like 'teste%'),
  s as (
    select sessao,
           max(visitante) visitante,
           bool_or(tipo = 'view' and pagina = 'site') viu_site,
           bool_or(tipo = 'view' and pagina = 'diagnostico') viu_diag,
           (array_agg(origem_n order by criado_em) filter (where tipo = 'view'))[1] origem,
           bool_or(tipo = 'click' and pagina = 'site' and alvo ilike '%diagn%') clicou_diag,
           bool_or(tipo = 'click' and pagina = 'site' and alvo ilike '%whatsapp%') clicou_wa,
           bool_or(tipo = 'form_submit') enviou,
           min(criado_em) inicio
    from e where sessao not in (select sessao from teste) group by sessao
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

grant execute on function public.seo_ranking(int) to authenticated;
grant execute on function public.seo_origens(int) to authenticated;
