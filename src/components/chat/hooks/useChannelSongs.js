import { useCallback, useEffect, useRef, useState } from 'react';
import { hasSupabaseConfig, supabase } from '../../../lib/supabaseClient';
import { allUrls } from '../../../lib/linkUtils';
import { musicEmbedFor } from '../../../lib/musicEmbed';

// Scans a channel's message history for posted music links (Spotify, Apple
// Music, YouTube, SoundCloud) and returns them newest-first, deduped by URL.
// Powers the channel Songs panel. Server-side filter narrows to messages
// that mention a music host so we don't pull the whole history; the client
// confirms each URL with musicEmbedFor.
const MUSIC_HOST_FILTER = [
  'body.ilike.%spotify.com%',
  'body.ilike.%music.apple.com%',
  'body.ilike.%youtube.com%',
  'body.ilike.%youtu.be%',
  'body.ilike.%soundcloud.com%',
].join(',');

const MAX_MESSAGES = 500;

const MUSIC_HOST_PATTERN = /spotify\.com|music\.apple\.com|youtube\.com|youtu\.be|soundcloud\.com/i;

// Whether a realtime change to this channel's messages can change the Songs
// list. Most chat messages have no music link, and each reload is a 500-row
// scan, so only reload for a message that mentions a music host, or a change to
// one already listed (edited, soft-deleted or deleted — a DELETE's `old` row
// carries only the primary key, so membership is the only test there).
export function songsChangeAffectsList(payload, songMessageIds) {
  const row = payload?.new;
  const id = row?.id ?? payload?.old?.id;
  if (id && songMessageIds.has(id)) return true;
  if (payload?.eventType === 'DELETE') return false;
  return MUSIC_HOST_PATTERN.test(row?.body || '');
}

export default function useChannelSongs({ activeChannelId }) {
  const [songs, setSongs] = useState([]);
  const songMessageIdsRef = useRef(new Set());

  useEffect(() => {
    songMessageIdsRef.current = new Set(songs.map((song) => song.messageId));
  }, [songs]);

  const loadSongs = useCallback(async () => {
    if (!hasSupabaseConfig || !activeChannelId) {
      setSongs([]);
      return;
    }

    const { data, error } = await supabase
      .from('chat_messages')
      .select('id, body, author_name, created_at')
      .eq('channel_id', activeChannelId)
      .is('deleted_at', null)
      .or(MUSIC_HOST_FILTER)
      .order('created_at', { ascending: false })
      .limit(MAX_MESSAGES);

    if (error) {
      setSongs([]);
      return;
    }

    const seen = new Set();
    const list = [];
    for (const message of data || []) {
      for (const url of allUrls(message.body)) {
        const embed = musicEmbedFor(url);
        if (!embed || seen.has(url)) continue;
        seen.add(url);
        list.push({
          url,
          embed,
          provider: embed.provider,
          messageId: message.id,
          authorName: message.author_name || 'Member',
          createdAt: message.created_at,
        });
      }
    }
    setSongs(list);
  }, [activeChannelId]);

  useEffect(() => {
    (async () => { await loadSongs(); })();
  }, [loadSongs]);

  // Refresh when messages change in this channel so newly posted (or deleted)
  // songs appear without a manual reload.
  useEffect(() => {
    if (!hasSupabaseConfig || !activeChannelId || typeof supabase.channel !== 'function') return undefined;
    const channel = supabase
      .channel(`chat-songs-${activeChannelId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'chat_messages', filter: `channel_id=eq.${activeChannelId}` },
        (payload) => {
          if (songsChangeAffectsList(payload, songMessageIdsRef.current)) loadSongs();
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [activeChannelId, loadSongs]);

  return { songs };
}
