import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Modal } from "antd";
import { MinusOutlined, PlusOutlined } from "@ant-design/icons";
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
  lastX: number;
  lastY: number;
}

interface PanState {
  startX: number;
  startY: number;
  startTx: number;
  startTy: number;
}

interface ViewState {
  scale: number;
  tx: number;
  ty: number;
}

const MIN_SCALE = 0.4;
const MAX_SCALE = 2.5;
const ZOOM_STEP = 1.25;

export function RelationGraphModal({ open, centerTableId, relations, tables, onClose, onJump }: RelationGraphModalProps) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [centerId, setCenterId] = useState(centerTableId);
  const [nodes, setNodes] = useState<Record<string, GraphNode>>({});
  const [edges, setEdges] = useState<GraphEdge[]>([]);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [view, setView] = useState<ViewState>({ scale: 1, tx: 0, ty: 0 });
  const dragRef = useRef<DragState | null>(null);
  const panRef = useRef<PanState | null>(null);

  useEffect(() => {
    if (!open) return;
    setCenterId(centerTableId);
    setView({ scale: 1, tx: 0, ty: 0 });
  }, [open, centerTableId]);

  const measure = useCallback(() => {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (rect && rect.width > 0 && rect.height > 0) {
      setSize({ width: Math.round(rect.width), height: Math.round(rect.height) });
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    measure();
    const observer = new ResizeObserver(measure);
    if (wrapRef.current) observer.observe(wrapRef.current);
    return () => observer.disconnect();
  }, [open, measure]);

  useEffect(() => {
    if (!open || size.width <= 0 || size.height <= 0) return;
    const layout = layoutGraph(centerId, relations, size.width, size.height);
    setNodes(layout.nodes);
    setEdges(layout.edges);
  }, [open, centerId, relations, size]);

  // 滚轮缩放（以鼠标位置为中心）。挂在 document 上，避免弹窗内容延迟挂载时监听丢失。
  useEffect(() => {
    if (!open) return;
    const handleWheel = (event: WheelEvent) => {
      const wrap = wrapRef.current;
      if (!wrap) return;
      if (!(event.target instanceof Node) || !wrap.contains(event.target)) return;
      event.preventDefault();
      const rect = wrap.getBoundingClientRect();
      const px = event.clientX - rect.left;
      const py = event.clientY - rect.top;
      setView((current) => {
        const factor = event.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
        const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, current.scale * factor));
        const worldX = (px - current.tx) / current.scale;
        const worldY = (py - current.ty) / current.scale;
        return {
          scale,
          tx: px - worldX * scale,
          ty: py - worldY * scale,
        };
      });
    };
    document.addEventListener("wheel", handleWheel, { passive: false });
    return () => document.removeEventListener("wheel", handleWheel);
  }, [open]);

  const zoomAroundCenter = (factor: number) => {
    setView((current) => {
      const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, current.scale * factor));
      const cx = size.width / 2;
      const cy = size.height / 2;
      const worldX = (cx - current.tx) / current.scale;
      const worldY = (cy - current.ty) / current.scale;
      return { scale, tx: cx - worldX * scale, ty: cy - worldY * scale };
    });
  };

  const tableById = (id: string) => tables.find((item) => item.id === id);
  const relCount = (id: string) => relations.filter((relation) => relation.source_table.id === id || relation.target_table.id === id).length;

  const handlePointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
    event.preventDefault();
    const target = (event.target as Element).closest(".graph-node") as SVGGElement | null;
    if (target?.dataset.id && nodes[target.dataset.id]) {
      const id = target.dataset.id;
      dragRef.current = { id, startX: event.clientX, startY: event.clientY, lastX: event.clientX, lastY: event.clientY };
    } else {
      panRef.current = { startX: event.clientX, startY: event.clientY, startTx: view.tx, startTy: view.ty };
    }
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current;
    if (drag) {
      const deltaX = (event.clientX - drag.lastX) / view.scale;
      const deltaY = (event.clientY - drag.lastY) / view.scale;
      drag.lastX = event.clientX;
      drag.lastY = event.clientY;
      setNodes((current) => {
        const node = current[drag.id];
        if (!node) return current;
        const next = { ...current, [drag.id]: { ...node, x: node.x + deltaX, y: node.y + deltaY } };
        setEdges(buildEdges(next, relations));
        return next;
      });
      return;
    }
    const pan = panRef.current;
    if (pan) {
      setView((current) => ({
        ...current,
        tx: pan.startTx + (event.clientX - pan.startX),
        ty: pan.startTy + (event.clientY - pan.startY),
      }));
    }
  };

  const handlePointerUp = (event: React.PointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current;
    if (drag) {
      const moved = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY);
      const clickedId = drag.id;
      dragRef.current = null;
      if (moved < 5 && clickedId !== centerId) {
        setCenterId(clickedId);
        onJump(clickedId);
      }
    }
    panRef.current = null;
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
      afterOpenChange={(nextOpen) => {
        if (nextOpen) measure();
      }}
    >
      <div className="relation-graph-wrap" ref={wrapRef}>
        <div className="relation-graph-legend">
          <span><i className="auto" />自动解析关系</span>
          <span><i className="manual" />手工维护关系</span>
        </div>
        <div className="relation-graph-toolbar">
          <Button size="small" icon={<MinusOutlined />} aria-label="缩小" onClick={() => zoomAroundCenter(1 / ZOOM_STEP)} />
          <Button size="small" aria-label="复位缩放" onClick={() => setView({ scale: 1, tx: 0, ty: 0 })}>
            1:1
          </Button>
          <Button size="small" icon={<PlusOutlined />} aria-label="放大" onClick={() => zoomAroundCenter(ZOOM_STEP)} />
        </div>
        <svg
          ref={svgRef}
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
          <g transform={`translate(${view.tx}, ${view.ty}) scale(${view.scale})`}>
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
          </g>
        </svg>
        <div className="relation-graph-tip">滚轮或右上角按钮缩放 · 点击其他表节点切换中心 · 拖动节点调整布局</div>
      </div>
    </Modal>
  );
}
