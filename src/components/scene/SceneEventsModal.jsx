import { useState } from 'react';
import { X, ScrollText, BookOpen, MapPin } from 'lucide-react';
import { TIMES_OF_DAY } from './sceneLighting';
import './ScenePlacesModal.css';

const hourLabel = (id) => TIMES_OF_DAY.find((time) => time.id === id)?.label || null;

// What happened here, in narrative order. Choosing an event
// stages it — only one is staged at a time — sets its hour and takes the
// visitor to where it can be seen (see Scene.jsx playEvent).
export default function SceneEventsModal({ scene, activeId, onSelect, onClose }) {
  const [era, setEra] = useState('');
  if (!scene?.events?.length) return null;
  const eras = [...new Set(scene.events.map((event) => event.era).filter(Boolean))];
  const selectedEra = eras.includes(era) ? era : '';

  return (
    <div className="scene-modal-backdrop" role="dialog" aria-modal="true" aria-label="What happened here">
      <div className="scene-modal-card">
        <div className="scene-modal-header">
          <h3 className="scene-modal-title">What happened here — {scene.title}</h3>
          <button type="button" className="scene-modal-close" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="scene-modal-body">
          <div className="scene-modal-section">
            <h4 className="scene-modal-section-title">
              <ScrollText size={14} /> {scene.eventsHeading || 'In the order the gospels tell them'}
            </h4>
            {eras.length > 0 && (
              <label className="scene-event-filter">
                Explore a chapter
                <select value={selectedEra} onChange={(event) => setEra(event.target.value)}>
                  <option value="">All episodes ({scene.events.length})</option>
                  {eras.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <ol className="scene-modal-list scene-events-list">
              {scene.events.map(
                (event, index) =>
                  (!selectedEra || event.era === selectedEra) && (
                    <li key={event.id}>
                      <button
                        type="button"
                        className={`scene-modal-item scene-event-item${event.id === activeId ? ' scene-event-item--active' : ''}`}
                        aria-current={event.id === activeId ? 'true' : undefined}
                        onClick={() => onSelect?.(event)}
                      >
                        <div className="scene-modal-item-label">
                          <span className="scene-event-number">{index + 1}</span> {event.label}
                          {event.id === activeId && <span className="scene-event-now">Showing now</span>}
                        </div>
                        <div className="scene-event-where">
                          <MapPin size={11} /> {event.place}
                          {hourLabel(event.hour) && <> · {hourLabel(event.hour)}</>}
                        </div>
                        {event.era && <div className="scene-event-where">{event.era}</div>}
                        <div className="scene-modal-item-refs">
                          <BookOpen size={12} /> {event.refs.join(', ')}
                        </div>
                      </button>
                    </li>
                  ),
              )}
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}
