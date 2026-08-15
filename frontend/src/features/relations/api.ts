import { json, request } from "../../shared/api/client";
import type { Relation, RelationDraft, TableRelations } from "./types";

export const relationsApi = {
  fetch: (tableId: string) => request<TableRelations>(`/api/tables/${tableId}/relations`),
  create: (draft: RelationDraft) => request<Relation>("/api/relations", json("POST", draft)),
  update: (id: string, draft: Pick<RelationDraft, "name" | "cardinality" | "note">) =>
    request<Relation>(`/api/relations/${id}`, json("PUT", draft)),
  remove: (id: string) => request<{ deleted: boolean }>(`/api/relations/${id}`, { method: "DELETE" }),
};
