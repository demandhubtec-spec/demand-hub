-- PDFs que a Ana manda no WhatsApp (análises, apresentações). Bucket público: o WhatsApp baixa o arquivo pela URL.
-- Só o dono envia ou apaga. O caminho leva o place_id do lead e um carimbo de tempo, para não dar para adivinhar.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('materiais', 'materiais', true, 15728640, array['application/pdf'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "materiais_insert_dono" on storage.objects;
create policy "materiais_insert_dono" on storage.objects for insert to authenticated
  with check (bucket_id = 'materiais' and public.meu_papel() = 'dono');

drop policy if exists "materiais_delete_dono" on storage.objects;
create policy "materiais_delete_dono" on storage.objects for delete to authenticated
  using (bucket_id = 'materiais' and public.meu_papel() = 'dono');
