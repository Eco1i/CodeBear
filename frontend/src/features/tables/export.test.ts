import { describe, expect, it } from "vitest";
import { tableStructureFileName } from "./export";

describe("table structure export filenames", () => {
  it("prefers the table code and adds the selected format extension", () => {
    expect(
      tableStructureFileName({ code: "t_user", name: "用户表" }, "xlsx"),
    ).toBe("t_user.xlsx");
  });

  it("removes characters that are invalid in Windows and macOS filenames", () => {
    expect(tableStructureFileName({ code: "bad/name?" }, "csv")).toBe(
      "bad_name_.csv",
    );
  });

  it("uses a safe name for reserved Windows devices and empty values", () => {
    expect(tableStructureFileName({ code: "CON" }, "json")).toBe("_CON.json");
    expect(tableStructureFileName({ code: "..." }, "md")).toBe("table.md");
  });

  it("trims trailing dots after limiting long filenames", () => {
    expect(
      tableStructureFileName({ code: `${"a".repeat(119)}.b` }, "csv"),
    ).toBe(`${"a".repeat(119)}.csv`);
  });
});
