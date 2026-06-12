import { useState } from 'react';
import { BarChart2, ChevronDown } from 'lucide-react';
import './FloatingPollNotification.css';

export default function FloatingPollNotification({ polls, onVoteNow }) {
  const [minimized, setMinimized] = useState(false);

  if (!polls || polls.length === 0) return null;

  const handleVoteNowClick = () => {
    onVoteNow();
  };

  if (minimized) {
    return (
      <div 
        className="floating-poll-badge animate-slide-in"
        onClick={() => setMinimized(false)}
        title={`You have ${polls.length} pending poll${polls.length > 1 ? 's' : ''}! Click to expand.`}
      >
        <BarChart2 size={20} />
        <span className="floating-poll-badge-count">{polls.length}</span>
      </div>
    );
  }

  return (
    <div className="floating-poll-card animate-slide-in">
      <div className="floating-poll-header">
        <div className="floating-poll-title">
          <BarChart2 size={16} style={{ color: 'var(--accent-gold)' }} />
          <span>{polls.length === 1 ? 'Pending Poll' : 'Pending Polls'}</span>
        </div>
        <button 
          className="floating-poll-close-btn"
          onClick={() => setMinimized(true)}
          title="Minimize notification"
        >
          <ChevronDown size={16} />
        </button>
      </div>

      <div className="floating-poll-body">
        {polls.length === 1 ? (
          <p className="floating-poll-desc">
            Your group <strong>{polls[0].groupName || polls[0].group_name}</strong> has an active poll:
            <span className="floating-poll-question">"{polls[0].question}"</span>
          </p>
        ) : (
          <p className="floating-poll-desc">
            You have <strong>{polls.length}</strong> active polls in your groups that need your response.
          </p>
        )}
      </div>

      <div className="floating-poll-actions">
        <button className="btn-primary floating-poll-vote-btn" onClick={handleVoteNowClick}>
          Vote Now
        </button>
      </div>
    </div>
  );
}
