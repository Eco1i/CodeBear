import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, Input, Modal } from "antd";
import { MinusOutlined, PlusOutlined, SearchOutlined } from "@ant-design/icons";
import { buildEdges, layoutGraph, otherTableCode, relationDisplayName } from "../model";
import type { GraphEdge, GraphItem, GraphNode, Relation, RelationOptionTable } from "../types";

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
  moved: number;
}

interface ViewState {
  scale: number;
  tx: number;
  ty: number;
}

interface HoverTip {
  x: number;
  y: number;
  relation: Relation;
  side: -1 | 1;
  nodeHover: boolean;
}

type Focus = { kind: "node"; id: string } | { kind: "edge"; index: number } | null;

const MIN_SCALE = 0.4;
const MAX_SCALE = 2.5;
const ZOOM_STEP = 1.25;
const DIR_OPTIONS: Array<{ key: "all" | "in" | "out"; label: string }> = [
  { key: "all", label: "全部" },
  { key: "in", label: "入向" },
  { key: "out", label: "出向" },
];

export function RelationGraphModal({ open, centerTableId, relations, tables, onClose, onJump }: RelationGraphModalProps) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [centerId, setCenterId] = useState(centerTableId);
  const [nodes, setNodes] = useState<Record<string, GraphNode>>({});
  const [items, setItems] = useState<GraphItem[]>([]);
  const [edges, setEdges] = useState<GraphEdge[]>([]);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [view, setView] = useState<ViewState>({ scale: 1, tx: 0, ty: 0 });
  const [focus, setFocus] = useState<Focus>(null);
  const [hoverTip, setHoverTip] = useState<HoverTip | null>(null);
  const [hoveredEdge, setHoveredEdge] = useState<number | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [entering, setEntering] = useState(false);
  const [dirFilter, setDirFilter] = useState<"all" | "in" | "out">("all");
  const [search, setSearch] = useState("");
  const [searchDraft, setSearchDraft] = useState("");
  const dragRef = useRef<DragState | null>(null);
  const panRef = useRef<PanState | null>(null);
  const enterTimer = useRef<number | null>(null);
  const lastClickRef = useRef<{ id: string; time: number } | null>(null);

  const tableById = (id: string) => tables.find((item) => item.id === id);
  const centerCode = tableById(centerId)?.code || "";

  const visibleRelations = useMemo(() => {
    const q = search.trim().toLowerCase();
    return relations.filter((relation) => {
      if (dirFilter === "in" && relation.target_table.id !== centerId) return false;
      if (dirFilter === "out" && relation.source_table.id !== centerId) return false;
      if (!q) return true;
      const other = otherTableCode(relation, centerId);
      const table = tableById(relation.source_table.id === centerId ? relation.target_table.id : relation.source_table.id);
      return `${other} ${table?.name || ""}`.toLowerCase().includes(q);
    });
  }, [relations, dirFilter, search, centerId, tables]);

  useEffect(() => {
    if (!open) return;
    setCenterId(centerTableId);
    setView({ scale: 1, tx: 0, ty: 0 });
    setFocus(null);
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
    const layout = layoutGraph(centerId, centerCode, visibleRelations, size.width, size.height);
    setNodes(layout.nodes);
    setItems(layout.items);
    setEdges(layout.edges);
    setFocus(null);
    setEntering(true);
    if (enterTimer.current) window.clearTimeout(enterTimer.current);
    enterTimer.current = window.setTimeout(() => setEntering(false), 750);
    return () => {
      if (enterTimer.current) window.clearTimeout(enterTimer.current);
    };
  }, [open, centerId, visibleRelations, size]);

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

  // 聚焦集合：被聚焦圆/线相关的保持高亮，其余变暗淡
  const focusSets = useMemo(() => {
    if (!focus) return null;
    const relatedNodes = new Set<string>([centerId]);
    const relatedEdges = new Set<number>();
    items.forEach((item, index) => {
      if (focus.kind === "node") {
        if (focus.id === centerId) {
          relatedNodes.add(item.nodeId);
          relatedEdges.add(index);
        } else if (item.nodeId === focus.id) {
          relatedNodes.add(item.nodeId);
          relatedEdges.add(index);
        }
      } else if (index === focus.index) {
        relatedNodes.add(item.nodeId);
        relatedEdges.add(index);
      }
    });
    return { relatedNodes, relatedEdges };
  }, [focus, items, centerId]);

  const handlePointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
    event.preventDefault();
    const target = (event.target as Element).closest(".graph-node") as SVGGElement | null;
    if (target?.dataset.id && nodes[target.dataset.id]) {
      const id = target.dataset.id;
      dragRef.current = { id, startX: event.clientX, startY: event.clientY, lastX: event.clientX, lastY: event.clientY };
    } else {
      panRef.current = { startX: event.clientX, startY: event.clientY, startTx: view.tx, startTy: view.ty, moved: 0 };
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
        setEdges(buildEdges(next, items, centerId));
        return next;
      });
      return;
    }
    const pan = panRef.current;
    if (pan) {
      const dx = event.clientX - pan.startX;
      const dy = event.clientY - pan.startY;
      pan.moved = Math.max(pan.moved, Math.hypot(dx, dy));
      setView((current) => ({
        ...current,
        tx: pan.startTx + dx,
        ty: pan.startTy + dy,
      }));
    }
  };

  const handlePointerUp = (event: React.PointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current;
    if (drag) {
      const moved = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY);
      const clickedId = drag.id;
      dragRef.current = null;
      if (moved < 5) {
        // pointerdown 的 preventDefault 会吞掉原生 dblclick，这里按点击间隔手动识别双击
        const now = performance.now();
        const last = lastClickRef.current;
        if (last && last.id === clickedId && now - last.time < 350) {
          lastClickRef.current = null;
          if (clickedId !== centerId) jumpToCenter(clickedId);
          return;
        }
        lastClickRef.current = { id: clickedId, time: now };
        // 单击相关表：聚焦该表，其余变暗淡；再点取消
        setFocus((current) =>
          current?.kind === "node" && current.id === clickedId ? null : { kind: "node", id: clickedId },
        );
      }
    } else if (panRef.current) {
      const moved = panRef.current.moved;
      panRef.current = null;
      if (moved < 5) setFocus(null);
    }
  };

  const jumpToCenter = (tableId: string) => {
    setCenterId(tableId);
    onJump(tableId);
  };

  const moveTip = (event: React.MouseEvent, relation: Relation, side: -1 | 1, nodeHover: boolean) => {
    const rect = wrapRef.current?.getBoundingClientRect();
    const x = rect ? event.clientX - rect.left + 14 : event.clientX + 14;
    const y = rect ? event.clientY - rect.top + 14 : event.clientY + 14;
    setHoverTip({ x, y, relation, side, nodeHover });
  };

  const edgeMarker = (relation: Relation, highlighted: boolean) =>
    `url(#rel-arr-${relation.source_type === "manual" ? "manual" : highlighted ? "hl" : "auto"})`;

  const nodeOrder = useMemo(() => {
    const order = new Map<string, number>();
    order.set(centerId, 0);
    items.forEach((item, index) => order.set(item.nodeId, index + 1));
    return order;
  }, [items, centerId]);

  return (
    <Modal
      open={open}
      onCancel={onClose}
      width={1060}
      centered
      className="relation-graph-modal"
      title={<span className="relation-graph-title">表关系图 · <span style={{ fontFamily: "'JetBrains Mono', inherit" }}>{centerCode}</span></span>}
      footer={null}
      afterOpenChange={(nextOpen) => {
        if (nextOpen) measure();
      }}
    >
      <div className="relation-graph-wrap" ref={wrapRef}>
        <div className="relation-graph-legend">
          <span><i className="dot center" />当前表</span>
          <span><i className="dot normal" />相关表</span>
          <span><i />自动解析关系</span>
          <span><i className="manual" />手工维护关系</span>
        </div>
        <div className="relation-graph-toolbar">
          <Input
            allowClear
            className="relation-graph-search"
            prefix={
              <button
                type="button"
                className="input-search-trigger"
                aria-label="过滤相关表"
                title="搜索"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => setSearch(searchDraft.trim())}
              >
                <SearchOutlined />
              </button>
            }
            value={searchDraft}
            placeholder="过滤表，如 TBND"
            onChange={(event) => setSearchDraft(event.target.value)}
            onPressEnter={() => setSearch(searchDraft.trim())}
          />
          {DIR_OPTIONS.map((option) => (
            <Button
              key={option.key}
              size="small"
              type={dirFilter === option.key ? "primary" : "default"}
              onClick={() => setDirFilter(option.key)}
            >
              {option.label}
            </Button>
          ))}
          <Button size="small" icon={<MinusOutlined />} aria-label="缩小" onClick={() => zoomAroundCenter(1 / ZOOM_STEP)} />
          <Button size="small" aria-label="复位缩放" onClick={() => setView({ scale: 1, tx: 0, ty: 0 })}>
            1:1
          </Button>
          <Button size="small" icon={<PlusOutlined />} aria-label="放大" onClick={() => zoomAroundCenter(ZOOM_STEP)} />
        </div>
        <svg
          width={size.width}
          height={size.height}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        >
          <defs>
            <marker id="rel-arr-auto" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 1 L 9 5 L 0 9 z" className="graph-arrow" />
            </marker>
            <marker id="rel-arr-manual" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 1 L 9 5 L 0 9 z" className="graph-arrow manual" />
            </marker>
            <marker id="rel-arr-hl" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 1 L 9 5 L 0 9 z" className="graph-arrow" style={{ fill: "#347ee8" }} />
            </marker>
          </defs>
          <g transform={`translate(${view.tx}, ${view.ty}) scale(${view.scale})`}>
            {edges.map((edge, index) => {
              const manual = edge.relation.source_type === "manual";
              const dimmed = focusSets ? !focusSets.relatedEdges.has(index) : false;
              const focused = focus?.kind === "edge" && focus.index === index;
              const highlighted =
                hoveredEdge === index ||
                hoveredNodeId === edge.nodeId ||
                hoveredNodeId === centerId;
              const classes = [
                "graph-edge",
                manual ? "manual" : "",
                dimmed ? "dim" : "",
                focused ? "focus" : "",
                highlighted ? "hl" : "",
                entering ? "graph-edge-enter" : "",
              ].filter(Boolean).join(" ");
              return (
                <path
                  key={edge.relation.id}
                  className={classes}
                  d={`M ${edge.x1} ${edge.y1} C ${(edge.x1 + edge.x2) / 2} ${edge.y1}, ${(edge.x1 + edge.x2) / 2} ${edge.y2}, ${edge.x2} ${edge.y2}`}
                  markerEnd={edgeMarker(edge.relation, focused || highlighted)}
                  style={entering ? { animationDelay: `${(nodeOrder.get(edge.nodeId) || 1) * 18}ms` } : undefined}
                  onMouseEnter={(event) => {
                    setHoveredEdge(index);
                    moveTip(event, edge.relation, edge.side, false);
                  }}
                  onMouseMove={(event) => moveTip(event, edge.relation, edge.side, false)}
                  onMouseLeave={() => {
                    setHoveredEdge(null);
                    setHoverTip(null);
                  }}
                  onClick={(event) => {
                    event.stopPropagation();
                    setFocus((current) =>
                      current?.kind === "edge" && current.index === index ? null : { kind: "edge", index },
                    );
                  }}
                />
              );
            })}
            {Object.values(nodes).map((node) => {
              const table = tableById(node.id);
              if (!table) return null;
              const dimmed = focusSets ? !focusSets.relatedNodes.has(node.id) : false;
              const focused = focus?.kind === "node" && focus.id === node.id;
              const isCenter = node.id === centerId;
              const classes = [
                "graph-node",
                isCenter ? "center" : "",
                dimmed ? "dim" : "",
                focused ? "focus" : "",
                entering ? "graph-node-enter" : "",
              ].filter(Boolean).join(" ");
              const order = nodeOrder.get(node.id) || 0;
              const relationOfNode = items.find((item) => item.nodeId === node.id)?.relation;
              const nodeSide = items.find((item) => item.nodeId === node.id)?.side;
              return (
                <g
                  key={node.id}
                  className={classes}
                  data-id={node.id}
                  style={entering ? { animationDelay: `${order * 18}ms` } : undefined}
                  onMouseEnter={(event) => {
                    setHoveredNodeId(node.id);
                    if (!isCenter && relationOfNode && nodeSide) {
                      moveTip(event, relationOfNode, nodeSide, true);
                    }
                  }}
                  onMouseMove={(event) => {
                    if (!isCenter && relationOfNode && nodeSide) {
                      moveTip(event, relationOfNode, nodeSide, true);
                    }
                  }}
                  onMouseLeave={() => {
                    setHoveredNodeId(null);
                    setHoverTip(null);
                  }}
                >
                  {node.mode === "bubble" ? (
                    <>
                      <ellipse className="bubble-shape" cx={node.x} cy={node.y} rx={node.width / 2} ry={13} />
                      <text className="graph-node-label" x={node.x} y={node.y + 3.5} textAnchor="middle">
                        {table.code}
                      </text>
                    </>
                  ) : (
                    <>
                      <circle className="graph-node-dot" cx={node.x} cy={node.y} r={isCenter ? 11 : 5.5} />
                      {isCenter ? (
                        <text className="graph-node-label" x={node.x} y={node.y + 26} textAnchor="middle">
                          {table.code}
                        </text>
                      ) : null}
                    </>
                  )}
                </g>
              );
            })}
          </g>
        </svg>
        <div className="relation-graph-tip">
          悬停看详情 · 双击相关表切换中心 · 滚轮缩放 · 拖拽圆调整布局
        </div>
        {hoverTip ? (
          <div className="graph-hover-tip" style={{ left: hoverTip.x, top: hoverTip.y }}>
            {(() => {
              const relation = hoverTip.relation;
              const other = tableById(relation.source_table.id === centerId ? relation.target_table.id : relation.source_table.id);
              const isIn = hoverTip.side < 0;
              const fields = isIn
                ? `${otherTableCode(relation, centerId)}.${relation.source_field.code} → ${relation.target_field.code}`
                : `${relation.source_field.code} → ${otherTableCode(relation, centerId)}.${relation.target_field.code}`;
              if (hoverTip.nodeHover) {
                return (
                  <>
                    <div className="tip-title">
                      {other?.code || otherTableCode(relation, centerId)}
                      {other?.name ? `（${other.name}）` : ""}
                    </div>
                    <div className="tip-fields">
                      <b>{fields}</b>
                    </div>
                    <div className="tip-meta">
                      <span className={`tip-badge card`}>{relation.cardinality || "—"}</span>
                      <span className={`tip-badge ${relation.source_type}`}>
                        {relation.source_type === "auto" ? "自动解析" : "手工维护"}
                      </span>
                    </div>
                  </>
                );
              }
              return (
                <>
                  <div className="tip-title">
                    {other?.code || otherTableCode(relation, centerId)}
                    {other?.name ? `（${other.name}）` : ""} {isIn ? "→ 本表" : "← 本表"}
                  </div>
                  <div className="tip-fk">{relationDisplayName(relation)}</div>
                  <div className="tip-fields">
                    <b>{fields}</b>
                  </div>
                  <div className="tip-meta">
                    <span className={`tip-badge card`}>{relation.cardinality || "—"}</span>
                    <span className={`tip-badge ${relation.source_type}`}>
                      {relation.source_type === "auto" ? "自动解析" : "手工维护"}
                    </span>
                  </div>
                </>
              );
            })()}
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
