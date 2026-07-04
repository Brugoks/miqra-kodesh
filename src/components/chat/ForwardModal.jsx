import { Forward, Hash, Lock, X } from 'lucide-react';
import { previewText } from './chatUtils';

export default function ForwardModal({ channels, message, onClose, onForward }) {
  if (!message) return null;

  return (
    <div className="chat-modal-overlay" role="presentation" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="chat-modal card" role="dialog" aria-modal="true" aria-label="Forward message">
        <div className="chat-modal-form">
          <div className="chat-modal-head">
            <h2>Forward Message</h2>
            <button type="button" className="chat-modal-close" onClick={onClose} aria-label="Close"><X size={18} /></button>
          </div>
          <div className="chat-forward-preview">
            <Forward size={15} />
            <span>{previewText(message).slice(0, 140) || 'Attachment'}</span>
          </div>
          <div className="chat-forward-list">
            {channels.map((channel) => (
              <button key={channel.id} type="button" onClick={() => onForward(channel.id)}>
                {channel.is_private ? <Lock size={14} /> : <Hash size={15} />}
                <span>{channel.name}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
