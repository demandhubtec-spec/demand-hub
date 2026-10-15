-- Demand Hub — guarda quando cada atividade foi criada, pra lista do projeto
-- aparecer na ordem em que as etapas foram cadastradas (igual ao protótipo).
-- Rode com: npx supabase db push  (ou cole no SQL editor do painel Supabase)

alter table atividades add column if not exists criado_em timestamptz;

-- Atividades antigas: preserva a ordem física de inserção.
with ordem as (
  select id, row_number() over (order by ctid) as n
  from atividades
  where criado_em is null
)
update atividades a
set criado_em = timestamptz '2026-09-01 00:00:00-03' + (ordem.n * interval '1 second')
from ordem
where a.id = ordem.id;

-- Entrega 08 (Dos Crias): ordem exata das etapas do protótipo.
update atividades a
set criado_em = timestamptz '2026-10-14 12:00:00-03' + (v.ordem * interval '1 second')
from (values
  (1, 'Mapear o fluxo atual de envio de fotos no grupo'),
  (2, 'Conectar o número/grupo de WhatsApp à automação'),
  (3, 'Extrair os dados do produto a partir da foto e do texto'),
  (4, 'Cadastrar o produto automaticamente no sistema'),
  (5, 'Criar etapa de revisão antes da publicação'),
  (6, 'Testar com casos reais do grupo')
) as v(ordem, titulo)
where a.titulo = v.titulo;

alter table atividades alter column criado_em set default now();
alter table atividades alter column criado_em set not null;
