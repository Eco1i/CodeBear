import { json, request } from "../../shared/api/client";
import type { DdlCatalog, DdlConfig, DdlGenerateResult, DdlOptions } from "./types";

export const ddlApi = {
  options: () => request<DdlOptions>("/api/ddl/options", { cache: "no-store" }),
  catalog: (
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
  generate: (table_ids: string[], config: DdlConfig, signal?: AbortSignal) =>
    request<DdlGenerateResult>("/api/ddl/generate", {
      ...json("POST", { table_ids, config }),
      signal,
    }),
};
