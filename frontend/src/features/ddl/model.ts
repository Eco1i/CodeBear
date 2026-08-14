import type {
  DdlCatalog,
  DdlCatalogGroup,
  DdlCatalogTable,
  DdlConfig,
  DdlValueOption,
} from "./types";
import type { WorkspaceNode } from "../workspace/types";

export const DEFAULT_CONFIG: DdlConfig = {
  database: "mysql",
  version: "8.0",
  schema: "",
  include_comments: true,
  drop_table: false,
  if_not_exists: true,
  engine: "InnoDB",
  charset: "utf8mb4",
  collation: "utf8mb4_0900_ai_ci",
  tablespace: "",
  tdsql_mode: "shard",
  ignite_template: "PARTITIONED",
  ignite_backups: 1,
  ignite_atomicity: "ATOMIC",
  ignite_write_sync: "FULL_SYNC",
  ignite_cache_group: "",
  ignite_affinity_key: true,
};

export function optionText(option: DdlValueOption): string {
  return [option.value, option.label, option.description, option.default_collation, option.charset]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase();
}

export function scopeIncludesGroup(
  node: WorkspaceNode | null,
  group: DdlCatalogGroup,
): boolean {
  if (!node || node.type === "project") return true;
  if (node.type === "pdm") {
    return node.pdm_id === group.id || node.relative_path === group.relative_path;
  }
  const prefix = node.relative_path.replace(/\/+$/, "");
  return !prefix || group.relative_path.startsWith(`${prefix}/`);
}

export function mergeCatalogGroups(base: DdlCatalog, hydrated: DdlCatalog): DdlCatalog {
  const hydratedById = new Map(hydrated.groups.map((group) => [group.id, group]));
  return {
    ...base,
    groups: base.groups.map((group) => hydratedById.get(group.id) || group),
  };
}

export function cacheCatalogTables(
  target: Map<string, DdlCatalogTable>,
  groups: DdlCatalogGroup[],
): void {
  groups.forEach((group) => group.tables.forEach((table) => target.set(table.id, table)));
}

export function compactNumber(value: number): string {
  return new Intl.NumberFormat("zh-CN").format(value);
}

export function cleanFileName(value: string): string {
  return value
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
    .replace(/[. ]+$/g, "")
    .slice(0, 120) || "码熊建表脚本";
}
