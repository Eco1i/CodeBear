import type { TableExportFormat } from "./types";

const EXTENSIONS = {
  xlsx: ".xlsx",
  csv: ".csv",
  json: ".json",
  md: ".md",
} satisfies Record<TableExportFormat, string>;

const WINDOWS_RESERVED_NAME = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;

export function tableStructureFileName(
  table: { code?: string | null; name?: string | null },
  format: TableExportFormat,
): string {
  const source = table.code?.trim() || table.name?.trim() || "table";
  let stem = source
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
    .slice(0, 120)
    .replace(/[. ]+$/g, "");
  if (!stem) stem = "table";
  if (WINDOWS_RESERVED_NAME.test(stem)) stem = `_${stem}`;
  return `${stem}${EXTENSIONS[format]}`;
}

export const TABLE_EXPORT_FORMATS: readonly TableExportFormat[] = [
  "xlsx",
  "csv",
  "json",
  "md",
];
