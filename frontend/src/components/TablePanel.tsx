import { useEffect, useMemo, useRef, useState } from "react";
import { DeleteOutlined, SearchOutlined } from "@ant-design/icons";
import { Button, Checkbox, Empty, Input, Segmented, Spin, Tooltip } from "antd";
import type { SearchMode, TableSummary } from "../types";
import { useGridScrollbarGutter } from "../useGridScrollbarGutter";
import { HighlightedText } from "./HighlightedText";

const TABLE_ROW_HEIGHT = 32;
const TABLE_VIEWPORT_HEIGHT = TABLE_ROW_HEIGHT * 6;
const TABLE_OVERSCAN = 3;

interface TablePanelProps {
  tables: Array<TableSummary | undefined>;
  total: number;
  datasetRevision: number;
  selectedTableId: string | null;
  selectedTableIds: Set<string>;
  loading: boolean;
  deleting: boolean;
  mode: SearchMode;
  query: string;
  allNodes: boolean;
  onSearch: (mode: SearchMode, query: string, allNodes: boolean) => void;
  onSelect: (table: TableSummary) => void;
  onToggleSelection: (table: TableSummary, checked: boolean) => void;
  onClearSelection: () => void;
  onDelete: (tables: TableSummary[]) => void;
  onRequestRange: (startIndex: number, endIndex: number) => void;
}

export function TablePanel({
  tables,
  total,
  datasetRevision,
  selectedTableId,
  selectedTableIds,
  loading,
  deleting,
  mode,
  query,
  allNodes,
  onSearch,
  onSelect,
  onToggleSelection,
  onClearSelection,
  onDelete,
  onRequestRange,
}: TablePanelProps) {
  const [draftMode, setDraftMode] = useState<SearchMode>(mode);
  const [draftQuery, setDraftQuery] = useState(query);
  const [draftAllNodes, setDraftAllNodes] = useState(allNodes);
  const [scrollTop, setScrollTop] = useState(0);
  const gridRef = useRef<HTMLDivElement>(null);
  const scrollBodyRef = useRef<HTMLDivElement>(null);
  const pendingScrollTopRef = useRef(0);
  const scrollFrameRef = useRef<number | null>(null);

  useEffect(() => {
    setDraftMode(mode);
    setDraftQuery(query);
    setDraftAllNodes(allNodes);
  }, [mode, query, allNodes]);

  useEffect(() => {
    if (scrollBodyRef.current) scrollBodyRef.current.scrollTop = 0;
    pendingScrollTopRef.current = 0;
    setScrollTop(0);
  }, [datasetRevision]);

  useEffect(
    () => () => {
      if (scrollFrameRef.current !== null) window.cancelAnimationFrame(scrollFrameRef.current);
    },
    [],
  );

  const visibleRange = useMemo(() => {
    const firstVisibleIndex = Math.floor(scrollTop / TABLE_ROW_HEIGHT);
    const startIndex = Math.max(0, firstVisibleIndex - TABLE_OVERSCAN);
    const endIndex = Math.min(
      total,
      Math.ceil((scrollTop + TABLE_VIEWPORT_HEIGHT) / TABLE_ROW_HEIGHT) + TABLE_OVERSCAN,
    );
    return { startIndex, endIndex };
  }, [scrollTop, total]);

  const visibleRows = useMemo(
    () => Array.from(
      { length: Math.max(0, visibleRange.endIndex - visibleRange.startIndex) },
      (_, offset) => {
        const index = visibleRange.startIndex + offset;
        return { table: tables[index], index };
      },
    ),
    [tables, visibleRange],
  );

  useEffect(() => {
    if (visibleRange.endIndex > visibleRange.startIndex) {
      onRequestRange(visibleRange.startIndex, visibleRange.endIndex);
    }
  }, [onRequestRange, visibleRange]);

  const handleTableScroll = (nextScrollTop: number) => {
    pendingScrollTopRef.current = nextScrollTop;
    if (scrollFrameRef.current !== null) return;
    scrollFrameRef.current = window.requestAnimationFrame(() => {
      scrollFrameRef.current = null;
      setScrollTop(pendingScrollTopRef.current);
    });
  };

  const submitSearch = () => onSearch(draftMode, draftQuery, draftAllNodes);
  const tableHighlightQuery = mode === "table" ? query.trim() : "";
  const selectedTables = useMemo(
    () => tables.filter((table): table is TableSummary => Boolean(table && selectedTableIds.has(table.id))),
    [selectedTableIds, tables],
  );

  useGridScrollbarGutter(gridRef, scrollBodyRef);

  return (
    <section className="table-panel panel-shell">
      <header className="panel-header table-panel-header">
        <div className="section-title">
          <span className="section-index">01</span>
          <span>
            <strong>数据表</strong>
            <small>在当前节点浏览，选择一行查看字段字典</small>
          </span>
        </div>
        {selectedTableIds.size > 0 ? (
          <div className="table-bulk-controls" aria-live="polite">
            <span>已选择 <b>{selectedTableIds.size}</b> 张表</span>
            <Button type="text" disabled={deleting} onClick={onClearSelection}>取消选择</Button>
            <Button
              danger
              icon={<DeleteOutlined />}
              loading={deleting}
              disabled={selectedTables.length !== selectedTableIds.size}
              onClick={() => onDelete(selectedTables)}
            >
              批量删除
            </Button>
          </div>
        ) : (
          <div className="table-search-controls">
            <Segmented
              size="small"
              value={draftMode}
              options={[
                { label: "搜表", value: "table" },
                { label: "搜字段", value: "field" },
              ]}
              onChange={(value) => setDraftMode(value as SearchMode)}
            />
            <Input
              allowClear
              prefix={(
                <button
                  type="button"
                  className="input-search-trigger"
                  aria-label="搜索数据表"
                  title="搜索"
                  disabled={loading}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={submitSearch}
                >
                  <SearchOutlined />
                </button>
              )}
              value={draftQuery}
              placeholder={draftMode === "table" ? "输入表名、描述或注释" : "输入字段名、描述或备注"}
              onChange={(event) => setDraftQuery(event.target.value)}
              onPressEnter={submitSearch}
            />
            <Checkbox checked={draftAllNodes} onChange={(event) => setDraftAllNodes(event.target.checked)}>
              所有节点
            </Checkbox>
          </div>
        )}
      </header>
      <div ref={gridRef} className="data-grid table-list-grid">
        <div className="data-grid-head table-list-row">
          <span className="table-selection-cell">选择</span>
          <div className="table-grid-columns table-grid-core">
            <span>序号</span>
            <span>表名</span>
            <span>表描述</span>
            <span>项目名称</span>
            <span>PDM 文件路径</span>
            <span>字段数</span>
          </div>
          <span className="table-action-cell">操作</span>
        </div>
        <div
          ref={scrollBodyRef}
          className="table-grid-body"
          data-testid="table-scroll-body"
          onScroll={(event) => handleTableScroll(event.currentTarget.scrollTop)}
        >
          {loading && (
            <div className="grid-loading">
              <Spin size="small" /> 正在读取索引…
            </div>
          )}
          {!loading && total === 0 && (
            <div className="grid-empty">
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={query ? "没有匹配的数据表" : "当前范围暂无数据表"}
              />
            </div>
          )}
          {total > 0 && (
            <div
              className="table-virtual-space"
              style={{ height: total * TABLE_ROW_HEIGHT }}
            >
              {visibleRows.map(({ table, index }) => table ? (
                  <div
                    className={`data-grid-row table-list-row ${selectedTableId === table.id ? "is-selected" : ""}${selectedTableIds.has(table.id) ? " is-marked" : ""}`}
                    key={table.id}
                    style={{ top: index * TABLE_ROW_HEIGHT }}
                    role="row"
                    aria-posinset={index + 1}
                    aria-setsize={total}
                  >
                    <span className="table-selection-cell">
                      <Checkbox
                        aria-label={`选择数据表 ${table.code || table.name}`}
                        checked={selectedTableIds.has(table.id)}
                        disabled={deleting}
                        onChange={(event) => onToggleSelection(table, event.target.checked)}
                      />
                    </span>
                    <button
                      type="button"
                      className="table-row-open table-grid-columns table-grid-core"
                      onClick={() => onSelect(table)}
                    >
                      <span className="grid-index">{String(index + 1).padStart(2, "0")}</span>
                      <span className="code-cell" title={table.code}>
                        <HighlightedText text={table.code || "—"} query={tableHighlightQuery} />
                      </span>
                      <span title={table.name || table.comment}>
                        <HighlightedText
                          text={table.name || table.comment || "—"}
                          query={tableHighlightQuery}
                        />
                      </span>
                      <span title={table.project_name}>{table.project_name}</span>
                      <span className="path-cell" title={table.relative_path}>{table.relative_path}</span>
                      <span className="number-cell">{table.field_count}</span>
                    </button>
                    <span className="table-action-cell">
                      <Tooltip title={`删除数据表 ${table.code || table.name}`}>
                        <Button
                          type="text"
                          danger
                          size="small"
                          icon={<DeleteOutlined />}
                          aria-label={`删除数据表 ${table.code || table.name}`}
                          disabled={deleting}
                          onClick={() => onDelete([table])}
                        />
                      </Tooltip>
                    </span>
                  </div>
                ) : (
                  <div
                    className="data-grid-row table-list-row is-page-loading"
                    key={`loading-${index}`}
                    style={{ top: index * TABLE_ROW_HEIGHT }}
                    aria-busy="true"
                  >
                    <span className="table-selection-cell" />
                    <div className="table-grid-columns table-grid-core">
                      <span className="grid-index">{String(index + 1).padStart(2, "0")}</span>
                      <span>正在加载…</span>
                      <span />
                      <span />
                      <span />
                      <span />
                    </div>
                    <span className="table-action-cell" />
                  </div>
                ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
