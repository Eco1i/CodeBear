import { useEffect, useRef, useState } from "react";
import { Modal } from "antd";
import { buildEdges, layoutGraph, NODE_SIZE } from "../model";
import type { GraphEdge, GraphNode, Relation, RelationOptionTable } from "../types";

interface RelationGraphModalProps {
  open: boolean;
  centerTableId: string;
  relations: Relation[];
  tables: RelationOptionTable[];
  onClose: () => void;
  onJump: (tableId: string) => void;
}

interface DragState {
  id: string;
  startX: number;
  startY: number;
  dx: number;
  dy: number;
}

export function RelationGraphModal({ open, centerTableId, relations, tables, onClose, onJump }: RelationGraphModalProps) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [centerId, setCenterId] = useState(centerTableId);
  const [nodes, setNodes] = useState<Record<string, GraphNode>>({});
  const [edges, setEdges] = useState<GraphEdge[]>([]);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const dragRef = useRef<DragState | null>(null);

  useEffect(() => {
    if (!open) return;
    setCenterId(centerTableId);
  }, [open, centerTableId]);

  useEffect(() => {
    if (!open || !wrapRef.current) return;
    const measure = () => {
      const rect = wrapRef.current?.getBoundingClientRect();
      if (rect) setSize({ width: Math.round(rect.width), height: Math.round(rect.height) });
    };
    measure();
    const observer = new ResizeObserver(measure);
    if (wrapRef.current) observer.observe(wrapRef.current);
    return () => observer.disconnect();
  }, [open]);

  useEffect(() => {
    if (!open || size.width <= 0 || size.height <= 0) return;
    const layout = layoutGraph(centerId, relations, size.width, size.height);
    setNodes(layout.nodes);
    setEdges(layout.edges);
  }, [open, centerId, relations, size]);

  const tableById = (id: string) => tables.find((item) => item.id === id);
  const relCount = (id: string) => relations.filter((relation) => relation.source_table.id === id || relation.target_table.id === id).length;

  const handlePointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
    const target = (event.target as Element).closest(".graph-node") as SVGGElement | null;
    if (!target?.dataset.id) return;
    const id = target.dataset.id;
    const node = nodes[id];
    if (!node) return;
    dragRef.current = {
      id,
      startX: event.clientX,
      startY: event.clientY,
      dx: event.clientX - node.x,
      dy: event.clientY - node.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    setNodes((current) => {
      const node = current[drag.id];
      if (!node) return current;
      const next = { ...current, [drag.id]: { ...node, x: event.clientX - drag.dx, y: event.clientY - drag.dy } };
      setEdges(buildEdges(next, relations));
      return next;
    });
  };

  const handlePointerUp = (event: React.PointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const moved = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY);
    const clickedId = drag.id;
    dragRef.current = null;
    if (moved < 5 && clickedId !== centerId) {
      setCenterId(clickedId);
      onJump(clickedId);
    }
  };

  return (
    <Modal
      open={open}
      onCancel={onClose}
      width={1040}
      centered
      className="relation-graph-modal"
      title={<span className="relation-graph-title">表关系图</span>}
      footer={null}
    >
      <div className="relation-graph-wrap" ref={wrapRef}>
        <div className="relation-graph-legend">
          <span><i className="auto" />自动解析关系</span>
          <span><i className="manual" />手工维护关系</span>
        </div>
        <svg
          width={size.width}
          height={size.height}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        >
          <defs>
            <marker id="rel-arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M 0 1 L 9 5 L 0 9 z" className="graph-arrow auto" />
            </marker>
            <marker id="rel-arr-manual" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M 0 1 L 9 5 L 0 9 z" className="graph-arrow manual" />
            </marker>
          </defs>
          {edges.map((edge) => {
            const manual = edge.relation.source_type === "manual";
            return (
              <g key={edge.relation.id}>
                <path
                  className={`graph-edge ${manual ? "manual" : ""}`}
                  d={`M ${edge.x1} ${edge.y1} L ${edge.x2} ${edge.y2}`}
                  markerEnd={`url(#${manual ? "rel-arr-manual" : "rel-arr"})`}
                />
                <text className="graph-edge-label" x={edge.midX} y={edge.midY - 7} textAnchor="middle">
                  {edge.relation.source_field.code} → {edge.relation.target_field.code}
                </text>
                <text className="graph-edge-label" x={edge.midX} y={edge.midY + 7} textAnchor="middle">
                  {edge.relation.cardinality ? `${edge.relation.cardinality} · ` : ""}
                  {edge.relation.name}
                </text>
              </g>
            );
          })}
          {Object.values(nodes).map((node) => {
            const table = tableById(node.id);
            if (!table) return null;
            const selected = node.id === centerId;
            const x = node.x - NODE_SIZE.width / 2;
            const y = node.y - NODE_SIZE.height / 2;
            return (
              <g className={`graph-node ${selected ? "selected" : ""}`} data-id={node.id} key={node.id}>
                <rect x={x} y={y} width={NODE_SIZE.width} height={NODE_SIZE.height} />
                <text className="graph-node-name" x={node.x} y={node.y - 18} textAnchor="middle">
                  {table.name}
                </text>
                <text className="graph-node-code" x={node.x} y={node.y} textAnchor="middle">
                  {table.code}
                </text>
                <text className="graph-node-meta" x={node.x} y={node.y + 18} textAnchor="middle">
                  {table.fields.length} 字段 · {relCount(node.id)} 关系
                </text>
              </g>
            );
          })}
        </svg>
        <div className="relation-graph-tip">点击其他表节点可切换中心并同步跳转；拖动节点调整布局</div>
      </div>
    </Modal>
  );
}
