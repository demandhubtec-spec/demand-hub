-- 28/11/2026 (Kelvin): score de qualidade dos leads (0 a 100, faixas A/B/C) e perfil do Instagram lido pelo Apify.
alter table public.outreach_leads
  add column if not exists score integer,
  add column if not exists score_faixa text,
  add column if not exists score_dor text,
  add column if not exists score_detalhe jsonb,
  add column if not exists score_em timestamptz,
  add column if not exists ig_perfil jsonb,
  add column if not exists ig_perfil_em timestamptz;

create index if not exists outreach_leads_fila_score_idx
  on public.outreach_leads (wa_status, msg_status, score desc nulls last);
