import { afterEach, describe, expect, it, vi } from "vitest";
import { tablesApi } from "./api";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("table structure export API", () => {
  it("requests the selected format and returns the download blob", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("xlsx-data", { status: 200 }));

    const blob = await tablesApi.exportStructure("table /1", "xlsx", "en-US");

    expect(await blob.text()).toBe("xlsx-data");
    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/tables/table%20%2F1/export?format=xlsx&language=en-US",
    );
  });
});
