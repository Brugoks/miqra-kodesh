import { X, MapPin, Compass, BookOpen } from 'lucide-react';
import './ScenePlacesModal.css';

export default function ScenePlacesModal({ scene, onSelectVantage, onSelectHotspot, onClose }) {
  if (!scene) return null;

  return (
    <div className="scene-modal-backdrop" role="dialog" aria-modal="true" aria-label="Places and stories">
      <div className="scene-modal-card">
        <div className="scene-modal-header">
          <h3 className="scene-modal-title">Places & Stories — {scene.title}</h3>
          <button type="button" className="scene-modal-close" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="scene-modal-body">
          <div className="scene-modal-section">
            <h4 className="scene-modal-section-title"><Compass size={14} /> Guided Vantages</h4>
            <div className="scene-modal-list">
              {(scene.vantages || []).map((v) => (
                <button
                  key={v.id}
                  type="button"
                  className="scene-modal-item"
                  onClick={() => {
                    onSelectVantage?.(v);
                    onClose();
                  }}
                >
                  <div className="scene-modal-item-label">{v.label}</div>
                  <div className="scene-modal-item-blurb">{v.blurb}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="scene-modal-section">
            <h4 className="scene-modal-section-title"><MapPin size={14} /> Landmarks & Historical Hotspots</h4>
            <div className="scene-modal-list">
              {(scene.hotspots || []).map((h) => (
                <button
                  key={h.id}
                  type="button"
                  className="scene-modal-item"
                  onClick={() => {
                    onSelectHotspot?.(h);
                    onClose();
                  }}
                >
                  <div className="scene-modal-item-label">{h.label}</div>
                  <div className="scene-modal-item-blurb">{h.body}</div>
                  {h.refs && h.refs.length > 0 && (
                    <div className="scene-modal-item-refs">
                      <BookOpen size={12} /> {h.refs.join(', ')}
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
