export type SearchMode = "table" | "field";

export interface TableSummary {
  id: string;
  name: string;
  code: string;
  comment: string;
  field_count: number;
  project_id: string;
  project_name: string;
  pdm_id: string;
  relative_path: string;
  source_hash: string;
}

export type TableTab = Pick<
  TableSummary,
  "id" | "name" | "code" | "project_id" | "project_name" | "pdm_id" | "relative_path"
>;

export interface FieldDefinition {
  id: string;
  is_new?: boolean;
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

export interface TableDeleteTarget {
  id: string;
  expected_hash: string;
}

export interface TableDeletePreview {
  table_count: number;
  field_count: number;
  pdm_count: number;
  relation_count: number;
  binding_count: number;
  tables: Array<{
    id: string;
    name: string;
    code: string;
    field_count: number;
    pdm_id: string;
    relative_path: string;
    project_name: string;
  }>;
}

export interface TableDeleteResult extends TableDeletePreview {
  deleted_ids: string[];
}
