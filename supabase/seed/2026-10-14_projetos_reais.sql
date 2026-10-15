-- Demand Hub — dados reais do protótipo v3 (aba Projetos)
-- Pode rodar mais de uma vez: só insere o que ainda não existe.
-- Requer as migrations 0003 e 0004.

-- 1) Clientes que faltavam (negócios do Kelvin, acesso restrito)
insert into clientes (nome, segmento, status, privado)
select 'Sentiari Music', 'Música / Entretenimento', 'ativo', true
where not exists (select 1 from clientes where nome = 'Sentiari Music');

insert into clientes (nome, segmento, status, privado)
select 'K19 Barbearia', 'Beleza / Estética', 'ativo', true
where not exists (select 1 from clientes where nome = 'K19 Barbearia');

-- Segmentos como no protótipo
update clientes set segmento = 'Logística / E-commerce' where nome = 'Tonabê';
update clientes set segmento = 'Varejo / Tabacaria' where nome in ('FNX Tabacaria', 'Dos Crias Tabacaria');

-- 2) Dos Crias — contrato de implementação mensal + 13 entregas do escopo
update clientes
set contrato_resumo = 'Contrato de Implementação Mensal — assinado 10/10/2026',
    mensalidade = 'R$ 2.800,00/mês'
where nome = 'Dos Crias Tabacaria';

insert into escopo_entregas (cliente_id, numero, nome, resumo)
select c.id, e.numero, e.nome, e.resumo
from clientes c
cross join (values
  (1, 'Integração Tray e Olist', 'Sincronização de pedidos e atualização entre os sistemas.'),
  (2, 'Conciliação de pagamentos', 'Conferência automática dos pagamentos da Tray e Olist.'),
  (3, 'Régua de cobrança automática', 'Lembretes e cobranças sem depender de envio manual.'),
  (4, 'Relatório diário no WhatsApp', 'Resumo operacional para acompanhar o dia.'),
  (5, 'Rastreio automático do pedido', 'Atualização do cliente sobre andamento e rastreio.'),
  (6, 'Declaração dos Correios em PDF', 'Geração da declaração a partir do pedido.'),
  (7, 'Avisos de processo para a equipe', 'Notificações automáticas conforme cada etapa.'),
  (8, 'Cadastro de produtos', 'Cadastro por foto / WhatsApp — a partir de foto e dados enviados no grupo.'),
  (9, 'Portal com dashboard', 'Visão centralizada de vendas, compras, estoque e operação.'),
  (10, 'Portal responsivo no celular', 'Acesso e acompanhamento também pelo smartphone.'),
  (11, 'Painel de giro + IA de estoque', 'Giro, quantidade, itens parados e apoio à decisão de estoque.'),
  (12, 'Financeiro: contas, taxas e comissão', 'Informações financeiras organizadas para apoiar o DRE.'),
  (13, 'Disparo e follow-up no portal', 'CRM de WhatsApp integrado ao portal para acompanhar a base.')
) as e(numero, nome, resumo)
where c.nome = 'Dos Crias Tabacaria'
on conflict (cliente_id, numero) do nothing;

insert into contratos (cliente_id, tipo, inicio, renovacao, status)
select c.id, 'Implementação mensal (13 entregas)', '2026-10-10', '10/11 (mensal)', 'ativo'
from clientes c
where c.nome = 'Dos Crias Tabacaria'
  and not exists (
    select 1 from contratos ct where ct.cliente_id = c.id and ct.tipo = 'Implementação mensal (13 entregas)'
  );

-- 3) Dos Crias — Entrega 08: Cadastro de produtos (projeto em andamento)
insert into projetos (cliente_id, nome, subtitulo, entrega_numero, departamento, status, prioridade, progresso, briefing, prazo_inicio)
select c.id,
       'Cadastro de produtos',
       'Cadastro por foto / WhatsApp',
       8,
       'tecnologia',
       'andamento',
       'alta',
       0,
       'Cadastro automático de produto a partir da foto e dos dados enviados no grupo de WhatsApp da operação — elimina a digitação manual do cadastro. Entrega 08 do escopo mensal (Cláusula 2 do contrato assinado em 10/10/2026).',
       '2026-10-14'
from clientes c
where c.nome = 'Dos Crias Tabacaria'
  and not exists (select 1 from projetos p where p.cliente_id = c.id and p.entrega_numero = 8);

insert into atividades (projeto_id, titulo, descricao, departamento, status, prioridade)
select p.id, a.titulo, a.descricao, 'tecnologia', 'a-fazer', 'media'
from projetos p
join clientes c on c.id = p.cliente_id and c.nome = 'Dos Crias Tabacaria'
cross join (values
  (1, 'Mapear o fluxo atual de envio de fotos no grupo', 'Levantar como e quando a equipe manda foto + dados do produto no grupo de WhatsApp hoje, pra desenhar a automação em cima do fluxo real.'),
  (2, 'Conectar o número/grupo de WhatsApp à automação', 'Configurar a captura automática da foto e do texto enviados junto no grupo.'),
  (3, 'Extrair os dados do produto a partir da foto e do texto', 'Usar IA para interpretar a foto e a mensagem e extrair nome, preço, variações e demais dados do produto.'),
  (4, 'Cadastrar o produto automaticamente no sistema', 'Criar o produto já cadastrado (Tray/Olist) a partir dos dados extraídos, sem digitação manual da equipe.'),
  (5, 'Criar etapa de revisão antes da publicação', 'Dar uma conferência rápida pra equipe revisar/corrigir os dados antes do produto ir ao ar.'),
  (6, 'Testar com casos reais do grupo', 'Validar o fluxo completo com fotos e mensagens reais enviadas pela equipe e ajustar o que não funcionar.')
) as a(ordem, titulo, descricao)
where p.entrega_numero = 8
  and not exists (select 1 from atividades x where x.projeto_id = p.id and x.titulo = a.titulo);

insert into mensagens (projeto_id, autor_id, texto)
select p.id, pf.id, 'Bora começar por esse — é o que o Samuel mais sente falta hoje no dia a dia.'
from projetos p
join clientes c on c.id = p.cliente_id and c.nome = 'Dos Crias Tabacaria'
join perfis pf on pf.nome = 'Kelvin'
where p.entrega_numero = 8
  and not exists (select 1 from mensagens m where m.projeto_id = p.id);

-- 4) Tonabê e FNX — briefing e prioridade dos projetos que já existem
update projetos p
set briefing = 'Reconstrução do auditor comercial dentro do portal, integração via API Tiny com as automações associadas, e migração dos arquivos que estavam com o Lucas para dentro do Portal.',
    prioridade = 'alta'
from clientes c
where c.id = p.cliente_id and c.nome = 'Tonabê' and p.briefing is null;

update projetos p
set briefing = 'Construção do sistema completo da Fnx: parte visual, integrações de API, dashboards de IA (SDR, compras e precificação), autenticação/segurança de login, banco de dados e a hospedagem com domínio próprio.',
    prioridade = 'alta'
from clientes c
where c.id = p.cliente_id and c.nome = 'FNX Tabacaria' and p.briefing is null;
