import { useEffect, useState } from 'react';
import { Box, ScrollText, Compass, MapPin, ChevronRight } from 'lucide-react';
import './SceneMomentsStrip.css';

// "Step into the scene" — the parts of the walkable 3D scenes the passage in
// the reader is about, each a link straight to it: the event staged at its
// hour, the vantage stood at, the pin opened (src/lib/sceneScripture.js). The
// index is loaded lazily so the reader's own chunk carries none of the scene
// manifests until a passage is showing.
let loading = null;
const loadIndex = () => {
  if (!loading) loading = import('../../lib/sceneScripture');
  return loading;
};

const KIND_ICON = { event: ScrollText, vantage: Compass, hotspot: MapPin };
const KIND_LABEL = { event: 'Event', vantage: 'Stand here', hotspot: 'Look closer' };

export default function SceneMomentsStrip({ passageIds, onEnter, limit = 3 }) {
  const key = (passageIds || []).join('|');
  const [found, setFound] = useState({ key: null, moments: [] });
  const [expandedFor, setExpandedFor] = useState(null);

  useEffect(() => {
    if (!key) return undefined;
    let cancelled = false;
    loadIndex().then(({ sceneMomentsForPassage }) => {
      if (!cancelled) setFound({ key, moments: sceneMomentsForPassage(key.split('|')) });
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [key]);

  const moments = found.key === key ? found.moments : [];
  if (!moments.length) return null;
  const expanded = expandedFor === key;
  const shown = expanded ? moments : moments.slice(0, limit);
  const scenes = [...new Set(moments.map((moment) => moment.sceneTitle))];

  return (
    <section className="sms-strip" data-no-scripture aria-label="Step into the scene">
      <div className="sms-head">
        <Box size={15} aria-hidden="true" />
        <span className="sms-title">Step into the scene</span>
        <span className="sms-where">{scenes.join(' · ')}</span>
      </div>
      <ul className="sms-list">
        {shown.map((moment) => {
          const Icon = KIND_ICON[moment.kind] || MapPin;
          return (
            <li key={moment.path}>
              <button type="button" className="sms-moment" onClick={() => onEnter?.(moment)}>
                <Icon size={15} className="sms-moment-icon" aria-hidden="true" />
                <span className="sms-moment-text">
                  <span className="sms-moment-label">{moment.label}</span>
                  <span className="sms-moment-meta">
                    {moment.sceneTitle}
                    {moment.place ? ` · ${moment.place}` : ''}
                    {' · '}
                    {moment.ref}
                  </span>
                </span>
                <span className="sms-moment-kind">{KIND_LABEL[moment.kind]}</span>
                <ChevronRight size={15} className="sms-moment-go" aria-hidden="true" />
              </button>
            </li>
          );
        })}
      </ul>
      {moments.length > limit && (
        <button type="button" className="sms-more" onClick={() => setExpandedFor(expanded ? null : key)}>
          {expanded ? 'Show fewer' : `Show ${moments.length - limit} more`}
        </button>
      )}
    </section>
  );
}
