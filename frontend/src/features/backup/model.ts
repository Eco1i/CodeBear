import type { DataNode } from "antd/es/tree";
import type { BackupExportNode, BackupImportNode, BackupInspection } from "./types";
import type { NodeType, WorkspaceNode } from "../workspace/types";

export type ConflictPolicy = "skip" | "rename" | "overwrite";
export type ImportSource = "archive" | "legacy";

export interface TransferNode extends DataNode {
  key: string;
  label: string;
  nodeType: NodeType;
  size: number;
  exportSelection?: BackupExportNode;
  importSelection?: BackupImportNode;
  children?: TransferNode[];
}

export interface TreeIndex {
  nodes: Map<string, TransferNode>;
  parents: Map<string, string>;
  keys: string[];
}

export interface SelectionSummary {
  projectCount: number;
  folderCount: number;
  pdmCount: number;
  totalBytes: number;
}

export function normalizeProjectNode(node: WorkspaceNode, projectId: string): WorkspaceNode {
  return {
    ...node,
    project_id: node.project_id || projectId,
    children: node.children?.map((child) => normalizeProjectNode(child, projectId)),
  };
}

export function exportTreeNode(node: WorkspaceNode): TransferNode {
  const projectId = node.project_id || node.id.replace("project:", "");
  return {
    key: node.id,
    title: node.name,
    label: node.name,
    nodeType: node.type,
    size: node.file_size || 0,
    isLeaf: node.type === "pdm",
    exportSelection: {
      project_id: projectId,
      type: node.type,
      relative_path: node.relative_path,
    },
    children: node.children?.map(exportTreeNode),
  };
}

export function backupTree(inspection: BackupInspection): TransferNode[] {
  return inspection.projects.map((project) => {
    const projectKey = `backup:${project.key}:project`;
    const projectNode: TransferNode = {
      key: projectKey,
      title: project.name,
      label: project.name,
      nodeType: "project",
      size: 0,
      importSelection: { project_key: project.key, type: "project", relative_path: "" },
      children: [],
    };
    const folderNodes = new Map<string, TransferNode>();
    const sortedEntries = [...project.entries].sort((left, right) => {
      const depth = left.path.split("/").length - right.path.split("/").length;
      if (depth) return depth;
      if (left.type !== right.type) return left.type === "folder" ? -1 : 1;
      return left.path.localeCompare(right.path, "zh-CN");
    });

    sortedEntries.forEach((entry) => {
      const key = `backup:${project.key}:${entry.type}:${entry.path}`;
      const label = entry.path.split("/").at(-1) || entry.path;
      const node: TransferNode = {
        key,
        title: label,
        label,
        nodeType: entry.type,
        size: entry.size || 0,
        isLeaf: entry.type === "pdm",
        importSelection: {
          project_key: project.key,
          type: entry.type,
          relative_path: entry.path,
        },
        children: entry.type === "folder" ? [] : undefined,
      };
      const slash = entry.path.lastIndexOf("/");
      const parentPath = slash === -1 ? "" : entry.path.slice(0, slash);
      const parent = parentPath ? folderNodes.get(parentPath) : projectNode;
      (parent?.children || projectNode.children)?.push(node);
      if (entry.type === "folder") folderNodes.set(entry.path, node);
    });
    return projectNode;
  });
}

export function buildTreeIndex(tree: TransferNode[]): TreeIndex {
  const nodes = new Map<string, TransferNode>();
  const parents = new Map<string, string>();
  const keys: string[] = [];
  const walk = (items: TransferNode[], parent?: string) => {
    items.forEach((item) => {
      nodes.set(item.key, item);
      keys.push(item.key);
      if (parent) parents.set(item.key, parent);
      walk(item.children || [], item.key);
    });
  };
  walk(tree);
  return { nodes, parents, keys };
}

export function collectSubtreeKeys(node: TransferNode, result: string[]): void {
  result.push(node.key);
  node.children?.forEach((child) => collectSubtreeKeys(child, result));
}

export function compactSelection(keys: string[], index: TreeIndex): TransferNode[] {
  const checked = new Set(keys);
  return keys
    .filter((key) => {
      let parent = index.parents.get(key);
      while (parent) {
        if (checked.has(parent)) return false;
        parent = index.parents.get(parent);
      }
      return true;
    })
    .map((key) => index.nodes.get(key))
    .filter((node): node is TransferNode => Boolean(node));
}

export function selectionSummary(keys: string[], index: TreeIndex): SelectionSummary {
  const projects = new Set<string>();
  let folderCount = 0;
  let pdmCount = 0;
  let totalBytes = 0;
  keys.forEach((key) => {
    const node = index.nodes.get(key);
    if (!node) return;
    const selection = node.exportSelection || node.importSelection;
    if (node.nodeType === "project") {
      projects.add(node.exportSelection?.project_id || node.importSelection?.project_key || key);
    } else if (selection) {
      projects.add("project_id" in selection ? selection.project_id : selection.project_key);
    }
    if (node.nodeType === "folder") folderCount += 1;
    if (node.nodeType === "pdm") {
      pdmCount += 1;
      totalBytes += node.size;
    }
  });
  return { projectCount: projects.size, folderCount, pdmCount, totalBytes };
}

export function filterTree(node: TransferNode, query: string): TransferNode | null {
  if (!query) return node;
  const children = (node.children || [])
    .map((child) => filterTree(child, query))
    .filter((child): child is TransferNode => Boolean(child));
  if (node.label.toLocaleLowerCase().includes(query) || children.length) {
    return { ...node, children };
  }
  return null;
}

export function formatBytes(bytes: number): string {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const order = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** order;
  return `${value >= 10 || order === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[order]}`;
}

export function formatCreatedAt(value: string): string {
  if (!value) return "旧版数据目录";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("zh-CN", { hour12: false });
}
