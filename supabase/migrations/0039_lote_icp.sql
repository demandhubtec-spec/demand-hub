-- 18/11/2026 · Lote ICP (Kelvin): clínicas e alimentação de Indaiatuba e região.
-- Aplicada no projeto em 18/11 com autorização do Kelvin ("pode aprovar tudo").
--  1) lote_icp_regiao(): cidades da região atendida.
--  2) lote_icp_ok(lead): dentro do perfil (restaurante com 80+ avaliações; clínica com 30 a 1500 avaliações,
--     sem hospital/laboratório/salão/pet, sem profissional sozinho "Dr./Dra." sem clínica no nome).
--  3) aprovar_lote_icp(): tira da fila quem veio de fora da região e aprova a mensagem (msg_status='aprovada',
--     prioridade='010', fura a fila) de quem tem WhatsApp e está no perfil. Pode rodar de novo a cada coleta.
--  4) Gatilho lote_icp_autoaprova: lead do lote passa sozinho pelo Léo, pela Rita e pela Duda.

create or replace function public.lote_icp_regiao() returns text[] language sql immutable as $f$
  select array['Indaiatuba','Salto','Itu','Elias Fausto','Sorocaba','Campinas','Itupeva','Jundiaí','Valinhos',
               'Vinhedo','Hortolândia','Sumaré','Monte Mor','Cabreúva','Porto Feliz']
$f$;

create or replace function public.lote_icp_ok(l public.outreach_leads) returns boolean language sql stable as $f$
select l.cidade = any(public.lote_icp_regiao()) and (
  (l.nicho ~* 'restaur|aliment' and coalesce(l.avaliacoes,0) >= 80)
  or (l.nicho ~* 'cl[ií]nic|odont|est[eé]tic' and coalesce(l.avaliacoes,0) between 30 and 1500
      and (coalesce(l.empresa,'')||' '||coalesce(l.categoria,'')) !~* 'hospital|laborat|diagn[oó]stic|universid|pronto.socorro|\mupa\M|santa casa|sal[aã]o de beleza|cabeleire|barbear|manicure|veterin|\mpet'
      and not (l.empresa ~* '^\s*(dr|dra|dentista)\M' and l.empresa !~* 'cl[ií]nica|odontologia|instituto|centro|espa[cç]o'))
)
$f$;

create or replace function public.aprovar_lote_icp() returns text language plpgsql as $f$
declare n_fora int; n_ok int;
begin
  update outreach_leads set wa_status='ignorado', wa_error='fora da região (coleta automática)', updated_at=now()
   where created_at > now()-interval '2 days' and wa_status in ('pendente','sem_whatsapp') and msg_status='sem'
     and coalesce(prioridade,'')<>'010' and origem is distinct from 'instagram'
     and (cidade is null or not cidade = any(public.lote_icp_regiao())) and termo_busca ~* ' SP$';
  get diagnostics n_fora = row_count;
  update outreach_leads l set msg_status='aprovada', prioridade='010', updated_at=now()
   where l.created_at > now()-interval '2 days' and l.wa_status='pendente' and l.whatsapp is not null
     and l.msg_status in ('sem','rascunho') and public.lote_icp_ok(l);
  get diagnostics n_ok = row_count;
  return 'fora '||n_fora||' / aprovados '||n_ok;
end $f$;

create or replace function public.lote_icp_autoaprova() returns trigger language plpgsql as $f$
begin
  if coalesce(new.prioridade,'') = '010' then
    if new.leo_status = 'pendente' then new.leo_status := 'aprovado'; new.leo_decidido_em := now(); end if;
    if new.rita_status = 'pendente' then new.rita_status := 'aprovado'; end if;
    if new.duda_status = 'pendente' then new.duda_status := 'aprovado'; end if;
  end if;
  return new;
end $f$;

drop trigger if exists lote_icp_autoaprova on public.outreach_leads;
create trigger lote_icp_autoaprova before update of leo_status, rita_status, duda_status on public.outreach_leads
  for each row execute function public.lote_icp_autoaprova();
