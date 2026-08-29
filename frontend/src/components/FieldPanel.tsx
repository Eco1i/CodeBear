import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import {
  CheckOutlined,
  CloseOutlined,
  DeleteOutlined,
  EditOutlined,
  InfoCircleOutlined,
  PlusOutlined,
  SearchOutlined,
} from "@ant-design/icons";
import { Button, Checkbox, Drawer, Empty, Input, Spin, Table, Tag, Tooltip } from "antd";
import type { InputRef } from "antd";
import type { ColumnsType } from "antd/es/table";
import type { FieldDefinition, TableDetail, TableMetadataUpdate, TableTab } from "../types";
import { dictionariesApi } from "../features/dictionaries/api";
import { TableTabs } from "../features/tables/components/TableTabs";
import type { DictionaryFieldBinding, DictionaryItem } from "../features/dictionaries/types";
import { useGridScrollbarGutter } from "../useGridScrollbarGutter";
import { FullTextPopover } from "./FullTextPopover";
import { HighlightedText } from "./HighlightedText";
import { TableGlyph } from "./PrototypeGlyphs";

export interface FieldPanelHandle {
  save: () => Promise<boolean>;
  discard: () => void;
}

interface FieldPanelProps {
  detail: TableDetail | null;
  loading: boolean;
  saving: boolean;
  highlightQuery: string;
  onSave: (table: TableMetadataUpdate, fields: FieldDefinition[]) => Promise<void>;
  onDirtyChange: (dirty: boolean) => void;
  onTabDirtyChange?: (tableId: string, dirty: boolean) => void;
  tabs?: TableTab[];
  activeTableId?: string | null;
  dirtyTableIds?: ReadonlySet<string>;
  onSelectTab?: (tableId: string) => void;
  onCloseTab?: (tableId: string) => void;
  onCloseOtherTabs?: (tableId: string) => void;
  onCloseTabsToLeft?: (tableId: string) => void;
  onCloseTabsToRight?: (tableId: string) => void;
  bindingRevision?: number;
  onOpenRelations?: () => void;
}

interface CachedDraft {
  editing: boolean;
  draft: FieldDefinition[];
  draftTable: TableMetadataUpdate;
}

const cloneFields = (fields: FieldDefinition[]): FieldDefinition[] => fields.map((field) => ({ ...field }));
let draftFieldSequence = 0;
const nextDraftFieldId = () => {
  draftFieldSequence += 1;
  return `draft-${Date.now()}-${draftFieldSequence}`;
};
const renumberFields = (fields: FieldDefinition[]): FieldDefinition[] =>
  fields.map((field, index) => ({ ...field, ordinal: index + 1 }));
const tableMetadata = (detail?: TableDetail | null): TableMetadataUpdate => ({
  name: detail?.name || "",
  code: detail?.code || "",
  comment: detail?.comment || "",
});
const EDITABLE_FIELD_KEYS = [
  "name",
  "code",
  "data_type",
  "length",
  "nullable",
  "default_value",
  "comment",
] as const;

function hasFieldChanges(original: FieldDefinition[], draft: FieldDefinition[]): boolean {
  if (original.length !== draft.length) return true;
  const originalById = new Map(original.map((field) => [field.id, field]));
  return draft.some((field) => {
    const baseline = originalById.get(field.id);
    return !baseline || EDITABLE_FIELD_KEYS.some((key) => baseline[key] !== field[key]);
  });
}

function hasTableChanges(original: TableDetail | null, draft: TableMetadataUpdate): boolean {
  return (
    (original?.name || "") !== draft.name ||
    (original?.code || "") !== draft.code ||
    (original?.comment || "") !== draft.comment
  );
}

function matchesField(field: FieldDefinition, query: string): boolean {
  if (!query) return true;
  const haystack = [
    field.code,
    field.name,
    field.data_type,
    field.length,
    field.default_value,
    field.comment,
  ]
    .join("\n")
    .toLocaleLowerCase();
  return haystack.includes(query.toLocaleLowerCase());
}

export const FieldPanel = forwardRef<FieldPanelHandle, FieldPanelProps>(function FieldPanel({
  detail,
  loading,
  saving,
  highlightQuery,
  onSave,
  onDirtyChange,
  onTabDirtyChange,
  tabs = [],
  activeTableId = null,
  dirtyTableIds = new Set(),
  onSelectTab = () => {},
  onCloseTab = () => {},
  onCloseOtherTabs = () => {},
  onCloseTabsToLeft = () => {},
  onCloseTabsToRight = () => {},
  bindingRevision = 0,
  onOpenRelations,
}: FieldPanelProps, ref) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<FieldDefinition[]>([]);
  const [draftTable, setDraftTable] = useState<TableMetadataUpdate>(tableMetadata());
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [draftQuery, setDraftQuery] = useState("");
  const [bindings, setBindings] = useState<Map<string, DictionaryFieldBinding>>(new Map());
  const [drawerBinding, setDrawerBinding] = useState<DictionaryFieldBinding | null>(null);
  const [drawerItems, setDrawerItems] = useState<DictionaryItem[]>([]);
  const [drawerQuery, setDrawerQuery] = useState("");
  const [drawerDraftQuery, setDrawerDraftQuery] = useState("");
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [syncedDetailId, setSyncedDetailId] = useState<string | null>(detail?.id || null);
  const draftCacheRef = useRef<Map<string, CachedDraft>>(new Map());
  const previousDetailIdRef = useRef<string | null>(detail?.id || null);
  const searchRef = useRef<InputRef>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const scrollBodyRef = useRef<HTMLDivElement>(null);
  const gutterHighlightRef = useRef<HTMLSpanElement>(null);
  const pointerPositionRef = useRef<{ x: number; y: number } | null>(null);

  useGridScrollbarGutter(gridRef, scrollBodyRef);

  const hideGutterHighlight = () => {
    if (gutterHighlightRef.current) gutterHighlightRef.current.hidden = true;
  };

  const syncGutterHighlight = (target: EventTarget | null) => {
    const grid = gridRef.current;
    const body = scrollBodyRef.current;
    const highlight = gutterHighlightRef.current;
    const row = target instanceof Element
      ? target.closest<HTMLElement>(".data-grid-row")
      : null;
    if (!grid || !body || !highlight || !row || !body.contains(row)) {
      hideGutterHighlight();
      return;
    }

    const gridRect = grid.getBoundingClientRect();
    const bodyRect = body.getBoundingClientRect();
    const rowRect = row.getBoundingClientRect();
    const visibleTop = Math.max(rowRect.top, bodyRect.top);
    const visibleBottom = Math.min(rowRect.bottom, bodyRect.bottom);
    if (visibleBottom <= visibleTop) {
      hideGutterHighlight();
      return;
    }

    highlight.hidden = false;
    highlight.style.top = `${Math.round(visibleTop - gridRect.top)}px`;
    highlight.style.height = `${Math.round(visibleBottom - visibleTop)}px`;
    highlight.style.backgroundColor = window.getComputedStyle(row).backgroundColor;
  };

  const handleFieldPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    pointerPositionRef.current = { x: event.clientX, y: event.clientY };
    syncGutterHighlight(event.target);
  };

  const handleFieldScroll = () => {
    const pointer = pointerPositionRef.current;
    syncGutterHighlight(pointer
      ? document.elementFromPoint(pointer.x, pointer.y)
      : null);
  };

  const handleFieldPointerLeave = () => {
    pointerPositionRef.current = null;
    hideGutterHighlight();
  };

  useEffect(() => {
    const previousDetailId = previousDetailIdRef.current;
    if (previousDetailId && previousDetailId !== detail?.id && editing) {
      draftCacheRef.current.set(previousDetailId, {
        editing: true,
        draft: cloneFields(draft),
        draftTable: { ...draftTable },
      });
    }

    previousDetailIdRef.current = detail?.id || null;
    setSyncedDetailId(detail?.id || null);
    const cached = detail?.id ? draftCacheRef.current.get(detail.id) : undefined;
    setEditing(cached?.editing || false);
    setDraft(cloneFields(cached?.draft || detail?.fields || []));
    setDraftTable(cached ? { ...cached.draftTable } : tableMetadata(detail));
    setSearchOpen(false);
    setQuery("");
    setDraftQuery("");
    hideGutterHighlight();
  }, [detail?.id]);

  useEffect(() => {
    let active = true;
    if (!detail?.id) {
      setBindings(new Map());
      return () => { active = false; };
    }
    void dictionariesApi.bindingsForTable(detail.id).then((result) => {
      if (active) setBindings(new Map(result.map((binding) => [binding.field_id, binding])));
    }).catch(() => {
      if (active) setBindings(new Map());
    });
    return () => { active = false; };
  }, [bindingRevision, detail?.id]);

  const openDictionaryDrawer = async (binding: DictionaryFieldBinding) => {
    setDrawerBinding(binding);
    setDrawerQuery("");
    setDrawerDraftQuery("");
    setDrawerLoading(true);
    try {
      const result = await dictionariesApi.items(binding.dictionary_id);
      setDrawerItems(result.items);
    } catch {
      setDrawerItems([]);
    } finally {
      setDrawerLoading(false);
    }
  };

  const visibleDrawerItems = useMemo(() => {
    const cleaned = drawerQuery.trim().toLocaleLowerCase();
    if (!cleaned) return drawerItems;
    return drawerItems.filter((item) => `${item.code}\n${item.name}\n${item.description}`.toLocaleLowerCase().includes(cleaned));
  }, [drawerItems, drawerQuery]);

  const drawerColumns: ColumnsType<DictionaryItem> = [
    { title: "字典值", dataIndex: "code", width: 160, render: (value) => <code>{value}</code> },
    { title: "字典值名称", dataIndex: "name", ellipsis: true },
  ];

  useEffect(() => {
    const handleKeydown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest(".ant-modal")) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase() === "f" && detail) {
        event.preventDefault();
        setSearchOpen(true);
        window.setTimeout(() => searchRef.current?.focus(), 0);
      } else if (event.key === "Escape" && searchOpen) {
        event.preventDefault();
        setSearchOpen(false);
        setQuery("");
        setDraftQuery("");
      }
    };
    window.addEventListener("keydown", handleKeydown, true);
    return () => window.removeEventListener("keydown", handleKeydown, true);
  }, [detail, searchOpen]);

  const sourceFields = editing ? draft : detail?.fields || [];
  const dirty = useMemo(
    () =>
      editing &&
      (hasTableChanges(detail, draftTable) || hasFieldChanges(detail?.fields || [], draft)),
    [detail, draft, draftTable, editing],
  );
  const visibleFields = useMemo(
    () => sourceFields.filter((field) => matchesField(field, query.trim())),
    [sourceFields, query],
  );
  const activeHighlightQuery = query.trim() || highlightQuery.trim();
  const draftValidation = useMemo(() => {
    if (!editing) return "";
    const codes = new Set<string>();
    for (const [index, field] of draft.entries()) {
      const code = field.code.trim();
      if (!code) return `第 ${index + 1} 行字段英文名不能为空`;
      if (!field.data_type.trim()) return `第 ${index + 1} 行数据类型不能为空`;
      const normalized = code.toLocaleLowerCase();
      if (codes.has(normalized)) return `字段英文名重复：${code}`;
      codes.add(normalized);
    }
    return "";
  }, [draft, editing]);

  useEffect(() => {
    const currentDetailId = detail?.id || null;
    if (currentDetailId !== syncedDetailId) return;
    onDirtyChange(dirty);
    if (currentDetailId) onTabDirtyChange?.(currentDetailId, dirty);
  }, [detail?.id, dirty, onDirtyChange, onTabDirtyChange, syncedDetailId]);

  useEffect(
    () => () => {
      onDirtyChange(false);
    },
    [onDirtyChange],
  );

  const submitFieldSearch = () => setQuery(draftQuery.trim());
  const submitDrawerSearch = () => setDrawerQuery(drawerDraftQuery.trim());

  const updateField = <K extends keyof FieldDefinition>(id: string, key: K, value: FieldDefinition[K]) => {
    setDraft((current) => current.map((field) => (field.id === id ? { ...field, [key]: value } : field)));
  };

  const addField = () => {
    if (!detail) return;
    setQuery("");
    setDraftQuery("");
    setDraft((current) => [
      ...current,
      {
        id: nextDraftFieldId(),
        is_new: true,
        table_id: detail.id,
        xml_id: "",
        ordinal: current.length + 1,
        name: "",
        code: "",
        data_type: "",
        length: "",
        nullable: true,
        default_value: "",
        comment: "",
        is_primary_key: false,
      },
    ]);
    window.requestAnimationFrame(() => {
      const body = scrollBodyRef.current;
      if (body) body.scrollTop = body.scrollHeight;
    });
  };

  const removeField = (id: string) => {
    setDraft((current) => renumberFields(current.filter((field) => field.id !== id)));
  };

  const startEditing = () => {
    setDraft(cloneFields(detail?.fields || []));
    setDraftTable(tableMetadata(detail));
    setEditing(true);
  };

  const cancelEditing = () => {
    if (detail?.id) draftCacheRef.current.delete(detail.id);
    setDraft(cloneFields(detail?.fields || []));
    setDraftTable(tableMetadata(detail));
    setEditing(false);
  };

  const save = async (): Promise<boolean> => {
    if (!detail || draftValidation) return false;
    await onSave(draftTable, draft);
    if (detail.id) draftCacheRef.current.delete(detail.id);
    setDraft(cloneFields(draft));
    setDraftTable({ ...draftTable });
    setEditing(false);
    return true;
  };

  useImperativeHandle(ref, () => ({
    save,
    discard: cancelEditing,
  }), [cancelEditing, save]);

  return (
    <section className="field-panel panel-shell">
      {tabs.length > 0 && (
        <TableTabs
          tabs={tabs}
          activeTableId={activeTableId}
          dirtyTableIds={dirtyTableIds}
          onSelect={onSelectTab}
          onClose={onCloseTab}
          onCloseOthers={onCloseOtherTabs}
          onCloseToLeft={onCloseTabsToLeft}
          onCloseToRight={onCloseTabsToRight}
        />
      )}
      <header className="field-panel-header">
        <div className="section-title field-title">
          <span className="section-index">02</span>
          {detail ? (
            <span className={`table-identity${editing ? " is-editing" : ""}`}>
              <span className="table-icon"><TableGlyph /></span>
              {editing ? (
                <span className="table-meta-editor">
                  <Input
                    aria-label="表名称"
                    prefix={<span className="table-meta-label">名称</span>}
                    placeholder="表名称"
                    value={draftTable.name}
                    onChange={(event) => setDraftTable((current) => ({ ...current, name: event.target.value }))}
                  />
                  <Input
                    aria-label="表代码"
                    prefix={<span className="table-meta-label">代码</span>}
                    placeholder="表代码"
                    value={draftTable.code}
                    onChange={(event) => setDraftTable((current) => ({ ...current, code: event.target.value }))}
                  />
                  <Input
                    aria-label="表描述"
                    prefix={<span className="table-meta-label">描述</span>}
                    placeholder="表描述"
                    value={draftTable.comment}
                    onChange={(event) => setDraftTable((current) => ({ ...current, comment: event.target.value }))}
                  />
                </span>
              ) : (
                <span className="table-heading">
                  <strong>{detail.name || detail.code}</strong>
                  <small>
                    <code
                      className={onOpenRelations ? "rel-open-code" : undefined}
                      title={onOpenRelations ? "点击查看表关系" : undefined}
                      role={onOpenRelations ? "button" : undefined}
                      tabIndex={onOpenRelations ? 0 : undefined}
                      onClick={onOpenRelations}
                      onKeyDown={(event) => {
                        if (onOpenRelations && (event.key === "Enter" || event.key === " ")) {
                          event.preventDefault();
                          onOpenRelations();
                        }
                      }}
                    >
                      {detail.code}
                    </code>
                    {detail.comment && <i>·</i>}
                    {detail.comment && (
                      <FullTextPopover title="表说明" text={detail.comment}>
                        <button
                          type="button"
                          className="table-comment-trigger"
                          aria-label="查看完整表说明"
                          title="点击查看完整表说明"
                        >
                          <InfoCircleOutlined />
                          <span>{detail.comment}</span>
                        </button>
                      </FullTextPopover>
                    )}
                  </small>
                </span>
              )}
            </span>
          ) : (
            <span><strong>字段字典</strong><small>选择一张数据表后查看明细</small></span>
          )}
        </div>
        {detail && (
          <div className="field-actions">
            {searchOpen ? (
              <div className="field-search-box">
                <Input
                  ref={searchRef}
                  allowClear
                  prefix={(
                    <button
                      type="button"
                      className="input-search-trigger"
                      aria-label="搜索当前表字段"
                      title="搜索"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={submitFieldSearch}
                    >
                      <SearchOutlined />
                    </button>
                  )}
                  placeholder="搜索当前表字段"
                  value={draftQuery}
                  onChange={(event) => setDraftQuery(event.target.value)}
                  onPressEnter={submitFieldSearch}
                  suffix={<span className="hit-count">{visibleFields.length}/{sourceFields.length}</span>}
                />
                <Tooltip title="关闭（Esc）">
                  <Button
                    type="text"
                    icon={<CloseOutlined />}
                    onClick={() => {
                      setSearchOpen(false);
                      setQuery("");
                      setDraftQuery("");
                    }}
                  />
                </Tooltip>
              </div>
            ) : (
              <Button
                icon={<SearchOutlined />}
                onClick={() => {
                  setSearchOpen(true);
                  window.setTimeout(() => searchRef.current?.focus(), 0);
                }}
              >
                搜索字段 <kbd>Ctrl F</kbd>
              </Button>
            )}
            {editing ? (
              <>
                {draftValidation && (
                  <span className="field-edit-error" role="alert" title={draftValidation}>
                    {draftValidation}
                  </span>
                )}
                <Button icon={<PlusOutlined />} disabled={saving} onClick={addField}>新增字段</Button>
                <Button icon={<CloseOutlined />} disabled={saving} onClick={cancelEditing}>取消</Button>
                <Button
                  type="primary"
                  icon={<CheckOutlined />}
                  loading={saving}
                  disabled={!dirty || Boolean(draftValidation)}
                  onClick={save}
                >
                  保存修改
                </Button>
              </>
            ) : (
              <Button icon={<EditOutlined />} onClick={startEditing}>编辑字典</Button>
            )}
          </div>
        )}
      </header>
      <div ref={gridRef} className="field-grid data-grid">
        <span
          ref={gutterHighlightRef}
          className="field-grid-gutter-highlight"
          aria-hidden="true"
          hidden
        />
        <div className="data-grid-head field-grid-columns">
          <span>#</span>
          <span>主键</span>
          <span>字段英文名</span>
          <span>字段描述</span>
          <span>数据类型</span>
          <span>长度</span>
          <span>可空</span>
          <span>缺省值</span>
          <span>字段备注</span>
          <span>操作</span>
        </div>
        <div
          ref={scrollBodyRef}
          className="field-grid-body"
          data-testid="field-scroll-body"
          onPointerMove={handleFieldPointerMove}
          onPointerLeave={handleFieldPointerLeave}
          onScroll={handleFieldScroll}
        >
          {loading && (
            <div className="grid-loading"><Spin size="small" /> 正在读取字段字典…</div>
          )}
          {!loading && !detail && (
            <div className="field-placeholder">
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="请先在上方选择一张数据表" />
            </div>
          )}
          {!loading && detail && visibleFields.length === 0 && (
            <div className="field-placeholder">
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={editing && !query.trim() ? "当前表暂无字段，可点击“新增字段”" : "当前表中没有匹配字段"}
              />
            </div>
          )}
          {!loading &&
            visibleFields.map((field) => (
              <div className={`data-grid-row field-grid-columns${field.is_new ? " is-new-field" : ""}`} key={field.id}>
                <span className="grid-index">{String(field.ordinal).padStart(2, "0")}</span>
                <span>
                  {field.is_primary_key ? <b className="pk-badge">PK</b> : null}
                </span>
                <span>
                  {editing ? (
                    <Input
                      aria-label={`第 ${field.ordinal} 行字段英文名`}
                      value={field.code}
                      onChange={(event) => updateField(field.id, "code", event.target.value)}
                    />
                  ) : (
                    bindings.has(field.id) ? (
                      <button
                        type="button"
                        className="field-dictionary-trigger"
                        title={`查看“${bindings.get(field.id)?.dictionary_name}”字典`}
                        onClick={() => void openDictionaryDrawer(bindings.get(field.id)!)}
                      >
                        <HighlightedText text={field.code || ""} query={activeHighlightQuery} />
                      </button>
                    ) : (
                      <code title={field.code}>
                        <HighlightedText text={field.code || ""} query={activeHighlightQuery} />
                      </code>
                    )
                  )}
                </span>
                <span>
                  {editing ? (
                    <Input
                      aria-label={`第 ${field.ordinal} 行字段描述`}
                      value={field.name}
                      onChange={(event) => updateField(field.id, "name", event.target.value)}
                    />
                  ) : (
                    <span title={field.name}>
                      <HighlightedText text={field.name || ""} query={activeHighlightQuery} />
                    </span>
                  )}
                </span>
                <span>
                  {editing ? (
                    <Input
                      aria-label={`第 ${field.ordinal} 行数据类型`}
                      value={field.data_type}
                      onChange={(event) => updateField(field.id, "data_type", event.target.value)}
                    />
                  ) : (
                    <code>{field.data_type || ""}</code>
                  )}
                </span>
                <span>
                  {editing ? (
                    <Input
                      aria-label={`第 ${field.ordinal} 行长度`}
                      value={field.length}
                      onChange={(event) => updateField(field.id, "length", event.target.value)}
                    />
                  ) : (
                    field.length || null
                  )}
                </span>
                <span>
                  <Checkbox
                    aria-label={`第 ${field.ordinal} 行可空`}
                    checked={field.nullable}
                    disabled={!editing}
                    onChange={(event) => updateField(field.id, "nullable", event.target.checked)}
                  />
                </span>
                <span>
                  {editing ? (
                    <Input
                      aria-label={`第 ${field.ordinal} 行缺省值`}
                      value={field.default_value}
                      onChange={(event) => updateField(field.id, "default_value", event.target.value)}
                    />
                  ) : (
                    field.default_value ? <span title={field.default_value}>{field.default_value}</span> : null
                  )}
                </span>
                <span>
                  {editing ? (
                    <Input
                      aria-label={`第 ${field.ordinal} 行字段备注`}
                      value={field.comment}
                      onChange={(event) => updateField(field.id, "comment", event.target.value)}
                    />
                  ) : field.comment ? (
                    <FullTextPopover title={`${field.code || "字段"} · 字段备注`} text={field.comment}>
                      <button
                        type="button"
                        className="field-comment-trigger"
                        aria-label={`查看 ${field.code || "字段"} 的完整备注`}
                        title="点击查看完整字段备注"
                      >
                        <HighlightedText text={field.comment} query={activeHighlightQuery} />
                      </button>
                    </FullTextPopover>
                  ) : (
                    null
                  )}
                </span>
                <span className="field-row-action">
                  {editing ? (
                    <Tooltip
                      title={
                        field.is_primary_key
                          ? "主键字段不能直接删除"
                          : bindings.has(field.id)
                            ? "请先在字典中心解除字段绑定"
                            : "删除字段（保存前可取消）"
                      }
                    >
                      <span>
                        <Button
                          type="text"
                          danger
                          size="small"
                          icon={<DeleteOutlined />}
                          aria-label={`删除字段 ${field.code || `第 ${field.ordinal} 行`}`}
                          disabled={field.is_primary_key || bindings.has(field.id)}
                          onClick={() => removeField(field.id)}
                        />
                      </span>
                    </Tooltip>
                  ) : (
                    null
                  )}
                </span>
              </div>
            ))}
        </div>
      </div>
      <Drawer
        open={Boolean(drawerBinding)}
        width={520}
        className="field-dictionary-drawer"
        title={(
          <span className="field-dictionary-drawer-title">
            <span><strong>{drawerBinding?.dictionary_name}</strong><small>字段字典值查询</small></span>
            <Tag color="green">{drawerBinding?.item_count || 0} 条</Tag>
          </span>
        )}
        onClose={() => setDrawerBinding(null)}
      >
        <Input
          allowClear
          prefix={(
            <button
              type="button"
              className="input-search-trigger"
              aria-label="搜索字典值或名称"
              title="搜索"
              onMouseDown={(event) => event.preventDefault()}
              onClick={submitDrawerSearch}
            >
              <SearchOutlined />
            </button>
          )}
          placeholder="搜索字典值或名称"
          value={drawerDraftQuery}
          onChange={(event) => setDrawerDraftQuery(event.target.value)}
          onPressEnter={submitDrawerSearch}
          onClear={() => {
            setDrawerDraftQuery("");
            setDrawerQuery("");
          }}
        />
        <div className="field-dictionary-drawer-table">
          <Table
            rowKey={(item) => item.id || item.code}
            size="small"
            loading={drawerLoading}
            pagination={{ pageSize: 100, showSizeChanger: false }}
            columns={drawerColumns}
            dataSource={visibleDrawerItems}
            scroll={{ y: "calc(100vh - 230px)" }}
          />
        </div>
      </Drawer>
    </section>
  );
});
