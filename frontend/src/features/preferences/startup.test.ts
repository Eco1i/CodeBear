import { afterEach, describe, expect, it, vi } from "vitest";
import { getStartupSettings, setStartupEnabled } from "./startup";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("login startup settings API", () => {
  it("loads current-user startup support and state", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ supported: true, enabled: false }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(getStartupSettings()).resolves.toEqual({
      supported: true,
      enabled: false,
    });
    expect(fetchSpy).toHaveBeenCalledWith("/api/settings/startup", undefined);
  });

  it("sends a strict enabled flag and returns the applied state", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ supported: true, enabled: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(setStartupEnabled(true)).resolves.toEqual({
      supported: true,
      enabled: true,
    });
    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/settings/startup",
      expect.objectContaining({
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: true }),
      }),
    );
  });
});
