export type NodeType = "project" | "folder" | "pdm";
export type SearchMode = "table" | "field";
export type AiScopeType = "table" | "pdm" | "project" | "all";
export type AiLayoutMode = "sidebar" | "floating" | "fullscreen";
export type AiConfidence = "high" | "medium" | "low";
export type AiAccessory =
  | "none"
  | "blue_scarf"
  | "red_cap"
  | "knit_hat"
  | "round_glasses"
  | "headphones"
  | "bow_tie"
  | "data_crown";

export interface Settings {
  workspace_root: string;
}

export interface AiSettingsStatus {
  provider: "deepseek";
  model: string;
  base_url: string;
  assistant_name: string;
  assistant_accessory: AiAccessory;
  configured: boolean;
  key_hint: string;
  storage: "none" | "environment" | "windows_dpapi";
  error: string;
}

export interface AiScope {
  type: AiScopeType;
  project_id?: string;
  scope_path?: string;
  table_id?: string;
}

export interface AiHistoryMessage {
  role: "user" | "assistant";
  content: string;
  evidence?: AiHistoryEvidence[];
  retrieval?: AiHistoryRetrieval;
}

export interface AiHistoryEvidence {
  table_id: string;
  table_code: string;
  table_name: string;
  relevance: "direct" | "related" | "candidate";
}

export interface AiEvidenceField {
  name: string;
  code: string;
  data_type: string;
  comment: string;
}

export interface AiEvidenceTable {
  table_id: string;
  table_name: string;
  table_code: string;
  table_comment: string;
  project_id: string;
  project_name: string;
  pdm_id: string;
  relative_path: string;
  relevance: "direct" | "related" | "candidate";
  reason: string;
  retrieval_rank: number;
  matched_fields: AiEvidenceField[];
}

export interface AiHistoryRetrieval {
  intent: "find_tables" | "find_field" | "describe_table" | "out_of_scope" | "sensitive_request";
  resolved_question: string;
  scope_terms: string[];
  business_terms: string[];
  code_terms: string[];
  target_role: string;
  exclude_roles: string[];
  only_target_role: boolean;
}

export interface AiRetrievalSummary extends AiHistoryRetrieval {
  candidate_count: number;
  raw_match_count: number;
  reviewed_count: number;
  direct_count: number;
  related_count: number;
  local_candidate_count: number;
  matched_sources: string[];
  search_terms: string[];
  selection_source: "model" | "none";
  planner_fallback: boolean;
  intent_label: string;
  ranking_reasons: string[];
  confidence: AiConfidence;
  scope_label: string;
  applied_scope_type: AiScopeType | "";
  scope_changed: boolean;
}

export interface AiClarificationOption {
  label: string;
  query: string;
}

export interface AiClarification {
  question: string;
  options: AiClarificationOption[];
}

export interface AiChatResponse {
  answer: string;
  model: string;
  scope_label: string;
  uncertain: boolean;
  confidence: AiConfidence;
  clarification: AiClarification | null;
  evidence: AiEvidenceTable[];
  retrieval: AiRetrievalSummary;
  usage: Record<string, number>;
}

export interface AiConversationSummary {
  id: string;
  title: string;
  preview: string;
  message_count: number;
  created_at: string;
  updated_at: string;
}

export interface AiConversationMessagePayload {
  evidence?: AiEvidenceTable[];
  retrieval?: AiRetrievalSummary;
  model?: string;
  confidence?: AiConfidence;
  clarification?: AiClarification | null;
  error?: boolean;
  scope?: AiScope;
  scope_kind?: string;
  scope_value?: string;
}

export interface AiConversationMessage extends AiConversationMessagePayload {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
}

export interface AiConversationDetail extends AiConversationSummary {
  messages: AiConversationMessage[];
}

export interface AiConversationMessageInput {
  id: string;
  role: "user" | "assistant";
  content: string;
  payload: AiConversationMessagePayload;
}

export interface AiConversationMessageResult {
  conversation: AiConversationSummary;
  message: AiConversationMessage;
}

export interface Project {
  id: string;
  name: string;
  root_path: string;
  pdm_count: number;
  table_count: number;
  field_count: number;
  created_at: string;
  updated_at: string;
}

export interface WorkspaceNode {
  id: string;
  project_id?: string;
  pdm_id?: string | null;
  type: NodeType;
  name: string;
  relative_path: string;
  pdm_count?: number;
  table_count?: number;
  field_count?: number;
  file_size?: number;
  parse_error?: string | null;
  children?: WorkspaceNode[];
}

export interface BackupExportNode {
  project_id: string;
  type: NodeType;
  relative_path: string;
}

export interface BackupImportNode {
  project_key: string;
  type: NodeType;
  relative_path: string;
}

export interface BackupEntry {
  type: Exclude<NodeType, "project">;
  path: string;
  size?: number;
  sha256?: string;
}

export interface BackupProject {
  key: string;
  name: string;
  entries: BackupEntry[];
}

export interface BackupStats {
  project_count: number;
  folder_count: number;
  pdm_count: number;
  total_bytes: number;
}

export interface BackupInspection {
  token: string;
  file_name: string;
  source_type: "archive" | "legacy";
  format: string;
  format_version: number;
  app_version: string;
  created_at: string;
  projects: BackupProject[];
  stats: BackupStats;
}

export interface BackupImportResult {
  projects: Array<{ id: string; name: string }>;
  imported: Array<{ project: string; relative_path: string }>;
  skipped: Array<{ project: string; relative_path: string }>;
  renamed: Array<{ project: string; source_path: string; relative_path: string }>;
  parse_errors: Array<{ relative_path: string; status: "error"; error: string }>;
}

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

export interface TableSearchResult {
  items: TableSummary[];
  total: number;
  field_total: number;
  pdm_total: number;
  limit: number;
  offset: number;
}

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

export interface TrashItem {
  id: string;
  original_project_id: string;
  project_name: string;
  original_relative_path: string;
  trash_path: string;
  kind: NodeType;
  name: string;
  deleted_at: string;
}

export interface ImportResult {
  imported: Array<{
    name: string;
    relative_path: string;
    pdm_id: string;
    table_count: number;
    field_count: number;
  }>;
  errors: Array<{ name: string; error: string }>;
}

export interface RefreshResult {
  project_id: string;
  indexed: number;
  unchanged: number;
  errors: Array<{
    relative_path: string;
    status: "error";
    error: string;
  }>;
  pdm_count: number;
}
