-- Time Comercial IA: playbook comercial editável e as etapas novas dos funis.
-- Uma linha só ("principal") com as seções. O Kelvin edita no portal; a Ana e o time leem no servidor.

create table if not exists public.comercial_playbook (
  id text primary key default 'principal',
  secoes jsonb not null default '[]'::jsonb,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid references auth.users(id) on delete set null
);

alter table public.comercial_playbook enable row level security;

drop policy if exists comercial_playbook_dono on public.comercial_playbook;
create policy comercial_playbook_dono on public.comercial_playbook for all to authenticated
  using (meu_papel() = 'dono') with check (meu_papel() = 'dono');

insert into public.comercial_playbook (id, secoes) values ('principal', $json$[
  {"titulo": "Objetivo do time", "texto": "Reuniões qualificadas na agenda do Kelvin\nOferta de entrada: diagnóstico gratuito, com demonstração da IA atendendo\nProduto principal: Atendimento IA + Prospecção Ativa\nPromessa: mais receita, sem contratar mais gente"},
  {"titulo": "Cliente ideal", "texto": "Nichos prioritários: clínicas, restaurantes e alimentação, barbearias e pet shops\nTambém: imobiliárias, empresas de eventos e serviços (manutenção, ar-condicionado), todos com portfólio pronto\nContato válido: dono, sócio ou responsável por marketing, atendimento ou vendas\nRegião inicial: Indaiatuba e até 50 km"},
  {"titulo": "Qualificação (os 4 critérios)", "texto": "Decisor: quem assina ou influencia direto\nFaturamento: acima do mínimo do nicho\nDor: perde cliente ou venda por demora ou falta de retorno\nMomento: quer resolver nos próximos 30 dias"},
  {"titulo": "Abordagem (SPIN)", "texto": "Situação: entender como o negócio atende e capta clientes hoje\nProblema: mostrar o que encontramos (atendimento, site, Instagram, Google) com dado real, nunca genérico\nImplicação: quanto isso custa em clientes e faturamento perdidos\nNecessidade: levar o dono a dizer o que ganharia resolvendo; aí entra o diagnóstico gratuito\nNunca abrir com oferta genérica: a primeira mensagem já entrega algo de valor feito para aquela empresa"},
  {"titulo": "Regras de canal", "texto": "Só dentro da janela de envio configurada no portal\nWhatsApp: respeitar o limite diário e o intervalo entre mensagens\nFollow-ups alternam cobrança e conteúdo útil\nQuem pede para parar sai na hora e não volta (LGPD)\nA IA sempre se apresenta como assistente da DemandIA quando perguntada"},
  {"titulo": "Tom", "texto": "Gente falando com gente: curto, direto, educado\nFala de resultado: clientes atendidos, faturamento, menos custo\nUma pergunta por mensagem\nSempre terminar com uma pergunta ou um próximo passo claro"},
  {"titulo": "Nunca", "texto": "Disparo em massa ou mensagem fora do horário\nPressão, urgência falsa ou \"última chance\"\nFalar preço antes de entender a dor\nTravessão e jargão técnico\nEscrever \"grátis\": o certo é \"gratuito\""}
]$json$::jsonb)
on conflict (id) do nothing;

-- Funis do Time Comercial IA (08/11/2026): novas etapas de qualificação e reunião realizada.
-- Outbound (prospecção ativa): outreach_leads.status_comercial
alter table public.outreach_leads drop constraint if exists outreach_leads_status_comercial_check;
alter table public.outreach_leads add constraint outreach_leads_status_comercial_check
  check (status_comercial = any (array['novo','contatado','respondeu','qualificacao','reuniao','reuniao_realizada','proposta','ganho','perdido','descartado']));

-- Inbound [anúncios]: sdr_leads.funil_etapa ("conversando" fica aceito para dados antigos)
alter table public.sdr_leads drop constraint if exists sdr_leads_funil_etapa_check;
alter table public.sdr_leads add constraint sdr_leads_funil_etapa_check
  check (funil_etapa = any (array['recebido','atendimento','conversando','qualificacao','reuniao','reuniao_realizada','proposta','ganho','perdido']));
