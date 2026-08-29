import type { SearchMode, TableSummary } from "./types";

export const SEARCH_MEMORY_STORAGE_KEY = "codebear.search-memory.v1";
export const SMART_SEARCH_PREFERENCE_KEY = "codebear.smart-search.enabled.v1";

const MAX_MEMORY_RECORDS = 100;
const MAX_PREFERRED_TABLES_PER_QUERY = 3;
const MEMORY_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000;

export interface SearchMemoryQuery {
  projectId?: string;
  scopeType: string;
  scopePath: string;
  mode: SearchMode | string;
  query: string;
  allNodes: boolean;
}

export interface SearchMemoryRecord {
  key: string;
  tableId: string;
  lastSelectedAt: number;
  selectionCount: number;
}

function storageOrNull(storage?: Storage): Storage | null {
  if (storage) return storage;
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function normalizeSearchQuery(query: string): string {
  return query.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

export function searchMemoryKey(query: SearchMemoryQuery): string {
  return JSON.stringify({
    projectId: query.allNodes ? "" : query.projectId || "",
    scopeType: query.scopeType,
    scopePath: query.scopePath.trim().replaceAll("\\", "/"),
    mode: query.mode,
    query: normalizeSearchQuery(query.query),
    allNodes: query.allNodes,
  });
}

function normalizeRecord(value: unknown): SearchMemoryRecord | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<SearchMemoryRecord>;
  if (
    typeof candidate.key !== "string" ||
    typeof candidate.tableId !== "string" ||
    !candidate.tableId ||
    typeof candidate.lastSelectedAt !== "number" ||
    !Number.isFinite(candidate.lastSelectedAt) ||
    typeof candidate.selectionCount !== "number" ||
    !Number.isFinite(candidate.selectionCount)
  ) {
    return null;
  }
  return {
    key: candidate.key,
    tableId: candidate.tableId,
    lastSelectedAt: candidate.lastSelectedAt,
    selectionCount: Math.max(1, Math.floor(candidate.selectionCount)),
  };
}

export function loadSearchMemory(storage?: Storage, now = Date.now()): SearchMemoryRecord[] {
  const target = storageOrNull(storage);
  if (!target) return [];
  try {
    const parsed: unknown = JSON.parse(target.getItem(SEARCH_MEMORY_STORAGE_KEY) || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(normalizeRecord)
      .filter((record): record is SearchMemoryRecord => Boolean(record))
      .filter((record) => now - record.lastSelectedAt <= MEMORY_MAX_AGE_MS)
      .sort((left, right) => right.lastSelectedAt - left.lastSelectedAt)
      .slice(0, MAX_MEMORY_RECORDS);
  } catch {
    return [];
  }
}

export function saveSearchMemory(records: SearchMemoryRecord[], storage?: Storage): void {
  const target = storageOrNull(storage);
  if (!target) return;
  try {
    target.setItem(SEARCH_MEMORY_STORAGE_KEY, JSON.stringify(records.slice(0, MAX_MEMORY_RECORDS)));
  } catch {
    // Local preference storage is optional and must not interrupt searching.
  }
}

export function recordSearchSelection(
  records: SearchMemoryRecord[],
  key: string,
  tableId: string,
  selectedAt = Date.now(),
): SearchMemoryRecord[] {
  if (!key || !tableId) return records;
  const existing = records.find((record) => record.key === key && record.tableId === tableId);
  const next = records.filter((record) => record !== existing);
  next.push({
    key,
    tableId,
    lastSelectedAt: selectedAt,
    selectionCount: (existing?.selectionCount || 0) + 1,
  });

  const preferredForKey = next
    .filter((record) => record.key === key)
    .sort((left, right) => right.lastSelectedAt - left.lastSelectedAt)
    .slice(0, MAX_PREFERRED_TABLES_PER_QUERY);
  const preferredIds = new Set(preferredForKey.map((record) => record.tableId));
  const withoutExtraPreferences = next.filter(
    (record) => record.key !== key || preferredIds.has(record.tableId),
  );
  return withoutExtraPreferences
    .sort((left, right) => right.lastSelectedAt - left.lastSelectedAt)
    .slice(0, MAX_MEMORY_RECORDS);
}

export function prioritizeTables<T extends Pick<TableSummary, "id">>(
  items: T[],
  records: SearchMemoryRecord[],
  key: string,
): { items: T[]; preferredIds: string[] } {
  if (!key || items.length < 2) return { items, preferredIds: [] };
  const itemIds = new Set(items.map((item) => item.id));
  const preferredIds = records
    .filter((record) => record.key === key && itemIds.has(record.tableId))
    .sort((left, right) => right.lastSelectedAt - left.lastSelectedAt)
    .slice(0, MAX_PREFERRED_TABLES_PER_QUERY)
    .map((record) => record.tableId);
  if (!preferredIds.length) return { items, preferredIds: [] };

  const preferred = new Set(preferredIds);
  return {
    items: [
      ...preferredIds.flatMap((id) => items.filter((item) => item.id === id)),
      ...items.filter((item) => !preferred.has(item.id)),
    ],
    preferredIds,
  };
}

export function readSmartSearchPreference(storage?: Storage): boolean {
  const target = storageOrNull(storage);
  if (!target) return true;
  try {
    return target.getItem(SMART_SEARCH_PREFERENCE_KEY) !== "false";
  } catch {
    return true;
  }
}

export function writeSmartSearchPreference(enabled: boolean, storage?: Storage): void {
  const target = storageOrNull(storage);
  if (!target) return;
  try {
    target.setItem(SMART_SEARCH_PREFERENCE_KEY, String(enabled));
  } catch {
    // Local preference storage is optional and must not interrupt searching.
  }
}
