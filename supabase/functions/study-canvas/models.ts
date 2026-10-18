import { SILICONFLOW_DEFAULT_MODEL, canvasModelByKey } from '../../../src/lib/canvasModels.js';
import { CanvasError } from './core.ts';

export type Provider = 'siliconflow' | 'openrouter';
export type Selection = {
  provider: Provider;
  model: string;
  maxTokens: number;
  /** True only when a developer picked a model; false for the server default. */
  explicit: boolean;
};
type Env = (key: string) => string | undefined;
type Message = { role: string; content: string };

const SILICONFLOW_BASES = ['https://api.siliconflow.com/v1', 'https://api.siliconflow.cn/v1'];
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

/**
 * Who answers a request. Everyone gets the configured SiliconFlow model. A
 * developer may name any model in the shared registry by its key; for anyone
 * else the field is ignored rather than rejected, so a stale choice left on a
 * device (or a demoted account) degrades to the default instead of an error.
 * Nothing about the model comes from the client except that key.
 */
export function selectModel(choice: unknown, role: string, env: Env): Selection {
  if (role === 'developer' && choice != null && choice !== '') {
    const entry = canvasModelByKey(choice);
    if (!entry) throw new CanvasError('That model is not available for Living Canvas.');
    return { provider: entry.provider as Provider, model: entry.model, maxTokens: entry.maxTokens, explicit: true };
  }
  return { provider: 'siliconflow', model: env('SILICONFLOW_CANVAS_MODEL') || SILICONFLOW_DEFAULT_MODEL, maxTokens: 2200, explicit: false };
}

/** Where to send the request and how to authenticate it; throws 503 if this provider is not set up. */
export function providerTarget(selection: Selection, env: Env): { url: string; headers: Record<string, string> } {
  if (selection.provider === 'openrouter') {
    const key = env('OPENROUTER_API_KEY');
    if (!key) throw new CanvasError('OpenRouter is not configured for Living Study Canvas yet.', 503);
    return {
      url: OPENROUTER_URL,
      headers: {
        Authorization: `Bearer ${key}`, 'Content-Type': 'application/json',
        'HTTP-Referer': env('OPENROUTER_HTTP_REFERER') || 'http://localhost:5173',
        'X-Title': env('OPENROUTER_APP_TITLE') || 'Miqra Kodesh',
      },
    };
  }
  const key = env('SILICONFLOW_API_KEY');
  if (!key) throw new CanvasError('SiliconFlow is not configured for Living Study Canvas yet.', 503);
  const base = (env('SILICONFLOW_BASE_URL') || SILICONFLOW_BASES[0]).replace(/\/$/, '');
  if (!SILICONFLOW_BASES.includes(base)) throw new CanvasError('SiliconFlow endpoint configuration is invalid.', 503);
  return { url: `${base}/chat/completions`, headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' } };
}

/**
 * The two providers switch reasoning off differently. SiliconFlow takes
 * `enable_thinking: false`. Every OpenRouter model offered here has mandatory
 * reasoning, so the lowest effort is requested and its text is dropped from the
 * reply; `max_tokens` counts reasoning, hence the larger budget. `require_parameters`
 * keeps OpenRouter from routing to a host that would quietly ignore the JSON mode.
 */
export function providerBody(selection: Selection, messages: Message[]) {
  if (selection.provider === 'openrouter') {
    return {
      model: selection.model, messages, stream: false, max_tokens: selection.maxTokens,
      response_format: { type: 'json_object' }, reasoning: { effort: 'low', exclude: true }, provider: { require_parameters: true },
    };
  }
  return { model: selection.model, messages, stream: false, max_tokens: selection.maxTokens, enable_thinking: false, response_format: { type: 'json_object' } };
}

/**
 * What a failed provider call says. A developer who picked the model gets the
 * provider's own explanation appended, because "model not found" is exactly what
 * they need while trying models; everyone else keeps the generic sentence.
 */
export function providerFailure(selection: Selection, status: number, detail: unknown) {
  const name = selection.provider === 'openrouter' ? 'OpenRouter' : 'SiliconFlow';
  const base = status === 429 ? `${name} is busy. Wait a moment and retry.`
    : status === 401 || status === 403 ? `The ${name} key could not be authorized. Check the server key${selection.provider === 'siliconflow' ? ' and region' : ''}.`
    : status === 402 ? `${name} reports the account is out of credits.`
    : selection.provider === 'siliconflow' ? 'SiliconFlow could not complete this study. Please retry or check the configured model.'
    : 'OpenRouter could not complete this study. Please retry or choose another model.';
  const extra = selection.explicit && typeof detail === 'string' && detail.trim() ? ` (${detail.trim().slice(0, 200)})` : '';
  return { message: base + extra, status: status === 429 ? 429 : 502 };
}
