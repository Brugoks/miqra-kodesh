import { GitBranch, History } from 'lucide-react';
import { orderTree } from '../../lib/studyCanvasModel';

/** The study's history as a tree: the main line flat, each branch indented under the step it left from. */
export default function CanvasPath({ steps, currentId, onSelect }) {
  return <nav className="canvas-path" aria-label="Study path"><h3><History size={16} /> Your study path</h3>
    <ol>{orderTree(steps).map(({ step, number, depth, branchFrom }) => <li key={step.id} className={branchFrom ? 'canvas-path-branch' : ''} style={{ '--canvas-depth': Math.min(depth, 4) }}>
      <button type="button" aria-current={step.id === currentId ? 'step' : undefined} onClick={() => onSelect(step.id)}>
        <span className="canvas-path-number">{number}</span>
        <span>{branchFrom && <em><GitBranch size={12} /> from step {branchFrom}</em>}<strong>{step.explanation.title}</strong>{step.focus && <small>{step.focus}</small>}</span>
      </button></li>)}</ol>
  </nav>;
}
