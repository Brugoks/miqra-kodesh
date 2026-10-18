// The models a developer account can switch between inside Living Canvas.
//
// This file is the single list: the browser builds its picker from it and the
// `study-canvas` edge function validates a request against it, so the two
// cannot disagree. A request names a model by `key` and nothing else about the
// model is ever taken from the client. The server honours a choice only for the
// real `developer` role (see supabase/functions/study-canvas/models.ts).
//
// `maxTokens` is the completion budget. The SiliconFlow defaults assume the
// handler's `enable_thinking: false`; the GLM models ignore that switch and
// reason anyway (measured: ~2.5k reasoning tokens, ~36 s), so they carry a
// bigger budget and `thinks`, which the picker shows as a slowness warning.
// Every OpenRouter model listed here has mandatory reasoning that cannot be
// turned off, so they run at the lowest effort (see providerBody) with room for
// it in `maxTokens`; that is quick enough not to need the warning.

const SILICONFLOW = 'siliconflow';
const OPENROUTER = 'openrouter';

export const CANVAS_MODEL_PROVIDERS = [SILICONFLOW, OPENROUTER];
export const SILICONFLOW_DEFAULT_MODEL = 'deepseek-ai/DeepSeek-V4-Flash';

const siliconflow = (model, label, extra = {}) => ({ provider: SILICONFLOW, model, label, maxTokens: 2200, thinks: false, ...extra });
const openrouter = (model, label, extra = {}) => ({ provider: OPENROUTER, model, label, maxTokens: 8000, thinks: false, ...extra });

const GROUPS = [
  {
    id: SILICONFLOW,
    label: 'SiliconFlow · Chinese models',
    models: [
      siliconflow(SILICONFLOW_DEFAULT_MODEL, 'DeepSeek V4 Flash'),
      siliconflow('deepseek-ai/DeepSeek-V4.1-Flash', 'DeepSeek V4.1 Flash'),
      siliconflow('deepseek-ai/DeepSeek-V4-Pro', 'DeepSeek V4 Pro'),
      siliconflow('moonshotai/Kimi-K3', 'Kimi K3'),
      siliconflow('moonshotai/Kimi-K2.6', 'Kimi K2.6'),
      siliconflow('Qwen/Qwen3.8-2.4T-A95B', 'Qwen 3.8 (2.4T)'),
      siliconflow('Qwen/Qwen3.6-35B-A3B', 'Qwen 3.6 35B'),
      siliconflow('MiniMaxAI/MiniMax-M3', 'MiniMax M3'),
      siliconflow('zai-org/GLM-5.3', 'GLM 5.3', { maxTokens: 6000, thinks: true }),
      siliconflow('zai-org/GLM-5.3-Flash', 'GLM 5.3 Flash', { maxTokens: 6000, thinks: true }),
    ],
  },
  {
    id: OPENROUTER,
    label: 'OpenRouter · Frontier models',
    models: [
      openrouter('openai/gpt-6.1-sol', 'GPT-6.1 Sol'),
      openrouter('anthropic/claude-sonnet-5.5', 'Claude Sonnet 5.5'),
      openrouter('google/gemini-4-argon', 'Gemini 4 Argon'),
      openrouter('google/gemini-3.8-flash', 'Gemini 3.8 Flash'),
    ],
  },
];

export const canvasModelKey = (provider, model) => `${provider}:${model}`;

export const CANVAS_MODEL_GROUPS = GROUPS.map((group) => ({
  ...group,
  models: group.models.map((entry) => ({ ...entry, key: canvasModelKey(entry.provider, entry.model) })),
}));

export const CANVAS_MODELS = CANVAS_MODEL_GROUPS.flatMap((group) => group.models);

const BY_KEY = new Map(CANVAS_MODELS.map((entry) => [entry.key, entry]));

/** The registry entry for a picker value, or null when it names nothing we offer. */
export const canvasModelByKey = (key) => (typeof key === 'string' ? BY_KEY.get(key) || null : null);

/** A readable name for whatever model a run reports, falling back to the raw id. */
export const canvasModelLabel = (provider, model) => BY_KEY.get(canvasModelKey(provider, model))?.label || model;
