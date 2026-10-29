-- ════════════════════════════════════════════════════════════════════
-- 0006 · Prospecção Ativa dentro do portal (sem Google Sheets)
-- Projeto Supabase: rqcarttwamgzypumcklf (mesmo do SDR e do portal)
-- Os itens 4.1 a 4.4 já tinham sido aplicados antes; ficam aqui para registro (idempotentes).
-- Idempotente: pode rodar mais de uma vez.
-- ════════════════════════════════════════════════════════════════════

-- 4.1 Campos completos do lead (antes ficavam só na planilha)
alter table public.outreach_leads
  add column if not exists endereco          text,
  add column if not exists telefone          text,
  add column if not exists site              text,
  add column if not exists instagram         text,
  add column if not exists linkedin_empresa  text,
  add column if not exists cnpj              text,
  add column if not exists porte             text,
  add column if not exists cargo_decisor     text,
  add column if not exists linkedin_decisor  text,
  add column if not exists avaliacoes        int,
  add column if not exists observacoes       text,
  add column if not exists origem            text not null default 'google_maps',
  add column if not exists coletado_em       date,
  add column if not exists status_comercial  text not null default 'novo';

-- Nome interno das mensagens (aba Mensagens do portal)
alter table public.outreach_templates add column if not exists name text;

-- 4.2 Deduplicação por nome + cidade, além do place_id
create unique index if not exists outreach_leads_nome_cidade
  on public.outreach_leads (lower(empresa), lower(coalesce(cidade,'')));

-- 4.3 Status comercial automático a partir dos canais
create or replace function public.outreach_sync_status() returns trigger language plpgsql as $$
begin
  if new.status_comercial in ('novo','contatado','respondeu') then
    new.status_comercial := case
      when new.wa_status = 'optout' or new.email_status = 'optout' then 'descartado'
      when new.wa_status = 'respondeu' or new.email_status = 'respondeu' then 'respondeu'
      when new.wa_status = 'enviado' or new.email_status = 'enviado' then 'contatado'
      else new.status_comercial end;
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists outreach_sync_status on public.outreach_leads;
create trigger outreach_sync_status before update on public.outreach_leads
  for each row execute function public.outreach_sync_status();

-- 4.4 Coletas (substitui a aba "Controle" da planilha)
create table if not exists public.outreach_coletas (
  id bigserial primary key,
  executada_em timestamptz not null default now(),
  cidades text[], nichos text[],
  lugares_coletados int, novos_adicionados int,
  custo_usd numeric(8,3), acumulado_mes_usd numeric(8,3),
  observacoes text
);
alter table public.outreach_coletas enable row level security;

-- ─────────────── Acesso do portal: só perfis "dono" ───────────────
-- O portal usa o login do próprio usuário (sem service role no navegador).
do $$
declare t text;
begin
  foreach t in array array['outreach_leads','outreach_templates','outreach_config','outreach_log','outreach_coletas'] loop
    execute format('drop policy if exists %I on public.%I', t || '_dono_all', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (public.meu_papel() = ''dono'') with check (public.meu_papel() = ''dono'')',
      t || '_dono_all', t);
  end loop;
end $$;

-- A view de KPIs roda com a permissão de quem consulta
alter view if exists public.outreach_resumo set (security_invoker = true);

-- ─────────────── Importação de leads (endpoint + CSV do portal) ───────────────
create or replace function public.outreach_import_leads(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  l jsonb;
  v_recebidos int := 0;
  v_novos int := 0;
  v_wa text;
  v_prio text;
  v_ins int;
  v_coleta jsonb := p -> 'coleta';
  v_custo numeric := coalesce((p -> 'coleta' ->> 'custo_usd')::numeric, 0);
  v_acum numeric;
begin
  if coalesce(auth.role(), '') <> 'service_role' and coalesce(public.meu_papel(), '') <> 'dono' then
    raise exception 'sem permissão';
  end if;

  for l in select * from jsonb_array_elements(coalesce(p -> 'leads', '[]'::jsonb)) loop
    v_recebidos := v_recebidos + 1;
    if coalesce(trim(l ->> 'empresa'), '') = '' then continue; end if;

    -- WhatsApp: 55 + DDD + 9 dígitos começando com 9. Fixo não é WhatsApp.
    v_wa := regexp_replace(coalesce(l ->> 'whatsapp', ''), '\D', '', 'g');
    if length(v_wa) in (10, 11) then v_wa := '55' || v_wa; end if;
    if v_wa !~ '^55[1-9][0-9]9[0-9]{8}$' then v_wa := null; end if;

    v_prio := initcap(coalesce(nullif(trim(l ->> 'prioridade'), ''), 'Média'));
    if v_prio not in ('Alta', 'Média', 'Baixa') then v_prio := 'Média'; end if;

    insert into public.outreach_leads (
      place_id, empresa, cidade, nicho, endereco, telefone, whatsapp, email, site, instagram,
      linkedin_empresa, cnpj, porte, decisor, cargo_decisor, linkedin_decisor, avaliacoes,
      prioridade, observacoes, origem, coletado_em, wa_status, email_status
    ) values (
      coalesce(nullif(trim(l ->> 'place_id'), ''), 'manual:' || gen_random_uuid()),
      trim(l ->> 'empresa'), nullif(trim(l ->> 'cidade'), ''), nullif(trim(l ->> 'nicho'), ''),
      nullif(l ->> 'endereco', ''), nullif(l ->> 'telefone', ''), v_wa,
      nullif(lower(trim(l ->> 'email')), ''), nullif(l ->> 'site', ''), nullif(l ->> 'instagram', ''),
      nullif(l ->> 'linkedin_empresa', ''), nullif(l ->> 'cnpj', ''), nullif(upper(l ->> 'porte'), ''),
      nullif(trim(l ->> 'decisor'), ''), nullif(l ->> 'cargo_decisor', ''), nullif(l ->> 'linkedin_decisor', ''),
      nullif(l ->> 'avaliacoes', '')::int, v_prio, nullif(l ->> 'observacoes', ''),
      coalesce(nullif(l ->> 'origem', ''), 'google_maps'),
      coalesce(nullif(l ->> 'coletado_em', '')::date, (now() at time zone 'America/Sao_Paulo')::date),
      case when v_prio = 'Baixa' then 'ignorado' when v_wa is null then 'sem_whatsapp' else 'pendente' end,
      case when v_prio = 'Baixa' then 'ignorado'
           when coalesce(trim(l ->> 'email'), '') = '' then 'sem_email' else 'pendente' end
    ) on conflict do nothing;
    get diagnostics v_ins = row_count;
    v_novos := v_novos + v_ins;
  end loop;

  if v_coleta is not null then
    select coalesce(sum(custo_usd), 0) + v_custo into v_acum
      from public.outreach_coletas
     where date_trunc('month', executada_em at time zone 'America/Sao_Paulo')
         = date_trunc('month', now() at time zone 'America/Sao_Paulo');
    insert into public.outreach_coletas (cidades, nichos, lugares_coletados, novos_adicionados, custo_usd, acumulado_mes_usd, observacoes)
    values (
      array(select jsonb_array_elements_text(coalesce(v_coleta -> 'cidades', '[]'))),
      array(select jsonb_array_elements_text(coalesce(v_coleta -> 'nichos', '[]'))),
      nullif(v_coleta ->> 'lugares_coletados', '')::int, v_novos, v_custo, v_acum,
      v_coleta ->> 'observacoes'
    );
  end if;

  insert into public.outreach_log (channel, event, detail)
  values ('sync', 'sync', jsonb_build_object(
    'msg', format('%s recebidos · %s novos · %s duplicados', v_recebidos, v_novos, v_recebidos - v_novos),
    'origem', case when auth.role() = 'service_role' then 'endpoint' else 'portal' end));

  return jsonb_build_object('recebidos', v_recebidos, 'novos', v_novos, 'duplicados', v_recebidos - v_novos);
end $$;

revoke all on function public.outreach_import_leads(jsonb) from public, anon;
grant execute on function public.outreach_import_leads(jsonb) to authenticated, service_role;

-- Orçamento do Apify no mês (teto US$ 4)
create or replace function public.outreach_orcamento()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'mes', to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM'),
    'gasto_usd', coalesce(sum(custo_usd), 0),
    'teto_usd', 4)
  from public.outreach_coletas
  where date_trunc('month', executada_em at time zone 'America/Sao_Paulo')
      = date_trunc('month', now() at time zone 'America/Sao_Paulo');
$$;
revoke all on function public.outreach_orcamento() from public, anon;
grant execute on function public.outreach_orcamento() to authenticated, service_role;

-- 4.5 Realtime para o painel
do $$ begin
  alter publication supabase_realtime add table public.outreach_leads;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.outreach_log;
exception when duplicate_object then null; end $$;

-- 4.6 SOMENTE depois de ajustar o outreach-wa-tick e remover o outreach-api:
-- alter table public.outreach_leads drop column sheet_row, drop column sheet_synced;
