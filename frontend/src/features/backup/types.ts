import type { NodeType } from "../workspace/types";

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
