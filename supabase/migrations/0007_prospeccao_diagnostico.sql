-- ════════════════════════════════════════════════════════════════════
-- 0007 · Prospecção: diagnóstico do perfil no Google + mensagem por lead com aprovação
-- Idempotente.
-- ════════════════════════════════════════════════════════════════════

-- Sinais do perfil no Google (vêm da coleta do Apify; os que faltarem ficam nulos)
alter table public.outreach_leads
  add column if not exists nota                 numeric(2,1),   -- totalScore (0 a 5)
  add column if not exists fotos                int,            -- imagesCount
  add column if not exists categoria            text,           -- categoryName
  add column if not exists tem_descricao        boolean,        -- ficha com descrição preenchida
  add column if not exists tem_horario          boolean,        -- horário de funcionamento preenchido
  add column if not exists responde_avaliacoes  numeric(4,1),   -- % das avaliações recentes com resposta do dono
  add column if not exists termo_busca          text,           -- ex.: "dentista Indaiatuba"
  add column if not exists posicao_busca        int,            -- posição real no Google Maps para o termo_busca
  add column if not exists total_busca          int,            -- quantas empresas apareceram nessa busca
  -- Diagnóstico calculado + mensagem personalizada
  add column if not exists diagnostico          jsonb,
  add column if not exists msg_rascunho         text,
  add column if not exists msg_status           text not null default 'sem',
  add column if not exists msg_gerada_em        timestamptz,
  add column if not exists msg_aprovada_em      timestamptz;

do $$ begin
  alter table public.outreach_leads add constraint outreach_leads_msg_status_check
    check (msg_status in ('sem', 'gerando', 'rascunho', 'aprovada', 'rejeitada'));
exception when duplicate_object then null; end $$;

create index if not exists outreach_leads_msg_status on public.outreach_leads (msg_status);

-- Liga/desliga: o robô só envia mensagens aprovadas (padrão: sim)
alter table public.outreach_config
  add column if not exists exigir_aprovacao boolean not null default true;

-- A importação passa a aceitar os sinais do perfil
create or replace function public.outreach_import_leads(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  l jsonb;
  v_recebidos int := 0;
  v_novos int := 0;
  v_atualizados int := 0;
  v_wa text;
  v_prio text;
  v_ins int;
  v_coleta jsonb := p -> 'coleta';
  v_custo numeric := coalesce((p -> 'coleta' ->> 'custo_usd')::numeric, 0);
  v_acum numeric;
  v_pid text;
begin
  if coalesce(auth.role(), '') <> 'service_role' and coalesce(public.meu_papel(), '') <> 'dono' then
    raise exception 'sem permissão';
  end if;

  for l in select * from jsonb_array_elements(coalesce(p -> 'leads', '[]'::jsonb)) loop
    v_recebidos := v_recebidos + 1;
    if coalesce(trim(l ->> 'empresa'), '') = '' then continue; end if;

    v_wa := regexp_replace(coalesce(l ->> 'whatsapp', ''), '\D', '', 'g');
    if length(v_wa) in (10, 11) then v_wa := '55' || v_wa; end if;
    if v_wa !~ '^55[1-9][0-9]9[0-9]{8}$' then v_wa := null; end if;

    v_prio := initcap(coalesce(nullif(trim(l ->> 'prioridade'), ''), 'Média'));
    if v_prio not in ('Alta', 'Média', 'Baixa') then v_prio := 'Média'; end if;
    v_pid := coalesce(nullif(trim(l ->> 'place_id'), ''), 'manual:' || gen_random_uuid());

    insert into public.outreach_leads (
      place_id, empresa, cidade, nicho, endereco, telefone, whatsapp, email, site, instagram,
      linkedin_empresa, cnpj, porte, decisor, cargo_decisor, linkedin_decisor, avaliacoes,
      prioridade, observacoes, origem, coletado_em, wa_status, email_status,
      nota, fotos, categoria, tem_descricao, tem_horario, responde_avaliacoes, termo_busca, posicao_busca, total_busca
    ) values (
      v_pid,
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
           when coalesce(trim(l ->> 'email'), '') = '' then 'sem_email' else 'pendente' end,
      nullif(l ->> 'nota', '')::numeric, nullif(l ->> 'fotos', '')::int, nullif(l ->> 'categoria', ''),
      nullif(l ->> 'tem_descricao', '')::boolean, nullif(l ->> 'tem_horario', '')::boolean,
      nullif(l ->> 'responde_avaliacoes', '')::numeric, nullif(l ->> 'termo_busca', ''),
      nullif(l ->> 'posicao_busca', '')::int, nullif(l ->> 'total_busca', '')::int
    ) on conflict do nothing;
    get diagnostics v_ins = row_count;
    v_novos := v_novos + v_ins;

    -- Lead que já existia: só completa os sinais do perfil (nunca mexe em status de envio)
    if v_ins = 0 then
      update public.outreach_leads o set
        nota = coalesce(nullif(l ->> 'nota', '')::numeric, o.nota),
        fotos = coalesce(nullif(l ->> 'fotos', '')::int, o.fotos),
        categoria = coalesce(nullif(l ->> 'categoria', ''), o.categoria),
        tem_descricao = coalesce(nullif(l ->> 'tem_descricao', '')::boolean, o.tem_descricao),
        tem_horario = coalesce(nullif(l ->> 'tem_horario', '')::boolean, o.tem_horario),
        responde_avaliacoes = coalesce(nullif(l ->> 'responde_avaliacoes', '')::numeric, o.responde_avaliacoes),
        termo_busca = coalesce(nullif(l ->> 'termo_busca', ''), o.termo_busca),
        posicao_busca = coalesce(nullif(l ->> 'posicao_busca', '')::int, o.posicao_busca),
        total_busca = coalesce(nullif(l ->> 'total_busca', '')::int, o.total_busca),
        avaliacoes = coalesce(nullif(l ->> 'avaliacoes', '')::int, o.avaliacoes),
        site = coalesce(o.site, nullif(l ->> 'site', '')),
        instagram = coalesce(o.instagram, nullif(l ->> 'instagram', ''))
      where o.place_id = v_pid
         or (lower(o.empresa) = lower(trim(l ->> 'empresa')) and lower(coalesce(o.cidade, '')) = lower(coalesce(trim(l ->> 'cidade'), '')));
      get diagnostics v_ins = row_count;
      v_atualizados := v_atualizados + least(v_ins, 1);
    end if;
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
    'msg', format('%s recebidos · %s novos · %s atualizados', v_recebidos, v_novos, v_atualizados),
    'origem', case when auth.role() = 'service_role' then 'endpoint' else 'portal' end));

  return jsonb_build_object('recebidos', v_recebidos, 'novos', v_novos, 'duplicados', v_recebidos - v_novos, 'atualizados', v_atualizados);
end $$;

revoke all on function public.outreach_import_leads(jsonb) from public, anon;
grant execute on function public.outreach_import_leads(jsonb) to authenticated, service_role;
