type FileSystemWritableFileStreamLike = {
  write(data: Blob): Promise<void>;
  close(): Promise<void>;
  abort?: () => Promise<void>;
};

type FileSystemFileHandleLike = {
  readonly name: string;
  createWritable(): Promise<FileSystemWritableFileStreamLike>;
};

type SaveFilePickerOptions = {
  suggestedName: string;
  types: Array<{
    description: string;
    accept: Record<string, string[]>;
  }>;
};

type ShowSaveFilePicker = (
  options: SaveFilePickerOptions,
) => Promise<FileSystemFileHandleLike>;

type WindowWithSaveFilePicker = Window & {
  showSaveFilePicker?: ShowSaveFilePicker;
};

export type SaveFileOptions = {
  description: string;
  mimeType: string;
  extension: string;
};

export type SaveFileTarget = {
  readonly fileName: string;
  write(blob: Blob): Promise<void>;
};

/**
 * Opens the browser's native save picker when the current browser supports it.
 * Call this before an asynchronous export request so the user activation is
 * still available to the File System Access API.
 */
export async function chooseSaveFileTarget(
  suggestedName: string,
  options: SaveFileOptions,
): Promise<SaveFileTarget | null> {
  if (typeof window === "undefined") return null;
  const picker = (window as WindowWithSaveFilePicker).showSaveFilePicker;
  if (typeof picker !== "function") return null;

  const handle = await picker.call(window, {
    suggestedName,
    types: [
      {
        description: options.description,
        accept: { [options.mimeType]: [options.extension] },
      },
    ],
  });

  return {
    fileName: handle.name || suggestedName,
    write: async (blob) => {
      const writable = await handle.createWritable();
      try {
        await writable.write(blob);
        await writable.close();
      } catch (error) {
        if (writable.abort) {
          try {
            await writable.abort();
          } catch {
            // Preserve the original write/close error.
          }
        }
        throw error;
      }
    },
  };
}

/** Use the browser's normal download flow when a native picker is unavailable. */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  try {
    link.click();
  } finally {
    link.remove();
    URL.revokeObjectURL(url);
  }
}

export function isSaveDialogCancellation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    (error as { name?: unknown }).name === "AbortError"
  );
}
