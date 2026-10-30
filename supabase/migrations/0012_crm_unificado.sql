-- CRM unificado: o portal passa a ler os contatos e as conversas da Ana (só perfil "dono"),
-- com atualização em tempo real, e os leads inbound ganham uma etapa no funil de oportunidades.
alter table public.sdr_leads
  add column if not exists funil_etapa text
    check (funil_etapa in ('conversando', 'reuniao', 'proposta', 'ganho', 'perdido'));

drop policy if exists sdr_leads_dono_select on public.sdr_leads;
create policy sdr_leads_dono_select on public.sdr_leads
  for select to authenticated using (meu_papel() = 'dono');

drop policy if exists sdr_leads_dono_update on public.sdr_leads;
create policy sdr_leads_dono_update on public.sdr_leads
  for update to authenticated using (meu_papel() = 'dono') with check (meu_papel() = 'dono');

drop policy if exists sdr_messages_dono_select on public.sdr_messages;
create policy sdr_messages_dono_select on public.sdr_messages
  for select to authenticated using (meu_papel() = 'dono');

-- Conversas ao vivo no portal
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'sdr_messages') then
    alter publication supabase_realtime add table public.sdr_messages;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'sdr_leads') then
    alter publication supabase_realtime add table public.sdr_leads;
  end if;
end $$;
