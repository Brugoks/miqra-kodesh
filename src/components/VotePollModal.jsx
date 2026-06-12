import { useState } from 'react';
import { X, BarChart2 } from 'lucide-react';
import './VotePollModal.css';

export default function VotePollModal({ polls, onVote, onClose }) {
  const [activePollId, setActivePollId] = useState(polls[0]?.id || null);
  const [submitting, setSubmitting] = useState(false);

  if (!polls || polls.length === 0) return null;

  const activePoll = polls.find(p => p.id === activePollId) || polls[0];

  const handleVoteClick = async (optionId) => {
    if (submitting) return;
    setSubmitting(true);
    await onVote(activePoll.id, optionId);
    setSubmitting(false);
    
    // Switch to the next remaining poll, or close if none left
    const remaining = polls.filter(p => p.id !== activePoll.id);
    if (remaining.length > 0) {
      setActivePollId(remaining[0].id);
    } else {
      onClose();
    }
  };

  return (
    <div className="vote-modal-overlay animate-fade-in">
      <div className="vote-modal-container animate-scale-in">
        <div className="vote-modal-header">
          <div className="vote-modal-title-group">
            <BarChart2 size={20} style={{ color: 'var(--accent-gold)' }} />
            <h3>Complete Pending Polls</h3>
          </div>
          <button className="vote-modal-close-btn" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        {polls.length > 1 && (
          <div className="vote-modal-tabs">
            {polls.map((p, index) => (
              <button
                key={p.id}
                className={`vote-modal-tab-btn ${p.id === activePoll.id ? 'active' : ''}`}
                onClick={() => setActivePollId(p.id)}
              >
                Poll {index + 1}
              </button>
            ))}
          </div>
        )}

        <div className="vote-modal-body">
          <span className="badge badge-gold" style={{ marginBottom: '0.5rem', display: 'inline-block', alignSelf: 'flex-start' }}>
            {activePoll.groupName || activePoll.group_name}
          </span>
          <h4 className="vote-modal-question">{activePoll.question}</h4>

          <div className="vote-modal-options">
            {activePoll.options.map(opt => (
              <button
                key={opt.id}
                className="vote-modal-option-btn"
                onClick={() => handleVoteClick(opt.id)}
                disabled={submitting}
              >
                {opt.text}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
