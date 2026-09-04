import { useCallback, useRef } from 'react';
import { Play, Pause, ChevronUp } from 'lucide-react';
import { formatYear } from '../../lib/bibleWiki';
import './AtlasScrubber.css';

// Nine equal-width era segments, each internally linear. Equal width (not
// proportional to real elapsed years) is deliberate — see
// docs/ancient-atlas-plan.md §02: the Gospels are 38 years but 118 of the
// dataset's 400 dated events, so giving every era the same screen real
// estate matches the data's density far better than a literal timeline would.
export default function AtlasScrubber({ eras, year, era, onYearChange, playing, onTogglePlay, collapsed, onExpand }) {
  const trackRef = useRef(null);
  const draggingRef = useRef(false);

  const yearFromClientX = useCallback((clientX) => {
    const rect = trackRef.current.getBoundingClientRect();
    const relX = Math.min(Math.max(clientX - rect.left, 0), rect.width);
    const segFloat = (relX / rect.width) * eras.length;
    const segIndex = Math.min(Math.max(Math.floor(segFloat), 0), eras.length - 1);
    const fraction = segFloat - segIndex;
    const seg = eras[segIndex];
    return Math.round(seg.from + fraction * (seg.to - seg.from));
  }, [eras]);

  const handlePointerDown = (e) => {
    draggingRef.current = true;
    trackRef.current.setPointerCapture(e.pointerId);
    onYearChange(yearFromClientX(e.clientX));
  };
  const handlePointerMove = (e) => {
    if (!draggingRef.current) return;
    onYearChange(yearFromClientX(e.clientX));
  };
  const stopDragging = () => { draggingRef.current = false; };

  const handleKeyDown = (e) => {
    const idx = eras.findIndex((x) => x.s === era.s);
    const span = era.to - era.from;
    const step = Math.max(1, Math.round(span / 40));
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') onYearChange(Math.max(eras[0].from, year - step));
    else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') onYearChange(Math.min(eras[eras.length - 1].to, year + step));
    else if (e.key === 'Home') onYearChange(eras[0].from);
    else if (e.key === 'End') onYearChange(eras[eras.length - 1].to);
    else if (e.key === 'PageUp' && idx > 0) onYearChange(eras[idx - 1].from);
    else if (e.key === 'PageDown' && idx < eras.length - 1) onYearChange(eras[idx + 1].from);
    else return;
    e.preventDefault();
  };

  const segIndex = eras.findIndex((e) => e.s === era.s);
  const fraction = era.to === era.from ? 0 : (year - era.from) / (era.to - era.from);
  const handlePercent = ((segIndex + fraction) / eras.length) * 100;

  return (
    <div className={`atlas-scrubber${collapsed ? ' is-collapsed' : ''}`}>
      <div className="atlas-scrubber-readout">
        <button
          type="button"
          className="atlas-scrubber-play"
          onClick={onTogglePlay}
          aria-label={playing ? 'Pause playing through the eras' : 'Play through the eras'}
        >
          {playing ? <Pause size={14} /> : <Play size={14} />}
        </button>
        <span className="atlas-scrubber-era">{era.n}</span>
        <span className="atlas-scrubber-year">{formatYear(year) || 'Creation'}</span>
        {collapsed ? (
          <button type="button" className="atlas-scrubber-expand" onClick={onExpand} aria-label="Show the time scrubber">
            <ChevronUp size={14} />
          </button>
        ) : (
          <span className="atlas-scrubber-play-spacer" aria-hidden="true" />
        )}
      </div>
      {!collapsed && (
        <>
          <div
            ref={trackRef}
            className="atlas-scrubber-track"
            role="slider"
            tabIndex={0}
            aria-label="Scrub through biblical history"
            aria-valuemin={eras[0].from}
            aria-valuemax={eras[eras.length - 1].to}
            aria-valuenow={year}
            aria-valuetext={`${era.n}, ${formatYear(year) || 'Creation'}`}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={stopDragging}
            onPointerCancel={stopDragging}
            onKeyDown={handleKeyDown}
          >
            {eras.map((e) => (
              <div key={e.s} className={`atlas-scrubber-seg${e.s === era.s ? ' is-active' : ''}`} />
            ))}
            <div className="atlas-scrubber-handle" style={{ left: `${handlePercent}%` }} />
          </div>
          <div className="atlas-scrubber-labels">
            {eras.map((e) => (
              <span key={e.s} className={`atlas-scrubber-label${e.s === era.s ? ' is-active' : ''}`}>{e.n}</span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
