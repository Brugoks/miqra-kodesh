import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { CanvasError, buildMessages, parseExplanation, parseReference, validateTurns, type Workspace } from './core.ts';

type Identity = { userId: string; role: string; organizationId: string | null };
type Dependencies = {
  identity: (request: Request) => Promise<Identity | null>;
  loadSources: (reference: string, signal: AbortSignal) => Promise<Workspace>;
  env: (key: string) => string | undefined;
  fetch: typeof fetch;
  recordUsage: (event: any) => Promise<void>;
};

export function createHandler(deps: Dependencies) {
  return async (request: Request) => {
    if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
    if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);
    try {
      // Check the verified database role before reading data or spending provider credits.
      const identity = await deps.identity(request);
      if (!identity) return jsonResponse({ error: 'Sign in to use Living Study Canvas.' }, 401);
      if (!['admin', 'developer'].includes(identity.role)) return jsonResponse({ error: 'Living Study Canvas is available to admins only.' }, 403);
      const raw = await request.text();
      if (raw.length > 40000) throw new CanvasError('The study request is too large.', 413);
      let body;
      try { body = JSON.parse(raw); } catch { throw new CanvasError('Send a valid study request.'); }
      if (!body || !['sources', 'explain'].includes(body.action)) throw new CanvasError('Choose sources or explain.');
      const spec = parseReference(body.reference);
      const turns = body.action === 'explain' ? validateTurns(body.turns) : [];
      const signal = AbortSignal.any([request.signal, AbortSignal.timeout(50000)]);
      const workspace = await deps.loadSources(spec.reference, signal);
      if (body.action === 'sources') return jsonResponse({ workspace });
      const key = deps.env('SILICONFLOW_API_KEY');
      if (!key) throw new CanvasError('SiliconFlow is not configured for Living Study Canvas yet.', 503);
      const base = (deps.env('SILICONFLOW_BASE_URL') || 'https://api.siliconflow.com/v1').replace(/\/$/, '');
      if (!['https://api.siliconflow.com/v1', 'https://api.siliconflow.cn/v1'].includes(base)) throw new CanvasError('SiliconFlow endpoint configuration is invalid.', 503);
      const model = deps.env('SILICONFLOW_CANVAS_MODEL') || 'deepseek-ai/DeepSeek-V4-Flash';
      const response = await deps.fetch(`${base}/chat/completions`, {
        method: 'POST', signal,
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, messages: buildMessages(workspace, turns), stream: false, max_tokens: 2200, enable_thinking: false, response_format: { type: 'json_object' } }),
      });
      const data = await response.json().catch(() => null);
      await deps.recordUsage({ provider: 'siliconflow', feature: 'study-canvas', status: response.status, userId: identity.userId, organizationId: identity.organizationId,
        units: Number(data?.usage?.total_tokens) || 1, metadata: { model, inputTokens: data?.usage?.prompt_tokens ?? null, outputTokens: data?.usage?.completion_tokens ?? null } });
      if (!response.ok) {
        const message = response.status === 429 ? 'SiliconFlow is busy. Wait a moment and retry.'
          : response.status === 401 || response.status === 403 ? 'The SiliconFlow key could not be authorized. Check the server key and region.'
          : 'SiliconFlow could not complete this study. Please retry or check the configured model.';
        throw new CanvasError(message, response.status === 429 ? 429 : 502);
      }
      const content = data?.choices?.[0]?.message?.content;
      if (typeof content !== 'string' || data?.choices?.[0]?.finish_reason === 'length') throw new CanvasError('The explanation was incomplete. Please retry.', 502);
      return jsonResponse({ explanation: parseExplanation(content, workspace.sources), model });
    } catch (error) {
      if (error instanceof CanvasError) return jsonResponse({ error: error.message }, error.status);
      if (error instanceof Error && ['AbortError', 'TimeoutError'].includes(error.name)) return jsonResponse({ error: 'The study request timed out or was stopped. You can retry.' }, 504);
      return jsonResponse({ error: 'Living Study Canvas could not complete this request. Please retry.' }, 500);
    }
  };
}
