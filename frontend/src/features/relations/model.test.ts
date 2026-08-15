import { describe, expect, it } from "vitest";
import { bubbleWidth, cardinalityText, CARDINALITY_OPTIONS, layoutGraph, relationDisplayName } from "./model";
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

const child = (id = "t-child", code = "T_CHILD") =>
  relation({
    id: `r-${id}`,
    source_table: { id, name: code, code },
    target_table: { id: "t-parent", name: "T_PARENT", code: "T_PARENT" },
  });

describe("relations model", () => {
  it("layouts center bubble plus one-hop neighbor bubbles", () => {
    const layout = layoutGraph("t-parent", "T_PARENT", [relation()], 1000, 600);
    expect(Object.keys(layout.nodes).sort()).toEqual(["t-child", "t-parent"]);
    expect(layout.nodes["t-parent"]).toEqual({ id: "t-parent", x: 500, y: 300, width: expect.any(Number), mode: "bubble" });
    expect(layout.nodes["t-child"].mode).toBe("bubble");
    expect(layout.items).toHaveLength(1);
    expect(layout.edges).toHaveLength(1);
    expect(layout.edges[0].sourceTableId).toBe("t-child");
    expect(layout.edges[0].side).toBe(-1);
  });

  it("places incoming on the left and outgoing on the right of the center", () => {
    const incoming = child("t-in", "T_IN");
    const outgoing = relation({
      id: "r-out",
      source_table: { id: "t-parent", name: "T_PARENT", code: "T_PARENT" },
      target_table: { id: "t-out", name: "T_OUT", code: "T_OUT" },
      target_field: { id: "f2", name: "编号", code: "ID" },
    });
    const layout = layoutGraph("t-parent", "T_PARENT", [incoming, outgoing], 1000, 600);
    expect(layout.nodes["t-in"].x).toBeLessThan(500);
    expect(layout.nodes["t-out"].x).toBeGreaterThan(500);
    const inEdge = layout.edges.find((edge) => edge.nodeId === "t-in");
    const outEdge = layout.edges.find((edge) => edge.nodeId === "t-out");
    expect(inEdge?.side).toBe(-1);
    expect(outEdge?.side).toBe(1);
  });

  it("falls back to dots when there are more than 16 relations", () => {
    const many = Array.from({ length: 17 }, (_, index) => child(`t-${index}`, `T_${index}`));
    const layout = layoutGraph("t-parent", "T_PARENT", many, 1000, 600);
    expect(Object.values(layout.nodes).every((node) => node.mode === "dot")).toBe(true);
    expect(layout.items).toHaveLength(17);
    expect(layout.edges).toHaveLength(17);
  });

  it("sizes bubbles by code length with a cap", () => {
    expect(bubbleWidth("T")).toBeGreaterThanOrEqual(34);
    expect(bubbleWidth("T_VERY_LONG_CODE")).toBeLessThanOrEqual(92);
    expect(bubbleWidth("T_VERY_LONG_CODE")).toBeGreaterThan(bubbleWidth("T"));
  });

  it("returns empty layout for missing dimensions", () => {
    expect(layoutGraph("t-parent", "T_PARENT", [relation()], 0, 0).edges).toEqual([]);
  });

  it("formats names and cardinality", () => {
    expect(relationDisplayName(relation())).toBe("FK_TEST");
    expect(relationDisplayName(relation({ name: "" }))).toBe("FK");
    expect(cardinalityText("1..n")).toBe("1..n");
    expect(cardinalityText("")).toBe("—");
    expect(CARDINALITY_OPTIONS).toContain("1..n");
  });
});
