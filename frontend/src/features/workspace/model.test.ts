import { describe, expect, it } from "vitest";
import {
  getProjectId,
  normalizeWorkspacePath,
  pathParent,
  projectForNode,
  walkNodes,
} from "./model";
import type { Project, WorkspaceNode } from "./types";

const tree: WorkspaceNode[] = [{
  id: "project:p1",
  type: "project",
  name: "项目一",
  relative_path: "",
  children: [{
    id: "folder:p1:domain",
    project_id: "p1",
    type: "folder",
    name: "domain",
    relative_path: "domain",
    children: [{
      id: "pdm:orders",
      project_id: "p1",
      pdm_id: "orders",
      type: "pdm",
      name: "订单模型.pdm",
      relative_path: "domain/订单模型.pdm",
    }],
  }],
}];

describe("workspace model", () => {
  it("locates nested nodes and resolves their project", () => {
    const node = walkNodes(tree, (candidate) => candidate.id === "pdm:orders");
    expect(node?.name).toBe("订单模型.pdm");
    expect(getProjectId(node)).toBe("p1");

    const project = { id: "p1", name: "项目一" } as Project;
    expect(projectForNode([project], node)).toBe(project);
  });

  it("normalizes workspace paths without changing business paths", () => {
    expect(pathParent("domain/订单模型.pdm")).toBe("domain");
    expect(normalizeWorkspacePath(" D:\\Data\\CodeBear/// ")).toBe("D:/Data/CodeBear");
    expect(normalizeWorkspacePath(" /Users/codebear/Workspace/// ")).toBe("/Users/codebear/Workspace");
  });
});
