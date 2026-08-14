import { json, request, requireOk } from "../../shared/api/client";
import type {
  BackupExportNode,
  BackupImportNode,
  BackupImportResult,
  BackupInspection,
} from "./types";

export const backupApi = {
  export: async (nodes: BackupExportNode[]): Promise<{ blob: Blob; fileName: string }> => {
    const response = await requireOk(await fetch("/api/backups/export", json("POST", { nodes })));
    return {
      blob: await response.blob(),
      fileName: response.headers.get("X-CodeBear-Filename") || "CodeBear-Backup.cbbak",
    };
  },
  inspect: (file: File) => {
    const form = new FormData();
    form.set("file", file, file.name);
    return request<BackupInspection>("/api/backups/inspect", { method: "POST", body: form });
  },
  inspectLegacy: (data_path: string) =>
    request<BackupInspection>("/api/backups/legacy/inspect", json("POST", { data_path })),
  import: (
    token: string,
    nodes: BackupImportNode[],
    conflict_policy: "skip" | "rename" | "overwrite",
  ) =>
    request<BackupImportResult>(
      "/api/backups/import",
      json("POST", { token, nodes, conflict_policy }),
    ),
  discard: async (token: string): Promise<void> => {
    await requireOk(await fetch(`/api/backups/${encodeURIComponent(token)}`, { method: "DELETE" }));
  },
};
