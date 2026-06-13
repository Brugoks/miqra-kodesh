import { useState } from 'react';
import { BookOpen } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';

export default function Auth() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [mode, setMode] = useState('sign-in');
  const [status, setStatus] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setIsSubmitting(true);
    setStatus('');

    if (mode === 'sign-up') {
      const { data: org, error: orgError } = await supabase
        .from('organizations')
        .select('id, name')
        .eq('invite_code', inviteCode.trim())
        .maybeSingle();

      if (orgError || !org) {
        setStatus('Invalid organization join code. Please check with your leader.');
        setIsSubmitting(false);
        return;
      }
    }

    const authAction = mode === 'sign-up'
      ? supabase.auth.signUp({
          email,
          password,
          options: {
            data: { invite_code: inviteCode.trim() }
          }
        })
      : supabase.auth.signInWithPassword({ email, password });

    const { error } = await authAction;

    if (error) {
      setStatus(error.message);
    } else if (mode === 'sign-up') {
      setStatus('Account created. Check your email if confirmation is enabled.');
    }

    setIsSubmitting(false);
  };

  const handleForgotPassword = async (event) => {
    event.preventDefault();
    setIsSubmitting(true);
    setStatus('');

    const redirectTo = `${window.location.origin}?recovery=true`;
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });

    if (error) {
      setStatus(error.message);
    } else {
      setStatus('Password reset link sent to your email!');
    }
    setIsSubmitting(false);
  };

  const handleOAuthSignIn = async (provider) => {
    setStatus('');
    if (mode === 'sign-up') {
      if (!inviteCode.trim()) {
        setStatus('Please enter an organization join code before signing up.');
        return;
      }
      const { data: org, error: orgError } = await supabase
        .from('organizations')
        .select('id')
        .eq('invite_code', inviteCode.trim())
        .maybeSingle();

      if (orgError || !org) {
        setStatus('Invalid organization join code. Please check with your leader.');
        return;
      }
      localStorage.setItem('pending_invite_code', inviteCode.trim());
    }

    const redirectTo = window.location.origin;
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo },
    });
    if (error) setStatus(error.message);
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      backgroundColor: 'var(--bg-primary)',
      padding: '1.5rem'
    }}>
      <div style={{
        maxWidth: '420px',
        width: '100%',
        backgroundColor: 'var(--bg-secondary)',
        border: '1px solid var(--border-color)',
        borderRadius: '12px',
        padding: '2.5rem 2rem',
        boxShadow: 'var(--shadow-lg)'
      }}>
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          marginBottom: '2rem'
        }}>
          <div style={{
            width: '60px',
            height: '60px',
            borderRadius: '50%',
            backgroundColor: 'var(--accent-gold-light)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '0.75rem'
          }}>
            <BookOpen size={30} style={{ color: 'var(--accent-gold)' }} />
          </div>
          <h2 style={{ fontFamily: 'var(--font-heading)', color: 'var(--text-primary)', marginBottom: '0.25rem', fontWeight: 'bold' }}>Students Portal</h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', textAlign: 'center', margin: 0 }}>
            Miqra Kodesh Student Small Groups
          </p>
        </div>

        {mode !== 'forgot-password' && (
          <>
            {/* Google Sign In */}
            <button
              type="button"
              onClick={() => handleOAuthSignIn('google')}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.65rem',
                padding: '0.65rem 1rem',
                border: '1.5px solid var(--border-color)',
                borderRadius: '8px',
                backgroundColor: '#fff',
                color: '#3c4043',
                fontWeight: 600,
                fontSize: '0.95rem',
                cursor: 'pointer',
                marginBottom: '1.25rem',
                boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                transition: 'box-shadow 0.15s, border-color 0.15s',
              }}
              onMouseEnter={e => e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)'}
              onMouseLeave={e => e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.08)'}
            >
              {/* Google "G" SVG logo */}
              <svg width="20" height="20" viewBox="0 0 48 48">
                <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
                <path fill="none" d="M0 0h48v48H0z"/>
              </svg>
              Continue with Google
            </button>

            <button
              type="button"
              onClick={() => handleOAuthSignIn('facebook')}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.65rem',
                padding: '0.65rem 1rem',
                border: '1.5px solid #1877f2',
                borderRadius: '8px',
                backgroundColor: '#1877f2',
                color: '#ffffff',
                fontWeight: 700,
                fontSize: '0.95rem',
                cursor: 'pointer',
                marginBottom: '1.25rem',
                boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                transition: 'box-shadow 0.15s, background-color 0.15s',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.18)';
                e.currentTarget.style.backgroundColor = '#166fe5';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.08)';
                e.currentTarget.style.backgroundColor = '#1877f2';
              }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  fill="#ffffff"
                  d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.41c0-3.025 1.792-4.697 4.533-4.697 1.312 0 2.686.236 2.686.236v2.971H15.83c-1.491 0-1.955.932-1.955 1.887v2.266h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z"
                />
              </svg>
              Continue with Facebook
            </button>

            {/* Divider */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
              <div style={{ flex: 1, height: '1px', backgroundColor: 'var(--border-color)' }} />
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>or sign in with email</span>
              <div style={{ flex: 1, height: '1px', backgroundColor: 'var(--border-color)' }} />
            </div>
          </>
        )}

        <form onSubmit={mode === 'forgot-password' ? handleForgotPassword : handleSubmit} style={{ display: 'grid', gap: '1rem' }}>
          <label style={{ display: 'grid', gap: '0.4rem', color: 'var(--text-secondary)', fontWeight: 700, fontSize: '0.85rem' }}>
            Email
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
          </label>

          {mode !== 'forgot-password' && (
            <label style={{ display: 'grid', gap: '0.4rem', color: 'var(--text-secondary)', fontWeight: 700, fontSize: '0.85rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>Password</span>
                {mode === 'sign-in' && (
                  <button
                    type="button"
                    onClick={() => { setMode('forgot-password'); setStatus(''); }}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--accent-gold)',
                      fontSize: '0.8rem',
                      cursor: 'pointer',
                      padding: 0,
                      fontWeight: 600
                    }}
                  >
                    Forgot Password?
                  </button>
                )}
              </div>
              <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={6} />
            </label>
          )}

          {mode === 'sign-up' && (
            <label style={{ display: 'grid', gap: '0.4rem', color: 'var(--text-secondary)', fontWeight: 700, fontSize: '0.85rem' }}>
              Organization Join Code
              <input
                type="text"
                value={inviteCode}
                onChange={(event) => setInviteCode(event.target.value)}
                required
                placeholder="Enter your organization's join code"
              />
            </label>
          )}

          {status && (
            <p style={{ color: (status.includes('created') || status.includes('sent')) ? 'var(--success-green)' : '#dc2626', fontSize: '0.9rem' }}>
              {status}
            </p>
          )}

          <button className="btn-primary" type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Working...' : mode === 'sign-up' ? 'Create Account' : mode === 'forgot-password' ? 'Send Reset Link' : 'Sign In'}
          </button>
        </form>

        {mode === 'forgot-password' ? (
          <button
            className="btn-secondary"
            type="button"
            onClick={() => { setMode('sign-in'); setStatus(''); }}
            style={{ width: '100%', marginTop: '1rem' }}
          >
            Back to Sign In
          </button>
        ) : (
          <button
            className="btn-secondary"
            type="button"
            onClick={() => { setMode((current) => current === 'sign-up' ? 'sign-in' : 'sign-up'); setStatus(''); }}
            style={{ width: '100%', marginTop: '1rem' }}
          >
            {mode === 'sign-up' ? 'Use Existing Account' : 'Create New Account'}
          </button>
        )}
      </div>
    </div>
  );
}

export function ResetPassword({ onComplete }) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [status, setStatus] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (password !== confirmPassword) {
      setStatus("Passwords do not match.");
      return;
    }
    setIsSubmitting(true);
    setStatus('');

    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      setStatus(error.message);
    } else {
      setStatus('Password updated successfully!');
      setTimeout(() => {
        onComplete();
      }, 1500);
    }
    setIsSubmitting(false);
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      backgroundColor: 'var(--bg-primary)',
      padding: '1.5rem'
    }}>
      <div style={{
        maxWidth: '420px',
        width: '100%',
        backgroundColor: 'var(--bg-secondary)',
        border: '1px solid var(--border-color)',
        borderRadius: '12px',
        padding: '2.5rem 2rem',
        boxShadow: 'var(--shadow-lg)'
      }}>
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          marginBottom: '2rem'
        }}>
          <div style={{
            width: '60px',
            height: '60px',
            borderRadius: '50%',
            backgroundColor: 'var(--accent-gold-light)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '0.75rem'
          }}>
            <BookOpen size={30} style={{ color: 'var(--accent-gold)' }} />
          </div>
          <h2 style={{ fontFamily: 'var(--font-heading)', color: 'var(--text-primary)', marginBottom: '0.25rem', fontWeight: 'bold' }}>Update Password</h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', textAlign: 'center', margin: 0 }}>
            Enter your new password below.
          </p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '1rem' }}>
          <label style={{ display: 'grid', gap: '0.4rem', color: 'var(--text-secondary)', fontWeight: 700, fontSize: '0.85rem' }}>
            New Password
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              minLength={6}
            />
          </label>

          <label style={{ display: 'grid', gap: '0.4rem', color: 'var(--text-secondary)', fontWeight: 700, fontSize: '0.85rem' }}>
            Confirm New Password
            <input
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              required
              minLength={6}
            />
          </label>

          {status && (
            <p style={{ color: status.includes('successfully') ? 'var(--success-green)' : '#dc2626', fontSize: '0.9rem' }}>
              {status}
            </p>
          )}

          <button className="btn-primary" type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Updating...' : 'Update Password'}
          </button>
        </form>
      </div>
    </div>
  );
}
