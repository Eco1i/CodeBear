import { describe, expect, it } from "vitest";
import {
  backupTree,
  buildTreeIndex,
  compactSelection,
  filterTree,
  selectionSummary,
} from "./model";
import type { BackupInspection } from "./types";

const inspection: BackupInspection = {
  token: "token",
  file_name: "backup.cbbak",
  source_type: "archive",
  format: "codebear-backup",
  format_version: 1,
  app_version: "1.1.0",
  created_at: "2026-08-14T10:00:00",
  projects: [{
    key: "project-one",
    name: "项目一",
    entries: [
      { type: "folder", path: "领域" },
      { type: "pdm", path: "领域/订单.pdm", size: 2048 },
    ],
  }],
  stats: { project_count: 1, folder_count: 1, pdm_count: 1, total_bytes: 2048 },
};

describe("backup model", () => {
  it("builds a nested import tree and compacts parent selections", () => {
    const tree = backupTree(inspection);
    const index = buildTreeIndex(tree);
    expect(tree[0].children?.[0].children?.[0].label).toBe("订单.pdm");
    expect(compactSelection(index.keys, index)).toEqual([tree[0]]);
    expect(selectionSummary(index.keys, index)).toEqual({
      projectCount: 1,
      folderCount: 1,
      pdmCount: 1,
      totalBytes: 2048,
    });
  });

  it("filters parents in when a descendant matches", () => {
    const result = filterTree(backupTree(inspection)[0], "订单");
    expect(result?.children?.[0].children?.[0].label).toBe("订单.pdm");
    expect(filterTree(backupTree(inspection)[0], "不存在")).toBeNull();
  });
});
