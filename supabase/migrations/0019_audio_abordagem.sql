-- Áudio de abordagem da Ana (1º contato no WhatsApp: "Oi" + "Tudo bem?" + áudio)
insert into storage.buckets (id, name, public, allowed_mime_types)
values ('audios', 'audios', true, array['audio/mpeg','audio/ogg','audio/mp4'])
on conflict (id) do nothing;

alter table public.outreach_config
  add column if not exists audio_abordagem_url text,   -- áudio público (ogg/opus); vazio = 1º contato só em texto
  add column if not exists audio_abordagem_seg int,    -- duração, para o "gravando áudio..."
  add column if not exists audio_abordagem_texto text; -- o que a Ana fala, vai para o histórico da conversa
