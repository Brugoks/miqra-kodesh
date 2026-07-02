import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase, hasSupabaseConfig } from '../lib/supabaseClient';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ClipboardCopy,
  Clock,
  Code2,
  Database,
  Gauge,
  HardDrive,
  Info,
  Mail,
  Plug,
  RefreshCw,
  ShieldCheck,
  Users,
  XCircle,
  Zap,
} from 'lucide-react';
import './DevTools.css';

const MB = 1024 * 1024;
const GB = 1024 * MB;

const LIMITS = {
  supabaseDatabaseBytes: 500 * MB,
  supabaseStorageBytes: 1 * GB,
  supabaseEgressBytes: 5 * GB,
  supabaseMonthlyActiveUsers: 50000,
  supabaseEdgeInvocationsMonthly: 500000,
  apiBibleMonthlyCalls: 5000,
  constantContactDailyCalls: 10000,
  canvaListDesignsPerMinute: 100,
  youtubeSearchDailyCalls: 100,
  geminiFlashLiteRequestsPerMinute: 15,
  geminiFlashLiteInputTokensPerMinute: 250000,
  geminiFlashLiteRequestsPerDay: 1000,
  openRouterFreeRequestsPerMinute: 20,
  openRouterFreeRequestsPerDay: 1000,
  resendMonthlyEmails: 3000,
  resendDailyEmails: 100,
  esvDailyCalls: 5000,
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
    key: 'openrouter',
    name: 'OpenRouter',
    limitLabel: 'Free model guard: 20 RPM, 1,000 requests / day after $10+ credits',
    period: 'today',
    limit: LIMITS.openRouterFreeRequestsPerDay,
    quotaMetrics: [
      {
        label: 'Free requests / minute',
        usageKey: 'lastMinuteCalls',
        limit: LIMITS.openRouterFreeRequestsPerMinute,
      },
      {
        label: 'Free requests / day',
        usageKey: 'todayCalls',
        limit: LIMITS.openRouterFreeRequestsPerDay,
      },
    ],
    description: 'Used by openrouter-proxy. The proxy only allows openrouter/free or model IDs ending in :free unless paid models are explicitly enabled.',
  },
  {
    key: 'wikidata',
    name: 'Wikidata',
    limitLabel: 'Public API: app-side tracked; Wikimedia limits are dynamic',
    period: 'today',
    limit: null,
    description: 'Used by wikidata-proxy for Scripture Context cards. Units reflect candidate entity searches attempted for each passage.',
  },
  {
    key: 'research-resources',
    name: 'BAS / OpenBible / Pleiades',
    limitLabel: 'Research links generated from Wikidata context',
    period: 'today',
    limit: null,
    virtual: true,
    description: 'BAS, OpenBible.info, and Pleiades currently appear as outbound research links. No scraping or API calls are made from the app, so provider usage is not consumed.',
  },
  {
    key: 'resend',
    name: 'Resend',
    limitLabel: 'Free tier: 3,000 emails / month, 100 / day',
    period: 'month',
    limit: LIMITS.resendMonthlyEmails,
    description: 'Transactional email (notifications). See the Resend page for daily limits and toggles.',
  },
  {
    key: 'bible-api.com',
    name: 'bible-api.com',
    limitLabel: 'Public API: ~15 requests / 30 s per IP, no key',
    period: 'today',
    limit: null,
    description: 'Public-domain translations (the WEB comparison column) and the automatic fallback when API.Bible is missing a key, rate-limited, or erroring.',
  },
  {
    key: 'esv',
    name: 'ESV API',
    limitLabel: 'Free non-commercial key: 5,000 requests / day',
    period: 'today',
    limit: LIMITS.esvDailyCalls,
    description: 'ESV passage text and narrated audio (Listen button). Requires the ESV_API_KEY secret.',
  },
  {
    key: 'link-preview',
    name: 'Link Previews',
    limitLabel: 'Self-hosted OG fetcher — no external provider quota',
    period: 'today',
    limit: null,
    description: 'Chat link-preview cards. Counts pages fetched by the link-preview Edge Function; results are session-cached client-side.',
  },
  {
    key: 'open-meteo',
    name: 'Open-Meteo / Nominatim',
    limitLabel: 'Free: ~10,000 forecast calls / day; Nominatim asks ≤1 req / s',
    period: 'today',
    limit: null,
    virtual: true,
    description: 'Event weather badges call both APIs directly from the browser with per-day localStorage caching, so no app-side usage events are recorded.',
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

// 30-day call-volume sparkline: single series, 2px line + faint area, no
// grid/axes (identity comes from the card title, values from the tooltip).
function Sparkline({ points }) {
  if (!points || points.length < 2) return null;
  const width = 220;
  const height = 36;
  const max = Math.max(...points.map((p) => p.calls), 1);
  const stepX = width / (points.length - 1);
  const y = (v) => height - 3 - (v / max) * (height - 6);
  const coords = points.map((p, i) => `${(i * stepX).toFixed(1)},${y(p.calls).toFixed(1)}`);
  const linePath = `M${coords.join(' L')}`;
  const areaPath = `${linePath} L${width},${height} L0,${height} Z`;
  const total = points.reduce((sum, p) => sum + p.calls, 0);
  const label = `Last ${points.length} days: ${formatNumber(total)} calls, peak ${formatNumber(max)} in one day`;
  return (
    <svg className="dev-sparkline" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label={label}>
      <title>{label}</title>
      <path d={areaPath} className="dev-sparkline-area" />
      <path d={linePath} className="dev-sparkline-line" vectorEffect="non-scaling-stroke" />
    </svg>
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

function ApiCard({ provider, usage, billing, daily }) {
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
      {daily?.some((p) => p.calls > 0) && (
        <div className="dev-sparkline-wrap">
          <Sparkline points={daily} />
          <span>30-day trend</span>
        </div>
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
      {provider.virtual && (
        <p className="dev-api-empty">
          Link-outs are listed for visibility only. Add click tracking later if you want per-resource activity counts.
        </p>
      )}
      {!provider.virtual && !usage?.lastEventAt && (
        <p className="dev-api-empty">
          This provider starts counting after its Edge Function makes a live provider request.
        </p>
      )}
    </article>
  );
}

const PAGES = [
  { key: 'overview', label: 'Overview', icon: Gauge },
  { key: 'api-activity', label: 'API Activity', icon: Zap },
  { key: 'table-activity', label: 'Table Activity', icon: Database },
  { key: 'jobs', label: 'Cron Jobs', icon: Clock },
  { key: 'health', label: 'Health', icon: Activity },
  { key: 'organizations', label: 'Organizations', icon: Plug },
  { key: 'resend', label: 'Resend', icon: Mail },
];

// Fill a provider's sparse daily rows into a contiguous N-day series.
function buildDailySeries(rows, days = 30) {
  const byDay = new Map(rows.map((r) => [r.day, Number(r.calls) || 0]));
  const series = [];
  const cursor = new Date();
  cursor.setDate(cursor.getDate() - (days - 1));
  for (let i = 0; i < days; i += 1) {
    const key = cursor.toISOString().slice(0, 10);
    series.push({ day: key, calls: byDay.get(key) || 0 });
    cursor.setDate(cursor.getDate() + 1);
  }
  return series;
}

export default function DevTools() {
  const [activePage, setActivePage] = useState('overview');
  const [organizations, setOrganizations] = useState([]);
  const [usageSnapshot, setUsageSnapshot] = useState(null);
  const [huggingFaceBilling, setHuggingFaceBilling] = useState(null);
  const [apiEvents, setApiEvents] = useState([]);
  const [emailSettings, setEmailSettings] = useState([]);
  const [emailLogs, setEmailLogs] = useState([]);
  const [loading, setLoading] = useState(hasSupabaseConfig);
  const [usageError, setUsageError] = useState('');

  // Insights (populated by the devtools_insights migration RPCs; each is null
  // when the RPC is unavailable so panels degrade to a hint instead of crashing)
  const [usageDaily, setUsageDaily] = useState(null);
  const [topConsumers, setTopConsumers] = useState(null);
  const [cronStatus, setCronStatus] = useState(null);
  const [rlsCoverage, setRlsCoverage] = useState(null);
  const [topQueries, setTopQueries] = useState(null);
  const [quotaAlerts, setQuotaAlerts] = useState([]);
  const [apiErrorEvents, setApiErrorEvents] = useState([]);

  // API Activity filters
  const [filterProvider, setFilterProvider] = useState('all');
  const [filterFeature, setFilterFeature] = useState('');
  const [errorsOnly, setErrorsOnly] = useState(false);

  // Health page actions
  const [healthResult, setHealthResult] = useState(null);
  const [healthLoading, setHealthLoading] = useState(false);
  const [quotaRunResult, setQuotaRunResult] = useState(null);
  const [quotaRunLoading, setQuotaRunLoading] = useState(false);
  const [diagCopied, setDiagCopied] = useState(false);

  const apiUsage = usageSnapshot?.apiUsage || EMPTY_OBJECT;
  const supabaseUsage = usageSnapshot?.supabase || EMPTY_OBJECT;

  const edgeTrackedCalls = useMemo(() => (
    Object.values(apiUsage).reduce((sum, item) => sum + Number(item?.monthCalls || 0), 0)
  ), [apiUsage]);

  const tableCounts = useMemo(() => (
    Object.entries(supabaseUsage.tableCounts || {})
      .sort(([, a], [, b]) => Number(b) - Number(a))
  ), [supabaseUsage.tableCounts]);

  // provider → contiguous 30-day series for sparklines
  const dailyByProvider = useMemo(() => {
    if (!Array.isArray(usageDaily)) return {};
    const grouped = {};
    for (const row of usageDaily) {
      if (!grouped[row.provider]) grouped[row.provider] = [];
      grouped[row.provider].push(row);
    }
    const series = {};
    for (const [provider, rows] of Object.entries(grouped)) {
      series[provider] = buildDailySeries(rows, 30);
    }
    return series;
  }, [usageDaily]);

  const visibleApiEvents = useMemo(() => {
    const source = errorsOnly ? apiErrorEvents : apiEvents;
    const feature = filterFeature.trim().toLowerCase();
    return source.filter((event) => (
      (filterProvider === 'all' || event.provider === filterProvider)
      && (!feature || String(event.feature || '').toLowerCase().includes(feature))
    ));
  }, [apiEvents, apiErrorEvents, errorsOnly, filterProvider, filterFeature]);

  const eventProviders = useMemo(() => (
    [...new Set([...apiEvents, ...apiErrorEvents].map((e) => e.provider))].sort()
  ), [apiEvents, apiErrorEvents]);

  const runHealthCheck = useCallback(async () => {
    setHealthLoading(true);
    const { data, error } = await supabase.functions.invoke('health-check', { body: {} });
    setHealthResult(error ? { error: error.message || 'Health check failed.' } : data);
    setHealthLoading(false);
  }, []);

  const runQuotaCheck = useCallback(async () => {
    setQuotaRunLoading(true);
    const { data, error } = await supabase.functions.invoke('quota-alert', { body: {} });
    setQuotaRunResult(error ? { error: error.message || 'Quota check failed.' } : data);
    setQuotaRunLoading(false);
  }, []);

  const copyDiagnostics = useCallback(async () => {
    const diagnostics = {
      generatedAt: new Date().toISOString(),
      usageSnapshot,
      usageDaily,
      topConsumers,
      cronStatus,
      rlsCoverage,
      quotaAlerts,
      huggingFaceBilling,
    };
    try {
      await navigator.clipboard.writeText(JSON.stringify(diagnostics, null, 2));
      setDiagCopied(true);
      setTimeout(() => setDiagCopied(false), 1500);
    } catch { /* clipboard unavailable */ }
  }, [usageSnapshot, usageDaily, topConsumers, cronStatus, rlsCoverage, quotaAlerts, huggingFaceBilling]);

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

    const [
      orgResult, usageResult, emailResult, logsResult, apiEventsResult, huggingFaceResult,
      dailyResult, consumersResult, cronResult, rlsResult, queriesResult, alertsResult, errorEventsResult,
    ] = await Promise.all([
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
      supabase
        .from('api_usage_events')
        .select('*, user:profiles(full_name, email)')
        .order('created_at', { ascending: false })
        .limit(150),
      supabase.functions.invoke('hf-proxy', {
        body: {
          provider: 'huggingface',
          task: 'billing',
        },
      }),
      supabase.rpc('dev_usage_daily', { days: 30 }),
      supabase.rpc('dev_top_consumers', { days: 30 }),
      supabase.rpc('dev_cron_status'),
      supabase.rpc('dev_rls_coverage'),
      supabase.rpc('dev_top_queries'),
      supabase
        .from('quota_alerts')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(25),
      supabase
        .from('api_usage_events')
        .select('*, user:profiles(full_name, email)')
        .or('status.lt.200,status.gte.300')
        .order('created_at', { ascending: false })
        .limit(150),
    ]);

    setOrganizations(orgResult.data || []);
    setEmailSettings(emailResult.data || []);
    setEmailLogs(logsResult.data || []);
    setApiEvents(apiEventsResult.data || []);
    setHuggingFaceBilling(
      huggingFaceResult.error ? null : huggingFaceResult.data,
    );

    // Insight RPCs may not exist yet (pre-migration) — degrade to null.
    setUsageDaily(dailyResult.error ? null : dailyResult.data);
    setTopConsumers(consumersResult.error ? null : consumersResult.data);
    setCronStatus(cronResult.error ? null : cronResult.data);
    setRlsCoverage(rlsResult.error ? null : rlsResult.data);
    setTopQueries(queriesResult.error ? null : queriesResult.data);
    setQuotaAlerts(alertsResult.data || []);
    setApiErrorEvents(errorEventsResult.data || []);

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
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button type="button" className="btn-secondary dev-refresh" onClick={copyDiagnostics} disabled={!usageSnapshot} title="Copy the full usage snapshot as JSON">
            {diagCopied ? <CheckCircle2 size={16} /> : <ClipboardCopy size={16} />}
            <span>{diagCopied ? 'Copied!' : 'Copy diagnostics'}</span>
          </button>
          <button type="button" className="btn-secondary dev-refresh" onClick={load} disabled={loading}>
            <RefreshCw size={16} />
            <span>{loading ? 'Refreshing...' : 'Refresh'}</span>
          </button>
        </div>
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
                icon={RefreshCw}
                title="Network Egress"
                used={Number(supabaseUsage.egressBytes || 0)}
                limit={LIMITS.supabaseEgressBytes}
                unit="bytes"
                helper="Estimated outgoing network traffic this month. Free tier limit is 5 GB/month."
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

          {Array.isArray(rlsCoverage) && (
            <section className={`card dev-alert ${rlsCoverage.length === 0 ? 'dev-alert-good' : ''}`}>
              {rlsCoverage.length === 0 ? (
                <>
                  <ShieldCheck size={18} />
                  <span>RLS coverage: every public table has row-level security enabled with at least one policy.</span>
                </>
              ) : (
                <>
                  <AlertTriangle size={18} />
                  <span>
                    RLS review: {rlsCoverage.map((t) => (
                      `${t.table} (${!t.rlsEnabled ? 'RLS DISABLED — exposed' : 'no policies — locked to service role'})`
                    )).join(', ')}. Disabled RLS is a data exposure; zero policies means clients get nothing — fine for service-only tables, a bug if the app reads them.
                  </span>
                </>
              )}
            </section>
          )}

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
                  daily={dailyByProvider[provider.key]}
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
          <li>OpenRouter is guarded to free models in the proxy by default; DevTools shows app-side calls, not your live OpenRouter billing balance.</li>
          <li>BAS, OpenBible.info, and Pleiades are currently outbound research links from Scripture Context, so they do not consume app API calls.</li>
        </ul>
      </section>
      )}

      {activePage === 'api-activity' && (
        <section className="card dev-orgs">
          <div className="dev-panel-heading">
            <h2><Zap size={18} /> Recent API Activity</h2>
          </div>
          <p className="dev-muted" style={{ margin: '0.5rem 0 1rem' }}>
            Recent app-observable provider calls recorded by Edge Functions. This table never stores API keys.
          </p>
          <div className="dev-filters">
            <select value={filterProvider} onChange={(e) => setFilterProvider(e.target.value)} aria-label="Filter by provider">
              <option value="all">All providers</option>
              {eventProviders.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            <input
              type="search"
              value={filterFeature}
              onChange={(e) => setFilterFeature(e.target.value)}
              placeholder="Filter by feature…"
              aria-label="Filter by feature"
            />
            <button
              type="button"
              className={`dev-filter-toggle ${errorsOnly ? 'active' : ''}`}
              onClick={() => setErrorsOnly((v) => !v)}
              aria-pressed={errorsOnly}
            >
              <XCircle size={14} /> Errors only
            </button>
            <span className="dev-muted dev-filter-count">
              {visibleApiEvents.length} event{visibleApiEvents.length === 1 ? '' : 's'}
            </span>
          </div>
          {loading ? (
            <p className="dev-muted">Loading activity...</p>
          ) : visibleApiEvents.length === 0 ? (
            <p className="dev-muted">{errorsOnly ? 'No errors match the current filters. 🎉' : 'No API activity matches the current filters.'}</p>
          ) : (
            <div className="dev-table-wrap">
              <table className="dev-org-table">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>User</th>
                    <th>Provider</th>
                    <th>Feature</th>
                    <th>Status</th>
                    <th>Units</th>
                    <th>Model / Reference</th>
                    <th>Details</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleApiEvents.map((event) => {
                    const ok = Number(event.status || 0) >= 200 && Number(event.status || 0) < 300;
                    const metadata = event.metadata || {};
                    const modelOrRef = metadata.model || metadata.reference || metadata.verseRef || '—';
                    const details = [
                      metadata.entityCount != null ? `${metadata.entityCount} entities` : null,
                      metadata.candidateCount != null ? `${metadata.candidateCount} candidates` : null,
                      metadata.totalTokens != null ? `${metadata.totalTokens} tokens` : null,
                      metadata.resourceSources?.length ? metadata.resourceSources.join(', ') : null,
                      metadata.error ? `Error: ${metadata.error}` : null,
                    ].filter(Boolean).join(' · ') || '—';
                    return (
                      <tr key={event.id}>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          {new Date(event.created_at).toLocaleString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            hour: 'numeric',
                            minute: '2-digit',
                            second: '2-digit',
                          })}
                        </td>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          {event.user?.full_name || (event.user?.email ? event.user.email.split('@')[0] : null) || <span className="dev-muted">—</span>}
                        </td>
                        <td><code>{event.provider}</code></td>
                        <td>{event.feature}</td>
                        <td>
                          <span className={`dev-status ${ok ? 'good' : 'danger'}`}>
                            {event.status || 'n/a'}
                          </span>
                        </td>
                        <td>{formatNumber(event.units || 1)}</td>
                        <td>{modelOrRef}</td>
                        <td>{details}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {activePage === 'api-activity' && (
        <section className="dev-section dev-breakdown-grid" style={{ marginTop: '1.5rem' }}>
          <article className="card dev-breakdown">
            <div className="dev-panel-heading">
              <h2><Plug size={18} /> Top Consumers by Organization</h2>
            </div>
            <p className="dev-muted">Calls in the last 30 days, grouped by org and provider.</p>
            {!Array.isArray(topConsumers?.orgs) ? (
              <p className="dev-muted">Run the latest migrations to enable consumer breakdowns.</p>
            ) : topConsumers.orgs.length === 0 ? (
              <p className="dev-muted">No usage recorded yet.</p>
            ) : (
              <div className="dev-table-counts">
                {topConsumers.orgs.slice(0, 12).map((row, i) => (
                  <div key={`${row.name}:${row.provider}:${i}`}>
                    <span>{row.name} · <code>{row.provider}</code></span>
                    <strong>
                      {formatNumber(row.calls)}
                      {Number(row.errors) > 0 && <span className="dev-consumer-errors"> ({formatNumber(row.errors)} err)</span>}
                    </strong>
                  </div>
                ))}
              </div>
            )}
          </article>
          <article className="card dev-breakdown">
            <div className="dev-panel-heading">
              <h2><Users size={18} /> Top Consumers by User</h2>
            </div>
            <p className="dev-muted">Which users are drawing down shared quotas.</p>
            {!Array.isArray(topConsumers?.users) ? (
              <p className="dev-muted">Run the latest migrations to enable consumer breakdowns.</p>
            ) : topConsumers.users.length === 0 ? (
              <p className="dev-muted">No usage recorded yet.</p>
            ) : (
              <div className="dev-table-counts">
                {topConsumers.users.slice(0, 12).map((row, i) => (
                  <div key={`${row.name}:${row.provider}:${i}`}>
                    <span>{row.name} · <code>{row.provider}</code></span>
                    <strong>
                      {formatNumber(row.calls)}
                      {Number(row.errors) > 0 && <span className="dev-consumer-errors"> ({formatNumber(row.errors)} err)</span>}
                    </strong>
                  </div>
                ))}
              </div>
            )}
          </article>
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

      {activePage === 'table-activity' && (
        <section className="card dev-orgs" style={{ marginTop: '1.5rem' }}>
          <div className="dev-panel-heading">
            <h2><Gauge size={18} /> Top Queries by Total Execution Time</h2>
          </div>
          <p className="dev-muted" style={{ margin: '0.5rem 0 1.25rem' }}>
            From <code>pg_stat_statements</code>, cumulative since the last stats reset. The heaviest statements are the first place to look when scans spike.
          </p>
          {!topQueries ? (
            <p className="dev-muted">Run the latest migrations to enable query statistics.</p>
          ) : topQueries.unavailable ? (
            <p className="dev-muted">pg_stat_statements is not available on this database.</p>
          ) : topQueries.length === 0 ? (
            <p className="dev-muted">No statement statistics recorded yet.</p>
          ) : (
            <div className="dev-table-wrap">
              <table className="dev-org-table">
                <thead>
                  <tr>
                    <th>Query</th>
                    <th>Calls</th>
                    <th>Total Time</th>
                    <th>Mean</th>
                    <th>Rows</th>
                  </tr>
                </thead>
                <tbody>
                  {topQueries.map((q, i) => (
                    <tr key={i}>
                      <td><code className="dev-query-text">{q.query}</code></td>
                      <td>{formatNumber(q.calls)}</td>
                      <td>{formatNumber(q.totalMs)} ms</td>
                      <td>{formatNumber(q.meanMs)} ms</td>
                      <td>{formatNumber(q.rows)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {activePage === 'jobs' && (
        <section className="card dev-orgs">
          <div className="dev-panel-heading">
            <h2><Clock size={18} /> Scheduled Jobs (pg_cron)</h2>
          </div>
          <p className="dev-muted" style={{ margin: '0.5rem 0 1.25rem' }}>
            Every registered cron job with its most recent run. A job that silently stops running shows up here as a stale or failed last run.
          </p>
          {!Array.isArray(cronStatus) ? (
            <p className="dev-muted">Run the latest migrations to enable cron visibility.</p>
          ) : cronStatus.length === 0 ? (
            <p className="dev-muted">No cron jobs are registered.</p>
          ) : (
            <div className="dev-table-wrap">
              <table className="dev-org-table">
                <thead>
                  <tr>
                    <th>Job</th>
                    <th>Schedule</th>
                    <th>Active</th>
                    <th>Last Run</th>
                    <th>Status</th>
                    <th>Duration</th>
                    <th>Failures (7d)</th>
                  </tr>
                </thead>
                <tbody>
                  {cronStatus.map((job) => {
                    const last = job.lastRun;
                    const ok = last?.status === 'succeeded';
                    return (
                      <tr key={job.jobname}>
                        <td><strong>{job.jobname}</strong></td>
                        <td><code>{job.schedule}</code></td>
                        <td>{job.active ? 'Yes' : <span className="dev-status danger">Paused</span>}</td>
                        <td style={{ whiteSpace: 'nowrap' }}>{last ? formatLastEvent(last.startTime) : <span className="dev-muted">Never ran</span>}</td>
                        <td>
                          {last ? (
                            <span className={`dev-status ${ok ? 'good' : 'danger'}`}>{last.status}</span>
                          ) : <span className="dev-muted">—</span>}
                        </td>
                        <td>{last?.durationMs != null ? `${formatNumber(last.durationMs)} ms` : '—'}</td>
                        <td>
                          {Number(job.recentFailures) > 0
                            ? <span className="dev-status danger">{formatNumber(job.recentFailures)}</span>
                            : '0'}
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

      {activePage === 'health' && (
        <>
          <section className="card dev-orgs">
            <div className="dev-panel-heading" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
              <h2><ShieldCheck size={18} /> Secrets & Function Health</h2>
              <button type="button" className="btn-primary" onClick={runHealthCheck} disabled={healthLoading}>
                {healthLoading ? 'Checking…' : 'Run health check'}
              </button>
            </div>
            <p className="dev-muted" style={{ margin: '0.5rem 0 1rem' }}>
              Reports which project secrets the Edge Function fleet depends on are configured — presence only, values are never returned.
            </p>
            {healthResult?.error && <p className="dev-status danger" style={{ display: 'inline-flex' }}>{healthResult.error}</p>}
            {healthResult?.secrets && (
              <>
                {healthResult.missingRequired?.length > 0 && (
                  <p className="dev-status danger" style={{ display: 'inline-flex', marginBottom: '0.75rem' }}>
                    <AlertTriangle size={13} /> Missing required: {healthResult.missingRequired.join(', ')}
                  </p>
                )}
                <div className="dev-health-grid">
                  {healthResult.secrets.map((secret) => (
                    <div key={secret.name} className={`dev-health-item ${secret.configured ? 'ok' : secret.required ? 'bad' : 'warn'}`}>
                      {secret.configured ? <CheckCircle2 size={15} /> : <XCircle size={15} />}
                      <div>
                        <code>{secret.name}</code>
                        <span>{secret.usedBy}{!secret.required && ' (optional)'}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
            {!healthResult && !healthLoading && (
              <p className="dev-muted">Not checked yet this session.</p>
            )}
          </section>

          <section className="card dev-orgs" style={{ marginTop: '1.5rem' }}>
            <div className="dev-panel-heading" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
              <h2><AlertTriangle size={18} /> Quota Alerts</h2>
              <button type="button" className="btn-secondary" onClick={runQuotaCheck} disabled={quotaRunLoading}>
                {quotaRunLoading ? 'Running…' : 'Run check now'}
              </button>
            </div>
            <p className="dev-muted" style={{ margin: '0.5rem 0 1rem' }}>
              A nightly job (7:00 UTC) evaluates free-tier thresholds and notifies developers by push and email at 75% (watch) and 90% (critical). One alert per metric per day.
            </p>
            {quotaRunResult && (
              <p className="dev-muted" style={{ marginBottom: '0.75rem' }}>
                {quotaRunResult.error
                  ? `Check failed: ${quotaRunResult.error}`
                  : `Checked ${quotaRunResult.checked} metrics · ${quotaRunResult.triggered?.length || 0} above threshold · ${quotaRunResult.newAlerts || 0} new alert(s) · ${quotaRunResult.developersNotified || 0} developer(s) notified.`}
              </p>
            )}
            {quotaAlerts.length === 0 ? (
              <p className="dev-muted">No quota alerts recorded. 🎉</p>
            ) : (
              <div className="dev-table-wrap">
                <table className="dev-org-table">
                  <thead>
                    <tr>
                      <th>When</th>
                      <th>Metric</th>
                      <th>Level</th>
                      <th>Usage</th>
                    </tr>
                  </thead>
                  <tbody>
                    {quotaAlerts.map((alert) => (
                      <tr key={alert.id}>
                        <td style={{ whiteSpace: 'nowrap' }}>{formatLastEvent(alert.created_at)}</td>
                        <td><code>{alert.metric}</code></td>
                        <td>
                          <span className={`dev-status ${alert.level === 'critical' ? 'danger' : 'warn'}`}>{alert.level}</span>
                        </td>
                        <td>{alert.detail || `${alert.percent}%`}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
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
