-- ════════════════════════════════════════════════════════════════════
-- 0009 · Prospecção: respostas por e-mail
-- Guarda as conversas (threads) do Gmail de cada lead para o robô ver quem respondeu,
-- quem pediu para sair e quem teve o e-mail devolvido. Idempotente.
-- ════════════════════════════════════════════════════════════════════

alter table public.outreach_leads
  add column if not exists email_threads text[];

alter table public.outreach_config
  add column if not exists email_check_at timestamptz;

-- Começo prudente para um Gmail novo (aquecimento): até 15 e-mails por dia, de 4 a 9 minutos entre eles.
-- Dá para subir aos poucos em Controles depois das primeiras semanas sem devolução.
update public.outreach_config
   set email_daily_cap = least(email_daily_cap, 15),
       email_min_interval_sec = greatest(email_min_interval_sec, 240),
       email_max_interval_sec = greatest(email_max_interval_sec, 540)
 where id = 1;
