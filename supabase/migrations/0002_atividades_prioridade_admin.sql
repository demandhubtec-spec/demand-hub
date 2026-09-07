-- Demand Hub — adiciona descrição/prioridade em atividades e libera o
-- departamento "administrativo" para projetos e atividades.
-- Rode com: npx supabase db push  (ou cole no SQL editor do painel Supabase)

alter table atividades add column if not exists descricao text;

alter table atividades
  add column if not exists prioridade text not null default 'media'
    check (prioridade in ('baixa', 'media', 'alta', 'urgente'));

-- Amplia os departamentos aceitos (antes só tecnologia/marketing/comercial).
alter table atividades drop constraint if exists atividades_departamento_check;
alter table atividades
  add constraint atividades_departamento_check
  check (departamento in ('tecnologia', 'marketing', 'comercial', 'administrativo'));

alter table projetos drop constraint if exists projetos_departamento_check;
alter table projetos
  add constraint projetos_departamento_check
  check (departamento in ('tecnologia', 'marketing', 'comercial', 'administrativo'));
