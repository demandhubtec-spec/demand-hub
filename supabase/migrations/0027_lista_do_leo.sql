-- Léo (LDR) completa a ficha antes da abordagem: CNPJ, sócios, dono, site de verdade (Google, WhatsApp, Instagram).
-- Só acrescenta colunas; nada é apagado.

alter table public.outreach_leads
  add column if not exists razao_social text,
  add column if not exists socios jsonb,
  add column if not exists cnpj_email text,
  add column if not exists cnpj_telefone text,
  add column if not exists cnpj_situacao text,
  add column if not exists cnae text,
  add column if not exists dono_instagram text,
  add column if not exists site_fonte text,
  add column if not exists wa_recado text,
  add column if not exists enriquecimento jsonb,
  add column if not exists enriquecido_em timestamptz;

create index if not exists outreach_leads_leo_etapa on public.outreach_leads ((enriquecimento->>'etapa'));

-- Coleta do Léo em andamento no Apify (uma por vez) e teto do Apify editável no portal
alter table public.outreach_config
  add column if not exists leo_coleta jsonb,
  add column if not exists apify_teto_usd numeric(8,2) not null default 4;

create or replace function public.outreach_orcamento()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'mes', to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM'),
    'gasto_usd', coalesce((select sum(custo_usd) from public.outreach_coletas
                            where date_trunc('month', executada_em at time zone 'America/Sao_Paulo')
                                = date_trunc('month', now() at time zone 'America/Sao_Paulo')), 0),
    'teto_usd', coalesce((select apify_teto_usd from public.outreach_config where id = 1), 4));
$$;
revoke all on function public.outreach_orcamento() from public, anon;
grant execute on function public.outreach_orcamento() to authenticated, service_role;
