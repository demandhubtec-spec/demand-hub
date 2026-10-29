-- ════════════════════════════════════════════════════════════════════
-- 0008 · Prospecção: cadência de follow-up (WhatsApp + e-mail) e Kanban
-- Idempotente.
--
-- Cada lead aprovado recebe uma sequência de 6 toques escrita pela Ana (coluna sequencia):
--   D0 manhã WhatsApp · D0 tarde e-mail · D2 WhatsApp · D4 e-mail · D7 WhatsApp · D10 WhatsApp
-- O robô manda o toque devido; qualquer resposta para a cadência; sem resposta no fim,
-- o lead vai para "Retomar depois" e volta para a aprovação em retomar_dias.
-- ════════════════════════════════════════════════════════════════════

alter table public.outreach_leads
  add column if not exists sequencia           jsonb,         -- [{n, dia, periodo, canal, assunto, texto}]
  add column if not exists cadencia            text not null default 'nao_iniciada',
  add column if not exists toque_atual         int  not null default 0,  -- quantos toques já foram feitos (enviados ou pulados)
  add column if not exists cadencia_inicio     timestamptz,
  add column if not exists proximo_toque_em    timestamptz,
  add column if not exists proximo_canal       text,
  add column if not exists ultimo_toque_em     timestamptz,
  add column if not exists ultimo_canal        text,
  add column if not exists respondeu_no_toque  int,
  add column if not exists retomar_em          date,
  add column if not exists tentativa           int  not null default 1;

do $$ begin
  alter table public.outreach_leads add constraint outreach_leads_cadencia_check
    check (cadencia in ('nao_iniciada', 'ativa', 'pausada', 'respondeu', 'concluida', 'parada'));
exception when duplicate_object then null; end $$;

create index if not exists outreach_leads_cadencia_due
  on public.outreach_leads (proximo_canal, proximo_toque_em) where cadencia = 'ativa';

alter table public.outreach_config
  add column if not exists followup_daily_cap int not null default 40,
  add column if not exists retomar_dias       int not null default 60;

-- ── Avança a cadência de um lead depois de um toque (enviado ou pulado) ──
-- Calcula quando sai o próximo toque e por qual canal. Toques de e-mail são pulados
-- quando o lead não tem e-mail ou o e-mail está desligado, para o WhatsApp seguir.
create or replace function public.outreach_avancar_cadencia(p_place_id text, p_resultado text default 'enviado')
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  l public.outreach_leads%rowtype;
  cfg public.outreach_config%rowtype;
  v_seq jsonb;
  v_n int;
  v_step jsonb;
  v_canal text;
  v_inicio timestamptz;
  v_due timestamptz;
  v_hora time;
  v_pulados int := 0;
begin
  select * into l from public.outreach_leads where place_id = p_place_id for update;
  if not found then return jsonb_build_object('erro', 'lead não encontrado'); end if;
  if l.cadencia not in ('nao_iniciada', 'ativa') then
    return jsonb_build_object('ignorado', l.cadencia);
  end if;
  select * into cfg from public.outreach_config where id = 1;

  v_seq := coalesce(l.sequencia, '[]'::jsonb);
  v_n := greatest(jsonb_array_length(v_seq), 1);
  v_inicio := coalesce(l.cadencia_inicio, now());

  l.toque_atual := l.toque_atual + 1;
  if p_resultado = 'enviado' then
    l.ultimo_toque_em := now();
    l.ultimo_canal := coalesce(v_seq -> (l.toque_atual - 1) ->> 'canal', 'whatsapp');
  end if;

  loop
    if l.toque_atual >= v_n then
      update public.outreach_leads set
        cadencia = 'concluida', cadencia_inicio = v_inicio, toque_atual = l.toque_atual,
        ultimo_toque_em = l.ultimo_toque_em, ultimo_canal = l.ultimo_canal,
        proximo_toque_em = null, proximo_canal = null,
        retomar_em = (now() at time zone 'America/Sao_Paulo')::date + coalesce(cfg.retomar_dias, 60),
        updated_at = now()
      where place_id = p_place_id;
      return jsonb_build_object('concluida', true, 'pulados', v_pulados);
    end if;

    v_step := v_seq -> l.toque_atual;
    v_canal := coalesce(v_step ->> 'canal', 'whatsapp');
    if v_canal = 'email' and (
         l.email is null or l.email_status in ('optout', 'sem_email', 'erro', 'ignorado')
         or not coalesce(cfg.email_enabled, false)
         or coalesce(v_step ->> 'texto', '') = '') then
      l.toque_atual := l.toque_atual + 1;
      v_pulados := v_pulados + 1;
      continue;
    end if;
    exit;
  end loop;

  v_hora := case when v_step ->> 'periodo' = 'tarde' then time '14:00' else time '09:30' end;
  v_due := (((v_inicio at time zone 'America/Sao_Paulo')::date + coalesce((v_step ->> 'dia')::int, 0)) + v_hora)
             at time zone 'America/Sao_Paulo';
  -- Nunca dois toques em menos de 3 horas
  v_due := greatest(v_due, coalesce(l.ultimo_toque_em, now()) + interval '3 hours');

  update public.outreach_leads set
    cadencia = 'ativa', cadencia_inicio = v_inicio, toque_atual = l.toque_atual,
    ultimo_toque_em = l.ultimo_toque_em, ultimo_canal = l.ultimo_canal,
    proximo_toque_em = v_due, proximo_canal = v_canal, updated_at = now()
  where place_id = p_place_id;
  return jsonb_build_object('proximo', v_due, 'canal', v_canal, 'toque', l.toque_atual, 'pulados', v_pulados);
end $$;

-- ── Leads em "Retomar depois" cuja data chegou voltam para a aprovação (nova tentativa) ──
create or replace function public.outreach_reativar()
returns int language plpgsql security definer set search_path = public as $$
declare v int;
begin
  update public.outreach_leads set
    cadencia = 'nao_iniciada', toque_atual = 0, cadencia_inicio = null,
    proximo_toque_em = null, proximo_canal = null, retomar_em = null,
    sequencia = null, msg_rascunho = null, msg_status = 'sem', msg_aprovada_em = null,
    wa_status = 'pendente', tentativa = tentativa + 1, updated_at = now()
  where cadencia = 'concluida'
    and retomar_em <= (now() at time zone 'America/Sao_Paulo')::date
    and wa_status = 'enviado'
    and status_comercial not in ('respondeu', 'reuniao', 'proposta', 'ganho', 'perdido', 'descartado');
  get diagnostics v = row_count;
  return v;
end $$;

revoke all on function public.outreach_avancar_cadencia(text, text) from public, anon;
revoke all on function public.outreach_reativar() from public, anon;
grant execute on function public.outreach_avancar_cadencia(text, text) to service_role;
grant execute on function public.outreach_reativar() to service_role;

-- Rascunhos antigos (só a 1ª mensagem, sem a sequência) voltam para "sem mensagem" para a Ana
-- escrever a cadência inteira.
update public.outreach_leads
   set msg_status = 'sem', msg_rascunho = null, msg_aprovada_em = null
 where sequencia is null and msg_status in ('rascunho', 'aprovada') and wa_status = 'pendente';

-- Sem travessão nos textos padrão
update public.outreach_templates
   set body = regexp_replace(body, '\s*[—–]\s*', ', ', 'g'),
       subject = case when subject ~ '[—–]' then regexp_replace(subject, '\s*[—–]\s*', ', ', 'g') else subject end
 where body ~ '[—–]' or coalesce(subject, '') ~ '[—–]';
