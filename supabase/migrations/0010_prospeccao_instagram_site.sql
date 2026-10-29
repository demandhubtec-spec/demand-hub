-- Prospecção: Direct do Instagram (envio manual) e prévia de site grátis
alter table public.outreach_leads
  add column if not exists dm_instagram            text,
  add column if not exists dm_instagram_enviado_em timestamptz,
  add column if not exists site_preview            jsonb,
  add column if not exists site_preview_em         timestamptz;

-- A página pública da prévia busca pelo token
create index if not exists outreach_leads_site_preview_token on public.outreach_leads ((site_preview->>'token'));
