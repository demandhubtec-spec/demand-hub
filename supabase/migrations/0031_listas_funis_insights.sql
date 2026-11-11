-- Time Comercial IA · listas por origem, metas do funil, ligações, insights da Gabi e avisos (11/11/2026)
-- Só acrescenta; nada é apagado nem alterado nas tabelas que já existem.
--  1) comercial_lista_leads: leads das listas Instagram, LinkedIn e Ligações (o Google continua em outreach_leads).
--     Ficam fora da automação: nada é enviado sozinho para eles.
--  2) importar_lista_leads(): importa uma rodada e descarta repetidos (o lead fica na lista onde apareceu primeiro).
--  3) comercial_avisos: avisos para o Kelvin (repetidos descartados, etc.).
--  4) comercial_metas: metas do funil por canal e etapa, editáveis no portal.
--  5) comercial_analises e comercial_insights: autoanálise diária das conversas e as correções sugeridas.
--  6) agentes_manuais_versoes: cópia do manual antes de cada correção, para poder voltar.

-- 1) Leads das listas Instagram, LinkedIn e Ligações
create table if not exists public.comercial_lista_leads (
  id uuid primary key default gen_random_uuid(),
  lista text not null check (lista in ('instagram', 'linkedin', 'ligacoes')),
  rodada text,
  empresa text not null,
  perfil text,              -- @ do Instagram ou perfil do LinkedIn
  perfil_url text,
  nicho text,
  cidade text,
  whatsapp text,
  email text,
  nota text check (nota in ('Quente', 'Morno', 'Frio')),
  pontos int,
  fonte text,               -- concorrente de onde veio (ex.: @assessorialpha)
  comentario text,
  post_url text,
  canal text,               -- DM, WhatsApp, ligação
  etapa text not null default 'na_lista' check (etapa in
    ('na_lista', 'contato', 'atendida', 'conversa', 'qualificacao', 'reuniao', 'reuniao_realizada', 'proposta', 'ganho', 'perdido')),
  etapa_max int not null default 0,   -- etapa mais longe que o lead já chegou (para o funil contar quem virou perdido)
  valor numeric(12,2),
  tentativas int not null default 0,  -- ligações: quantas vezes tentou ligar
  observacoes text,
  externo_id text,                    -- id no sistema da empresa de ligações (webhook)
  payload jsonb,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create unique index if not exists comercial_lista_leads_externo on public.comercial_lista_leads (lista, externo_id) where externo_id is not null;
create index if not exists comercial_lista_leads_lista on public.comercial_lista_leads (lista, etapa);

alter table public.comercial_lista_leads enable row level security;
drop policy if exists comercial_lista_leads_dono on public.comercial_lista_leads;
create policy comercial_lista_leads_dono on public.comercial_lista_leads for all to authenticated
  using (meu_papel() = 'dono') with check (meu_papel() = 'dono');

-- Ordem das etapas, para guardar a mais longe que o lead já chegou
create or replace function public.comercial_etapa_ordem(e text) returns int language sql immutable as $$
  select case e
    when 'na_lista' then 0 when 'contato' then 1 when 'atendida' then 2 when 'conversa' then 3
    when 'qualificacao' then 4 when 'reuniao' then 5 when 'reuniao_realizada' then 6
    when 'proposta' then 7 when 'ganho' then 8 else -1 end
$$;

create or replace function public.comercial_lista_leads_touch() returns trigger language plpgsql as $$
begin
  new.atualizado_em := now();
  new.etapa_max := greatest(coalesce(new.etapa_max, 0), public.comercial_etapa_ordem(new.etapa));
  return new;
end $$;

drop trigger if exists comercial_lista_leads_touch on public.comercial_lista_leads;
create trigger comercial_lista_leads_touch before insert or update on public.comercial_lista_leads
  for each row execute function public.comercial_lista_leads_touch();

-- 3) Avisos para o Kelvin
create table if not exists public.comercial_avisos (
  id uuid primary key default gen_random_uuid(),
  tipo text not null,          -- repetido, sem_interesse, ligacoes, insight
  lista text,
  rodada text,
  texto text not null,
  detalhes jsonb not null default '[]'::jsonb,
  lido boolean not null default false,
  criado_em timestamptz not null default now()
);
alter table public.comercial_avisos enable row level security;
drop policy if exists comercial_avisos_dono on public.comercial_avisos;
create policy comercial_avisos_dono on public.comercial_avisos for all to authenticated
  using (meu_papel() = 'dono') with check (meu_papel() = 'dono');

-- 2) Importa uma rodada. Repetido (mesmo WhatsApp ou mesmo perfil) fica onde apareceu primeiro e gera aviso.
create or replace function public.importar_lista_leads(p_lista text, p_rodada text, p_leads jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  r jsonb;
  fim text;
  perfil_n text;
  onde text;
  entraram int := 0;
  repetidos jsonb := '[]'::jsonb;
  fora int := 0;
begin
  if meu_papel() is distinct from 'dono' then
    raise exception 'só o dono importa listas';
  end if;
  for r in select * from jsonb_array_elements(p_leads) loop
    if coalesce(r->>'etapa', '') = 'sem_interesse' or lower(coalesce(r->>'observacoes', '')) like 'sem interesse%' then
      fora := fora + 1;
      continue;
    end if;
    fim := right(regexp_replace(coalesce(r->>'whatsapp', ''), '\D', '', 'g'), 8);
    perfil_n := lower(trim(both '@' from coalesce(r->>'perfil', '')));
    onde := null;
    if length(fim) = 8 then
      select 'Google Meu Negócio' into onde from outreach_leads where right(regexp_replace(coalesce(whatsapp, ''), '\D', '', 'g'), 8) = fim limit 1;
      if onde is null then
        select case lista when 'instagram' then 'Instagram' when 'linkedin' then 'LinkedIn' else 'Ligações' end || coalesce(' · ' || rodada, '')
          into onde from comercial_lista_leads where right(regexp_replace(coalesce(whatsapp, ''), '\D', '', 'g'), 8) = fim limit 1;
      end if;
      if onde is null then
        select 'Inbound' into onde from sdr_leads where right(phone, 8) = fim limit 1;
      end if;
    end if;
    if onde is null and perfil_n <> '' then
      select case lista when 'instagram' then 'Instagram' when 'linkedin' then 'LinkedIn' else 'Ligações' end || coalesce(' · ' || rodada, '')
        into onde from comercial_lista_leads where lower(trim(both '@' from coalesce(perfil, ''))) = perfil_n and lista = p_lista limit 1;
    end if;
    if onde is not null then
      repetidos := repetidos || jsonb_build_object('empresa', r->>'empresa', 'perfil', r->>'perfil', 'ficou_em', onde);
      continue;
    end if;
    insert into comercial_lista_leads (lista, rodada, empresa, perfil, perfil_url, nicho, cidade, whatsapp, email, nota, pontos,
      fonte, comentario, post_url, canal, observacoes)
    values (p_lista, p_rodada, coalesce(nullif(r->>'empresa', ''), r->>'perfil', 'Sem nome'), nullif(r->>'perfil', ''), nullif(r->>'perfil_url', ''),
      nullif(r->>'nicho', ''), nullif(r->>'cidade', ''), nullif(r->>'whatsapp', ''), nullif(r->>'email', ''),
      case when r->>'nota' in ('Quente', 'Morno', 'Frio') then r->>'nota' end, nullif(r->>'pontos', '')::int,
      nullif(r->>'fonte', ''), nullif(r->>'comentario', ''), nullif(r->>'post_url', ''), nullif(r->>'canal', ''), nullif(r->>'observacoes', ''));
    entraram := entraram + 1;
  end loop;
  if jsonb_array_length(repetidos) > 0 then
    insert into comercial_avisos (tipo, lista, rodada, texto, detalhes)
    values ('repetido', p_lista, p_rodada,
      jsonb_array_length(repetidos) || case when jsonb_array_length(repetidos) = 1 then ' lead repetido descartado' else ' leads repetidos descartados' end
        || ' na rodada ' || coalesce(p_rodada, '') || '. Ficaram na lista onde apareceram primeiro.',
      repetidos);
  end if;
  if fora > 0 then
    insert into comercial_avisos (tipo, lista, rodada, texto)
    values ('sem_interesse', p_lista, p_rodada, fora || ' leads marcados como sem interesse ficaram fora da importação.');
  end if;
  return jsonb_build_object('entraram', entraram, 'repetidos', repetidos, 'sem_interesse', fora);
end $$;

grant execute on function public.importar_lista_leads(text, text, jsonb) to authenticated;

-- 4) Metas do funil (por canal e por etapa: % que deve passar da etapa anterior para esta)
create table if not exists public.comercial_metas (
  id text primary key default 'principal',
  dados jsonb not null default '{}'::jsonb,
  atualizado_em timestamptz not null default now()
);
alter table public.comercial_metas enable row level security;
drop policy if exists comercial_metas_dono on public.comercial_metas;
create policy comercial_metas_dono on public.comercial_metas for all to authenticated
  using (meu_papel() = 'dono') with check (meu_papel() = 'dono');

insert into public.comercial_metas (id, dados) values ('principal', $j${
  "vendas_mes": 8,
  "reunioes_semana": 12,
  "faltas_max": 25,
  "topo_venda": 1.0,
  "etapas": {
    "google":    {"contato": 100, "conversa": 35, "qualificacao": 45, "reuniao": 50, "reuniao_realizada": 75, "proposta": 60, "ganho": 40},
    "instagram": {"contato": 100, "conversa": 35, "qualificacao": 45, "reuniao": 50, "reuniao_realizada": 75, "proposta": 60, "ganho": 40},
    "linkedin":  {"contato": 100, "conversa": 35, "qualificacao": 45, "reuniao": 50, "reuniao_realizada": 75, "proposta": 60, "ganho": 40},
    "ligacoes":  {"contato": 100, "atendida": 40, "conversa": 60, "qualificacao": 40, "reuniao": 50, "reuniao_realizada": 75, "proposta": 60, "ganho": 40},
    "inbound":   {"conversa": 80, "qualificacao": 50, "reuniao": 50, "reuniao_realizada": 75, "proposta": 60, "ganho": 40}
  },
  "fases": {"abordagem": 35, "conexao": 70, "qualificacao": 45, "agendamento": 50}
}$j$::jsonb)
on conflict (id) do nothing;

-- 5) Autoanálise das conversas
create table if not exists public.comercial_analises (
  id uuid primary key default gen_random_uuid(),
  conversas int not null default 0,
  fases jsonb not null default '{}'::jsonb,   -- {abordagem:{valor,base}, conexao:..., qualificacao:..., agendamento:...}
  pedido_em timestamptz,                      -- "Analisar agora" no portal
  criado_em timestamptz not null default now()
);
alter table public.comercial_analises enable row level security;
drop policy if exists comercial_analises_dono on public.comercial_analises;
create policy comercial_analises_dono on public.comercial_analises for all to authenticated
  using (meu_papel() = 'dono') with check (meu_papel() = 'dono');

create table if not exists public.comercial_insights (
  id uuid primary key default gen_random_uuid(),
  analise_id uuid references public.comercial_analises(id) on delete set null,
  fase text not null check (fase in ('abordagem', 'conexao', 'qualificacao', 'agendamento')),
  gravidade text not null default 'atencao' check (gravidade in ('gargalo', 'atencao')),
  canais text[] not null default '{}',
  agente text not null default 'gabi' check (agente in ('gabi', 'marina')),
  titulo text not null,
  causa text not null,
  trecho jsonb not null default '[]'::jsonb,  -- [{de: 'lead' | 'ia' | 'nota', texto}]
  remover text,
  incluir text[] not null default '{}',
  esperado text,
  conversas int not null default 0,
  status text not null default 'pendente' check (status in ('pendente', 'aplicado', 'recusado')),
  versao_id uuid,
  metrica_antes numeric,
  metrica_depois numeric,
  criado_em timestamptz not null default now(),
  decidido_em timestamptz
);
create index if not exists comercial_insights_status on public.comercial_insights (status, criado_em desc);
alter table public.comercial_insights enable row level security;
drop policy if exists comercial_insights_dono on public.comercial_insights;
create policy comercial_insights_dono on public.comercial_insights for all to authenticated
  using (meu_papel() = 'dono') with check (meu_papel() = 'dono');

-- 6) Versões dos manuais (antes de cada correção aprovada)
create table if not exists public.agentes_manuais_versoes (
  id uuid primary key default gen_random_uuid(),
  agente text not null,
  secoes jsonb not null,
  motivo text,
  criado_em timestamptz not null default now()
);
alter table public.agentes_manuais_versoes enable row level security;
drop policy if exists agentes_manuais_versoes_dono on public.agentes_manuais_versoes;
create policy agentes_manuais_versoes_dono on public.agentes_manuais_versoes for all to authenticated
  using (meu_papel() = 'dono') with check (meu_papel() = 'dono');

-- Relógio da autoanálise: todo dia às 6h de Brasília (9h UTC), com a mesma autenticação dos outros jobs
do $$
begin
  if exists (select 1 from cron.job where jobname = 'outreach-email-tick') and not exists (select 1 from cron.job where jobname = 'comercial-insights') then
    perform cron.schedule(
      'comercial-insights',
      '0 9 * * *',
      replace((select command from cron.job where jobname = 'outreach-email-tick'), '/api/prospeccao/email-tick', '/api/cron/insights')
    );
  end if;
end $$;
