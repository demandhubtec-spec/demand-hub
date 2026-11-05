-- Dos Crias · atividades técnicas pendentes vão para o Fabrício (dev)
-- Ficam com o Kelvin: aprovações do Samuel e alinhamentos com ele ("Definir com o Samuel...").
-- Atividades já concluídas não mudam. Pode rodar mais de uma vez.

update atividades a
set responsavel_id = (select id from perfis where nome ilike 'Fabr%' limit 1)
from projetos p
join clientes c on c.id = p.cliente_id
where a.projeto_id = p.id
  and c.nome = 'Dos Crias Tabacaria'
  and p.entrega_numero is not null
  and a.status <> 'concluido'
  and a.titulo not ilike 'Aprova%'
  and a.titulo not ilike 'Definir com o Samuel%'
  and exists (select 1 from perfis where nome ilike 'Fabr%');

-- Conferência
select pf.nome as responsavel, count(*) filter (where a.status <> 'concluido') as pendentes, count(*) as total
from atividades a
join projetos p on p.id = a.projeto_id
join clientes c on c.id = p.cliente_id and c.nome = 'Dos Crias Tabacaria'
left join perfis pf on pf.id = a.responsavel_id
where p.entrega_numero is not null
group by 1 order by 1;
