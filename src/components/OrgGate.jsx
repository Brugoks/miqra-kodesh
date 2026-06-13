import { useState } from 'react';
import { BookOpen, LogOut } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';

export default function OrgGate({ onJoin, onSignOut }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const trimmed = code.trim();
    if (!trimmed) return;
    setError('');
    setLoading(true);
    try {
      await onJoin(trimmed);
    } catch (err) {
      setError(err.message || 'Invalid join code. Please check with your leader.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      backgroundColor: 'var(--bg-primary)',
      padding: '1.5rem',
    }}>
      <div style={{
        maxWidth: '400px',
        width: '100%',
        backgroundColor: 'var(--bg-secondary)',
        border: '1px solid var(--border-color)',
        borderRadius: '14px',
        padding: '2.5rem 2rem',
        boxShadow: 'var(--shadow-lg)',
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '2rem' }}>
          <div style={{
            width: '60px', height: '60px', borderRadius: '50%',
            backgroundColor: 'var(--accent-gold-light)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            marginBottom: '0.75rem',
          }}>
            <BookOpen size={28} style={{ color: 'var(--accent-gold)' }} />
          </div>
          <h2 style={{ fontFamily: 'var(--font-heading)', color: 'var(--text-primary)', marginBottom: '0.4rem', fontWeight: 'bold', textAlign: 'center' }}>
            Welcome!
          </h2>
          <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', textAlign: 'center', margin: 0, lineHeight: 1.5 }}>
            Enter the organization join code your leader provided to access your group's portal.
          </p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Organization Join Code
            </label>
            <input
              value={code}
              onChange={(e) => { setCode(e.target.value); setError(''); }}
              placeholder="Enter your join code"
              autoComplete="off"
              autoFocus
              style={{
                width: '100%',
                padding: '0.65rem 0.85rem',
                borderRadius: '8px',
                border: `1.5px solid ${error ? '#dc2626' : 'var(--border-color)'}`,
                backgroundColor: 'var(--bg-primary)',
                color: 'var(--text-primary)',
                fontSize: '1rem',
                letterSpacing: '0.05em',
                boxSizing: 'border-box',
                outline: 'none',
              }}
            />
            {error && (
              <p style={{ margin: '0.4rem 0 0', fontSize: '0.82rem', color: '#dc2626' }}>{error}</p>
            )}
          </div>

          <button
            type="submit"
            disabled={loading || !code.trim()}
            className="btn-primary"
            style={{ width: '100%', padding: '0.7rem', fontSize: '0.95rem', marginTop: '0.25rem' }}
          >
            {loading ? 'Joining…' : 'Join Organization'}
          </button>
        </form>

        <button
          type="button"
          onClick={onSignOut}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem',
            width: '100%', marginTop: '1.25rem', padding: '0.5rem',
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--text-muted)', fontSize: '0.83rem',
          }}
        >
          <LogOut size={14} />
          Sign out and use a different account
        </button>
      </div>
    </div>
  );
}
