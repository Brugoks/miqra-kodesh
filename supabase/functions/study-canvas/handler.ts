import { providerBody, providerFailure, providerTarget, selectModel } from './models.ts';
import { relatedScripture, validateRelated } from './related.ts';
import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { CanvasError, buildMessages, mergeWorkspaces, parseExplanation, parseReference, parseReferences, validateTurns, type Workspace } from './core.ts';

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
    const startedAt = Date.now();
    try {
      // Verify identity before reading private input or spending provider credits.
      const identity = await deps.identity(request);
      if (!identity) return jsonResponse({ error: 'Sign in to use Living Study Canvas.' }, 401);
      const raw = await request.text();
      if (raw.length > 40000) throw new CanvasError('The study request is too large.', 413);
      let body;
      try { body = JSON.parse(raw); } catch { throw new CanvasError('Send a valid study request.'); }
      if (!body || !['sources', 'explain', 'related'].includes(body.action)) throw new CanvasError('Choose sources, explain, or related.');
      // Related Scripture belongs to every signed-in member's personal canvas.
      // The separate study preview keeps its existing role boundary.
      if (body.action !== 'related' && !['admin', 'developer'].includes(identity.role)) return jsonResponse({ error: 'Living Study Canvas is available to admins only.' }, 403);
      // Leave time for both reference selection and the grounded explanation.
      const timeout = body.action === 'related' ? 110000 : 50000;
      const signal = AbortSignal.any([request.signal, AbortSignal.timeout(timeout)]);
      // Resolved before any source or provider work, so a bad choice costs nothing.
      const selection = selectModel(body.modelChoice, identity.role, deps.env);
      const related = body.action === 'related' ? validateRelated(body) : null;
      const specs = related ? [] : body.action === 'explain' ? parseReferences(body) : [parseReference(body.reference)];
      const turns = body.action === 'explain' ? validateTurns(body.turns) : [];
      const workspaces = await Promise.all(specs.map((spec) => deps.loadSources(spec.reference, signal)));
      if (body.action === 'sources') return jsonResponse({ workspace: workspaces[0] });
      const target = providerTarget(selection, deps.env);
      const { model } = selection;
      const spent = { calls: 0, inputTokens: 0, outputTokens: 0, costUsd: null as number | null };
      const generate = async (messages: { role: string; content: string }[]) => {
        const response = await deps.fetch(target.url, { method: 'POST', signal, headers: target.headers, body: JSON.stringify(providerBody(selection, messages)) });
        const data = await response.json().catch(() => null);
        const cost = typeof data?.usage?.cost === 'number' && Number.isFinite(data.usage.cost) ? data.usage.cost : null;
        spent.calls += 1; spent.inputTokens += Number(data?.usage?.prompt_tokens) || 0; spent.outputTokens += Number(data?.usage?.completion_tokens) || 0;
        if (cost !== null) spent.costUsd = (spent.costUsd ?? 0) + cost;
        await deps.recordUsage({ provider: selection.provider, feature: related ? 'canvas-related-scripture' : 'study-canvas', status: response.status, userId: identity.userId, organizationId: identity.organizationId,
          units: Number(data?.usage?.total_tokens) || 1, metadata: { model, inputTokens: data?.usage?.prompt_tokens ?? null, outputTokens: data?.usage?.completion_tokens ?? null, ...(cost !== null ? { costUsd: cost } : {}), ...(selection.explicit ? { explicitChoice: true } : {}) } });
        if (!response.ok) {
          const failure = providerFailure(selection, response.status, data?.error?.message);
          throw new CanvasError(failure.message, failure.status);
        }
        const content = data?.choices?.[0]?.message?.content;
        if (typeof content !== 'string' || data?.choices?.[0]?.finish_reason === 'length') throw new CanvasError('The explanation was incomplete. Please retry.', 502);
        return content;
      };
      // Only a developer is told what a run cost; it is how the models get compared.
      const diagnostics = () => (identity.role === 'developer' ? { diagnostics: { provider: selection.provider, model, ...spent, ms: Date.now() - startedAt } } : {});
      if (related) return jsonResponse({ suggestions: await relatedScripture(related, generate, deps.loadSources, signal), model, ...diagnostics() });
      const workspace = mergeWorkspaces(workspaces);
      const content = await generate(buildMessages(workspace, turns));
      return jsonResponse({ explanation: parseExplanation(content, workspace.sources), model, ...diagnostics() });
    } catch (error) {
      if (error instanceof CanvasError) return jsonResponse({ error: error.message }, error.status);
      if (error instanceof Error && ['AbortError', 'TimeoutError'].includes(error.name)) return jsonResponse({ error: 'The study request timed out or was stopped. You can retry.' }, 504);
      return jsonResponse({ error: 'Living Study Canvas could not complete this request. Please retry.' }, 500);
    }
  };
}
