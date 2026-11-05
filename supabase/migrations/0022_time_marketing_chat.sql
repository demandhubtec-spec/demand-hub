-- Time de Marketing IA (ex-Estúdio): chat do Kelvin com o time todo e com cada agente.
-- As mensagens do Kelvin viram orientação para o Pauteiro e o Redator (ia-sdr/src/lib/estudio/ia.ts).
create table if not exists public.estudio_mensagens (
  id bigint generated always as identity primary key,
  autor text not null,              -- 'kelvin' ou o id do agente (vera, rita, teo, bia, duda, rui, lara, nina)
  para text not null default 'time', -- 'time' (grupo) ou o id do agente (conversa individual)
  texto text not null check (length(texto) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index if not exists estudio_mensagens_para_em on public.estudio_mensagens (para, created_at desc);

alter table public.estudio_mensagens enable row level security;
drop policy if exists estudio_mensagens_dono on public.estudio_mensagens;
create policy estudio_mensagens_dono on public.estudio_mensagens
  for all using (public.meu_papel() = 'dono') with check (public.meu_papel() = 'dono');
