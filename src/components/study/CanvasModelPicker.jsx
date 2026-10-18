import { useId } from 'react';
import { CANVAS_MODEL_GROUPS, canvasModelLabel } from '../../lib/canvasModels';
import { useCanvasModel } from './canvasModelContext';

/** Developer-only switch for the AI model behind Living Canvas. Renders nothing for anyone else. */
export default function CanvasModelPicker({ disabled = false }) {
  const { canChoose, choice, setChoice } = useCanvasModel();
  const id = useId();
  if (!canChoose) return null;
  return <div className="moment-model">
    <label htmlFor={id}>AI model <small>developer account</small></label>
    <select id={id} value={choice} disabled={disabled} onChange={(event) => setChoice(event.target.value)}>
      <option value="">Server default</option>
      {CANVAS_MODEL_GROUPS.map((group) => <optgroup key={group.id} label={group.label}>
        {group.models.map((model) => <option key={model.key} value={model.key}>{model.label}{model.thinks ? ' · thinks first' : ''}</option>)}
      </optgroup>)}
    </select>
    <p className="moment-hint">Only you see this. Each request uses the model chosen here, and the line under the results says what it cost.</p>
  </div>;
}

const seconds = (ms) => `${(ms / 1000).toFixed(1)}s`;
const money = (usd) => `$${usd < 0.01 ? usd.toFixed(4) : usd.toFixed(3)}`;

/** What the last run used, for comparing models. `run` is the server's `diagnostics`. */
export function CanvasModelRun({ run }) {
  const { canChoose } = useCanvasModel();
  if (!canChoose || !run) return null;
  const parts = [canvasModelLabel(run.provider, run.model), seconds(run.ms), `${run.inputTokens.toLocaleString()} in / ${run.outputTokens.toLocaleString()} out`];
  if (typeof run.costUsd === 'number') parts.push(money(run.costUsd));
  return <p className="moment-model-run" role="status" aria-label="Model used for these results">{parts.join(' · ')}</p>;
}
