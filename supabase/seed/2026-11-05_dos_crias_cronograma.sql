-- Dos Crias · cronograma das 13 entregas (base: documento de entregáveis de 29/10/2026)
-- Rode DEPOIS da migração 0023. Pode rodar mais de uma vez: atualiza fase, prazos e status
-- das entregas e só cria as atividades que ainda não existem (pelo título). Nada é apagado.

create or replace function pg_temp.dc_entrega(p_num int, p_nome text, p_sub text, p_status text, p_fase text,
  p_prio text, p_ini date, p_fim date, p_brief text) returns uuid language plpgsql as $$
declare v_cli uuid; v_id uuid; v_resp uuid;
begin
  select id into v_cli from clientes where nome = 'Dos Crias Tabacaria';
  if v_cli is null then raise exception 'Cliente Dos Crias Tabacaria não encontrado'; end if;
  select id into v_resp from perfis where nome ilike 'Kelvin%' limit 1;
  select id into v_id from projetos where cliente_id = v_cli and entrega_numero = p_num limit 1;
  if v_id is null then
    insert into projetos (cliente_id, nome, subtitulo, entrega_numero, departamento, status, fase, prioridade,
                          progresso, prazo_inicio, prazo_fim, prazo, briefing, responsavel_id)
    values (v_cli, p_nome, p_sub, p_num, 'tecnologia', p_status, p_fase, p_prio, 0, p_ini, p_fim, p_fim, p_brief, v_resp)
    returning id into v_id;
  else
    update projetos set status = p_status, fase = p_fase, prioridade = p_prio, prazo_inicio = p_ini,
      prazo_fim = p_fim, prazo = p_fim, briefing = coalesce(p_brief, briefing), responsavel_id = coalesce(responsavel_id, v_resp)
    where id = v_id;
  end if;
  return v_id;
end $$;

create or replace function pg_temp.dc_ativ(p_proj uuid, p_ordem int, p_titulo text, p_status text, p_prazo date, p_resp text)
returns void language plpgsql as $$
declare v_resp uuid;
begin
  select id into v_resp from perfis where nome ilike p_resp || '%' limit 1;
  if exists (select 1 from atividades where projeto_id = p_proj and titulo = p_titulo) then
    update atividades set status = p_status, prazo = p_prazo, responsavel_id = coalesce(v_resp, responsavel_id)
    where projeto_id = p_proj and titulo = p_titulo;
  else
    insert into atividades (projeto_id, titulo, departamento, status, prioridade, prazo, responsavel_id, criado_em)
    values (p_proj, p_titulo, 'tecnologia', p_status, 'media', p_prazo, v_resp,
            timestamptz '2026-11-05 12:00:00-03' + (p_ordem * interval '1 second'));
  end if;
end $$;

do $$
declare v uuid;
begin
  -- Entrega 01
  v := pg_temp.dc_entrega(1, 'Integração Tray e Olist', null, 'andamento', 'teste', 'alta', '2026-10-20', '2026-11-26', 'Conexão do portal com o Olist (Tiny) e com a Tray. A parte técnica está pronta; falta cadastrar as chaves de acesso e conferir com uma ordem real.');
  perform pg_temp.dc_ativ(v, 1, 'Conexão com Olist (Tiny) e Tray pronta no portal', 'concluido', '2026-10-29', 'Kelvin');
  perform pg_temp.dc_ativ(v, 2, 'Tela de Integrações: testa e conecta Olist e Tray com um clique', 'concluido', '2026-10-29', 'Kelvin');
  perform pg_temp.dc_ativ(v, 3, 'Aprovação do Samuel cria o produto novo no Olist', 'concluido', '2026-10-29', 'Kelvin');
  perform pg_temp.dc_ativ(v, 4, 'Cadastrar as chaves de acesso e conectar Olist e Tray', 'andamento', '2026-11-12', 'Fabrício');
  perform pg_temp.dc_ativ(v, 5, 'Trocar os acessos que estavam no n8n e desligar o fluxo antigo', 'a-fazer', '2026-11-12', 'Fabrício');
  perform pg_temp.dc_ativ(v, 6, 'Conferir o envio da ordem de compra ao Olist com uma ordem real', 'a-fazer', '2026-11-14', 'Fabrício');
  perform pg_temp.dc_ativ(v, 7, 'Confirmar a importação automática da nota no Olist (hoje manual)', 'a-fazer', '2026-11-19', 'Fabrício');
  perform pg_temp.dc_ativ(v, 8, 'Correção do que aparecer nos testes', 'a-fazer', '2026-11-21', 'Kelvin');
  perform pg_temp.dc_ativ(v, 9, 'Aprovação do Samuel', 'a-fazer', '2026-11-26', 'Kelvin');
  -- Entrega 02
  v := pg_temp.dc_entrega(2, 'Conciliação de pagamentos', null, 'a-fazer', null, 'media', '2026-12-03', '2026-12-17', null);
  perform pg_temp.dc_ativ(v, 1, 'Mapear como os pagamentos chegam da Tray e do Olist', 'a-fazer', '2026-12-04', 'Kelvin');
  perform pg_temp.dc_ativ(v, 2, 'Implementação', 'a-fazer', '2026-12-10', 'Kelvin');
  perform pg_temp.dc_ativ(v, 3, 'Teste', 'a-fazer', '2026-12-14', 'Kelvin');
  perform pg_temp.dc_ativ(v, 4, 'Correção', 'a-fazer', '2026-12-15', 'Kelvin');
  perform pg_temp.dc_ativ(v, 5, 'Aprovação do Samuel', 'a-fazer', '2026-12-17', 'Kelvin');
  -- Entrega 03
  v := pg_temp.dc_entrega(3, 'Régua de cobrança automática', null, 'a-fazer', null, 'media', '2027-01-07', '2027-01-21', null);
  perform pg_temp.dc_ativ(v, 1, 'Definir com o Samuel quando e como cobrar', 'a-fazer', '2027-01-08', 'Kelvin');
  perform pg_temp.dc_ativ(v, 2, 'Implementação', 'a-fazer', '2027-01-14', 'Kelvin');
  perform pg_temp.dc_ativ(v, 3, 'Teste', 'a-fazer', '2027-01-18', 'Kelvin');
  perform pg_temp.dc_ativ(v, 4, 'Correção', 'a-fazer', '2027-01-19', 'Kelvin');
  perform pg_temp.dc_ativ(v, 5, 'Aprovação do Samuel', 'a-fazer', '2027-01-21', 'Kelvin');
  -- Entrega 04
  v := pg_temp.dc_entrega(4, 'Relatório diário no WhatsApp', null, 'a-fazer', null, 'media', '2026-11-19', '2026-12-03', null);
  perform pg_temp.dc_ativ(v, 1, 'Definir com o Samuel os números do resumo do dia', 'a-fazer', '2026-11-21', 'Kelvin');
  perform pg_temp.dc_ativ(v, 2, 'Implementação', 'a-fazer', '2026-11-26', 'Kelvin');
  perform pg_temp.dc_ativ(v, 3, 'Teste', 'a-fazer', '2026-11-28', 'Kelvin');
  perform pg_temp.dc_ativ(v, 4, 'Correção', 'a-fazer', '2026-12-01', 'Kelvin');
  perform pg_temp.dc_ativ(v, 5, 'Aprovação do Samuel', 'a-fazer', '2026-12-03', 'Kelvin');
  -- Entrega 05
  v := pg_temp.dc_entrega(5, 'Rastreio automático do pedido', null, 'a-fazer', null, 'media', '2026-12-10', '2026-12-24', null);
  perform pg_temp.dc_ativ(v, 1, 'Implementação', 'a-fazer', '2026-12-17', 'Kelvin');
  perform pg_temp.dc_ativ(v, 2, 'Teste', 'a-fazer', '2026-12-21', 'Kelvin');
  perform pg_temp.dc_ativ(v, 3, 'Correção', 'a-fazer', '2026-12-22', 'Kelvin');
  perform pg_temp.dc_ativ(v, 4, 'Aprovação do Samuel', 'a-fazer', '2026-12-24', 'Kelvin');
  -- Entrega 06
  v := pg_temp.dc_entrega(6, 'Declaração dos Correios em PDF', null, 'a-fazer', null, 'media', '2026-12-17', '2027-01-07', null);
  perform pg_temp.dc_ativ(v, 1, 'Implementação', 'a-fazer', '2026-12-23', 'Kelvin');
  perform pg_temp.dc_ativ(v, 2, 'Teste', 'a-fazer', '2027-01-04', 'Kelvin');
  perform pg_temp.dc_ativ(v, 3, 'Correção', 'a-fazer', '2027-01-05', 'Kelvin');
  perform pg_temp.dc_ativ(v, 4, 'Aprovação do Samuel', 'a-fazer', '2027-01-07', 'Kelvin');
  -- Entrega 07
  v := pg_temp.dc_entrega(7, 'Avisos de processo para a equipe', null, 'andamento', 'implementacao', 'media', '2026-10-29', '2026-11-26', 'Avisos automáticos para a equipe em cada etapa. O aviso no grupo e os alertas dentro do portal já funcionam; falta o aviso por celular ou e-mail.');
  perform pg_temp.dc_ativ(v, 1, 'Aviso no grupo quando o Samuel aprova', 'concluido', '2026-10-29', 'Kelvin');
  perform pg_temp.dc_ativ(v, 2, 'Alertas no portal de estoque mínimo e contas a vencer', 'concluido', '2026-10-29', 'Kelvin');
  perform pg_temp.dc_ativ(v, 3, 'Aviso de estoque mínimo e de venda por celular ou e-mail', 'andamento', '2026-11-19', 'Kelvin');
  perform pg_temp.dc_ativ(v, 4, 'Teste', 'a-fazer', '2026-11-21', 'Kelvin');
  perform pg_temp.dc_ativ(v, 5, 'Correção', 'a-fazer', '2026-11-24', 'Kelvin');
  perform pg_temp.dc_ativ(v, 6, 'Aprovação do Samuel', 'a-fazer', '2026-11-26', 'Kelvin');
  -- Entrega 08
  v := pg_temp.dc_entrega(8, 'Cadastro de produtos', 'Cadastro por foto / WhatsApp', 'andamento', 'teste', 'alta', '2026-10-14', '2026-11-19', 'Pedido mandado no grupo de WhatsApp vira ordem de compra no portal, nota vira nota fiscal e produto avulso vira cadastro. A IA lê texto, áudio, foto e PDF. Nada vai para o Olist sem a aprovação do Samuel. Robô pronto, esperando as chaves para ligar.');
  perform pg_temp.dc_ativ(v, 1, 'Mapear o fluxo atual de envio de fotos no grupo', 'concluido', '2026-10-21', 'Kelvin');
  perform pg_temp.dc_ativ(v, 2, 'Extrair os dados do produto a partir da foto e do texto', 'concluido', '2026-10-29', 'Kelvin');
  perform pg_temp.dc_ativ(v, 3, 'Cadastrar o produto automaticamente no sistema', 'concluido', '2026-10-29', 'Kelvin');
  perform pg_temp.dc_ativ(v, 4, 'Criar etapa de revisão antes da publicação', 'concluido', '2026-10-29', 'Kelvin');
  perform pg_temp.dc_ativ(v, 5, 'Conectar o número/grupo de WhatsApp à automação', 'andamento', '2026-11-12', 'Fabrício');
  perform pg_temp.dc_ativ(v, 6, 'Cadastrar as chaves de acesso e ligar o robô', 'andamento', '2026-11-12', 'Fabrício');
  perform pg_temp.dc_ativ(v, 7, 'Testar com casos reais do grupo', 'a-fazer', '2026-11-14', 'Kelvin');
  perform pg_temp.dc_ativ(v, 8, 'Correção do que aparecer nos testes', 'a-fazer', '2026-11-17', 'Kelvin');
  perform pg_temp.dc_ativ(v, 9, 'Aprovação do Samuel', 'a-fazer', '2026-11-19', 'Kelvin');
  -- Entrega 09
  v := pg_temp.dc_entrega(9, 'Portal com dashboard', null, 'andamento', 'teste', 'alta', '2026-10-14', '2026-11-19', 'Portal Dos Crias no ar em versão de teste (doscriamvp.vercel.app), funcionando de ponta a ponta para entrada de mercadoria, aprovação, produtos, fornecedores e contas a pagar. Endereço final previsto: portal.atacadodoscrias.com.br.');
  perform pg_temp.dc_ativ(v, 1, 'Login com troca de senha no primeiro acesso e código para administradores', 'concluido', '2026-10-29', 'Kelvin');
  perform pg_temp.dc_ativ(v, 2, 'Menu por departamento e tela de Resumo com números do dia e pendências', 'concluido', '2026-10-29', 'Kelvin');
  perform pg_temp.dc_ativ(v, 3, 'Nota fiscal e ordem de compra com custo, desconto, frete e anexos', 'concluido', '2026-10-29', 'Kelvin');
  perform pg_temp.dc_ativ(v, 4, 'Aprovação do Samuel com motivo e histórico de quem fez cada ação', 'concluido', '2026-10-29', 'Kelvin');
  perform pg_temp.dc_ativ(v, 5, 'Produtos (importação da planilha do Olist) e fornecedores', 'concluido', '2026-10-29', 'Kelvin');
  perform pg_temp.dc_ativ(v, 6, 'Exportação e impressão para lançar no Olist', 'concluido', '2026-10-29', 'Kelvin');
  perform pg_temp.dc_ativ(v, 7, 'Usuários por perfil e histórico de atividades', 'concluido', '2026-10-29', 'Kelvin');
  perform pg_temp.dc_ativ(v, 8, 'Versão de teste no ar', 'concluido', '2026-10-29', 'Kelvin');
  perform pg_temp.dc_ativ(v, 9, 'Uso pela equipe na versão de teste e correções', 'andamento', '2026-11-14', 'Kelvin');
  perform pg_temp.dc_ativ(v, 10, 'Endereço final portal.atacadodoscrias.com.br e servidor em São Paulo', 'a-fazer', '2026-11-14', 'Fabrício');
  perform pg_temp.dc_ativ(v, 11, 'Aprovação do Samuel', 'a-fazer', '2026-11-19', 'Kelvin');
  -- Entrega 10
  v := pg_temp.dc_entrega(10, 'Portal responsivo no celular', null, 'andamento', 'implementacao', 'media', '2026-11-05', '2026-12-03', null);
  perform pg_temp.dc_ativ(v, 1, 'Revisar todas as telas no celular', 'a-fazer', '2026-11-19', 'Kelvin');
  perform pg_temp.dc_ativ(v, 2, 'Ajustes de tela para o celular', 'a-fazer', '2026-11-26', 'Kelvin');
  perform pg_temp.dc_ativ(v, 3, 'Teste com a equipe pelo celular', 'a-fazer', '2026-11-28', 'Kelvin');
  perform pg_temp.dc_ativ(v, 4, 'Correção', 'a-fazer', '2026-12-01', 'Kelvin');
  perform pg_temp.dc_ativ(v, 5, 'Aprovação do Samuel', 'a-fazer', '2026-12-03', 'Kelvin');
  -- Entrega 11
  v := pg_temp.dc_entrega(11, 'Painel de giro + IA de estoque', null, 'a-fazer', null, 'media', '2026-11-26', '2026-12-10', null);
  perform pg_temp.dc_ativ(v, 1, 'Alerta de estoque mínimo dentro do portal (já adiantado)', 'concluido', '2026-10-29', 'Kelvin');
  perform pg_temp.dc_ativ(v, 2, 'Implementação', 'a-fazer', '2026-12-03', 'Kelvin');
  perform pg_temp.dc_ativ(v, 3, 'Teste', 'a-fazer', '2026-12-07', 'Kelvin');
  perform pg_temp.dc_ativ(v, 4, 'Correção', 'a-fazer', '2026-12-08', 'Kelvin');
  perform pg_temp.dc_ativ(v, 5, 'Aprovação do Samuel', 'a-fazer', '2026-12-10', 'Kelvin');
  -- Entrega 12
  v := pg_temp.dc_entrega(12, 'Financeiro: contas, taxas e comissão', null, 'andamento', 'implementacao', 'media', '2026-10-29', '2026-12-17', 'Contas a pagar já funcionam (só administradores). Falta o painel com custo, lucro, taxa de cartão, frete e comissão.');
  perform pg_temp.dc_ativ(v, 1, 'Contas a pagar geradas a partir de nota ou ordem aprovada', 'concluido', '2026-10-29', 'Kelvin');
  perform pg_temp.dc_ativ(v, 2, 'Taxa de cartão, frete e comissão', 'a-fazer', '2026-12-03', 'Kelvin');
  perform pg_temp.dc_ativ(v, 3, 'Painel financeiro e relatório de vendas por marca e produto', 'a-fazer', '2026-12-10', 'Kelvin');
  perform pg_temp.dc_ativ(v, 4, 'Teste', 'a-fazer', '2026-12-14', 'Kelvin');
  perform pg_temp.dc_ativ(v, 5, 'Correção', 'a-fazer', '2026-12-15', 'Kelvin');
  perform pg_temp.dc_ativ(v, 6, 'Aprovação do Samuel', 'a-fazer', '2026-12-17', 'Kelvin');
  -- Entrega 13
  v := pg_temp.dc_entrega(13, 'Disparo e follow-up no portal', null, 'a-fazer', null, 'baixa', '2027-01-14', '2027-01-28', null);
  perform pg_temp.dc_ativ(v, 1, 'Promoções pelo WhatsApp com intervalo longo e só em horário comercial', 'a-fazer', '2027-01-19', 'Kelvin');
  perform pg_temp.dc_ativ(v, 2, 'Follow-up da Tray e envio de produto novo para a Tray', 'a-fazer', '2027-01-21', 'Kelvin');
  perform pg_temp.dc_ativ(v, 3, 'CRM por vendedor', 'a-fazer', '2027-01-23', 'Kelvin');
  perform pg_temp.dc_ativ(v, 4, 'Teste', 'a-fazer', '2027-01-25', 'Kelvin');
  perform pg_temp.dc_ativ(v, 5, 'Correção', 'a-fazer', '2027-01-26', 'Kelvin');
  perform pg_temp.dc_ativ(v, 6, 'Aprovação do Samuel', 'a-fazer', '2027-01-28', 'Kelvin');
end $$;

-- Conferência: select entrega_numero, nome, status, fase, prazo_inicio, prazo_fim from projetos p
--   join clientes c on c.id = p.cliente_id where c.nome = 'Dos Crias Tabacaria' order by 1;
