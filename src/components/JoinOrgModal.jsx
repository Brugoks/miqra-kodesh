import { useState } from 'react';
import { Building, X } from 'lucide-react';

export default function JoinOrgModal({ onJoin, onClose }) {
  const [code, setCode] = useState('');
  const [status, setStatus] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!code.trim()) return;

    setIsSubmitting(true);
    setStatus('');

    try {
      const org = await onJoin(code.trim());
      setStatus(`Joined ${org.name}!`);
      setTimeout(() => onClose(), 1200);
    } catch (err) {
      setStatus(err.message || 'Failed to join organization.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const isSuccess = status.startsWith('Joined');

  return (
    <>
      <div
        data-testid="join-org-backdrop"
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 100 }}
      />
      <div
        role="dialog"
        aria-label="Join Organization"
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 101,
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border-color)',
          borderRadius: '12px',
          padding: '2rem',
          width: '100%',
          maxWidth: '400px',
          boxShadow: 'var(--shadow-lg)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Building size={20} style={{ color: 'var(--accent-gold)' }} />
            <h3 style={{ margin: 0, fontFamily: 'var(--font-heading)', color: 'var(--text-primary)', fontSize: '1.1rem' }}>
              Join Organization
            </h3>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text-muted)',
              padding: '0.25rem',
              borderRadius: '6px',
            }}
          >
            <X size={18} />
          </button>
        </div>

        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '0 0 1.25rem' }}>
          Enter the join code provided by your organization leader.
        </p>

        <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '1rem' }}>
          <label style={{ display: 'grid', gap: '0.4rem', color: 'var(--text-secondary)', fontWeight: 700, fontSize: '0.85rem' }}>
            Join Code
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="e.g. CBC-STUDENTS-2026"
              required
              autoFocus
              style={{ textTransform: 'uppercase' }}
            />
          </label>

          {status && (
            <p style={{ color: isSuccess ? 'var(--success-green)' : '#dc2626', fontSize: '0.9rem', margin: 0 }}>
              {status}
            </p>
          )}

          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
            <button type="button" className="btn-secondary" onClick={onClose} style={{ padding: '0.5rem 1rem' }}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={isSubmitting || !code.trim()} style={{ padding: '0.5rem 1.25rem' }}>
              {isSubmitting ? 'Joining...' : 'Join'}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
