export interface RelationEndpoint {
  id: string;
  name: string;
  code: string;
}

export interface Relation {
  id: string;
  name: string;
  cardinality: string;
  note: string;
  source_type: "auto" | "manual";
  source_table: RelationEndpoint;
  source_field: RelationEndpoint;
  target_table: RelationEndpoint;
  target_field: RelationEndpoint;
  created_at: string;
  updated_at: string;
}

export interface RelationOptionField {
  id: string;
  name: string;
  code: string;
}

export interface RelationOptionTable {
  id: string;
  name: string;
  code: string;
  fields: RelationOptionField[];
}

export interface TableRelations {
  incoming: Relation[];
  outgoing: Relation[];
  options: RelationOptionTable[];
}

export interface RelationDraft {
  name: string;
  cardinality: string;
  note: string;
  source_table_id: string;
  source_field_id: string;
  target_table_id: string;
  target_field_id: string;
}

export interface GraphNode {
  id: string;
  x: number;
  y: number;
}

export interface GraphEdge {
  relation: Relation;
  sourceTableId: string;
  targetTableId: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  midX: number;
  midY: number;
}
