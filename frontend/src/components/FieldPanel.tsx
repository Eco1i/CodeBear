import { useEffect, useMemo, useRef, useState } from "react";
import {
  CheckOutlined,
  CloseOutlined,
  EditOutlined,
  InfoCircleOutlined,
  SearchOutlined,
} from "@ant-design/icons";
import { Button, Checkbox, Empty, Input, Spin, Tooltip } from "antd";
import type { InputRef } from "antd";
import type { FieldDefinition, TableDetail } from "../types";
import { useGridScrollbarGutter } from "../useGridScrollbarGutter";
import { FullTextPopover } from "./FullTextPopover";
import { HighlightedText } from "./HighlightedText";
import { TableGlyph } from "./PrototypeGlyphs";

interface FieldPanelProps {
  detail: TableDetail | null;
  loading: boolean;
  saving: boolean;
  highlightQuery: string;
  onSave: (fields: FieldDefinition[]) => Promise<void>;
  onDirtyChange: (dirty: boolean) => void;
}

const cloneFields = (fields: FieldDefinition[]): FieldDefinition[] => fields.map((field) => ({ ...field }));
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

export function FieldPanel({
  detail,
  loading,
  saving,
  highlightQuery,
  onSave,
  onDirtyChange,
}: FieldPanelProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<FieldDefinition[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [draftQuery, setDraftQuery] = useState("");
  const searchRef = useRef<InputRef>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const scrollBodyRef = useRef<HTMLDivElement>(null);

  useGridScrollbarGutter(gridRef, scrollBodyRef);

  useEffect(() => {
    setEditing(false);
    setDraft(cloneFields(detail?.fields || []));
    setSearchOpen(false);
    setQuery("");
    setDraftQuery("");
  }, [detail?.id]);

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
    () => editing && hasFieldChanges(detail?.fields || [], draft),
    [detail?.fields, draft, editing],
  );
  const visibleFields = useMemo(
    () => sourceFields.filter((field) => matchesField(field, query.trim())),
    [sourceFields, query],
  );
  const activeHighlightQuery = query.trim() || highlightQuery.trim();

  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);

  useEffect(
    () => () => {
      onDirtyChange(false);
    },
    [onDirtyChange],
  );

  const submitFieldSearch = () => setQuery(draftQuery.trim());

  const updateField = <K extends keyof FieldDefinition>(id: string, key: K, value: FieldDefinition[K]) => {
    setDraft((current) => current.map((field) => (field.id === id ? { ...field, [key]: value } : field)));
  };

  const startEditing = () => {
    setDraft(cloneFields(detail?.fields || []));
    setEditing(true);
  };

  const cancelEditing = () => {
    setDraft(cloneFields(detail?.fields || []));
    setEditing(false);
  };

  const save = async () => {
    await onSave(draft);
    setEditing(false);
  };

  return (
    <section className="field-panel panel-shell">
      <header className="field-panel-header">
        <div className="section-title field-title">
          <span className="section-index">02</span>
          {detail ? (
            <span className="table-identity">
              <span className="table-icon"><TableGlyph /></span>
              <span className="table-heading">
                <strong>{detail.name || detail.code}</strong>
                <small>
                  <code>{detail.code}</code>
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
                <Button icon={<CloseOutlined />} disabled={saving} onClick={cancelEditing}>取消</Button>
                <Button type="primary" icon={<CheckOutlined />} loading={saving} onClick={save}>保存修改</Button>
              </>
            ) : (
              <Button icon={<EditOutlined />} onClick={startEditing}>编辑字典</Button>
            )}
          </div>
        )}
      </header>
      <div ref={gridRef} className="field-grid data-grid">
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
        </div>
        <div ref={scrollBodyRef} className="field-grid-body" data-testid="field-scroll-body">
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
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="当前表中没有匹配字段" />
            </div>
          )}
          {!loading &&
            visibleFields.map((field) => (
              <div className="data-grid-row field-grid-columns" key={field.id}>
                <span className="grid-index">{String(field.ordinal).padStart(2, "0")}</span>
                <span>
                  {field.is_primary_key ? <b className="pk-badge">PK</b> : <span className="pk-empty">—</span>}
                </span>
                <span>
                  {editing ? (
                    <Input value={field.code} onChange={(event) => updateField(field.id, "code", event.target.value)} />
                  ) : (
                    <code title={field.code}>
                      <HighlightedText text={field.code || "—"} query={activeHighlightQuery} />
                    </code>
                  )}
                </span>
                <span>
                  {editing ? (
                    <Input value={field.name} onChange={(event) => updateField(field.id, "name", event.target.value)} />
                  ) : (
                    <span title={field.name}>
                      <HighlightedText text={field.name || "—"} query={activeHighlightQuery} />
                    </span>
                  )}
                </span>
                <span>
                  {editing ? (
                    <Input value={field.data_type} onChange={(event) => updateField(field.id, "data_type", event.target.value)} />
                  ) : (
                    <code>{field.data_type || "—"}</code>
                  )}
                </span>
                <span>
                  {editing ? (
                    <Input value={field.length} onChange={(event) => updateField(field.id, "length", event.target.value)} />
                  ) : (
                    field.length || "—"
                  )}
                </span>
                <span>
                  <Checkbox
                    checked={field.nullable}
                    disabled={!editing}
                    onChange={(event) => updateField(field.id, "nullable", event.target.checked)}
                  />
                </span>
                <span>
                  {editing ? (
                    <Input
                      value={field.default_value}
                      onChange={(event) => updateField(field.id, "default_value", event.target.value)}
                    />
                  ) : (
                    <span title={field.default_value}>{field.default_value || "—"}</span>
                  )}
                </span>
                <span>
                  {editing ? (
                    <Input value={field.comment} onChange={(event) => updateField(field.id, "comment", event.target.value)} />
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
                    "—"
                  )}
                </span>
              </div>
            ))}
        </div>
      </div>
    </section>
  );
}
