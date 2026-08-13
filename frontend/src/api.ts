import type {
  AiChatResponse,
  AiConversationDetail,
  AiConversationMessageInput,
  AiConversationMessageResult,
  AiConversationSummary,
  AiHistoryMessage,
  AiScope,
  AiSettingsStatus,
  BackupExportNode,
  BackupImportNode,
  BackupImportResult,
  BackupInspection,
  DdlCatalog,
  DdlConfig,
  DdlGenerateResult,
  DdlOptions,
  FieldDefinition,
  ImportResult,
  Project,
  RefreshResult,
  Settings,
  TableDetail,
  TableSearchResult,
  TrashItem,
  WorkspaceNode,
} from "./types";

interface ErrorDetail {
  message?: string;
  code?: string;
  data?: unknown;
}

export class ApiError extends Error {
  status: number;
  code: string;
  data: unknown;

  constructor(status: number, detail: ErrorDetail | string) {
    const normalized = typeof detail === "string" ? { message: detail } : detail;
    super(normalized.message || `请求失败（${status}）`);
    this.name = "ApiError";
    this.status = status;
    this.code = normalized.code || "request_failed";
    this.data = normalized.data;
  }
}

async function requireOk(response: Response): Promise<Response> {
  if (!response.ok) {
    let detail: ErrorDetail | string = response.statusText;
    try {
      const payload = (await response.json()) as { detail?: ErrorDetail | string };
      detail = payload.detail || detail;
    } catch {
      // Keep the HTTP status text when an upstream proxy returns a non-JSON body.
    }
    throw new ApiError(response.status, detail);
  }
  return response;
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await requireOk(await fetch(url, init));
  return (await response.json()) as T;
}

function json(method: string, payload?: unknown): RequestInit {
  return {
    method,
    headers: { "Content-Type": "application/json" },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  };
}

export const api = {
  settings: () => request<Settings>("/api/settings", { cache: "no-store" }),
  updateWorkspace: (workspace_root: string) =>
    request<Settings>("/api/settings/workspace", json("PUT", { workspace_root })),
  aiSettings: () => request<AiSettingsStatus>("/api/ai/settings", { cache: "no-store" }),
  saveAiSettings: (payload: {
    api_key?: string;
    assistant_name?: string;
    assistant_accessory?: AiSettingsStatus["assistant_accessory"];
  }) =>
    request<AiSettingsStatus>("/api/ai/settings", json("PUT", payload)),
  clearAiKey: () => request<AiSettingsStatus>("/api/ai/settings", { method: "DELETE" }),
  testAi: (api_key?: string) =>
    request<{ connected: boolean; provider: string; model: string }>(
      "/api/ai/test",
      json("POST", api_key ? { api_key } : {}),
    ),
  aiChat: (question: string, scope: AiScope, history: AiHistoryMessage[], signal?: AbortSignal) =>
    request<AiChatResponse>("/api/ai/chat", {
      ...json("POST", { question, scope, history }),
      signal,
    }),
  aiConversations: (limit = 200) =>
    request<AiConversationSummary[]>(`/api/ai/conversations?limit=${limit}`, { cache: "no-store" }),
  aiConversation: (conversationId: string) =>
    request<AiConversationDetail>(`/api/ai/conversations/${encodeURIComponent(conversationId)}`, {
      cache: "no-store",
    }),
  createAiConversation: (first_message: AiConversationMessageInput) =>
    request<AiConversationDetail>("/api/ai/conversations", json("POST", { first_message })),
  appendAiConversationMessage: (conversationId: string, message: AiConversationMessageInput) =>
    request<AiConversationMessageResult>(
      `/api/ai/conversations/${encodeURIComponent(conversationId)}/messages`,
      json("POST", message),
    ),
  renameAiConversation: (conversationId: string, title: string) =>
    request<AiConversationSummary>(
      `/api/ai/conversations/${encodeURIComponent(conversationId)}`,
      json("PATCH", { title }),
    ),
  deleteAiConversation: (conversationId: string) =>
    request<{ deleted: boolean }>(`/api/ai/conversations/${encodeURIComponent(conversationId)}`, {
      method: "DELETE",
    }),
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
  exportBackup: async (nodes: BackupExportNode[]): Promise<{ blob: Blob; fileName: string }> => {
    const response = await requireOk(
      await fetch("/api/backups/export", json("POST", { nodes })),
    );
    return {
      blob: await response.blob(),
      fileName: response.headers.get("X-CodeBear-Filename") || "CodeBear-Backup.cbbak",
    };
  },
  inspectBackup: (file: File) => {
    const form = new FormData();
    form.set("file", file, file.name);
    return request<BackupInspection>("/api/backups/inspect", { method: "POST", body: form });
  },
  inspectLegacyData: (data_path: string) =>
    request<BackupInspection>("/api/backups/legacy/inspect", json("POST", { data_path })),
  importBackup: (
    token: string,
    nodes: BackupImportNode[],
    conflict_policy: "skip" | "rename" | "overwrite",
  ) =>
    request<BackupImportResult>(
      "/api/backups/import",
      json("POST", { token, nodes, conflict_policy }),
    ),
  discardBackup: async (token: string): Promise<void> => {
    await requireOk(await fetch(`/api/backups/${encodeURIComponent(token)}`, { method: "DELETE" }));
  },
  tables: (params: {
    projectId?: string;
    scopeType: string;
    scopePath: string;
    mode: string;
    query: string;
    allNodes: boolean;
    limit: number;
    offset: number;
    signal?: AbortSignal;
  }) => {
    const query = new URLSearchParams({
      scope_type: params.scopeType,
      scope_path: params.scopePath,
      mode: params.mode,
      q: params.query,
      all_nodes: String(params.allNodes),
      limit: String(params.limit),
      offset: String(params.offset),
    });
    if (params.projectId) query.set("project_id", params.projectId);
    return request<TableSearchResult>(`/api/tables?${query}`, { signal: params.signal });
  },
  table: (tableId: string, signal?: AbortSignal) =>
    request<TableDetail>(`/api/tables/${tableId}`, { signal }),
  ddlOptions: () => request<DdlOptions>("/api/ddl/options", { cache: "no-store" }),
  ddlCatalog: (
    projectId: string,
    params: { includeTables?: boolean; pdmIds?: string[]; query?: string } = {},
    signal?: AbortSignal,
  ) => {
    const query = new URLSearchParams({
      project_id: projectId,
      include_tables: String(params.includeTables ?? true),
    });
    params.pdmIds?.forEach((pdmId) => query.append("pdm_id", pdmId));
    if (params.query) query.set("q", params.query);
    return request<DdlCatalog>(`/api/ddl/catalog?${query}`, {
      cache: "no-store",
      signal,
    });
  },
  generateDdl: (table_ids: string[], config: DdlConfig, signal?: AbortSignal) =>
    request<DdlGenerateResult>("/api/ddl/generate", {
      ...json("POST", { table_ids, config }),
      signal,
    }),
  saveFields: (tableId: string, expected_hash: string, fields: FieldDefinition[]) =>
    request<TableDetail>(
      `/api/tables/${tableId}/fields`,
      json("PUT", { expected_hash, fields }),
    ),
};
