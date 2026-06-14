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
    limitLabel: 'Limits/credits are account/provider-specific',
    period: 'today',
    limit: null,
    description: 'Used by embeddings, similarity, and optional chat inference.',
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

function ApiCard({ provider, usage }) {
  const used = usageForPeriod(usage, provider.period);
  const percent = percentUsed(used, provider.limit);
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
      <Meter used={used} limit={provider.limit} />
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
      </dl>
      <p>{provider.description}</p>
    </article>
  );
}

export default function DevTools() {
  const [organizations, setOrganizations] = useState([]);
  const [usageSnapshot, setUsageSnapshot] = useState(null);
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
      setLoading(false);
      return;
    }

    setLoading(true);
    setUsageError('');

    const [orgResult, usageResult] = await Promise.all([
      supabase
        .from('organizations')
        .select('id, name, slug, invite_code, primary_color, secondary_color, created_at')
        .order('created_at', { ascending: true }),
      supabase.rpc('dev_usage_snapshot'),
    ]);

    setOrganizations(orgResult.data || []);

    if (usageResult.error) {
      setUsageSnapshot(null);
      setUsageError(usageResult.error.message || 'Could not load usage metrics.');
    } else {
      setUsageSnapshot(usageResult.data);
    }

    setLoading(false);
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

      {usageSnapshot && (
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
    </div>
  );
}
