-- 0025 · Time de Marketing IA rodando de verdade
-- - Plano por mês: começa em inicio_em e cobre o mês inteiro; do dia 24 em diante já planeja o mês seguinte.
-- - Manual de marca (marca): cores, fontes, logo, tom de voz e regras, usado nas copies e nas artes.
-- - Padrão do nosso perfil (perfil_padrao): o que o @demand_ia já posta e o que deu resultado, revisto toda semana.
-- - A conta própria entra no Radar como fonte "proprio" (não é concorrente, é o nosso padrão).
--
-- Para desfazer: alter table public.estudio_config drop column inicio_em, drop column marca,
--   drop column perfil_padrao, drop column ultimo_perfil; alter table public.estudio_fontes drop column proprio;

alter table public.estudio_config
  add column if not exists inicio_em date,
  add column if not exists marca jsonb not null default '{}'::jsonb,
  add column if not exists perfil_padrao jsonb not null default '{}'::jsonb,
  add column if not exists ultimo_perfil date;

alter table public.estudio_fontes add column if not exists proprio boolean not null default false;

insert into public.estudio_fontes (tipo, valor, ativo, proprio)
values ('conta', 'demand_ia', true, true)
on conflict (tipo, valor) do update set ativo = true, proprio = true;

update public.estudio_config
   set inicio_em = coalesce(inicio_em, date '2026-11-09'),
       mix = '{"carrossel":3,"estatico":2,"reels":2}'::jsonb
 where id = 1;

-- Quando o Kelvin aprova, pede ajuste ou descarta (pelo portal ou pela Central), a Vera avisa o agente
-- no canal interno. Assim a Central mostra a conversa real do time.
create or replace function public.estudio_avisar_decisao()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  d text := to_char(new.dia, 'DD/MM');
  t text := left(new.tema, 70);
  msg text; para text;
begin
  if new.status is not distinct from old.status then return new; end if;
  if old.status = 'revisar_copy' and new.status = 'copy_aprovada' then
    para := 'duda'; msg := format('Kelvin aprovou a copy de %s ("%s"). Duda, pode fazer %s.', d, t, case when new.formato = 'reels' then 'o vídeo' else 'a arte' end);
  elsif old.status = 'revisar_copy' and new.status = 'pauta' then
    para := 'bia'; msg := format('Kelvin pediu ajuste na copy de %s: "%s". Prioridade.', d, left(coalesce(new.comentario, 'refazer'), 200));
  elsif old.status = 'revisar_arte' and new.status = 'agendado' then
    para := 'lara'; msg := format('Kelvin aprovou a arte de %s. Lara, está agendado para %s às %s.', d, d, new.horario);
  elsif old.status = 'revisar_arte' and new.status = 'copy_aprovada' then
    para := 'duda'; msg := format('Kelvin pediu ajuste na arte de %s: "%s".', d, left(coalesce(new.comentario, 'refazer'), 200));
  elsif new.status = 'descartado' and old.status in ('revisar_copy', 'revisar_arte', 'pauta', 'copy_aprovada', 'agendado') then
    para := 'teo'; msg := format('O post de %s ("%s") foi descartado. Téo, planeja outro tema para o dia.', d, t);
  end if;
  if msg is not null then
    insert into public.estudio_mensagens (autor, para, texto) values ('vera', para, msg);
  end if;
  return new;
end $$;

drop trigger if exists estudio_pautas_avisar on public.estudio_pautas;
create trigger estudio_pautas_avisar after update of status on public.estudio_pautas
  for each row execute function public.estudio_avisar_decisao();
