import type { AiAccessory } from "../ai/types";

export type NodeType = "project" | "folder" | "pdm";

export interface Settings {
  workspace_root: string;
  assistant_name: string;
  assistant_accessory: AiAccessory;
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
