import { afterEach, describe, expect, it, vi } from "vitest";
import {
  chooseSaveFileTarget,
  downloadBlob,
  isSaveDialogCancellation,
} from "./fileDownload";

const savePickerWindow = window as Window & {
  showSaveFilePicker?: unknown;
};
const originalSavePicker = savePickerWindow.showSaveFilePicker;

afterEach(() => {
  vi.restoreAllMocks();
  if (originalSavePicker) {
    savePickerWindow.showSaveFilePicker = originalSavePicker;
  } else {
    Reflect.deleteProperty(savePickerWindow, "showSaveFilePicker");
  }
});

describe("file download helpers", () => {
  it("writes the blob through the native save picker", async () => {
    const write = vi.fn<(data: Blob) => Promise<void>>().mockResolvedValue();
    const close = vi.fn<() => Promise<void>>().mockResolvedValue();
    const picker = vi.fn().mockResolvedValue({
      name: "chosen.cbbak",
      createWritable: vi.fn().mockResolvedValue({ write, close }),
    });
    savePickerWindow.showSaveFilePicker = picker;

    const target = await chooseSaveFileTarget("suggested.cbbak", {
      description: "CodeBear backup",
      mimeType: "application/octet-stream",
      extension: ".cbbak",
    });
    const blob = new Blob(["backup"]);

    expect(target?.fileName).toBe("chosen.cbbak");
    await target?.write(blob);

    expect(picker).toHaveBeenCalledWith({
      suggestedName: "suggested.cbbak",
      types: [
        {
          description: "CodeBear backup",
          accept: { "application/octet-stream": [".cbbak"] },
        },
      ],
    });
    expect(write).toHaveBeenCalledWith(blob);
    expect(close).toHaveBeenCalledOnce();
  });

  it("returns no target when the native picker is unavailable", async () => {
    Reflect.deleteProperty(savePickerWindow, "showSaveFilePicker");

    await expect(
      chooseSaveFileTarget("backup.cbbak", {
        description: "CodeBear backup",
        mimeType: "application/octet-stream",
        extension: ".cbbak",
      }),
    ).resolves.toBeNull();
  });

  it("keeps the browser download fallback available", () => {
    const createObjectURL = vi.fn().mockReturnValue("blob:test");
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: createObjectURL,
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: revokeObjectURL,
    });
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);

    downloadBlob(new Blob(["backup"]), "backup.cbbak");

    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(click).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:test");
  });

  it("recognizes a cancelled save dialog", () => {
    expect(isSaveDialogCancellation({ name: "AbortError" })).toBe(true);
    expect(isSaveDialogCancellation({ name: "NotAllowedError" })).toBe(false);
    expect(isSaveDialogCancellation(new Error("cancelled"))).toBe(false);
  });
});
