import { Handle, Position } from '@xyflow/react';

// Connections are drawn between card edges (ConnectionEdge), so these handles
// are only the anchors React Flow requires. They are never shown or used.
export default function Anchors() {
  return <>
    <Handle type="target" position={Position.Top} className="lc-handle" isConnectable={false} />
    <Handle type="source" position={Position.Top} className="lc-handle" isConnectable={false} />
  </>;
}
