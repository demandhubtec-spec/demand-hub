-- Canal "Você e a Ana": a Ana pede orientação sobre um lead e o Kelvin orienta (portal ou WhatsApp).
-- As orientações ficam guardadas para a Ana seguir nas próximas conversas.
create table if not exists public.ana_canal (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references public.sdr_leads(id) on delete set null,
  autor text not null check (autor in ('kelvin', 'ana')),
  tipo text not null default 'texto' check (tipo in ('texto', 'audio', 'imagem')),
  conteudo text not null,
  origem text not null default 'portal' check (origem in ('portal', 'whatsapp', 'sistema')),
  status text check (status in ('pendente', 'respondido')),
  lembrado_em timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists ana_canal_created_idx on public.ana_canal (created_at desc);
create index if not exists ana_canal_pendente_idx on public.ana_canal (status, created_at) where status = 'pendente';

create table if not exists public.ana_orientacoes (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references public.sdr_leads(id) on delete cascade,
  texto text not null,
  ativa boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.ana_canal enable row level security;
alter table public.ana_orientacoes enable row level security;

drop policy if exists ana_canal_dono on public.ana_canal;
create policy ana_canal_dono on public.ana_canal for all to authenticated
  using (meu_papel() = 'dono') with check (meu_papel() = 'dono');
drop policy if exists ana_orientacoes_dono on public.ana_orientacoes;
create policy ana_orientacoes_dono on public.ana_orientacoes for all to authenticated
  using (meu_papel() = 'dono') with check (meu_papel() = 'dono');

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'ana_canal') then
    alter publication supabase_realtime add table public.ana_canal;
  end if;
end $$;
