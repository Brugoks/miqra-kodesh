import { memo } from 'react';
import { NodeResizeControl } from '@xyflow/react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import Anchors from './Anchors';
import { useBoard } from './BoardContext';

/**
 * A named frame around related thoughts. Its header drags the whole group; the
 * body lets clicks and drags through to the board, so panning and selecting work
 * over it. Collapsed, it shows a count and carries the links of what it hides.
 */
function SectionNode({ id, data, selected }) {
  const board = useBoard();
  const name = data.title.trim() || 'Untitled section';
  const target = board.dropTarget === id;
  return <div className={['lc-section', `lc-section--${data.color}`, data.collapsed && 'is-collapsed', selected && 'is-selected', target && 'is-drop-target'].filter(Boolean).join(' ')}>
    <Anchors />
    {selected && !data.collapsed && <NodeResizeControl className="lc-section__resize" position="bottom-right" minWidth={data.minWidth} minHeight={data.minHeight}
      onResizeEnd={(_event, params) => board.resizeSection(id, params.width, params.height)} aria-label={`Resize section ${name}`}><span aria-hidden="true" className="lc-section__grip" /></NodeResizeControl>}
    <header className="lc-section__header">
      <button className="lc-section__toggle nodrag" aria-expanded={!data.collapsed} aria-label={`${data.collapsed ? 'Expand' : 'Collapse'} section ${name}`} onClick={() => board.toggleSection(id)}>
        {data.collapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
      </button>
      <span className="lc-section__title">{name}</span>
      {data.collapsed && <span className="lc-section__count">{data.cards} {data.cards === 1 ? 'thought' : 'thoughts'}{data.links ? ` · ${data.links} ${data.links === 1 ? 'link' : 'links'}` : ''}</span>}
    </header>
  </div>;
}

export default memo(SectionNode);
