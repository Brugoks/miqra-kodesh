import { memo } from 'react';
import { BaseEdge, EdgeLabelRenderer, getBezierPath, useInternalNode } from '@xyflow/react';
import { floatingEdge } from '../../../lib/canvasEdgeGeometry';

const rectOf = (node) => ({ ...node.internals.positionAbsolute, width: node.measured?.width ?? node.width ?? 0, height: node.measured?.height ?? node.height ?? 0 });

/** A labelled link between two cards, drawn from edge to edge so it follows them as they move. */
function ConnectionEdge({ id, source, target, markerEnd, selected, data }) {
  const from = useInternalNode(source);
  const to = useInternalNode(target);
  if (!from || !to) return null;
  const { sx, sy, tx, ty, sourcePosition, targetPosition } = floatingEdge(rectOf(from), rectOf(to));
  const [path, labelX, labelY] = getBezierPath({ sourceX: sx, sourceY: sy, sourcePosition, targetX: tx, targetY: ty, targetPosition });
  return <>
    <BaseEdge id={id} path={path} markerEnd={markerEnd} interactionWidth={28} className={`lc-edge${selected ? ' is-selected' : ''}${data?.viaSection ? ' is-via-section' : ''}`} />
    {data?.label && <EdgeLabelRenderer>
      <div className={`lc-edge-label nodrag nopan${selected ? ' is-selected' : ''}`} style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}>{data.label}</div>
    </EdgeLabelRenderer>}
  </>;
}

export default memo(ConnectionEdge);
