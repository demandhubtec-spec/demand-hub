-- 25/11: listas de ligação montadas no banco, servidas por /api/export/ligacoes?k=... para subir no Callface
create table if not exists export_ligacoes (
  k text primary key,
  nome text,
  conteudo text not null,
  criado_em timestamptz not null default now()
);
alter table export_ligacoes enable row level security;
