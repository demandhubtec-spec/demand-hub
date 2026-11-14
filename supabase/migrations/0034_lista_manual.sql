-- 14/11/2026 · Funil comercial unificado: cadastro manual de lead (indicação, recomendação, network, evento...).
-- Aplicada no projeto em 14/11 com autorização do Kelvin. Não altera nenhum lead existente.
alter table public.comercial_lista_leads drop constraint comercial_lista_leads_lista_check;
alter table public.comercial_lista_leads add constraint comercial_lista_leads_lista_check
  check (lista in ('instagram','linkedin','ligacoes','manual'));
