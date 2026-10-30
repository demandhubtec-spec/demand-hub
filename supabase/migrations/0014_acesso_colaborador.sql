-- Acesso do colaborador (Fabrício): só Tecnologia e Marketing. Nada do Comercial nem do Administrativo,
-- inclusive projetos e atividades desses departamentos. Para o dono, nada muda.
create or replace function public.dept_liberado(d text) returns boolean
language sql stable security definer set search_path = public as $$
  select not public.sou_colaborador() or coalesce(d, '') in ('tecnologia', 'marketing', '');
$$;

-- Cliente visível (sem depender da leitura da tabela de clientes, que o colaborador não tem)
create or replace function public.cliente_visivel(c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select c is null or exists (select 1 from clientes where id = c and (not privado or public.tenho_acesso_privado()));
$$;

create or replace function public.projeto_visivel(p_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from projetos p
    where p.id = p_id and public.cliente_visivel(p.cliente_id) and public.dept_liberado(p.departamento)
  );
$$;

drop policy if exists projetos_select on public.projetos;
create policy projetos_select on public.projetos for select
  using (public.cliente_visivel(cliente_id) and public.dept_liberado(departamento));

drop policy if exists atividades_select on public.atividades;
create policy atividades_select on public.atividades for select
  using (public.dept_liberado(departamento) and (projeto_id is null or public.projeto_visivel(projeto_id)));

drop policy if exists atividades_write on public.atividades;
create policy atividades_write on public.atividades for all
  using (public.dept_liberado(departamento)) with check (public.dept_liberado(departamento));

-- Usuário novo criado no Supabase (Authentication > Add user) entra automaticamente como colaborador.
-- Para virar dono é preciso mudar o papel na tabela perfis.
create or replace function public.perfil_do_novo_usuario() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.perfis (id, nome, papel)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'nome', ''), initcap(split_part(new.email, '@', 1))),
    'colaborador'
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists perfil_do_novo_usuario on auth.users;
create trigger perfil_do_novo_usuario after insert on auth.users
  for each row execute function public.perfil_do_novo_usuario();
