import { describe, expect, it } from "vitest";
import { cardinalityText, CARDINALITY_OPTIONS, layoutGraph, relationDisplayName } from "./model";
import type { Relation } from "./types";

const relation = (overrides: Partial<Relation> = {}): Relation => ({
  id: "r1",
  name: "FK_TEST",
  cardinality: "1..n",
  note: "",
  source_type: "manual",
  source_table: { id: "t-child", name: "子表", code: "T_CHILD" },
  source_field: { id: "f1", name: "编号", code: "ID" },
  target_table: { id: "t-parent", name: "父表", code: "T_PARENT" },
  target_field: { id: "f2", name: "编号", code: "ID" },
  created_at: "",
  updated_at: "",
  ...overrides,
});

describe("relations model", () => {
  it("layouts center plus one-hop neighbors", () => {
    const layout = layoutGraph("t-parent", [relation()], 1000, 600);
    expect(Object.keys(layout.nodes).sort()).toEqual(["t-child", "t-parent"]);
    expect(layout.nodes["t-parent"]).toEqual({ id: "t-parent", x: 500, y: 300 });
    expect(layout.neighborIds).toEqual(["t-child"]);
    expect(layout.edges).toHaveLength(1);
    expect(layout.edges[0].sourceTableId).toBe("t-child");
  });

  it("returns empty layout for missing dimensions", () => {
    expect(layoutGraph("t-parent", [relation()], 0, 0).edges).toEqual([]);
  });

  it("formats names and cardinality", () => {
    expect(relationDisplayName(relation())).toBe("FK_TEST");
    expect(relationDisplayName(relation({ name: "" }))).toBe("FK");
    expect(cardinalityText("1..n")).toBe("1..n");
    expect(cardinalityText("")).toBe("—");
    expect(CARDINALITY_OPTIONS).toContain("1..n");
  });
});
