-- 0019 · Estúdio (social media no automático)
-- Agentes da IA (servidor da Ana) pesquisam, montam o calendário, escrevem, fazem a arte e publicam no
-- Instagram. O Kelvin aprova a copy e a arte no portal (Marketing > Estúdio). Só o perfil dono acessa.
--
-- Para desfazer: drop table public.estudio_metricas, public.estudio_publicacoes, public.estudio_pecas,
--   public.estudio_pautas, public.estudio_referencias, public.estudio_fontes, public.estudio_config;

create table if not exists public.estudio_config (
  id            int primary key default 1 check (id = 1),
  ativo         boolean not null default true,
  agentes       jsonb not null default '{"radar":true,"pauteiro":true,"redator":true,"diretor":true,"publicador":true}'::jsonb,
  -- horário de cada post: alterna entre eles, um por dia
  horarios      text[] not null default array['12:00','19:30'],
  dias_a_frente int not null default 14 check (dias_a_frente between 3 and 45),
  pilares       jsonb not null default '[
    {"nome":"Dor do dono","descricao":"o que trava o faturamento: paciente que some, recepção que não responde, agenda vazia"},
    {"nome":"Demonstração","descricao":"a IA atendendo de verdade: prints, antes e depois, passo a passo"},
    {"nome":"Bastidor e método","descricao":"como a DemandIA faz, números do processo, o que aprendemos"},
    {"nome":"Oferta","descricao":"diagnóstico gratuito, demo ao vivo, convite com palavra-chave"}
  ]'::jsonb,
  -- formatos da semana (7 posts): quantos de cada
  mix           jsonb not null default '{"carrossel":3,"estatico":2,"reels":2}'::jsonb,
  ultimo_radar  date,
  atualizado_em timestamptz not null default now()
);
insert into public.estudio_config (id) values (1) on conflict do nothing;

create table if not exists public.estudio_fontes (
  id           uuid primary key default gen_random_uuid(),
  tipo         text not null default 'conta' check (tipo in ('conta', 'hashtag')),
  valor        text not null check (length(trim(valor)) between 1 and 80),
  nome         text,
  seguidores   int,
  posts        int,
  verificado_em timestamptz,
  erro         text,
  ativo        boolean not null default true,
  criado_em    timestamptz not null default now(),
  unique (tipo, valor)
);

create table if not exists public.estudio_referencias (
  id           uuid primary key default gen_random_uuid(),
  fonte_id     uuid references public.estudio_fontes(id) on delete cascade,
  ig_media_id  text not null unique,
  conta        text,
  link         text,
  formato      text,
  legenda      text,
  curtidas     int,
  comentarios  int,
  views        int,
  seguidores   int,
  publicado_em timestamptz,
  nota         numeric,
  motivo       text,
  usada        boolean not null default false,
  coletado_em  timestamptz not null default now()
);
create index if not exists estudio_referencias_nota_idx on public.estudio_referencias (publicado_em desc, nota desc);

create table if not exists public.estudio_pautas (
  id             uuid primary key default gen_random_uuid(),
  dia            date not null,
  horario        text not null default '12:00',
  formato        text not null check (formato in ('estatico', 'carrossel', 'reels')),
  pilar          text,
  tema           text not null,
  gancho         text,
  referencias    uuid[] not null default '{}',
  palavra_gatilho text,
  -- pauta → revisar_copy → copy_aprovada → revisar_arte → agendado → publicado
  -- reels: copy_aprovada → aguardando_video → revisar_arte → agendado
  status         text not null default 'pauta' check (status in ('pauta', 'revisar_copy', 'copy_aprovada',
                   'aguardando_video', 'revisar_arte', 'agendado', 'publicando', 'publicado', 'erro', 'descartado')),
  comentario     text,
  erro           text,
  tentativas     int not null default 0,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now()
);
create index if not exists estudio_pautas_dia_idx on public.estudio_pautas (dia, status);

create table if not exists public.estudio_pecas (
  id         uuid primary key default gen_random_uuid(),
  pauta_id   uuid not null references public.estudio_pautas(id) on delete cascade,
  tipo       text not null check (tipo in ('copy', 'arte')),
  versao     int not null default 1,
  conteudo   jsonb not null default '{}'::jsonb,
  arquivos   text[] not null default '{}',
  comentario text,
  criado_em  timestamptz not null default now()
);
create index if not exists estudio_pecas_pauta_idx on public.estudio_pecas (pauta_id, tipo, versao desc);

create table if not exists public.estudio_publicacoes (
  id           uuid primary key default gen_random_uuid(),
  pauta_id     uuid not null references public.estudio_pautas(id) on delete cascade,
  ig_media_id  text,
  link         text,
  publicado_em timestamptz,
  gatilho_id   uuid,
  erro         text,
  criado_em    timestamptz not null default now()
);

create table if not exists public.estudio_metricas (
  id              uuid primary key default gen_random_uuid(),
  publicacao_id   uuid not null references public.estudio_publicacoes(id) on delete cascade,
  dia             date not null default current_date,
  alcance         int,
  salvamentos     int,
  comentarios     int,
  compartilhamentos int,
  curtidas        int,
  unique (publicacao_id, dia)
);

create or replace function public.estudio_tocar()
returns trigger language plpgsql set search_path = public as $$
begin
  new.atualizado_em := now();
  return new;
end $$;
drop trigger if exists estudio_pautas_tocar on public.estudio_pautas;
create trigger estudio_pautas_tocar before update on public.estudio_pautas
  for each row execute function public.estudio_tocar();
drop trigger if exists estudio_config_tocar on public.estudio_config;
create trigger estudio_config_tocar before update on public.estudio_config
  for each row execute function public.estudio_tocar();

-- Acesso: só o perfil dono (mesma regra do CRM). Os agentes usam a chave de serviço.
do $$
declare t text;
begin
  foreach t in array array['estudio_config','estudio_fontes','estudio_referencias','estudio_pautas',
                           'estudio_pecas','estudio_publicacoes','estudio_metricas'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_dono', t);
    execute format('create policy %I on public.%I for all to authenticated using (public.meu_papel() = ''dono'') with check (public.meu_papel() = ''dono'')', t || '_dono', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;

-- Artes e vídeos: bucket público (a Meta busca a imagem por link). Só o dono sobe arquivos pelo portal.
insert into storage.buckets (id, name, public) values ('estudio', 'estudio', true)
on conflict (id) do update set public = true;

drop policy if exists "estudio_storage_dono" on storage.objects;
create policy "estudio_storage_dono" on storage.objects for all to authenticated
  using (bucket_id = 'estudio' and public.meu_papel() = 'dono')
  with check (bucket_id = 'estudio' and public.meu_papel() = 'dono');

-- Perfis iniciais do Radar (o @ é conferido na Meta pela tela de Configurações ou pelo Radar)
insert into public.estudio_fontes (tipo, valor) values
  ('conta', 'assessoriaalpha'), ('conta', 'v4company'), ('conta', 'viverdeia'), ('conta', 'g4educacao'),
  ('conta', 'rafaelmilagre'), ('conta', 'denerlippert'), ('conta', 'athosvilarins'), ('conta', 'tallisgomes'),
  ('conta', 'clinisales'), ('conta', 'esteticamaisclientes')
on conflict do nothing;
