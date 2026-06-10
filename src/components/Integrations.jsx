import { useEffect, useMemo, useState } from 'react';
import './Integrations.css';
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Image,
  Link,
  Mail,
  MessageCircle,
  Palette,
  Save,
  Send,
} from 'lucide-react';
import {
  createCanvaAuthUrl,
  createConstantContactAuthUrl,
  getIntegrationStatus,
  integrations,
} from '../lib/integrationConfig';
import {
  canUseIntegrationApi,
  exchangeIntegrationCode,
  getAnnouncementDraft,
  getSavedConnections,
  removeIntegrationConnection,
  runIntegrationAction,
  saveAnnouncementDraft,
} from '../lib/integrationApi';

const defaultDraft = {
  title: 'Wednesday Night Groups',
  audience: 'Students & Parents',
  channel: 'email-sms',
  canvaUrl: '',
  body: 'Join us this Wednesday at 6:30 PM as we continue our small group study and fellowship together.',
};

const getInitialOauthNotice = () => {
  const params = new URLSearchParams(window.location.search);
  const integration = params.get('integration');
  const code = params.get('code');
  const error = params.get('error');

  if (!integration) return null;

  return {
    provider: integration === 'canva' ? 'Canva' : 'Constant Contact',
    status: code ? 'ready' : 'error',
    message: error || (code ? 'Authorization code received' : 'Missing authorization code'),
  };
};

const getOauthPayload = () => {
  const params = new URLSearchParams(window.location.search);
  const integration = params.get('integration');
  const code = params.get('code');

  if (!integration || !code) return null;

  return {
    provider: integration === 'canva' ? 'canva' : 'constant-contact',
    code,
  };
};

export default function Integrations() {
  const [draft, setDraft] = useState(() => {
    const saved = localStorage.getItem('cb_students_announcement_draft');
    if (!saved) return defaultDraft;

    try {
      return { ...defaultDraft, ...JSON.parse(saved) };
    } catch {
      return defaultDraft;
    }
  });
  const [saveState, setSaveState] = useState('idle');
  const [oauthNotice] = useState(getInitialOauthNotice);
  const [connections, setConnections] = useState([]);
  const [connectionError, setConnectionError] = useState('');
  const [isCompletingConnection, setIsCompletingConnection] = useState(false);
  const [isLoadingConnections, setIsLoadingConnections] = useState(canUseIntegrationApi);
  const [providerData, setProviderData] = useState({});
  const [loadingAction, setLoadingAction] = useState('');

  const canvaStatus = getIntegrationStatus('canva');
  const constantContactStatus = getIntegrationStatus('constantContact');
  const oauthPayload = useMemo(() => getOauthPayload(), []);

  useEffect(() => {
    if (!canUseIntegrationApi) return undefined;

    let isMounted = true;

    getSavedConnections()
      .then((savedConnections) => {
        if (isMounted) {
          setConnections(savedConnections);
          setConnectionError('');
        }
      })
      .catch((error) => {
        if (isMounted) setConnectionError(error.message);
      })
      .finally(() => {
        if (isMounted) setIsLoadingConnections(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!canUseIntegrationApi) return undefined;

    let isMounted = true;

    getAnnouncementDraft()
      .then((savedDraft) => {
        if (!isMounted || !savedDraft) return;

        setDraft({
          title: savedDraft.title,
          audience: savedDraft.audience,
          channel: savedDraft.channel,
          canvaUrl: savedDraft.canva_url || '',
          body: savedDraft.body,
        });
      })
      .catch((error) => {
        if (isMounted) setConnectionError(error.message);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const emailPreview = useMemo(() => ({
    subject: `${draft.title} | CB Students`,
    preheader: draft.body.slice(0, 120),
  }), [draft.body, draft.title]);

  const smsPreview = useMemo(() => {
    const linkText = draft.canvaUrl ? ` ${draft.canvaUrl}` : '';
    return `${draft.title}: ${draft.body}${linkText}`.slice(0, 300);
  }, [draft]);

  const updateDraft = (field, value) => {
    setDraft((current) => ({ ...current, [field]: value }));
  };

  const saveDraft = async () => {
    localStorage.setItem('cb_students_announcement_draft', JSON.stringify(draft));

    try {
      if (canUseIntegrationApi) await saveAnnouncementDraft(draft);
      setSaveState('saved');
      setTimeout(() => setSaveState('idle'), 1800);
    } catch (error) {
      setConnectionError(error.message);
    }
  };

  const openCanva = async () => {
    if (!canvaStatus.configured) return;
    window.location.href = await createCanvaAuthUrl();
  };

  const openConstantContact = () => {
    if (!constantContactStatus.configured) return;
    window.location.href = createConstantContactAuthUrl();
  };

  const getConnection = (provider) => {
    return connections.find((connection) => connection.provider === provider);
  };

  const completeConnection = async () => {
    if (!oauthPayload) return;
    setIsCompletingConnection(true);
    setConnectionError('');

    try {
      const isCanva = oauthPayload.provider === 'canva';
      const status = isCanva ? canvaStatus : constantContactStatus;
      const result = await exchangeIntegrationCode({
        provider: oauthPayload.provider,
        code: oauthPayload.code,
        redirectUri: status.redirectUri,
        codeVerifier: isCanva ? sessionStorage.getItem('canva_code_verifier') : undefined,
        scopes: status.scopes,
      });

      setConnections((current) => [
        {
          provider: result.provider,
          expires_at: result.expiresAt,
          scopes: result.scopes,
          updated_at: new Date().toISOString(),
        },
        ...current.filter((connection) => connection.provider !== result.provider),
      ]);

      sessionStorage.removeItem('canva_code_verifier');
      sessionStorage.removeItem('canva_oauth_state');
      sessionStorage.removeItem('constant_contact_oauth_state');
      window.history.replaceState({}, '', window.location.pathname);
    } catch (error) {
      setConnectionError(error.message);
    } finally {
      setIsCompletingConnection(false);
    }
  };

  const disconnect = async (provider) => {
    setConnectionError('');

    try {
      await removeIntegrationConnection(provider);
      setConnections((current) => current.filter((connection) => connection.provider !== provider));
    } catch (error) {
      setConnectionError(error.message);
    }
  };

  const loadProviderData = async (provider, action) => {
    setLoadingAction(`${provider}:${action}`);
    setConnectionError('');

    try {
      const result = await runIntegrationAction({ provider, action });
      setProviderData((current) => ({
        ...current,
        [provider]: result.data,
      }));
    } catch (error) {
      setConnectionError(error.message);
    } finally {
      setLoadingAction('');
    }
  };

  const getCanvaDesigns = () => {
    const data = providerData.canva;
    return data?.items || data?.designs || [];
  };

  const getConstantContactLists = () => {
    const data = providerData['constant-contact'];
    return data?.lists || data?.contact_lists || [];
  };

  return (
    <div className="integrations-page">
      <section className="integrations-header">
        <div>
          <span className="badge badge-gold">Connected Tools</span>
          <h1>Announcement Hub</h1>
        </div>
        <button className="btn-primary integrations-save-button" onClick={saveDraft}>
          <Save size={18} />
          <span>{saveState === 'saved' ? 'Saved' : 'Save Draft'}</span>
        </button>
      </section>

      {oauthNotice && (
        <section className={`integration-alert ${oauthNotice.status}`}>
          {oauthNotice.status === 'ready' ? <CheckCircle2 size={20} /> : <AlertTriangle size={20} />}
          <div>
            <strong>{oauthNotice.provider}</strong>
            <span>{oauthNotice.message}</span>
          </div>
          {oauthPayload && (
            <button
              className="btn-secondary"
              type="button"
              onClick={completeConnection}
              disabled={!canUseIntegrationApi || isCompletingConnection}
            >
              {isCompletingConnection ? 'Connecting...' : 'Complete Connection'}
            </button>
          )}
        </section>
      )}

      {connectionError && (
        <section className="integration-alert error">
          <AlertTriangle size={20} />
          <div>
            <strong>Integration Error</strong>
            <span>{connectionError}</span>
          </div>
        </section>
      )}

      <section className="integration-status-grid">
        <article className="integration-card card card-gold">
          <div className="integration-card-header">
            <div className="integration-icon canva">
              <Palette size={24} />
            </div>
            <div>
              <h2>Canva</h2>
              <span className={`badge ${getConnection('canva') ? 'badge-success' : canvaStatus.configured ? 'badge-info' : 'badge-info'}`}>
                {getConnection('canva') ? 'Connected' : canvaStatus.configured ? 'Ready to Connect' : 'Needs Client ID'}
              </span>
            </div>
          </div>
          <dl className="integration-meta">
            {getConnection('canva') && (
              <div>
                <dt>Saved</dt>
                <dd>{new Date(getConnection('canva').updated_at).toLocaleString()}</dd>
              </div>
            )}
            <div>
              <dt>Redirect</dt>
              <dd>{canvaStatus.redirectUri}</dd>
            </div>
            <div>
              <dt>Scopes</dt>
              <dd>{canvaStatus.scopes}</dd>
            </div>
          </dl>
          <button className="btn-secondary integration-action" disabled={!canvaStatus.configured} onClick={openCanva}>
            <ExternalLink size={17} />
            <span>Connect Canva</span>
          </button>
          {getConnection('canva') && (
            <button className="btn-secondary integration-action" type="button" onClick={() => disconnect('canva')}>
              Disconnect Canva
            </button>
          )}
          {getConnection('canva') && (
            <button
              className="btn-secondary integration-action"
              type="button"
              onClick={() => loadProviderData('canva', 'list-designs')}
              disabled={loadingAction === 'canva:list-designs'}
            >
              {loadingAction === 'canva:list-designs' ? 'Loading...' : 'Load Designs'}
            </button>
          )}
        </article>

        <article className="integration-card card card-gold">
          <div className="integration-card-header">
            <div className="integration-icon contact">
              <Mail size={24} />
            </div>
            <div>
              <h2>Constant Contact</h2>
              <span className={`badge ${getConnection('constant-contact') ? 'badge-success' : constantContactStatus.configured ? 'badge-info' : 'badge-info'}`}>
                {getConnection('constant-contact') ? 'Connected' : constantContactStatus.configured ? 'Ready to Connect' : 'Needs Client ID'}
              </span>
            </div>
          </div>
          <dl className="integration-meta">
            {getConnection('constant-contact') && (
              <div>
                <dt>Saved</dt>
                <dd>{new Date(getConnection('constant-contact').updated_at).toLocaleString()}</dd>
              </div>
            )}
            <div>
              <dt>Redirect</dt>
              <dd>{constantContactStatus.redirectUri}</dd>
            </div>
            <div>
              <dt>Scopes</dt>
              <dd>{constantContactStatus.scopes}</dd>
            </div>
          </dl>
          <button className="btn-secondary integration-action" disabled={!constantContactStatus.configured} onClick={openConstantContact}>
            <ExternalLink size={17} />
            <span>Connect Constant Contact</span>
          </button>
          {getConnection('constant-contact') && (
            <button className="btn-secondary integration-action" type="button" onClick={() => disconnect('constant-contact')}>
              Disconnect Constant Contact
            </button>
          )}
          {getConnection('constant-contact') && (
            <button
              className="btn-secondary integration-action"
              type="button"
              onClick={() => loadProviderData('constant-contact', 'list-contact-lists')}
              disabled={loadingAction === 'constant-contact:list-contact-lists'}
            >
              {loadingAction === 'constant-contact:list-contact-lists' ? 'Loading...' : 'Load Lists'}
            </button>
          )}
        </article>
      </section>

      {(getCanvaDesigns().length > 0 || getConstantContactLists().length > 0) && (
        <section className="integration-results-grid">
          {getCanvaDesigns().length > 0 && (
            <article className="card integration-results">
              <h2>Canva Designs</h2>
              <div className="result-list">
                {getCanvaDesigns().slice(0, 6).map((design) => (
                  <div className="result-row" key={design.id || design.design_id || design.title}>
                    <strong>{design.title || design.name || 'Untitled design'}</strong>
                    <span>{design.id || design.design_id}</span>
                  </div>
                ))}
              </div>
            </article>
          )}

          {getConstantContactLists().length > 0 && (
            <article className="card integration-results">
              <h2>Constant Contact Lists</h2>
              <div className="result-list">
                {getConstantContactLists().slice(0, 6).map((list) => (
                  <div className="result-row" key={list.list_id || list.id || list.name}>
                    <strong>{list.name}</strong>
                    <span>{list.membership_count ?? list.contact_count ?? 0} contacts</span>
                  </div>
                ))}
              </div>
            </article>
          )}
        </section>
      )}

      {isLoadingConnections && (
        <section className="integration-alert">
          <CheckCircle2 size={20} />
          <div>
            <strong>Checking Connections</strong>
            <span>Looking for saved Canva and Constant Contact tokens.</span>
          </div>
        </section>
      )}

      <section className="announcement-workspace">
        <form className="announcement-editor card" onSubmit={(event) => event.preventDefault()}>
          <div className="section-title-row">
            <Image size={22} />
            <h2>Announcement Draft</h2>
          </div>

          <div className="form-grid">
            <label>
              Title
              <input value={draft.title} onChange={(event) => updateDraft('title', event.target.value)} />
            </label>
            <label>
              Audience
              <select value={draft.audience} onChange={(event) => updateDraft('audience', event.target.value)}>
                <option>Students & Parents</option>
                <option>Students</option>
                <option>Parents</option>
                <option>Leaders</option>
                <option>All CB Students Contacts</option>
              </select>
            </label>
            <label>
              Channel
              <select value={draft.channel} onChange={(event) => updateDraft('channel', event.target.value)}>
                <option value="email-sms">Email + Text</option>
                <option value="email">Email Only</option>
                <option value="sms">Text Only</option>
              </select>
            </label>
            <label>
              Canva Link
              <input
                value={draft.canvaUrl}
                onChange={(event) => updateDraft('canvaUrl', event.target.value)}
                placeholder="https://www.canva.com/design/..."
              />
            </label>
          </div>

          <label>
            Message
            <textarea rows="7" value={draft.body} onChange={(event) => updateDraft('body', event.target.value)} />
          </label>
        </form>

        <aside className="announcement-preview">
          <div className="preview-panel card">
            <div className="section-title-row">
              <Mail size={20} />
              <h2>Email</h2>
            </div>
            <div className="preview-block">
              <span>Subject</span>
              <strong>{emailPreview.subject}</strong>
            </div>
            <div className="preview-block">
              <span>Preview</span>
              <p>{emailPreview.preheader}</p>
            </div>
            {draft.canvaUrl && (
              <a href={draft.canvaUrl} target="_blank" rel="noreferrer" className="asset-link">
                <Link size={16} />
                <span>Canva design</span>
              </a>
            )}
          </div>

          <div className="preview-panel card">
            <div className="section-title-row">
              <MessageCircle size={20} />
              <h2>Text</h2>
            </div>
            <p className="sms-preview">{smsPreview}</p>
            <div className="sms-count">{smsPreview.length}/300</div>
          </div>

          <button className="btn-primary send-button" disabled>
            <Send size={18} />
            <span>Prepare Campaign</span>
          </button>
        </aside>
      </section>

      <section className="integration-env card">
        <h2>Setup Keys</h2>
        <div className="env-grid">
          <code>VITE_CANVA_CLIENT_ID</code>
          <code>VITE_CONSTANT_CONTACT_CLIENT_ID</code>
          <code>VITE_CANVA_REDIRECT_URI</code>
          <code>VITE_CONSTANT_CONTACT_REDIRECT_URI</code>
        </div>
        <p>
          Canva redirect: <strong>{integrations.canva.redirectUri}</strong>
        </p>
        <p>
          Constant Contact redirect: <strong>{integrations.constantContact.redirectUri}</strong>
        </p>
      </section>
    </div>
  );
}
