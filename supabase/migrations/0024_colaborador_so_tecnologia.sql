-- 0024 · Colaborador (Fabrício) fica só com Tecnologia
--
-- Antes: Tecnologia e Marketing. Agora: só Tecnologia (projetos e atividades).
-- Comercial, Marketing, Administrativo e Configurações seguem bloqueados.
-- Para o dono nada muda. Nenhum dado é apagado.
--
-- Para desfazer: trocar ('tecnologia', '') por ('tecnologia', 'marketing', '') e rodar de novo.

create or replace function public.dept_liberado(d text) returns boolean
language sql stable security definer set search_path = public as $$
  select not public.sou_colaborador() or coalesce(d, '') in ('tecnologia', '');
$$;
