export type DdlDatabase = "mysql" | "oracle" | "dameng" | "tdsql" | "ignite";
export type TdsqlTableMode = "shard" | "single" | "broadcast";
export type IgniteTemplate = "PARTITIONED" | "REPLICATED";
export type IgniteAtomicity = "ATOMIC" | "TRANSACTIONAL";
export type IgniteWriteSync = "FULL_SYNC" | "PRIMARY_SYNC" | "FULL_ASYNC";

export interface DdlDatabaseOption {
  value: DdlDatabase;
  label: string;
  description: string;
  versions: string[];
  default_version: string;
  extension: string;
}

export interface DdlValueOption {
  value: string;
  label?: string;
  description?: string;
  default_collation?: string;
  charset?: string;
  default_for_charset?: boolean;
  max_bytes?: number;
  recommended?: boolean;
  deprecated?: boolean;
  optional?: boolean;
}

export interface DdlOptions {
  databases: DdlDatabaseOption[];
  mysql_character_sets: DdlValueOption[];
  mysql_collations: DdlValueOption[];
  mysql_storage_engines: DdlValueOption[];
  tdsql_table_modes: DdlValueOption[];
  ignite_templates: DdlValueOption[];
  ignite_atomicity_modes: DdlValueOption[];
  ignite_write_sync_modes: DdlValueOption[];
}

export interface DdlCatalogTable {
  id: string;
  pdm_id: string;
  ordinal: number;
  name: string;
  code: string;
  comment: string;
  field_count: number;
  relative_path: string;
  source_hash: string;
}

export interface DdlCatalogGroup {
  id: string;
  relative_path: string;
  file_name: string;
  model_name: string;
  pd_version: string;
  target_db: string;
  table_count: number;
  field_count: number;
  parse_error: string | null;
  tables_loaded: boolean;
  tables: DdlCatalogTable[];
}

export interface DdlCatalog {
  project_id: string;
  project_name: string;
  groups: DdlCatalogGroup[];
  table_count: number;
  field_count: number;
}

export interface DdlConfig {
  database: DdlDatabase;
  version: string;
  schema: string;
  include_comments: boolean;
  drop_table: boolean;
  if_not_exists: boolean;
  engine: string;
  charset: string;
  collation: string;
  tablespace: string;
  tdsql_mode: TdsqlTableMode;
  ignite_template: IgniteTemplate;
  ignite_backups: number;
  ignite_atomicity: IgniteAtomicity;
  ignite_write_sync: IgniteWriteSync;
  ignite_cache_group: string;
  ignite_affinity_key: boolean;
}

export interface DdlWarning {
  code: string;
  severity: "info" | "warning" | "error";
  message: string;
  table_id: string;
  table_code: string;
  field_code: string;
}

export interface DdlGenerateResult {
  database: DdlDatabase;
  database_label: string;
  version: string;
  extension: string;
  script: string;
  warnings: DdlWarning[];
  warning_count: number;
  table_count: number;
  column_count: number;
  line_count: number;
  char_count: number;
}
