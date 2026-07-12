import { useState } from 'react';
import { PlayCircle, Loader2 } from 'lucide-react';
import { supabase, hasSupabaseConfig } from '../../lib/supabaseClient';

// On-demand BibleProject videos for a wiki entry, via the channel-locked
// youtube-proxy (same pipeline as StudyResources). Loaded only on tap so
// browsing the wiki never spends YouTube quota.
export default function WikiVideos({ query, label = 'related BibleProject videos' }) {
  const [state, setState] = useState('idle'); // idle | loading | ready | empty | error
  const [videos, setVideos] = useState([]);

  if (!hasSupabaseConfig) return null;

  const load = async () => {
    setState('loading');
    try {
      const { data, error } = await supabase.functions.invoke('youtube-proxy', {
        body: { query, maxResults: 3 },
      });
      if (error) throw error;
      const found = data?.videos || [];
      setVideos(found);
      setState(found.length ? 'ready' : 'empty');
    } catch {
      setState('error');
    }
  };

  return (
    <section className="wv-section">
      {state === 'idle' && (
        <button className="wv-load" onClick={load}>
          <PlayCircle size={15} /> Watch {label}
        </button>
      )}
      {state === 'loading' && <p className="wv-status"><Loader2 size={14} className="wv-spin" /> Finding videos…</p>}
      {state === 'empty' && <p className="wv-status">No matching BibleProject videos found.</p>}
      {state === 'error' && <p className="wv-status">Couldn't load videos right now.</p>}
      {state === 'ready' && (
        <div className="wv-grid">
          {videos.map((v) => (
            <figure key={v.videoId} className="wv-video">
              <div className="wv-embed">
                <iframe
                  src={`https://www.youtube-nocookie.com/embed/${v.videoId}`}
                  title={v.title}
                  loading="lazy"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              </div>
              <figcaption>{v.title}</figcaption>
            </figure>
          ))}
        </div>
      )}
    </section>
  );
}
