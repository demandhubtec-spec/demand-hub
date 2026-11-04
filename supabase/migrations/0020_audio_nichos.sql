-- Nichos que recebem o áudio de abordagem (o áudio fala de clínica e paciente). Vazio = todos.
alter table public.outreach_config add column if not exists audio_abordagem_nichos text[];
update public.outreach_config set audio_abordagem_nichos = array['Clínica médica','Odontologia','Endocrinologia','Pet shop / Veterinária'] where id = 1 and audio_abordagem_nichos is null;
