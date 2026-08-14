import type { Project, WorkspaceNode } from "./types";

export type DialogKind = "project" | "folder" | "rename" | "settings" | null;

export interface DialogState {
  kind: DialogKind;
  node?: WorkspaceNode;
}

export function walkNodes(
  nodes: WorkspaceNode[],
  visit: (node: WorkspaceNode) => boolean,
): WorkspaceNode | null {
  for (const node of nodes) {
    if (visit(node)) return node;
    const child = walkNodes(node.children || [], visit);
    if (child) return child;
  }
  return null;
}

export function pathParent(path: string): string {
  const index = path.lastIndexOf("/");
  return index === -1 ? "" : path.slice(0, index);
}

export function getProjectId(node: WorkspaceNode | null): string | undefined {
  return node?.project_id || (node?.type === "project" ? node.id.replace("project:", "") : undefined);
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "操作失败，请稍后重试";
}

export function projectForNode(
  projects: Project[],
  node: WorkspaceNode | null,
): Project | undefined {
  const projectId = getProjectId(node);
  return projects.find((project) => project.id === projectId);
}

export function normalizeWorkspacePath(path: string): string {
  return path.trim().replaceAll("/", "\\").replace(/\\+$/, "").toLocaleLowerCase();
}
