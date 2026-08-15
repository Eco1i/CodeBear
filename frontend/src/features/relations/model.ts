import type { GraphEdge, GraphItem, GraphNode, Relation } from "./types";

export const CARDINALITY_OPTIONS = ["1..1", "1..n", "n..1", "n..m", "0..1", "0..*"];

// 气泡节点宽度：按表代码长度自适应（JetBrains Mono 10px 约 6.05px/字符）
const CHAR_WIDTH = 6.05;
const BUBBLE_MAX_WIDTH = 92;

export function relationDisplayName(relation: Relation): string {
  return relation.name || "FK";
}

export function cardinalityText(cardinality: string): string {
  return cardinality ? cardinality : "—";
}

export function bubbleWidth(code: string): number {
  return Math.min(BUBBLE_MAX_WIDTH, Math.max(34, code.length * CHAR_WIDTH + 22));
}

export function centerBubbleWidth(code: string): number {
  return Math.max(64, code.length * CHAR_WIDTH + 26);
}

export interface GraphLayout {
  nodes: Record<string, GraphNode>;
  edges: GraphEdge[];
  items: GraphItem[];
}

export function otherTableCode(relation: Relation, centerTableId: string): string {
  return relation.source_table.id === centerTableId
    ? relation.target_table.code
    : relation.source_table.code;
}

/**
 * 气泡圆 + 连线布局：
 * - 入向（对方引用本表）排左侧半圆，出向（本表引用对方）排右侧半圆
 * - 关系 ≤16 条：气泡圆（表代码写在圆内），沿半圆弧行走最多三圈
 * - 关系 >16 条：退化为小圆点星图，间距随数量自适应收缩
 * 纯函数便于测试；宽度/高度为 0 时返回空布局。
 */
export function layoutGraph(
  centerTableId: string,
  centerCode: string,
  relations: Relation[],
  width: number,
  height: number,
): GraphLayout {
  const nodes: Record<string, GraphNode> = {};
  const items: GraphItem[] = [];
  if (width <= 0 || height <= 0) return { nodes, edges: [], items };

  const incoming = relations.filter((relation) => relation.target_table.id === centerTableId);
  const outgoing = relations.filter((relation) => relation.source_table.id === centerTableId);
  const total = incoming.length + outgoing.length;
  const bubbleMode = total <= 16;

  const cx = width / 2;
  const cy = height / 2;
  const maxR = Math.min(width / 2, height / 2) - 34;

  nodes[centerTableId] = {
    id: centerTableId,
    x: cx,
    y: cy,
    width: bubbleMode ? centerBubbleWidth(centerCode) : 22,
    mode: bubbleMode ? "bubble" : "dot",
  };

  const placeBubbles = (list: Relation[], side: -1 | 1) => {
    const ringRadii = [0.66, 0.86, 1.0].map((factor) => factor * maxR);
    const gap = 16;
    const angleStart = side < 0 ? Math.PI / 2 : -Math.PI / 2;
    const angleEnd = angleStart + Math.PI;
    let ring = 0;
    let angle = angleStart;
    for (const relation of list) {
      const nodeId = relation.source_table.id === centerTableId ? relation.target_table.id : relation.source_table.id;
      const w = bubbleWidth(otherTableCode(relation, centerTableId));
      if (ring < ringRadii.length - 1 && angle + (w + gap) / ringRadii[ring] > angleEnd + 0.001) {
        ring += 1;
        angle = angleStart;
      }
      const r = ringRadii[Math.min(ring, ringRadii.length - 1)];
      const arc = (w + gap) / r;
      const a = angle + arc / 2;
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r;
      nodes[nodeId] = { id: nodeId, x, y, width: w, mode: "bubble" };
      items.push({ nodeId, side, relation, x, y, width: w, mode: "bubble" });
      angle += arc;
    }
  };

  const placeDots = (list: Relation[], side: -1 | 1) => {
    const ringCount = 8;
    const r0 = 0.38 * maxR;
    const step = (0.62 * maxR) / (ringCount - 1);
    const radii = Array.from({ length: ringCount }, (_, index) => r0 + step * index);
    const totalArc = Math.PI * radii.reduce((sum, r) => sum + r, 0);
    const spacing = Math.max(14, totalArc / Math.max(1, list.length));
    const angleStart = side < 0 ? Math.PI / 2 : -Math.PI / 2;
    let ring = 0;
    let indexInRing = 0;
    for (const relation of list) {
      const nodeId = relation.source_table.id === centerTableId ? relation.target_table.id : relation.source_table.id;
      while (ring < radii.length - 1 && indexInRing * spacing + spacing > Math.PI * radii[ring]) {
        ring += 1;
        indexInRing = 0;
      }
      const r = radii[Math.min(ring, radii.length - 1)];
      const cap = Math.max(1, Math.floor((Math.PI * r) / spacing));
      const slot = Math.min(indexInRing, cap - 1);
      const a = angleStart + (slot + 0.5) / cap * Math.PI;
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r;
      nodes[nodeId] = { id: nodeId, x, y, width: 11, mode: "dot" };
      items.push({ nodeId, side, relation, x, y, width: 11, mode: "dot" });
      indexInRing += 1;
    }
  };

  if (bubbleMode) {
    placeBubbles(incoming, -1);
    placeBubbles(outgoing, 1);
  } else {
    placeDots(incoming, -1);
    placeDots(outgoing, 1);
  }

  const edges = buildEdges(nodes, items, centerTableId);
  return { nodes, edges, items };
}

export function buildEdges(
  nodes: Record<string, GraphNode>,
  items: GraphItem[],
  centerTableId: string,
): GraphEdge[] {
  const center = nodes[centerTableId];
  if (!center) return [];
  return items
    .filter((item) => nodes[item.nodeId])
    .map((item) => {
      const node = nodes[item.nodeId];
      const half = node.mode === "bubble" ? node.width / 2 : 7.5;
      const centerHalf = center.mode === "bubble" ? center.width / 2 : 12;
      const x1 = item.side < 0 ? node.x + half : center.x + centerHalf;
      const y1 = item.side < 0 ? node.y : center.y;
      const x2 = item.side < 0 ? center.x - centerHalf : node.x - half;
      const y2 = item.side < 0 ? center.y : node.y;
      return {
        relation: item.relation,
        sourceTableId: item.relation.source_table.id,
        targetTableId: item.relation.target_table.id,
        nodeId: item.nodeId,
        side: item.side,
        x1,
        y1,
        x2,
        y2,
        midX: (x1 + x2) / 2,
        midY: (y1 + y2) / 2,
      };
    });
}
