import { describe, expect, it } from "vitest";
import { buildScopeOptions, restoredScopeFromConversation } from "./model";
import type { AiConversationDetail } from "./types";
import type { TableDetail } from "../tables/types";
import type { Project, WorkspaceNode } from "../workspace/types";

describe("AI scope model", () => {
  it("builds scopes from the current table through the global workspace", () => {
    const project = { id: "p1", name: "订单项目" } as Project;
    const node = {
      id: "pdm-1",
      project_id: "p1",
      type: "pdm",
      name: "订单模型.pdm",
      relative_path: "交易/订单模型.pdm",
    } satisfies WorkspaceNode;
    const table = {
      id: "table-1",
      project_id: "p1",
      relative_path: "交易/订单模型.pdm",
      code: "T_ORDER",
      name: "订单表",
    } as TableDetail;

    expect(buildScopeOptions(project, node, table).map((option) => option.scope.type))
      .toEqual(["table", "pdm", "project", "all"]);
  });

  it("restores a historical scope even when the current workspace no longer contains it", () => {
    const conversation = {
      id: "conversation-1",
      messages: [{
        id: "message-1",
        role: "user",
        content: "查旧项目",
        created_at: "2026-08-14T10:00:00",
        scope: { type: "project", project_id: "old-project" },
        scope_kind: "原项目",
        scope_value: "历史订单库",
      }],
    } as AiConversationDetail;

    expect(restoredScopeFromConversation(conversation, []))
      .toMatchObject({ kind: "原项目", value: "历史订单库", scope: { project_id: "old-project" } });
  });
});
