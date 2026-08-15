export type SearchMode = "table" | "field";

export interface TableSummary {
  id: string;
  name: string;
  code: string;
  comment: string;
  field_count: number;
  kind: "table" | "view";
  project_id: string;
  project_name: string;
  pdm_id: string;
  relative_path: string;
  source_hash: string;
}

export interface FieldDefinition {
  id: string;
  table_id: string;
  xml_id: string;
  ordinal: number;
  name: string;
  code: string;
  data_type: string;
  length: string;
  nullable: boolean;
  default_value: string;
  comment: string;
  is_primary_key: boolean;
}

export interface TableDetail extends TableSummary {
  xml_id: string;
  ordinal: number;
  pd_version: string;
  target_db: string;
  fields: FieldDefinition[];
}

export interface TableMetadataUpdate {
  name: string;
  code: string;
  comment: string;
}

export interface TableSearchResult {
  items: TableSummary[];
  total: number;
  field_total: number;
  pdm_total: number;
  limit: number;
  offset: number;
}
