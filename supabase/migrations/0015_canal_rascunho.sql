-- Canal com a Ana: rascunhos que a Ana propõe ao Kelvin antes de mandar para um lead.
alter table public.ana_canal add column if not exists rascunho text;
alter table public.ana_canal drop constraint if exists ana_canal_status_check;
alter table public.ana_canal add constraint ana_canal_status_check
  check (status in ('pendente', 'respondido', 'aguardando_ok', 'enviado', 'descartado'));
