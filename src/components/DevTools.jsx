import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase, hasSupabaseConfig } from '../lib/supabaseClient';
import {
  AlertTriangle,
  CheckCircle2,
  Code2,
  Database,
  Gauge,
  HardDrive,
  Info,
  Mail,
  Plug,
  RefreshCw,
  Users,
  Zap,
} from 'lucide-react';
import './DevTools.css';

const MB = 1024 * 1024;
const GB = 1024 * MB;

const LIMITS = {
  supabaseDatabaseBytes: 500 * MB,
  supabaseStorageBytes: 1 * GB,
  supabaseMonthlyActiveUsers: 50000,
  supabaseEdgeInvocationsMonthly: 500000,
  apiBibleMonthlyCalls: 5000,
  constantContactDailyCalls: 10000,
  canvaListDesignsPerMinute: 100,
  youtubeSearchDailyCalls: 100,
  geminiFlashLiteRequestsPerMinute: 15,
  geminiFlashLiteInputTokensPerMinute: 250000,
  geminiFlashLiteRequestsPerDay: 1000,
  resendMonthlyEmails: 3000,
  resendDailyEmails: 100,
};

const API_PROVIDERS = [
  {
    key: 'api-bible',
    name: 'API.Bible',
    limitLabel: 'Starter plan: 5,000 calls / month',
    period: 'month',
    limit: LIMITS.apiBibleMonthlyCalls,
    description: 'Used by Bible passage and Strong’s tagged passage lookups.',
  },
  {
    key: 'constant-contact',
    name: 'Constant Contact',
    limitLabel: 'V3 API: 10,000 requests / day, 4 requests / second',
    period: 'today',
    limit: LIMITS.constantContactDailyCalls,
    description: 'Used by OAuth token exchange and contact-list reads.',
  },
  {
    key: 'canva',
    name: 'Canva Connect',
    limitLabel: 'List designs: 100 requests / minute / user',
    period: 'minute',
    limit: LIMITS.canvaListDesignsPerMinute,
    description: 'Used by OAuth token exchange and design-list reads.',
  },
  {
    key: 'youtube',
    name: 'YouTube Data API',
    limitLabel: 'Default app quota includes 100 search.list calls / day',
    period: 'today',
    limit: LIMITS.youtubeSearchDailyCalls,
    description: 'Used by BibleProject resource search.',
  },
  {
    key: 'cloudflare-ai',
    name: 'Cloudflare Workers AI',
    limitLabel: 'Free allocation is measured in neurons, not raw calls',
    period: 'today',
    limit: null,
    description: 'Used by scripture image generation. Check Cloudflare for neuron usage.',
  },
  {
    key: 'groq',
    name: 'Groq',
    limitLabel: 'Limits are account/model-specific',
    period: 'today',
    limit: null,
    description: 'Used by AI text generation through hf-proxy.',
  },
  {
    key: 'huggingface',
    name: 'Hugging Face',
    limitLabel: 'Inference Providers monthly credits',
    period: 'month',
    limit: null,
    quotaMetrics: [
      {
        label: 'Inference spend this month',
        usageKey: 'spentUsd',
        limitKey: 'monthlyCreditUsd',
        source: 'billing',
        format: 'currency',
      },
    ],
    description: 'Free accounts include $0.10/month; PRO accounts include $2/month. TTS, embeddings, similarity, and optional chat inference all draw from these credits.',
  },
  {
    key: 'gemini',
    name: 'Google Gemini',
    limitLabel: 'Gemini 2.5 Flash-Lite free-tier baseline',
    period: 'today',
    limit: LIMITS.geminiFlashLiteRequestsPerDay,
    quotaMetrics: [
      {
        label: 'Requests / minute',
        usageKey: 'lastMinuteCalls',
        limit: LIMITS.geminiFlashLiteRequestsPerMinute,
      },
      {
        label: 'Input tokens / minute',
        usageKey: 'lastMinuteUnits',
        limit: LIMITS.geminiFlashLiteInputTokensPerMinute,
      },
      {
        label: 'Requests / day',
        usageKey: 'todayCalls',
        limit: LIMITS.geminiFlashLiteRequestsPerDay,
      },
    ],
    description: 'Free tier: 15 RPM, 250K input TPM, and 1,000 RPD. Quotas apply per Google Cloud project and may vary; AI Studio is authoritative.',
  },
  {
    key: 'resend',
    name: 'Resend',
    limitLabel: 'Free tier: 3,000 emails / month, 100 / day',
    period: 'month',
    limit: LIMITS.resendMonthlyEmails,
    description: 'Transactional email (notifications). See the Resend page for daily limits and toggles.',
  },
];

const EMPTY_OBJECT = {};

const formatBytes = (bytes = 0) => {
  if (!Number.isFinite(bytes)) return '0 B';
  if (bytes >= GB) return `${(bytes / GB).toFixed(2)} GB`;
  if (bytes >= MB) return `${(bytes / MB).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
};

const formatNumber = (value = 0) => new Intl.NumberFormat('en-US').format(Number(value) || 0);
const formatCurrency = (value = 0) => new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
}).format(Number(value) || 0);

const usageForPeriod = (usage, period) => {
  if (period === 'month') return Number(usage?.monthCalls || 0);
  if (period === 'minute') return Number(usage?.lastMinuteCalls || 0);
  return Number(usage?.todayCalls || 0);
};

const percentUsed = (used, limit) => {
  if (!limit) return null;
  return Math.min(100, Math.round((used / limit) * 1000) / 10);
};

const statusForPercent = (percent) => {
  if (percent == null) return { label: 'Tracked', tone: 'info', icon: Info };
  if (percent >= 90) return { label: 'Critical', tone: 'danger', icon: AlertTriangle };
  if (percent >= 75) return { label: 'Watch', tone: 'warn', icon: AlertTriangle };
  return { label: 'Healthy', tone: 'good', icon: CheckCircle2 };
};

const formatLastEvent = (value) => {
  if (!value) return 'No events yet';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'No events yet';
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
};

function Meter({ used, limit }) {
  const percent = percentUsed(used, limit);
  return (
    <div className="dev-meter" aria-label={percent == null ? 'Usage tracked' : `${percent}% used`}>
      <span style={{ width: `${percent ?? 100}%` }} className={percent == null ? 'unknown' : ''} />
    </div>
  );
}

function LimitCard({ icon: Icon, title, used, limit, helper, unit = '', soft = false }) {
  const percent = percentUsed(used, limit);
  const status = statusForPercent(percent);
  const StatusIcon = status.icon;
  return (
    <article className={`dev-limit-card ${status.tone}`}>
      <div className="dev-limit-head">
        <div className="dev-limit-icon"><Icon size={18} /></div>
        <span className={`dev-status ${status.tone}`}>
          <StatusIcon size={13} />
          {soft ? 'Lower bound' : status.label}
        </span>
      </div>
      <h3>{title}</h3>
      <div className="dev-limit-value">
        <strong>{unit === 'bytes' ? formatBytes(used) : formatNumber(used)}</strong>
        {limit ? <span> / {unit === 'bytes' ? formatBytes(limit) : formatNumber(limit)}</span> : null}
      </div>
      <Meter used={used} limit={limit} />
      <p>{helper}</p>
    </article>
  );
}

function ApiCard({ provider, usage, billing }) {
  const used = usageForPeriod(usage, provider.period);
  const quotaMetrics = provider.quotaMetrics?.map((metric) => {
    const source = metric.source === 'billing' ? billing : usage;
    const metricUsed = Number(source?.[metric.usageKey] || 0);
    const metricLimit = Number(
      metric.limitKey ? source?.[metric.limitKey] : metric.limit,
    ) || null;
    return {
      ...metric,
      used: metricUsed,
      limit: metricLimit,
      percent: percentUsed(metricUsed, metricLimit),
    };
  });
  const percent = quotaMetrics?.length
    ? Math.max(...quotaMetrics.map((metric) => metric.percent ?? 0))
    : percentUsed(used, provider.limit);
  const status = statusForPercent(percent);
  const StatusIcon = status.icon;
  const callsLabel = provider.period === 'month'
    ? 'month'
    : provider.period === 'minute'
      ? 'last minute'
      : 'today';

  return (
    <article className={`dev-api-card ${status.tone}`}>
      <div className="dev-api-head">
        <div>
          <h3>{provider.name}</h3>
          <span>{provider.limitLabel}</span>
        </div>
        <span className={`dev-status ${status.tone}`}>
          <StatusIcon size={13} />
          {status.label}
        </span>
      </div>
      <div className="dev-api-usage">
        <strong>{formatNumber(used)}</strong>
        <span>{callsLabel} calls</span>
      </div>
      {quotaMetrics?.length ? (
        <div className="dev-api-quotas">
          {quotaMetrics.map((metric) => (
            <div className="dev-api-quota" key={metric.usageKey}>
              <div>
                <span>{metric.label}</span>
                <strong>
                  {metric.format === 'currency' ? formatCurrency(metric.used) : formatNumber(metric.used)}
                  {' / '}
                  {metric.format === 'currency' ? formatCurrency(metric.limit) : formatNumber(metric.limit)}
                </strong>
              </div>
              <Meter used={metric.used} limit={metric.limit} />
            </div>
          ))}
        </div>
      ) : (
        <Meter used={used} limit={provider.limit} />
      )}
      <dl className="dev-api-meta">
        <div>
          <dt>Month</dt>
          <dd>{formatNumber(usage?.monthCalls || 0)}</dd>
        </div>
        <div>
          <dt>Today</dt>
          <dd>{formatNumber(usage?.todayCalls || 0)}</dd>
        </div>
        <div>
          <dt>Errors today</dt>
          <dd>{formatNumber(usage?.errorsToday || 0)}</dd>
        </div>
        <div>
          <dt>Last event</dt>
          <dd>{formatLastEvent(usage?.lastEventAt)}</dd>
        </div>
      </dl>
      <p>{provider.description}</p>
      {provider.key === 'huggingface' && billing && (
        <p className="dev-api-empty">
          Detected {billing.plan === 'pro' ? 'PRO' : 'Free'} account · credits reset with the Hugging Face billing period.
        </p>
      )}
      {provider.key === 'huggingface' && !billing && (
        <p className="dev-api-empty">
          Billing usage is unavailable. Check the Hugging Face billing dashboard for the authoritative balance.
        </p>
      )}
      {!usage?.lastEventAt && (
        <p className="dev-api-empty">
          This provider starts counting after its Edge Function makes a live provider request.
        </p>
      )}
    </article>
  );
}

const PAGES = [
  { key: 'overview', label: 'Overview', icon: Gauge },
  { key: 'table-activity', label: 'Table Activity', icon: Database },
  { key: 'organizations', label: 'Organizations', icon: Plug },
  { key: 'resend', label: 'Resend', icon: Mail },
];

export default function DevTools() {
  const [activePage, setActivePage] = useState('overview');
  const [organizations, setOrganizations] = useState([]);
  const [usageSnapshot, setUsageSnapshot] = useState(null);
  const [huggingFaceBilling, setHuggingFaceBilling] = useState(null);
  const [emailSettings, setEmailSettings] = useState([]);
  const [emailLogs, setEmailLogs] = useState([]);
  const [loading, setLoading] = useState(hasSupabaseConfig);
  const [usageError, setUsageError] = useState('');

  const apiUsage = usageSnapshot?.apiUsage || EMPTY_OBJECT;
  const supabaseUsage = usageSnapshot?.supabase || EMPTY_OBJECT;

  const edgeTrackedCalls = useMemo(() => (
    Object.values(apiUsage).reduce((sum, item) => sum + Number(item?.monthCalls || 0), 0)
  ), [apiUsage]);

  const tableCounts = useMemo(() => (
    Object.entries(supabaseUsage.tableCounts || {})
      .sort(([, a], [, b]) => Number(b) - Number(a))
  ), [supabaseUsage.tableCounts]);

  const load = useCallback(async () => {
    if (!hasSupabaseConfig) {
      // LocalStorage fallback for DevTools resend logs
      const savedLogs = localStorage.getItem('miqra_dev_email_logs');
      if (savedLogs) {
        setEmailLogs(JSON.parse(savedLogs));
      } else {
        const defaultLogs = [
          {
            id: 'log_1',
            provider: 'resend',
            feature: 'weekly_meeting_digest',
            status: 200,
            metadata: { to: 'student@example.com', subject: 'Weekly Small Group Digest', status: 'delivered' },
            created_at: new Date(Date.now() - 30 * 60 * 1000).toISOString()
          },
          {
            id: 'log_2',
            provider: 'resend',
            feature: 'intake_form_sent',
            status: 200,
            metadata: { to: 'hannah@example.com', subject: 'New Intake Form Assigned', status: 'delivered' },
            created_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
          },
          {
            id: 'log_3',
            provider: 'resend',
            feature: 'chat_mention_fallback',
            status: 400,
            metadata: { to: 'invalid-email', subject: 'Chat Mention Notification', error: 'Invalid recipient address' },
            created_at: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString()
          }
        ];
        setEmailLogs(defaultLogs);
        localStorage.setItem('miqra_dev_email_logs', JSON.stringify(defaultLogs));
      }
      setLoading(false);
      return;
    }

    setLoading(true);
    setUsageError('');

    const [orgResult, usageResult, emailResult, logsResult, huggingFaceResult] = await Promise.all([
      supabase
        .from('organizations')
        .select('id, name, slug, invite_code, primary_color, secondary_color, created_at')
        .order('created_at', { ascending: true }),
      supabase.rpc('dev_usage_snapshot'),
      supabase
        .from('app_email_settings')
        .select('*')
        .order('sort_order', { ascending: true }),
      supabase
        .from('api_usage_events')
        .select('*')
        .eq('provider', 'resend')
        .order('created_at', { ascending: false })
        .limit(100),
      supabase.functions.invoke('hf-proxy', {
        body: {
          provider: 'huggingface',
          task: 'billing',
        },
      }),
    ]);

    setOrganizations(orgResult.data || []);
    setEmailSettings(emailResult.data || []);
    setEmailLogs(logsResult.data || []);
    setHuggingFaceBilling(
      huggingFaceResult.error ? null : huggingFaceResult.data,
    );

    if (usageResult.error) {
      setUsageSnapshot(null);
      setUsageError(usageResult.error.message || 'Could not load usage metrics.');
    } else {
      setUsageSnapshot(usageResult.data);
    }

    setLoading(false);
  }, []);

  const toggleEmailSetting = useCallback(async (emailType, nextEnabled) => {
    // Optimistic flip; revert on failure.
    setEmailSettings((cur) => cur.map((s) => s.email_type === emailType ? { ...s, enabled: nextEnabled } : s));
    const { error } = await supabase
      .from('app_email_settings')
      .update({ enabled: nextEnabled, updated_at: new Date().toISOString() })
      .eq('email_type', emailType);
    if (error) {
      setEmailSettings((cur) => cur.map((s) => s.email_type === emailType ? { ...s, enabled: !nextEnabled } : s));
    }
  }, []);

  useEffect(() => {
    Promise.resolve().then(load);
  }, [load]);

  return (
    <div className="devtools-page">
      <header className="devtools-header">
        <div className="devtools-title">
          <div className="devtools-icon">
            <Code2 size={24} />
          </div>
          <div>
            <h1>DevTools</h1>
            <p>Operational checks, free-tier proximity, and developer-only app metadata.</p>
          </div>
        </div>
        <button type="button" className="btn-secondary dev-refresh" onClick={load} disabled={loading}>
          <RefreshCw size={16} />
          <span>{loading ? 'Refreshing...' : 'Refresh'}</span>
        </button>
      </header>

      <nav className="devtools-nav">
        {PAGES.map((page) => {
          const Icon = page.icon;
          return (
            <button
              key={page.key}
              type="button"
              className={`devtools-nav-btn ${activePage === page.key ? 'active' : ''}`}
              onClick={() => setActivePage(page.key)}
            >
              <Icon size={16} />
              <span>{page.label}</span>
            </button>
          );
        })}
      </nav>

      {!hasSupabaseConfig && (
        <section className="card dev-alert">
          <AlertTriangle size={18} />
          <span>Supabase is not configured, so usage metrics are unavailable in this environment.</span>
        </section>
      )}

      {usageError && (
        <section className="card dev-alert">
          <AlertTriangle size={18} />
          <span>{usageError}. Run the latest migrations to enable `dev_usage_snapshot()`.</span>
        </section>
      )}

      {activePage === 'overview' && usageSnapshot && (
        <>
          <section className="dev-section">
            <div className="dev-section-heading">
              <h2>Supabase Free-Tier Proximity</h2>
              <span>Generated {new Date(usageSnapshot.generatedAt).toLocaleString()}</span>
            </div>
            <div className="dev-limit-grid">
              <LimitCard
                icon={Database}
                title="Database Size"
                used={Number(supabaseUsage.databaseBytes || 0)}
                limit={LIMITS.supabaseDatabaseBytes}
                unit="bytes"
                helper="Free projects enter read-only mode at the 500 MB database-size quota."
              />
              <LimitCard
                icon={HardDrive}
                title="Storage Objects"
                used={Number(supabaseUsage.storageBytes || 0)}
                limit={LIMITS.supabaseStorageBytes}
                unit="bytes"
                helper={`${formatNumber(supabaseUsage.storageObjects || 0)} files across Supabase Storage buckets.`}
              />
              <LimitCard
                icon={Users}
                title="Monthly Active Users"
                used={Number(supabaseUsage.monthlyActiveUsers || 0)}
                limit={LIMITS.supabaseMonthlyActiveUsers}
                helper={`${formatNumber(supabaseUsage.authUsers || 0)} total auth users; MAU is based on last sign-in within 30 days.`}
              />
              <LimitCard
                icon={Zap}
                title="Tracked Edge Calls"
                used={edgeTrackedCalls}
                limit={LIMITS.supabaseEdgeInvocationsMonthly}
                helper="Lower-bound estimate from app-instrumented proxy calls this month; Supabase dashboard is authoritative."
                soft
              />
            </div>
          </section>

          <section className="dev-section">
            <div className="dev-section-heading">
              <h2>Integrated API Usage</h2>
              <span>Tracked from Edge Function proxy calls after this migration</span>
            </div>
            <div className="dev-api-grid">
              {API_PROVIDERS.map((provider) => (
                <ApiCard
                  key={provider.key}
                  provider={provider}
                  usage={apiUsage[provider.key]}
                  billing={provider.key === 'huggingface' ? huggingFaceBilling : null}
                />
              ))}
            </div>
          </section>

          <section className="dev-section dev-breakdown-grid">
            <article className="card dev-breakdown">
              <div className="dev-panel-heading">
                <h2><Gauge size={18} /> Largest Tables</h2>
              </div>
              <div className="dev-table-counts">
                {tableCounts.slice(0, 14).map(([name, count]) => (
                  <div key={name}>
                    <span>{name}</span>
                    <strong>{formatNumber(count)}</strong>
                  </div>
                ))}
              </div>
            </article>

            <article className="card dev-breakdown">
              <div className="dev-panel-heading">
                <h2><HardDrive size={18} /> Storage Buckets</h2>
              </div>
              <div className="dev-table-counts">
                {(supabaseUsage.storageBuckets || []).length === 0 ? (
                  <p className="dev-muted">No storage objects found.</p>
                ) : (supabaseUsage.storageBuckets || []).map((bucket) => (
                  <div key={bucket.bucketId}>
                    <span>{bucket.bucketId}</span>
                    <strong>{formatBytes(Number(bucket.bytes || 0))}</strong>
                  </div>
                ))}
              </div>
            </article>
          </section>
        </>
      )}

      {activePage === 'overview' && (
      <section className="card dev-notes">
        <div className="dev-panel-heading">
          <h2><Info size={18} /> Notes</h2>
        </div>
        <ul>
          <li>Supabase bandwidth and exact Edge Function invocations are only available in the Supabase dashboard or Management API.</li>
          <li>Cloudflare AI, Groq, and Hugging Face billing/rate limits are account-specific; this app tracks proxy call volume, not provider billing units.</li>
          <li>Canva uses endpoint-specific burst limits, so the most useful app-side signal is calls in the last minute.</li>
        </ul>
      </section>
      )}

      {activePage === 'table-activity' && (
        <section className="card dev-orgs">
          <div className="dev-panel-heading">
            <h2><Database size={18} /> Table Activity & Scan Statistics</h2>
          </div>
          <p style={{ margin: '0.5rem 0 1.25rem', color: 'var(--text-secondary)', fontSize: '0.85rem', lineHeight: '1.45' }}>
            Cumulative query execution statistics since the last database statistics reset. High sequential scans (Seq Scans) relative to Index Scans can indicate missing indexes or query loops.
          </p>
          {loading ? (
            <p className="dev-muted">Loading...</p>
          ) : !supabaseUsage.tableStats || Object.keys(supabaseUsage.tableStats).length === 0 ? (
            <p className="dev-muted">No database statistics returned. Try running migrations first.</p>
          ) : (
            <div className="dev-table-wrap">
              <table className="dev-org-table">
                <thead>
                  <tr>
                    <th>Table Name</th>
                    <th>Row Count</th>
                    <th>Seq Scans</th>
                    <th>Seq Rows Read</th>
                    <th>Index Scans</th>
                    <th>Index Rows Fetched</th>
                    <th>Index Usage Ratio</th>
                    <th>Write Ops (Ins/Upd/Del)</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(supabaseUsage.tableStats)
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([name, stats]) => {
                      const rowCount = supabaseUsage.tableCounts?.[name] || 0;
                      const seqScan = Number(stats.seqScan || 0);
                      const seqRead = Number(stats.seqTupRead || 0);
                      const idxScan = Number(stats.idxScan || 0);
                      const idxFetch = Number(stats.idxTupFetch || 0);
                      const ins = Number(stats.inserted || 0);
                      const upd = Number(stats.updated || 0);
                      const del = Number(stats.deleted || 0);

                      const totalScans = seqScan + idxScan;
                      const ratio = totalScans > 0 ? (idxScan / totalScans) * 100 : null;
                      
                      // Highlight tables with high sequential scans and low index usage
                      const isHighSeqScan = seqScan > 1000 && (ratio === null || ratio < 10);

                      return (
                        <tr key={name} style={isHighSeqScan ? { background: 'rgba(239, 68, 68, 0.08)' } : undefined}>
                          <td><strong>{name}</strong></td>
                          <td>{formatNumber(rowCount)}</td>
                          <td>
                            <span style={{ color: seqScan > 100000 ? '#dc2626' : 'inherit', fontWeight: seqScan > 100000 ? 'bold' : 'normal' }}>
                              {formatNumber(seqScan)}
                            </span>
                          </td>
                          <td>{formatNumber(seqRead)}</td>
                          <td>{formatNumber(idxScan)}</td>
                          <td>{formatNumber(idxFetch)}</td>
                          <td>
                            {ratio !== null ? (
                              <span style={{ color: ratio < 30 ? '#d97706' : '#16a34a', fontWeight: 'bold' }}>
                                {ratio.toFixed(1)}%
                              </span>
                            ) : (
                              <span style={{ color: 'var(--text-muted)' }}>N/A</span>
                            )}
                          </td>
                          <td>
                            <span style={{ color: 'var(--text-muted)' }}>
                              {formatNumber(ins)} / {formatNumber(upd)} / {formatNumber(del)}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {activePage === 'organizations' && (
      <section className="card dev-orgs">
        <div className="dev-panel-heading">
          <h2><Plug size={18} /> Organizations</h2>
        </div>

        {loading ? (
          <p className="dev-muted">Loading...</p>
        ) : organizations.length === 0 ? (
          <p className="dev-muted">No organizations found.</p>
        ) : (
          <div className="dev-table-wrap">
            <table className="dev-org-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Slug</th>
                  <th>Invite Code</th>
                  <th>Colors</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {organizations.map((org) => (
                  <tr key={org.id}>
                    <td>{org.name}</td>
                    <td>{org.slug}</td>
                    <td><code>{org.invite_code}</code></td>
                    <td>
                      <div className="dev-swatches">
                        <span style={{ background: org.primary_color }} title={org.primary_color} />
                        <span style={{ background: org.secondary_color }} title={org.secondary_color} />
                      </div>
                    </td>
                    <td>{new Date(org.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      )}

      {activePage === 'resend' && (
        <ResendPage
          usage={apiUsage.resend}
          emailSettings={emailSettings}
          emailLogs={emailLogs}
          onToggle={toggleEmailSetting}
          loading={loading}
        />
      )}
    </div>
  );
}

function ResendPage({ usage, emailSettings, emailLogs = [], onToggle, loading }) {
  const monthUsed = Number(usage?.monthCalls || 0);
  const todayUsed = Number(usage?.todayCalls || 0);
  return (
    <>
      <section className="dev-section">
        <div className="dev-section-heading">
          <h2><Mail size={18} /> Resend Email Usage</h2>
          <span>Free tier: 3,000 / month · 100 / day</span>
        </div>
        <div className="dev-limit-grid">
          <LimitCard
            icon={Mail}
            title="Emails This Month"
            used={monthUsed}
            limit={LIMITS.resendMonthlyEmails}
            helper="Resend free tier allows 3,000 emails per month across your account."
          />
          <LimitCard
            icon={Mail}
            title="Emails Today"
            used={todayUsed}
            limit={LIMITS.resendDailyEmails}
            helper="The 100/day cap is the tighter limit — prefer digests over per-event sends."
          />
          <LimitCard
            icon={AlertTriangle}
            title="Send Errors Today"
            used={Number(usage?.errorsToday || 0)}
            limit={null}
            helper="Bounces, rejections, or API failures recorded today."
            soft
          />
        </div>
        <p className="dev-muted dev-resend-note">
          Usage populates once the <code>send-email</code> function logs sends to <code>api_usage_events</code> with provider <code>resend</code>. A verified sending domain is required for real delivery.
        </p>
      </section>

      <section className="card dev-email-settings">
        <div className="dev-panel-heading">
          <h2><Mail size={18} /> Email Notifications</h2>
        </div>
        <p className="dev-muted">Turn each transactional email category on or off. Disabled categories are skipped by the send path — no deploy needed.</p>

        {loading ? (
          <p className="dev-muted">Loading...</p>
        ) : emailSettings.length === 0 ? (
          <p className="dev-muted">No email categories configured. Run the latest migrations.</p>
        ) : (
          <ul className="dev-email-list">
            {emailSettings.map((setting) => (
              <li key={setting.email_type} className="dev-email-row">
                <div className="dev-email-info">
                  <strong>{setting.label}</strong>
                  {setting.description && <span>{setting.description}</span>}
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={setting.enabled}
                  className={`dev-toggle ${setting.enabled ? 'on' : 'off'}`}
                  onClick={() => onToggle(setting.email_type, !setting.enabled)}
                  title={setting.enabled ? 'Enabled — click to disable' : 'Disabled — click to enable'}
                >
                  <span className="dev-toggle-knob" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card dev-email-logs" style={{ marginTop: '1.5rem' }}>
        <div className="dev-panel-heading">
          <h2><HardDrive size={18} /> Sent Email Logs</h2>
        </div>
        <p className="dev-muted">Real-time log of proxy email sends. Up to 100 recent events are shown.</p>

        {loading ? (
          <p className="dev-muted">Loading logs...</p>
        ) : emailLogs.length === 0 ? (
          <p className="dev-muted">No emails have been sent yet.</p>
        ) : (
          <div className="dev-table-wrap">
            <table className="dev-org-table">
              <thead>
                <tr>
                  <th>Sent At</th>
                  <th>Organization</th>
                  <th>Category</th>
                  <th>Recipient</th>
                  <th>Subject</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {emailLogs.map((log) => {
                  const to = log.metadata?.to || '—';
                  const subject = log.metadata?.subject || '—';
                  const errorMsg = log.metadata?.error || '';
                  const orgName = log.metadata?.org_name || 'System / Global';
                  const isSuccess = log.status >= 200 && log.status < 300;
                  
                  return (
                    <tr key={log.id}>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        {new Date(log.created_at).toLocaleString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          hour: 'numeric',
                          minute: '2-digit',
                          second: '2-digit'
                        })}
                      </td>
                      <td>{orgName}</td>
                      <td>
                        <code>{log.feature}</code>
                      </td>
                      <td>{to}</td>
                      <td>{subject}</td>
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                          <span className={`dev-status ${isSuccess ? 'good' : 'danger'}`} style={{ width: 'fit-content' }}>
                            {isSuccess ? 'Success' : `Failed (${log.status})`}
                          </span>
                          {errorMsg && (
                            <span style={{ fontSize: '0.75rem', color: '#dc2626', maxWidth: '240px', wordBreak: 'break-word' }}>
                              {errorMsg}
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
