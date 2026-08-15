import type { GraphEdge, GraphNode, Relation } from "./types";

const NODE_WIDTH = 184;
const NODE_HEIGHT = 96;
const NODE_OFFSET = 92;

export const CARDINALITY_OPTIONS = ["1..1", "1..n", "n..1", "n..m", "0..1", "0..*"];

export function relationDisplayName(relation: Relation): string {
  return relation.name || "FK";
}

export function cardinalityText(cardinality: string): string {
  return cardinality ? cardinality : "—";
}

export interface GraphLayout {
  nodes: Record<string, GraphNode>;
  edges: GraphEdge[];
  neighborIds: string[];
}

/**
 * 以 centerTableId 为中心，一跳邻居均匀分布成圆。
 * 纯函数便于测试；宽度/高度为 0 时返回空布局。
 */
export function layoutGraph(
  centerTableId: string,
  relations: Relation[],
  width: number,
  height: number,
): GraphLayout {
  const nodes: Record<string, GraphNode> = {};
  if (width <= 0 || height <= 0) return { nodes, edges: [], neighborIds: [] };
  const neighborIds: string[] = [];
  relations.forEach((relation) => {
    const other =
      relation.source_table.id === centerTableId ? relation.target_table.id : relation.target_table.id === centerTableId ? relation.source_table.id : "";
    if (other && !neighborIds.includes(other)) neighborIds.push(other);
  });
  const cx = width / 2;
  const cy = height / 2;
  nodes[centerTableId] = { id: centerTableId, x: cx, y: cy };
  const radius = Math.min(width, height) * 0.34;
  neighborIds.forEach((id, index) => {
    const angle = (index / Math.max(1, neighborIds.length)) * Math.PI * 2 - Math.PI / 2;
    nodes[id] = { id, x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius };
  });
  const edges: GraphEdge[] = buildEdges(nodes, relations);
  return { nodes, edges, neighborIds };
}

export function buildEdges(nodes: Record<string, GraphNode>, relations: Relation[]): GraphEdge[] {
  return relations
    .filter((relation) => nodes[relation.source_table.id] && nodes[relation.target_table.id])
    .map((relation) => {
      const a = nodes[relation.source_table.id];
      const b = nodes[relation.target_table.id];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.hypot(dx, dy) || 1;
      const ux = dx / len;
      const uy = dy / len;
      const x1 = a.x + ux * NODE_OFFSET;
      const y1 = a.y + uy * (NODE_HEIGHT / 2);
      const x2 = b.x - ux * NODE_OFFSET;
      const y2 = b.y - uy * (NODE_HEIGHT / 2);
      return {
        relation,
        sourceTableId: relation.source_table.id,
        targetTableId: relation.target_table.id,
        x1,
        y1,
        x2,
        y2,
        midX: (x1 + x2) / 2,
        midY: (y1 + y2) / 2,
      };
    });
}

export const NODE_SIZE = { width: NODE_WIDTH, height: NODE_HEIGHT };
