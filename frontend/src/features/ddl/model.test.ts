import { describe, expect, it } from "vitest";
import {
  cleanFileName,
  DEFAULT_CONFIG,
  mergeCatalogGroups,
  optionText,
  scopeIncludesGroup,
} from "./model";
import type { DdlCatalog, DdlCatalogGroup } from "./types";
import type { WorkspaceNode } from "../workspace/types";

const group = {
  id: "pdm-1",
  relative_path: "交易/订单.pdm",
  tables: [],
  tables_loaded: false,
} as unknown as DdlCatalogGroup;

describe("DDL model", () => {
  it("keeps defaults and filename cleanup independent from the modal", () => {
    expect(DEFAULT_CONFIG.database).toBe("mysql");
    expect(DEFAULT_CONFIG.charset).toBe("utf8mb4");
    expect(cleanFileName('订单:<脚本>?.sql ')).toBe("订单__脚本__.sql");
    expect(optionText({ value: "utf8mb4", label: "通用", description: "推荐" }))
      .toContain("推荐");
  });

  it("retains workspace scope and hydrated table data", () => {
    const folder = {
      id: "folder",
      project_id: "p1",
      type: "folder",
      name: "交易",
      relative_path: "交易",
    } satisfies WorkspaceNode;
    expect(scopeIncludesGroup(folder, group)).toBe(true);

    const base = { groups: [group] } as DdlCatalog;
    const hydratedGroup = { ...group, tables_loaded: true, tables: [{ id: "table-1" }] };
    const hydrated = { groups: [hydratedGroup] } as DdlCatalog;
    expect(mergeCatalogGroups(base, hydrated).groups[0]).toBe(hydratedGroup);
  });
});
