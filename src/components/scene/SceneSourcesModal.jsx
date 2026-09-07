import { X, BookOpen } from 'lucide-react';
import { SCENE_SOURCES_DATA } from './sceneSourcesData';
import './ScenePlacesModal.css';

export default function SceneSourcesModal({ scene, sceneSlug, onClose }) {
  const slug = scene?.slug || sceneSlug;
  if (!slug) return null;
  const title = scene?.title || (slug ? slug.charAt(0).toUpperCase() + slug.slice(1) : '');
  const sources = SCENE_SOURCES_DATA[slug] || [];

  return (
    <div className="scene-modal-backdrop" role="dialog" aria-modal="true" aria-label="Historical evidence and sources">
      <div className="scene-modal-card">
        <div className="scene-modal-header">
          <h3 className="scene-modal-title">How We Know — {title}</h3>
          <button type="button" className="scene-modal-close" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="scene-modal-body">
          <p style={{ margin: 0, fontSize: '0.8125rem', color: '#a0a0a8', lineHeight: 1.4 }}>
            Reconstruction claims in Miqra Kodesh are linked to archaeological excavations, primary
            texts, and contextual evidence.
          </p>

          <div className="scene-modal-list">
            {sources.map((src) => (
              <div key={src.id} className="scene-modal-item" style={{ cursor: 'default' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span className="scene-modal-item-label" style={{ margin: 0 }}>{src.claim}</span>
                  <span
                    style={{
                      fontSize: '0.6875rem',
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                      padding: '2px 6px',
                      borderRadius: '4px',
                      background: src.certainty === 'attested' ? 'rgba(70, 160, 90, 0.2)' : 'rgba(210, 160, 50, 0.2)',
                      color: src.certainty === 'attested' ? '#70d085' : '#e0b850',
                    }}
                  >
                    {src.certainty}
                  </span>
                </div>
                <div className="scene-modal-item-blurb">{src.detail}</div>
                <div className="scene-modal-item-refs" style={{ color: '#90a0b0' }}>
                  <BookOpen size={12} /> {src.source}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
