import { json, request } from "../../shared/api/client";
import type {
  FieldDefinition,
  TableDetail,
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
    return request<TableSearchResult>(`/api/tables?${query}`, { signal: params.signal });
  },
  detail: (tableId: string, signal?: AbortSignal) =>
    request<TableDetail>(`/api/tables/${tableId}`, { signal }),
  saveFields: (tableId: string, expected_hash: string, fields: FieldDefinition[]) =>
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
