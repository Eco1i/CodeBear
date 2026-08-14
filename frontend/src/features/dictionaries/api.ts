import { json, request } from "../../shared/api/client";
import type {
  DictionaryBoundField,
  DictionaryFieldBinding,
  DictionaryFieldCandidatesResult,
  DictionaryItem,
  DictionaryItemsResult,
  DictionarySummary,
  ExcelInspection,
} from "./types";

interface CandidateParams {
  dictionaryId: string;
  projectId: string;
  scopeType: string;
  scopePath: string;
  query: string;
  mode: "bind" | "unbind";
}

export const dictionariesApi = {
  list: (query = "") => request<DictionarySummary[]>(`/api/dictionaries?q=${encodeURIComponent(query)}`),
  create: (name: string, description: string) =>
    request<DictionarySummary>("/api/dictionaries", json("POST", { name, description })),
  update: (id: string, name: string, description: string) =>
    request<DictionarySummary>(`/api/dictionaries/${id}`, json("PUT", { name, description })),
  remove: (id: string) => request<{ deleted: boolean }>(`/api/dictionaries/${id}`, { method: "DELETE" }),
  items: (id: string, query = "") =>
    request<DictionaryItemsResult>(`/api/dictionaries/${id}/items?q=${encodeURIComponent(query)}&limit=5000`),
  replaceItems: (id: string, items: DictionaryItem[]) =>
    request<DictionarySummary>(`/api/dictionaries/${id}/items`, json("PUT", { items })),
  bindingsForTable: (tableId: string) =>
    request<DictionaryFieldBinding[]>(`/api/dictionaries/field-bindings?table_id=${encodeURIComponent(tableId)}`),
  boundFields: (id: string, query = "") =>
    request<DictionaryBoundField[]>(`/api/dictionaries/${id}/bindings?q=${encodeURIComponent(query)}`),
  candidates: (params: CandidateParams) => {
    const query = new URLSearchParams({
      dictionary_id: params.dictionaryId,
      project_id: params.projectId,
      scope_type: params.scopeType,
      scope_path: params.scopePath,
      q: params.query,
      mode: params.mode,
      limit: "5000",
    });
    return request<DictionaryFieldCandidatesResult>(`/api/dictionaries/field-candidates?${query}`);
  },
  bind: (id: string, fieldIds: string[]) =>
    request<{ count: number }>(`/api/dictionaries/${id}/bindings`, json("POST", { field_ids: fieldIds })),
  unbind: (id: string, fieldIds: string[]) =>
    request<{ count: number }>(`/api/dictionaries/${id}/unbind`, json("POST", { field_ids: fieldIds })),
  inspectExcel: async (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return request<ExcelInspection>("/api/dictionaries/excel/inspect", { method: "POST", body: form });
  },
  importExcel: async (options: {
    file: File;
    name: string;
    description: string;
    sheetName: string;
    codeColumns: string[];
    nameColumn: string;
    descriptionColumn: string;
    dictionaryId?: string;
  }) => {
    const form = new FormData();
    form.append("file", options.file);
    form.append("name", options.name);
    form.append("description", options.description);
    form.append("sheet_name", options.sheetName);
    options.codeColumns.forEach((column) => form.append("code_columns", column));
    form.append("name_column", options.nameColumn);
    form.append("description_column", options.descriptionColumn);
    if (options.dictionaryId) form.append("dictionary_id", options.dictionaryId);
    return request<DictionarySummary>("/api/dictionaries/excel/import", { method: "POST", body: form });
  },
};
