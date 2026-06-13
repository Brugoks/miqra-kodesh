import { useState, useEffect } from 'react';
import { PlayCircle, Loader2, AlertCircle, ExternalLink } from 'lucide-react';
import { supabase, hasSupabaseConfig } from '../lib/supabaseClient';
import './StudyResources.css';

function VideoEmbed({ video }) {
  return (
    <figure className="sr-video">
      <div className="sr-embed">
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${video.videoId}`}
          title={video.title}
          loading="lazy"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
      <figcaption className="sr-video-title">{video.title}</figcaption>
    </figure>
  );
}

// Resources tab — BibleProject videos matched to a study module's book and topic.
export default function StudyResources({ book, topic }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [bookVideos, setBookVideos] = useState([]);
  const [topicVideos, setTopicVideos] = useState([]);

  const cleanTopic = topic && topic !== book ? topic.trim() : '';

  useEffect(() => {
    let active = true;

    if (!hasSupabaseConfig || (!book && !cleanTopic)) return undefined;

    const fetchVideos = async (query, maxResults) => {
      const { data, error: fnErr } = await supabase.functions.invoke('youtube-proxy', {
        body: { query, maxResults },
      });
      if (fnErr) throw new Error(data?.detail || fnErr.message);
      return data?.videos || [];
    };

    const run = async () => {
      setLoading(true);
      setError('');
      try {
        const [bv, tv] = await Promise.all([
          book ? fetchVideos(`${book} overview`, 4) : Promise.resolve([]),
          cleanTopic ? fetchVideos(`${cleanTopic} word study theme`, 6) : Promise.resolve([]),
        ]);
        if (!active) return;
        const bookIds = new Set(bv.map((v) => v.videoId));
        setBookVideos(bv);
        setTopicVideos(tv.filter((v) => !bookIds.has(v.videoId)));
      } catch (e) {
        if (active) setError(e.message || 'Could not load BibleProject resources.');
      } finally {
        if (active) setLoading(false);
      }
    };

    run();
    return () => { active = false; };
  }, [book, cleanTopic]);

  if (!book && !cleanTopic) {
    return (
      <p className="sr-empty">
        Set a book or topic on this study to see related BibleProject videos here.
      </p>
    );
  }

  if (loading) {
    return (
      <div className="sr-loading">
        <Loader2 size={22} className="sr-spin" />
        <span>Finding BibleProject videos…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="sr-error">
        <AlertCircle size={18} />
        <span>{error}</span>
      </div>
    );
  }

  const nothing = !bookVideos.length && !topicVideos.length;

  return (
    <div className="sr-root">
      <div className="sr-header">
        <PlayCircle size={16} className="sr-yt-icon" />
        <span>BibleProject Resources</span>
        <a
          className="sr-channel-link"
          href="https://www.youtube.com/@bibleproject"
          target="_blank"
          rel="noopener noreferrer"
        >
          Channel <ExternalLink size={11} />
        </a>
      </div>

      {nothing && (
        <p className="sr-empty">No BibleProject videos found for this book or topic.</p>
      )}

      {bookVideos.length > 0 && (
        <section className="sr-section">
          <h4 className="sr-section-title">{book} — Book Overview</h4>
          <div className="sr-grid">
            {bookVideos.map((v) => <VideoEmbed key={v.videoId} video={v} />)}
          </div>
        </section>
      )}

      {topicVideos.length > 0 && (
        <section className="sr-section">
          <h4 className="sr-section-title">Themes &amp; Topics{cleanTopic ? ` — ${cleanTopic}` : ''}</h4>
          <div className="sr-grid">
            {topicVideos.map((v) => <VideoEmbed key={v.videoId} video={v} />)}
          </div>
        </section>
      )}

      <p className="sr-credit">Videos by BibleProject (Tim Mackie &amp; Jon Collins) · embedded from YouTube</p>
    </div>
  );
}
