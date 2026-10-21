-- Agendador da IA SDR: chama /api/cron/tick a cada 10 min (follow-ups + confirmações + lembretes).
-- Funciona em qualquer plano da Vercel (no Hobby, o Vercel Cron só roda 1x por dia).
-- Troque SEU-APP e SEU_CRON_SECRET.

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'ia-sdr-tick',
  '*/10 * * * *',
  $$
  select net.http_post(
    url     := 'https://SEU-APP.vercel.app/api/cron/tick',
    headers := jsonb_build_object('Authorization', 'Bearer SEU_CRON_SECRET', 'Content-Type', 'application/json'),
    body    := '{}'::jsonb
  );
  $$
);

-- Para remover: select cron.unschedule('ia-sdr-tick');
