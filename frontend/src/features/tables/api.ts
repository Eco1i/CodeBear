import { json, request, requireOk } from "../../shared/api/client";
import type {
  FieldDefinition,
  TableDeletePreview,
  TableDeleteResult,
  TableDeleteTarget,
  TableDetail,
  TableExportFormat,
  TableMetadataUpdate,
  TableSearchResult,
} from "./types";

export interface TableSearchParams {
  projectId?: string;
  scopeType: string;
  scopePath: string;
  mode: string;
  query: string;
  allNodes: boolean;
  limit: number;
  offset: number;
  preferredTableIds?: string[];
  signal?: AbortSignal;
}

export const tablesApi = {
  search: (params: TableSearchParams) => {
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
    if (params.preferredTableIds?.length) {
      query.set(
        "preferred_ids",
        params.preferredTableIds.slice(0, 3).join(","),
      );
    }
    return request<TableSearchResult>(`/api/tables?${query}`, {
      signal: params.signal,
    });
  },
  detail: (tableId: string, signal?: AbortSignal) =>
    request<TableDetail>(`/api/tables/${tableId}`, { signal }),
  exportStructure: async (
    tableId: string,
    format: TableExportFormat,
    language: "zh-CN" | "en-US",
  ) => {
    const query = new URLSearchParams({ format, language });
    const response = await requireOk(
      await fetch(`/api/tables/${encodeURIComponent(tableId)}/export?${query}`),
    );
    return response.blob();
  },
  previewDelete: (tables: TableDeleteTarget[]) =>
    request<TableDeletePreview>(
      "/api/tables/delete-preview",
      json("POST", { tables }),
    ),
  deleteTables: (tables: TableDeleteTarget[]) =>
    request<TableDeleteResult>("/api/tables/delete", json("POST", { tables })),
  saveFields: (
    tableId: string,
    expected_hash: string,
    fields: FieldDefinition[],
  ) =>
    request<TableDetail>(
      `/api/tables/${tableId}/fields`,
      json("PUT", { expected_hash, fields }),
    ),
  saveDictionary: (
    tableId: string,
    expected_hash: string,
    table: TableMetadataUpdate,
    fields: FieldDefinition[],
  ) =>
    request<TableDetail>(
      `/api/tables/${tableId}/fields`,
      json("PUT", { expected_hash, table, fields }),
    ),
};
