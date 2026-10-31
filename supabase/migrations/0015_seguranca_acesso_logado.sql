-- 0015 · Segurança: só quem está logado acessa os dados do portal
--
-- Achado em 31/10/2026: as regras de acesso valiam para "public" (inclui visitante
-- sem login) e sou_colaborador() devolvia false para quem não tem perfil. Resultado:
-- com a chave pública do site, um visitante lia e alterava clientes não privados,
-- contratos, finanças, projetos, escopo, atividades, mensagens e anexos.
--
-- O que muda (nenhum dado é apagado ou alterado):
--   1. Quem não tem perfil passa a ser tratado como colaborador (acesso mais restrito).
--   2. As regras dessas tabelas e do bucket "anexos" passam a valer só para logados.
-- Dono e colaborador continuam vendo o mesmo. Ana, prospecção e edge functions usam
-- a chave de serviço e não são afetadas.
--
-- Para desfazer: trocar "true" por "false" no passo 1 e "authenticated" por "public"
-- no passo 2, e rodar de novo.

begin;

-- 1. Sem perfil = acesso mais restrito
create or replace function public.sou_colaborador()
returns boolean language sql stable security definer set search_path = public
as $$
  select coalesce((select papel = 'colaborador' from perfis where id = auth.uid()), true);
$$;

-- 2. Regras só para usuários logados
do $$
declare r record;
begin
  for r in select * from (values
    ('perfis_select','public.perfis'),
    ('perfis_update_self','public.perfis'),
    ('clientes_select','public.clientes'),
    ('clientes_insert','public.clientes'),
    ('clientes_update','public.clientes'),
    ('clientes_delete','public.clientes'),
    ('contratos_select','public.contratos'),
    ('contratos_write','public.contratos'),
    ('financeiro_select','public.financeiro_lancamentos'),
    ('financeiro_write','public.financeiro_lancamentos'),
    ('projetos_select','public.projetos'),
    ('projetos_write','public.projetos'),
    ('atividades_select','public.atividades'),
    ('atividades_write','public.atividades'),
    ('escopo_select','public.escopo_entregas'),
    ('escopo_write','public.escopo_entregas'),
    ('mensagens_select','public.mensagens'),
    ('mensagens_insert','public.mensagens'),
    ('anexos_select','public.anexos'),
    ('anexos_insert','public.anexos'),
    ('anexos_delete','public.anexos'),
    ('anexos_storage_select','storage.objects'),
    ('anexos_storage_insert','storage.objects'),
    ('anexos_storage_delete','storage.objects')
  ) as t(pol, tab)
  loop
    execute format('alter policy %I on %s to authenticated', r.pol, r.tab);
  end loop;
end $$;

commit;
