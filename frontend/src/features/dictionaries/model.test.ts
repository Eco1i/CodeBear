import { describe, expect, it } from "vitest";
import { importSuccessMessage } from "./model";
import type { DictionarySummary } from "./types";

const summary = (overrides: Partial<DictionarySummary> = {}): DictionarySummary => ({
  id: "dict-1",
  name: "委托方向",
  description: "",
  source_type: "excel",
  source_name: "恒生O32字典数据.xlsx",
  source_sheet: "委托方向表-TENTRUSTDIRECTION",
  code_column: "C_ENTRUST_DIRECTION",
  name_column: "VC_ENTRUSTDIR_NAME",
  item_count: 82,
  binding_count: 0,
  table_count: 0,
  created_at: "2026-08-14T00:00:00Z",
  updated_at: "2026-08-14T00:00:00Z",
  ...overrides,
});

describe("dictionaries model", () => {
  it("无重复行时只提示导入条数", () => {
    expect(importSuccessMessage(summary())).toBe("已导入 82 条字典值");
  });

  it("跳过完全相同重复行时说明数量", () => {
    expect(importSuccessMessage(summary({ skipped_duplicate_count: 108 }))).toBe(
      "已导入 82 条字典值，已自动跳过 108 条重复行（完全相同 108 条），同码保留首次出现",
    );
  });

  it("同码不同名冲突时列出数量与示例代码", () => {
    expect(
      importSuccessMessage(
        summary({
          skipped_duplicate_count: 108,
          skipped_conflict_count: 23,
          conflicting_codes: ["0", "9", "B"],
        }),
      ),
    ).toBe(
      "已导入 82 条字典值，已自动跳过 131 条重复行（完全相同 108 条、同码不同名 23 条：如 0、9、B），同码保留首次出现",
    );
  });
});
