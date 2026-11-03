-- 0018 · Gatilhos do Instagram
-- Cada gatilho liga palavra-chave + post (ou qualquer post recente) a:
--   1) uma resposta pública no comentário (sorteada entre as variações) e
--   2) uma mensagem no Direct, com botão opcional (página do diagnóstico, WhatsApp da Ana ou link próprio).
-- Quem monta é o gestor, no portal (Marketing > Instagram Direct > Gatilhos).
-- O robô (função bright-respondig-boter) lê os gatilhos ativos; sem esta tabela ele segue só com o DIAGNÓSTICO antigo.
--
-- Para desfazer: drop function public.ig_gatilho_contar(uuid, boolean); drop table public.ig_gatilhos;

create table if not exists public.ig_gatilhos (
  id                 uuid primary key default gen_random_uuid(),
  nome               text not null check (length(trim(nome)) between 1 and 80),
  ativo              boolean not null default true,
  -- link = resposta + 1 mensagem no Direct; diagnostico = o fluxo antigo do DIAGNÓSTICO, com estes textos
  tipo               text not null default 'link' check (tipo in ('link', 'diagnostico')),
  palavras           text[] not null check (cardinality(palavras) between 1 and 5),
  -- ids dos posts; vazio = vale para os 10 posts mais recentes
  midias             text[] not null default '{}',
  -- só para mostrar no portal: [{id, link, imagem, legenda}]
  midias_info        jsonb not null default '[]'::jsonb,
  respostas_publicas text[] not null default '{}' check (cardinality(respostas_publicas) <= 5),
  mensagem           text not null default '' check (length(mensagem) <= 900),
  botao_tipo         text not null default 'nenhum' check (botao_tipo in ('nenhum', 'diagnostico', 'whatsapp', 'link')),
  botao_texto        text not null default '' check (length(botao_texto) <= 20),
  botao_url          text check (botao_url is null or botao_url ~* '^https?://'),
  whatsapp_texto     text check (whatsapp_texto is null or length(whatsapp_texto) <= 300),
  comentarios        integer not null default 0,
  envios             integer not null default 0,
  ultimo_em          timestamptz,
  criado_em          timestamptz not null default now(),
  atualizado_em      timestamptz not null default now(),
  criado_por         uuid default auth.uid()
);

create index if not exists ig_gatilhos_ativos_idx on public.ig_gatilhos (ativo, criado_em);

create or replace function public.ig_gatilhos_tocar()
returns trigger language plpgsql set search_path = public as $$
begin
  new.atualizado_em := now();
  return new;
end $$;

drop trigger if exists ig_gatilhos_tocar on public.ig_gatilhos;
create trigger ig_gatilhos_tocar before update on public.ig_gatilhos
  for each row execute function public.ig_gatilhos_tocar();

-- Acesso: só gestor logado (colaborador não vê). O robô usa a chave de serviço.
alter table public.ig_gatilhos enable row level security;

drop policy if exists ig_gatilhos_gestor on public.ig_gatilhos;
create policy ig_gatilhos_gestor on public.ig_gatilhos
  for all to authenticated
  using (not public.sou_colaborador())
  with check (not public.sou_colaborador());

revoke all on public.ig_gatilhos from anon;

-- Contador usado pelo robô (comentário recebido e Direct enviado), sem corrida entre execuções.
create or replace function public.ig_gatilho_contar(p_id uuid, p_enviou boolean)
returns void language sql security definer set search_path = public as $$
  update ig_gatilhos
     set comentarios = comentarios + 1,
         envios      = envios + case when p_enviou then 1 else 0 end,
         ultimo_em   = now()
   where id = p_id;
$$;
revoke execute on function public.ig_gatilho_contar(uuid, boolean) from public, anon, authenticated;

-- Primeiro gatilho: o DIAGNÓSTICO que já roda hoje, com os mesmos textos, post e link.
insert into public.ig_gatilhos (nome, tipo, palavras, midias, respostas_publicas, mensagem, botao_tipo, botao_texto, botao_url)
select
  'Diagnóstico gratuito',
  'diagnostico',
  array['diagnostico'],
  coalesce((select string_to_array(nullif(valor, ''), ',') from public.ig_config where chave = 'media_ids'), '{}'),
  array['Te mandei no direct 📩', 'Acabei de te chamar no direct!', 'Olha seu direct 👀'],
  'Oi, {nome}! Aqui é da DemandIA 👋 Seu diagnóstico gratuito começa por aqui. Leva uns 3 minutos e o resultado chega no seu WhatsApp em até 24h úteis.',
  'link',
  'Fazer diagnóstico',
  'https://demandhub.com.br/diagnostico?utm_source=instagram&utm_medium=pago&utm_campaign=03-ENGAJAMENTO-PERFIL-IG-DIAGNOSTICO&utm_term=01-ADVANTAGE-ABERTO&utm_content=01-CARROSSEL-DOR-DOMINGO'
where not exists (select 1 from public.ig_gatilhos where tipo = 'diagnostico');
