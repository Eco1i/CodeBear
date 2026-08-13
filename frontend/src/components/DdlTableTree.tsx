import { useEffect, useMemo, useRef, useState } from "react";
import { ReloadOutlined } from "@ant-design/icons";
import { Button, Checkbox, Empty, Spin } from "antd";

import type { DdlCatalogGroup, DdlCatalogTable } from "../types";
import { PdmGlyph, TableGlyph, TreeChevronGlyph } from "./PrototypeGlyphs";


const GROUP_ROW_HEIGHT = 44;
const TABLE_ROW_HEIGHT = 40;
const GROUP_GAP = 7;
const TREE_OVERSCAN = 240;


interface DdlTableTreeProps {
  groups: DdlCatalogGroup[];
  selectedIds: ReadonlySet<string>;
  selectedGroupCounts: ReadonlyMap<string, number>;
  expandedIds: ReadonlySet<string>;
  loadingGroupIds: ReadonlySet<string>;
  groupErrors: ReadonlyMap<string, string>;
  searching: boolean;
  queryActive: boolean;
  viewRevision: string;
  onToggleExpanded: (group: DdlCatalogGroup) => void;
  onToggleGroup: (group: DdlCatalogGroup, checked: boolean) => void;
  onToggleTable: (table: DdlCatalogTable, checked: boolean) => void;
  onRetryGroup: (group: DdlCatalogGroup) => void;
}


interface PositionedRowBase {
  key: string;
  top: number;
  height: number;
}

interface GroupRow extends PositionedRowBase {
  kind: "group";
  group: DdlCatalogGroup;
  groupIndex: number;
  expanded: boolean;
  selectedCount: number;
  selectionTotal: number;
}

interface TableRow extends PositionedRowBase {
  kind: "table";
  group: DdlCatalogGroup;
  table: DdlCatalogTable;
  tableIndex: number;
  isLast: boolean;
}

interface StatusRow extends PositionedRowBase {
  kind: "status";
  group: DdlCatalogGroup;
  status: "loading" | "error" | "empty";
  message: string;
  isLast: true;
}

type PositionedRow = GroupRow | TableRow | StatusRow;


export function DdlTableTree({
  groups,
  selectedIds,
  selectedGroupCounts,
  expandedIds,
  loadingGroupIds,
  groupErrors,
  searching,
  queryActive,
  viewRevision,
  onToggleExpanded,
  onToggleGroup,
  onToggleTable,
  onRetryGroup,
}: DdlTableTreeProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const pendingScrollTopRef = useRef(0);
  const scrollFrameRef = useRef<number | null>(null);
  const [viewportHeight, setViewportHeight] = useState(480);
  const [scrollTop, setScrollTop] = useState(0);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const updateHeight = () => setViewportHeight(Math.max(1, Math.round(viewport.clientHeight)));
    updateHeight();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(updateHeight);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);

  useEffect(
    () => () => {
      if (scrollFrameRef.current !== null) window.cancelAnimationFrame(scrollFrameRef.current);
    },
    [],
  );

  useEffect(() => {
    const viewport = viewportRef.current;
    if (viewport) viewport.scrollTop = 0;
    pendingScrollTopRef.current = 0;
    setScrollTop(0);
  }, [viewRevision]);

  const layout = useMemo(() => {
    const rows: PositionedRow[] = [];
    let top = 0;
    groups.forEach((group, groupIndex) => {
      const expanded = expandedIds.has(group.id);
      const visibleSelectedCount = queryActive
        ? group.tables.reduce((total, table) => total + (selectedIds.has(table.id) ? 1 : 0), 0)
        : (selectedGroupCounts.get(group.id) || 0);
      const selectionTotal = queryActive ? group.tables.length : group.table_count;
      const loading = loadingGroupIds.has(group.id);
      const error = groupErrors.get(group.id) || "";
      const hasChildRow = expanded && (loading || Boolean(error) || !group.tables_loaded || group.tables.length > 0);
      rows.push({
        kind: "group",
        key: `group-${group.id}`,
        top,
        height: hasChildRow ? GROUP_ROW_HEIGHT : GROUP_ROW_HEIGHT + GROUP_GAP,
        group,
        groupIndex,
        expanded,
        selectedCount: visibleSelectedCount,
        selectionTotal,
      });
      top += hasChildRow ? GROUP_ROW_HEIGHT : GROUP_ROW_HEIGHT + GROUP_GAP;

      if (!expanded) return;
      if (error) {
        rows.push({
          kind: "status",
          key: `status-${group.id}`,
          top,
          height: TABLE_ROW_HEIGHT + GROUP_GAP,
          group,
          status: "error",
          message: error,
          isLast: true,
        });
        top += TABLE_ROW_HEIGHT + GROUP_GAP;
        return;
      }
      if (loading || !group.tables_loaded) {
        rows.push({
          kind: "status",
          key: `status-${group.id}`,
          top,
          height: TABLE_ROW_HEIGHT + GROUP_GAP,
          group,
          status: "loading",
          message: "正在读取数据表…",
          isLast: true,
        });
        top += TABLE_ROW_HEIGHT + GROUP_GAP;
        return;
      }
      if (!group.tables.length) {
        rows.push({
          kind: "status",
          key: `status-${group.id}`,
          top,
          height: TABLE_ROW_HEIGHT + GROUP_GAP,
          group,
          status: "empty",
          message: "该 PDM 暂无数据表",
          isLast: true,
        });
        top += TABLE_ROW_HEIGHT + GROUP_GAP;
        return;
      }
      group.tables.forEach((table, tableIndex) => {
        const isLast = tableIndex === group.tables.length - 1;
        const height = TABLE_ROW_HEIGHT + (isLast ? GROUP_GAP : 0);
        rows.push({
          kind: "table",
          key: `table-${table.id}`,
          top,
          height,
          group,
          table,
          tableIndex,
          isLast,
        });
        top += height;
      });
    });
    return { rows, totalHeight: top };
  }, [expandedIds, groupErrors, groups, loadingGroupIds, queryActive, selectedGroupCounts, selectedIds]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const maximum = Math.max(0, layout.totalHeight - viewportHeight);
    if (viewport.scrollTop <= maximum) return;
    viewport.scrollTop = maximum;
    pendingScrollTopRef.current = maximum;
    setScrollTop(maximum);
  }, [layout.totalHeight, viewportHeight]);

  const visibleRows = useMemo(() => {
    const start = Math.max(0, scrollTop - TREE_OVERSCAN);
    const end = scrollTop + viewportHeight + TREE_OVERSCAN;
    let low = 0;
    let high = layout.rows.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      const row = layout.rows[middle];
      if (row.top + row.height < start) low = middle + 1;
      else high = middle;
    }

    const rows: PositionedRow[] = [];
    for (let index = low; index < layout.rows.length; index += 1) {
      const row = layout.rows[index];
      if (row.top > end) break;
      rows.push(row);
    }
    return rows;
  }, [layout.rows, scrollTop, viewportHeight]);

  const handleScroll = (nextScrollTop: number) => {
    pendingScrollTopRef.current = nextScrollTop;
    if (scrollFrameRef.current !== null) return;
    scrollFrameRef.current = window.requestAnimationFrame(() => {
      scrollFrameRef.current = null;
      setScrollTop(pendingScrollTopRef.current);
    });
  };

  return (
    <div
      ref={viewportRef}
      className="ddl-table-tree"
      role="tree"
      aria-label="PDM 数据表选择树"
      aria-busy={searching}
      onScroll={(event) => handleScroll(event.currentTarget.scrollTop)}
    >
      {searching ? (
        <div className="ddl-tree-loading"><Spin size="small" /><span>正在搜索 PDM 和数据表…</span></div>
      ) : !groups.length ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="没有匹配的 PDM 或数据表" />
      ) : (
        <div className="ddl-tree-virtual-space" style={{ height: layout.totalHeight }}>
          {visibleRows.map((row) => {
            if (row.kind === "group") {
              const checked = Boolean(row.selectionTotal && row.selectedCount === row.selectionTotal);
              const indeterminate = row.selectedCount > 0 && !checked;
              const loading = loadingGroupIds.has(row.group.id);
              return (
                <div
                  className="ddl-tree-virtual-row is-group"
                  key={row.key}
                  style={{ height: row.height, transform: `translateY(${row.top}px)` }}
                >
                  <div
                    className="ddl-tree-group ddl-tree-virtual-group"
                    role="treeitem"
                    aria-expanded={row.expanded}
                    aria-level={1}
                    aria-posinset={row.groupIndex + 1}
                    aria-setsize={groups.length}
                  >
                    <div className="ddl-pdm-node">
                      <button
                        type="button"
                        className="ddl-tree-toggle"
                        aria-label={row.expanded ? `收起 ${row.group.file_name}` : `展开 ${row.group.file_name}`}
                        onClick={() => onToggleExpanded(row.group)}
                      >
                        <TreeChevronGlyph expanded={row.expanded} />
                      </button>
                      <Checkbox
                        checked={checked}
                        indeterminate={indeterminate}
                        disabled={loading}
                        aria-label={`选择 ${row.group.file_name}`}
                        onChange={(event) => onToggleGroup(row.group, event.target.checked)}
                      />
                      <span className="ddl-tree-icon is-pdm"><PdmGlyph /></span>
                      <button type="button" className="ddl-pdm-copy" onClick={() => onToggleExpanded(row.group)}>
                        <b title={row.group.relative_path}>{row.group.file_name}</b>
                        <small>{row.group.model_name || "PowerDesigner 模型文件"}</small>
                      </button>
                      <span className="ddl-node-count">{row.selectedCount} / {row.selectionTotal}</span>
                    </div>
                  </div>
                </div>
              );
            }
            if (row.kind === "status") {
              return (
                <div
                  className="ddl-tree-virtual-row is-table"
                  key={row.key}
                  style={{ height: row.height, transform: `translateY(${row.top}px)` }}
                >
                  <div className="ddl-tree-table-surface is-last">
                    <div className={`ddl-tree-status is-${row.status}`} role="status">
                      {row.status === "loading" ? <Spin size="small" /> : null}
                      <span title={row.message}>{row.message}</span>
                      {row.status === "error" ? (
                        <Button
                          type="text"
                          size="small"
                          icon={<ReloadOutlined />}
                          onClick={() => onRetryGroup(row.group)}
                        >
                          重试
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            }
            return (
              <div
                className="ddl-tree-virtual-row is-table"
                key={row.key}
                style={{ height: row.height, transform: `translateY(${row.top}px)` }}
              >
                <div className={`ddl-tree-table-surface${row.isLast ? " is-last" : ""}`}>
                  <label
                    className={`ddl-table-node${selectedIds.has(row.table.id) ? " is-selected" : ""}`}
                    role="treeitem"
                    aria-level={2}
                    aria-posinset={row.tableIndex + 1}
                    aria-setsize={row.group.tables.length}
                  >
                    <Checkbox
                      checked={selectedIds.has(row.table.id)}
                      aria-label={`选择 ${row.table.name || row.table.code}`}
                      onChange={(event) => onToggleTable(row.table, event.target.checked)}
                    />
                    <span className="ddl-tree-icon is-table"><TableGlyph /></span>
                    <span className="ddl-table-copy">
                      <b title={row.table.name || row.table.code}>{row.table.name || row.table.code || "未命名数据表"}</b>
                      <small title={row.table.code}>{row.table.code || "NO_TABLE_CODE"}</small>
                    </span>
                    <span className="ddl-node-count">{row.table.field_count} 字段</span>
                  </label>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
