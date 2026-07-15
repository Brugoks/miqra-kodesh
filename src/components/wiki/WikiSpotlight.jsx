import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookMarked, Landmark, ChevronRight } from 'lucide-react';
import { loadBibleWiki, loadChurchTeachers, weeklyPick, formatYearRange } from '../../lib/bibleWiki';
import { wikiImageUrl } from '../../lib/wikiImageUrls';
import './WikiSpotlight.css';

// Dashboard card: a deterministic weekly rotation through the wiki — one
// Bible figure and one voice from church history, same pick for the whole
// church all week so conversations line up.
export default function WikiSpotlight() {
  const navigate = useNavigate();
  const [picks, setPicks] = useState(null);
  const [brokenThumbs, setBrokenThumbs] = useState(() => new Set());

  useEffect(() => {
    let cancelled = false;
    Promise.all([loadBibleWiki(), loadChurchTeachers()]).then(([wiki, teachers]) => {
      if (cancelled) return;
      const figures = wiki.entries.filter((e) => e.type === 'person' && e.desc && e.s !== 'god_1324');
      const voices = teachers.teachers.filter((t) => (t.kind || 'person') === 'person');
      setPicks({
        figure: weeklyPick(figures.slice(0, 120)),
        voice: weeklyPick(voices, new Date(), 3),
      });
    });
    return () => { cancelled = true; };
  }, []);

  if (!picks?.figure || !picks?.voice) return null;

  const thumbUrl = (slug) => {
    if (brokenThumbs.has(slug)) return null;
    return wikiImageUrl(`_default/thumbs/${slug}.jpg`);
  };

  const row = (entry, label, Icon, path) => (
    <button className="ws-row" onClick={() => navigate(path)}>
      {thumbUrl(entry.s) ? (
        <img
          className="ws-thumb"
          src={thumbUrl(entry.s)}
          alt=""
          loading="lazy"
          onError={() => setBrokenThumbs((prev) => new Set(prev).add(entry.s))}
        />
      ) : (
        <span className="ws-thumb ws-thumb-icon"><Icon size={16} /></span>
      )}
      <span className="ws-body">
        <span className="ws-label">{label}</span>
        <span className="ws-name">{entry.name}</span>
        <span className="ws-desc">{(entry.desc || entry.sum || '').slice(0, 130)}{(entry.desc || entry.sum || '').length > 130 ? '…' : ''}</span>
        {entry.type === 'teacher' && entry.y && <span className="ws-meta">{formatYearRange(entry.y)} · {entry.era}</span>}
      </span>
      <ChevronRight size={16} className="ws-chevron" />
    </button>
  );

  return (
    <section className="ws-card card">
      <h2 className="ws-title">This week in the wiki</h2>
      {row(picks.figure, 'Figure of the week', BookMarked, `/wiki/${picks.figure.s}`)}
      {row(picks.voice, 'Voice from church history', Landmark, `/church-history/${picks.voice.s}`)}
    </section>
  );
}
