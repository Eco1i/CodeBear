import { json, request } from "../../shared/api/client";
import type {
  ImportResult,
  Project,
  RefreshResult,
  Settings,
  TrashItem,
  WorkspaceNode,
} from "./types";

export const workspaceApi = {
  settings: () => request<Settings>("/api/settings", { cache: "no-store" }),
  updateWorkspace: (workspace_root: string) =>
    request<Settings>("/api/settings/workspace", json("PUT", { workspace_root })),
  projects: () => request<Project[]>("/api/projects"),
  createProject: (name: string) => request<Project>("/api/projects", json("POST", { name })),
  renameProject: (projectId: string, name: string) =>
    request<Project>(`/api/projects/${projectId}`, json("PUT", { name })),
  tree: (projectId: string) => request<WorkspaceNode>(`/api/projects/${projectId}/tree`),
  refresh: (projectId: string, force = false) =>
    request<RefreshResult>(`/api/projects/${projectId}/refresh?force=${force}`, { method: "POST" }),
  createFolder: (project_id: string, parent_path: string, name: string) =>
    request<WorkspaceNode>("/api/folders", json("POST", { project_id, parent_path, name })),
  renameNode: (project_id: string, relative_path: string, name: string) =>
    request<{ relative_path: string; name: string }>(
      "/api/nodes/rename",
      json("PUT", { project_id, relative_path, name }),
    ),
  moveNode: (project_id: string, relative_path: string, target_parent_path: string) =>
    request<{ relative_path: string; name: string }>(
      "/api/nodes/move",
      json("POST", { project_id, relative_path, target_parent_path }),
    ),
  trashNode: (project_id: string, relative_path: string) =>
    request<{ trash_id: string; kind: string; name: string }>(
      "/api/nodes/trash",
      json("POST", { project_id, relative_path }),
    ),
  trash: () => request<TrashItem[]>("/api/trash"),
  restoreTrash: (trashId: string) =>
    request<Record<string, unknown>>(`/api/trash/${trashId}/restore`, { method: "POST" }),
  importPdm: async (
    projectId: string,
    parentPath: string,
    files: File[],
    overwrite: boolean,
  ): Promise<ImportResult> => {
    const form = new FormData();
    form.set("project_id", projectId);
    form.set("parent_path", parentPath);
    form.set("overwrite", String(overwrite));
    files.forEach((file) => form.append("files", file, file.name));
    return request<ImportResult>("/api/import", { method: "POST", body: form });
  },
};
