-- Private bucket that caches Fish Audio TTS output. Scripture text is static,
-- so each (voice, passage-chunk) is synthesized once and served from here on
-- every later play — turning "N users × M replays" into one paid call per
-- unique chunk. The fish-tts edge function reads/writes it with the service
-- role, so no client-facing storage policies are needed (private bucket = only
-- service_role can access).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'tts-cache',
  'tts-cache',
  false,
  10485760,  -- 10 MB (a 1000-char MP3 chunk is ~40-60 KB; headroom to spare)
  array['audio/mpeg','application/octet-stream']
)
on conflict (id) do nothing;
