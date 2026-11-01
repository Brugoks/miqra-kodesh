import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';

export default function CanvasOAuthConsent() {
  const authorizationId = new URLSearchParams(window.location.search).get('authorization_id');
  const [details, setDetails] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let cancelled = false;
    if (!authorizationId || !supabase) return;
    supabase.auth.oauth.getAuthorizationDetails(authorizationId).then(({ data, error }) => {
      if (cancelled) return;
      if (error || !data) setError('This authorization request is invalid or expired. Reconnect from ChatGPT.');
      else if ('redirect_url' in data) window.location.assign(data.redirect_url);
      else setDetails(data);
    }).catch(() => { if (!cancelled) setError('Could not load this authorization request.'); });
    return () => { cancelled = true; };
  }, [authorizationId]);
  async function decide(approve) {
    setBusy(true); setError('');
    try {
      const { data, error } = await supabase.auth.oauth[approve ? 'approveAuthorization' : 'denyAuthorization'](authorizationId, { skipBrowserRedirect: true });
      if (error || !data?.redirect_url) throw new Error('Could not finish authorization. Try reconnecting from ChatGPT.');
      window.location.assign(data.redirect_url);
    } catch (e) { setError(e.message); setBusy(false); }
  }
  return <main className="study-canvas"><section className="card">
    <h1>Connect Living Canvas</h1>
    <p>{details?.client?.name || 'The requesting application'} wants to connect to your Miqra Qodesh account.</p>
    <p>This lets the application discover, read and edit your personal canvases, including private journal entries. Connect only an application you trust.</p>
    <p>Publishing is a separate action that needs your explicit approval for selected cards. Prayers, personal reflections and the original glimpse stay private.</p>
    {details && <p>Requested identity permissions: {details.scope || 'Default identity access'}</p>}
    {details && <p>Return address: {details.redirect_uri}</p>}
    {error && <p role="alert">{error}</p>}
    {!authorizationId ? <p role="alert">Missing authorization request. Start the connection from ChatGPT.</p> : !details && !error ? <p role="status">Loading connection details…</p> : null}
    <button className="btn-primary" disabled={!details || busy} onClick={() => decide(true)}>Connect account</button>{' '}
    <button className="btn-secondary" disabled={!details || busy} onClick={() => decide(false)}>Decline</button>
  </section></main>;
}
