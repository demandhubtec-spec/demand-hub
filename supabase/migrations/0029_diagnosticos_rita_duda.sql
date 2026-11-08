-- Etapa 3 do Time Comercial IA: diagnósticos da Rita (Google, site, Instagram), relatório da Duda e
-- aprovação separada de cada etapa (Léo → Rita → Duda → mensagens e cadência). Só acrescenta.

alter table public.outreach_leads
  add column if not exists diagnosticos jsonb,
  add column if not exists marca jsonb,
  add column if not exists relatorio_token text unique,
  add column if not exists rita_status text check (rita_status in ('pendente', 'aprovado', 'ajuste')),
  add column if not exists rita_nota text,
  add column if not exists duda_status text check (duda_status in ('pendente', 'aprovado', 'ajuste')),
  add column if not exists duda_nota text;

create index if not exists outreach_leads_rita_status on public.outreach_leads (rita_status);
create index if not exists outreach_leads_duda_status on public.outreach_leads (duda_status);

-- Conversa do Kelvin com cada agente do Time Comercial IA (texto ou áudio transcrito)
create table if not exists public.time_conversas (
  id uuid primary key default gen_random_uuid(),
  agente text not null,
  autor text not null check (autor in ('kelvin', 'agente')),
  tipo text not null default 'texto' check (tipo in ('texto', 'audio')),
  conteudo text not null,
  estrutura jsonb,
  created_at timestamptz not null default now()
);
create index if not exists time_conversas_agente on public.time_conversas (agente, created_at desc);
alter table public.time_conversas enable row level security;
drop policy if exists time_conversas_dono on public.time_conversas;
create policy time_conversas_dono on public.time_conversas for all to authenticated
  using (meu_papel() = 'dono') with check (meu_papel() = 'dono');
