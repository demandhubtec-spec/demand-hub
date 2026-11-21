-- 21/11/2026 (Kelvin): contexto do card no funil, escrito pela IA a partir da conversa (ia-sdr/src/lib/contexto-card.ts):
-- temperatura, resumo, última resposta, por que parou e objetivo da ligação. A temperatura da IA substitui a
-- calculada por palavras-chave (sdr_atualizar_temperatura), que errava com robôs e "pode sim" soltos.
alter table public.sdr_leads add column if not exists contexto jsonb;
select cron.alter_job(jobid, active := false) from cron.job where jobname = 'sdr-temperatura';
