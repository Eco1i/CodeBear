import { useEffect, useMemo, useRef, useState } from "react";
import {
  DeleteOutlined,
  SearchOutlined,
  SettingOutlined,
} from "@ant-design/icons";
import {
  Button,
  Checkbox,
  Empty,
  Input,
  Popconfirm,
  Popover,
  Segmented,
  Spin,
  Switch,
  Tooltip,
} from "antd";
import type { SearchMode, TableSummary } from "../types";
import { useI18n } from "../features/preferences/PreferencesProvider";
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
  smartRankingEnabled?: boolean;
  hasSearchMemory?: boolean;
  preferredTableIds?: ReadonlySet<string>;
  onSmartRankingChange?: (enabled: boolean) => void;
  onClearSearchMemory?: () => void;
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
  smartRankingEnabled = true,
  hasSearchMemory = false,
  preferredTableIds = new Set(),
  onSmartRankingChange = () => {},
  onClearSearchMemory = () => {},
}: TablePanelProps) {
  const { t } = useI18n();
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
      if (scrollFrameRef.current !== null)
        window.cancelAnimationFrame(scrollFrameRef.current);
    },
    [],
  );

  const visibleRange = useMemo(() => {
    const firstVisibleIndex = Math.floor(scrollTop / TABLE_ROW_HEIGHT);
    const startIndex = Math.max(0, firstVisibleIndex - TABLE_OVERSCAN);
    const endIndex = Math.min(
      total,
      Math.ceil((scrollTop + TABLE_VIEWPORT_HEIGHT) / TABLE_ROW_HEIGHT) +
        TABLE_OVERSCAN,
    );
    return { startIndex, endIndex };
  }, [scrollTop, total]);

  const visibleRows = useMemo(
    () =>
      Array.from(
        {
          length: Math.max(0, visibleRange.endIndex - visibleRange.startIndex),
        },
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
  const searchSettings = (
    <div className="table-search-settings">
      <div className="table-search-settings-title">
        {t("table.searchPreferences")}
      </div>
      <div className="table-search-setting-block">
        <div className="table-search-setting-row">
          <strong>{t("table.smartRanking")}</strong>
          <Switch
            size="small"
            checked={smartRankingEnabled}
            onChange={onSmartRankingChange}
            aria-label={t("table.enableSmartRanking")}
          />
        </div>
        <small>{t("table.smartRankingHint")}</small>
      </div>
      <div className="table-search-setting-row table-search-memory-row">
        <strong>{t("table.searchMemory")}</strong>
        <Popconfirm
          title={t("table.clearSearchMemoryConfirm")}
          okText={t("table.confirmClear")}
          cancelText={t("common.cancel")}
          placement="left"
          arrow={{ pointAtCenter: true }}
          classNames={{ root: "table-search-clear-popconfirm" }}
          onConfirm={onClearSearchMemory}
        >
          <Button
            danger
            size="small"
            className="table-search-clear-button"
            icon={<DeleteOutlined />}
            disabled={!hasSearchMemory}
          >
            {t("table.clearSearchMemory")}
          </Button>
        </Popconfirm>
      </div>
    </div>
  );
  const selectedTables = useMemo(
    () =>
      tables.filter((table): table is TableSummary =>
        Boolean(table && selectedTableIds.has(table.id)),
      ),
    [selectedTableIds, tables],
  );

  useGridScrollbarGutter(gridRef, scrollBodyRef);

  return (
    <section className="table-panel panel-shell">
      <header className="panel-header table-panel-header">
        <div className="section-title">
          <span className="section-index">01</span>
          <span>
            <strong>{t("table.title")}</strong>
            <small>{t("table.subtitle")}</small>
          </span>
        </div>
        {selectedTableIds.size > 0 ? (
          <div className="table-bulk-controls" aria-live="polite">
            <span>{t("table.selected", { count: selectedTableIds.size })}</span>
            <Button type="text" disabled={deleting} onClick={onClearSelection}>
              {t("table.clearSelection")}
            </Button>
            <Button
              danger
              icon={<DeleteOutlined />}
              loading={deleting}
              disabled={selectedTables.length !== selectedTableIds.size}
              onClick={() => onDelete(selectedTables)}
            >
              {t("table.batchDelete")}
            </Button>
          </div>
        ) : (
          <div className="table-search-controls">
            <Segmented
              size="small"
              value={draftMode}
              options={[
                { label: t("table.searchTable"), value: "table" },
                { label: t("table.searchField"), value: "field" },
              ]}
              onChange={(value) => setDraftMode(value as SearchMode)}
            />
            <Input
              allowClear
              prefix={
                <button
                  type="button"
                  className="input-search-trigger"
                  aria-label={t("common.search")}
                  title={t("common.search")}
                  disabled={loading}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={submitSearch}
                >
                  <SearchOutlined />
                </button>
              }
              value={draftQuery}
              placeholder={
                draftMode === "table"
                  ? t("table.searchTablePlaceholder")
                  : t("table.searchFieldPlaceholder")
              }
              onChange={(event) => setDraftQuery(event.target.value)}
              onPressEnter={submitSearch}
            />
            <Checkbox
              checked={draftAllNodes}
              onChange={(event) => setDraftAllNodes(event.target.checked)}
            >
              {t("table.allNodes")}
            </Checkbox>
            <Popover
              content={searchSettings}
              trigger="click"
              placement="bottomRight"
              arrow={{ pointAtCenter: true }}
              styles={{ container: { padding: 0 } }}
              classNames={{ root: "table-search-settings-popover" }}
            >
              <Button
                type="text"
                size="small"
                icon={<SettingOutlined />}
                aria-label={t("table.searchSettings")}
                title={t("table.searchSettings")}
                className="table-search-settings-trigger"
              />
            </Popover>
          </div>
        )}
      </header>
      <div ref={gridRef} className="data-grid table-list-grid">
        <div className="data-grid-head table-list-row">
          <span className="table-selection-cell">{t("table.select")}</span>
          <div className="table-grid-columns table-grid-core">
            <span>{t("table.index")}</span>
            <span>{t("table.name")}</span>
            <span>{t("table.description")}</span>
            <span>{t("table.projectName")}</span>
            <span>{t("table.pdmPath")}</span>
            <span>{t("table.fieldCount")}</span>
          </div>
          <span className="table-action-cell">{t("common.actions")}</span>
        </div>
        <div
          ref={scrollBodyRef}
          className="table-grid-body"
          data-testid="table-scroll-body"
          onScroll={(event) => handleTableScroll(event.currentTarget.scrollTop)}
        >
          {loading && (
            <div className="grid-loading">
              <Spin size="small" /> {t("table.readingIndex")}
            </div>
          )}
          {!loading && total === 0 && (
            <div className="grid-empty">
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={query ? t("table.noMatch") : t("table.empty")}
              />
            </div>
          )}
          {total > 0 && (
            <div
              className="table-virtual-space"
              style={{ height: total * TABLE_ROW_HEIGHT }}
            >
              {visibleRows.map(({ table, index }) =>
                table ? (
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
                        aria-label={t("table.selectTable", {
                          name: table.code || table.name || t("table.unnamed"),
                        })}
                        checked={selectedTableIds.has(table.id)}
                        disabled={deleting}
                        onChange={(event) =>
                          onToggleSelection(table, event.target.checked)
                        }
                      />
                    </span>
                    <button
                      type="button"
                      className="table-row-open table-grid-columns table-grid-core"
                      onClick={() => onSelect(table)}
                    >
                      <span className="grid-index">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <span className="code-cell" title={table.code}>
                        <HighlightedText
                          text={table.code || "—"}
                          query={tableHighlightQuery}
                        />
                      </span>
                      <span
                        className="table-name-cell"
                        title={table.name || table.comment}
                      >
                        <span className="table-name-text">
                          <HighlightedText
                            text={table.name || table.comment || "—"}
                            query={tableHighlightQuery}
                          />
                        </span>
                        {preferredTableIds.has(table.id) ? (
                          <span className="recent-table-badge">
                            {t("table.recentlyOpened")}
                          </span>
                        ) : null}
                      </span>
                      <span title={table.project_name}>
                        {table.project_name}
                      </span>
                      <span className="path-cell" title={table.relative_path}>
                        {table.relative_path}
                      </span>
                      <span className="number-cell">{table.field_count}</span>
                    </button>
                    <span className="table-action-cell">
                      <Tooltip
                        title={t("table.deleteTable", {
                          name: table.code || table.name || t("table.unnamed"),
                        })}
                      >
                        <Button
                          type="text"
                          danger
                          size="small"
                          icon={<DeleteOutlined />}
                          aria-label={t("table.deleteTable", {
                            name:
                              table.code || table.name || t("table.unnamed"),
                          })}
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
                      <span className="grid-index">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <span>{t("table.loading")}</span>
                      <span />
                      <span />
                      <span />
                      <span />
                    </div>
                    <span className="table-action-cell" />
                  </div>
                ),
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
