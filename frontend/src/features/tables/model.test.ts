import { describe, expect, it } from "vitest";
import {
  loadSearchMemory,
  prioritizeTables,
  recordSearchSelection,
  searchMemoryKey,
  writeSmartSearchPreference,
  readSmartSearchPreference,
} from "./model";
import type { SearchMemoryRecord } from "./model";

describe("table search memory", () => {
  const query = {
    projectId: "project-1",
    scopeType: "project",
    scopePath: "",
    mode: "table" as const,
    query: "  用户  ",
    allNodes: false,
  };

  it("normalizes equivalent search terms into the same memory key", () => {
    expect(searchMemoryKey(query)).toBe(searchMemoryKey({ ...query, query: "用户" }));
    expect(searchMemoryKey(query)).not.toBe(searchMemoryKey({ ...query, projectId: "project-2" }));
    expect(searchMemoryKey(query)).not.toBe(searchMemoryKey({ ...query, mode: "field" }));
  });

  it("promotes recently selected tables only for the matching search", () => {
    const key = searchMemoryKey(query);
    const otherKey = searchMemoryKey({ ...query, query: "订单" });
    const first = recordSearchSelection([], key, "table-2", 100);
    const records = recordSearchSelection(first, otherKey, "table-3", 200);
    const ranked = prioritizeTables(
      [{ id: "table-1" }, { id: "table-2" }, { id: "table-3" }],
      records,
      key,
    );

    expect(ranked.items.map((item) => item.id)).toEqual(["table-2", "table-1", "table-3"]);
    expect(ranked.preferredIds).toEqual(["table-2"]);
  });

  it("keeps at most three preferred tables per search and caps memory", () => {
    const key = searchMemoryKey(query);
    let records: SearchMemoryRecord[] = [];
    for (let index = 0; index < 5; index += 1) {
      records = recordSearchSelection(records, key, `table-${index}`, index + 1);
    }
    const ranked = prioritizeTables(
      Array.from({ length: 5 }, (_, index) => ({ id: `table-${index}` })),
      records,
      key,
    );

    expect(ranked.preferredIds).toEqual(["table-4", "table-3", "table-2"]);
    expect(records).toHaveLength(3);
  });

  it("ignores malformed and expired local records", () => {
    const storage = window.localStorage;
    const now = 90 * 24 * 60 * 60 * 1000 + 1000;
    storage.setItem(
      "codebear.search-memory.v1",
      JSON.stringify([
        { key: "valid", tableId: "table-1", lastSelectedAt: now - 900, selectionCount: 1 },
        { key: "expired", tableId: "table-2", lastSelectedAt: 0, selectionCount: 1 },
        { key: "invalid", tableId: "table-3" },
      ]),
    );

    expect(loadSearchMemory(storage, now)).toEqual([
      { key: "valid", tableId: "table-1", lastSelectedAt: now - 900, selectionCount: 1 },
    ]);
  });

  it("defaults smart ranking to enabled and persists the preference", () => {
    const storage = window.localStorage;
    expect(readSmartSearchPreference(storage)).toBe(true);
    writeSmartSearchPreference(false, storage);
    expect(readSmartSearchPreference(storage)).toBe(false);
  });
});
