import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  CheckOutlined,
  CloseOutlined,
  DeleteOutlined,
  EditOutlined,
  InfoCircleOutlined,
  PlusOutlined,
  SearchOutlined,
} from "@ant-design/icons";
import {
  Button,
  Checkbox,
  Drawer,
  Empty,
  Input,
  Spin,
  Table,
  Tag,
  Tooltip,
} from "antd";
import type { InputRef } from "antd";
import type { ColumnsType } from "antd/es/table";
import type {
  FieldDefinition,
  TableDetail,
  TableMetadataUpdate,
  TableTab,
} from "../types";
import { useI18n } from "../features/preferences/PreferencesProvider";
import { dictionariesApi } from "../features/dictionaries/api";
import { TableTabs } from "../features/tables/components/TableTabs";
import type {
  DictionaryFieldBinding,
  DictionaryItem,
} from "../features/dictionaries/types";
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
  onSave: (
    table: TableMetadataUpdate,
    fields: FieldDefinition[],
  ) => Promise<void>;
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

const cloneFields = (fields: FieldDefinition[]): FieldDefinition[] =>
  fields.map((field) => ({ ...field }));
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

function hasFieldChanges(
  original: FieldDefinition[],
  draft: FieldDefinition[],
): boolean {
  if (original.length !== draft.length) return true;
  const originalById = new Map(original.map((field) => [field.id, field]));
  return draft.some((field) => {
    const baseline = originalById.get(field.id);
    return (
      !baseline ||
      EDITABLE_FIELD_KEYS.some((key) => baseline[key] !== field[key])
    );
  });
}

function hasTableChanges(
  original: TableDetail | null,
  draft: TableMetadataUpdate,
): boolean {
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

export const FieldPanel = forwardRef<FieldPanelHandle, FieldPanelProps>(
  function FieldPanel(
    {
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
    }: FieldPanelProps,
    ref,
  ) {
    const { t } = useI18n();
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState<FieldDefinition[]>([]);
    const [draftTable, setDraftTable] = useState<TableMetadataUpdate>(
      tableMetadata(),
    );
    const [searchOpen, setSearchOpen] = useState(false);
    const [query, setQuery] = useState("");
    const [draftQuery, setDraftQuery] = useState("");
    const [bindings, setBindings] = useState<
      Map<string, DictionaryFieldBinding>
    >(new Map());
    const [drawerBinding, setDrawerBinding] =
      useState<DictionaryFieldBinding | null>(null);
    const [drawerItems, setDrawerItems] = useState<DictionaryItem[]>([]);
    const [drawerQuery, setDrawerQuery] = useState("");
    const [drawerDraftQuery, setDrawerDraftQuery] = useState("");
    const [drawerLoading, setDrawerLoading] = useState(false);
    const [syncedDetailId, setSyncedDetailId] = useState<string | null>(
      detail?.id || null,
    );
    const draftCacheRef = useRef<Map<string, CachedDraft>>(new Map());
    const previousDetailIdRef = useRef<string | null>(detail?.id || null);
    const searchRef = useRef<InputRef>(null);
    const gridRef = useRef<HTMLDivElement>(null);
    const scrollBodyRef = useRef<HTMLDivElement>(null);

    useGridScrollbarGutter(gridRef, scrollBodyRef);

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
      const cached = detail?.id
        ? draftCacheRef.current.get(detail.id)
        : undefined;
      setEditing(cached?.editing || false);
      setDraft(cloneFields(cached?.draft || detail?.fields || []));
      setDraftTable(cached ? { ...cached.draftTable } : tableMetadata(detail));
      setSearchOpen(false);
      setQuery("");
      setDraftQuery("");
    }, [detail?.id]);

    useEffect(() => {
      let active = true;
      if (!detail?.id) {
        setBindings(new Map());
        return () => {
          active = false;
        };
      }
      void dictionariesApi
        .bindingsForTable(detail.id)
        .then((result) => {
          if (active)
            setBindings(
              new Map(result.map((binding) => [binding.field_id, binding])),
            );
        })
        .catch(() => {
          if (active) setBindings(new Map());
        });
      return () => {
        active = false;
      };
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
      return drawerItems.filter((item) =>
        `${item.code}\n${item.name}\n${item.description}`
          .toLocaleLowerCase()
          .includes(cleaned),
      );
    }, [drawerItems, drawerQuery]);

    const drawerColumns: ColumnsType<DictionaryItem> = [
      {
        title: t("field.dictionaryValue"),
        dataIndex: "code",
        width: 160,
        render: (value) => <code>{value}</code>,
      },
      {
        title: t("field.dictionaryValueName"),
        dataIndex: "name",
        ellipsis: true,
      },
    ];

    useEffect(() => {
      const handleKeydown = (event: KeyboardEvent) => {
        const target = event.target as HTMLElement | null;
        if (target?.closest(".ant-modal")) return;
        if (
          (event.ctrlKey || event.metaKey) &&
          event.key.toLocaleLowerCase() === "f" &&
          detail
        ) {
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
        (hasTableChanges(detail, draftTable) ||
          hasFieldChanges(detail?.fields || [], draft)),
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
        if (!code) return t("field.emptyEnglishName", { row: index + 1 });
        if (!field.data_type.trim())
          return t("field.emptyDataType", { row: index + 1 });
        const normalized = code.toLocaleLowerCase();
        if (codes.has(normalized))
          return t("field.duplicateEnglishName", { name: code });
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

    const updateField = <K extends keyof FieldDefinition>(
      id: string,
      key: K,
      value: FieldDefinition[K],
    ) => {
      setDraft((current) =>
        current.map((field) =>
          field.id === id ? { ...field, [key]: value } : field,
        ),
      );
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
      setDraft((current) =>
        renumberFields(current.filter((field) => field.id !== id)),
      );
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

    const renderFieldCode = (field: FieldDefinition) => {
      if (editing) {
        return (
          <Input
            aria-label={t("field.rowField", {
              row: field.ordinal,
              field: t("field.englishName"),
            })}
            value={field.code}
            onChange={(event) =>
              updateField(field.id, "code", event.target.value)
            }
          />
        );
      }
      const binding = bindings.get(field.id);
      if (binding) {
        return (
          <button
            type="button"
            className="field-dictionary-trigger"
            title={t("field.viewDictionary", {
              name: binding.dictionary_name || t("common.noData"),
            })}
            onClick={() => void openDictionaryDrawer(binding)}
          >
            <HighlightedText
              text={field.code || ""}
              query={activeHighlightQuery}
            />
          </button>
        );
      }
      return (
        <code title={field.code}>
          <HighlightedText
            text={field.code || ""}
            query={activeHighlightQuery}
          />
        </code>
      );
    };

    const renderDefaultValue = (field: FieldDefinition) => {
      if (editing) {
        return (
          <Input
            aria-label={t("field.rowField", {
              row: field.ordinal,
              field: t("field.defaultValue"),
            })}
            value={field.default_value}
            onChange={(event) =>
              updateField(field.id, "default_value", event.target.value)
            }
          />
        );
      }
      return field.default_value ? (
        <span title={field.default_value}>{field.default_value}</span>
      ) : null;
    };

    const renderFieldComment = (field: FieldDefinition) => {
      if (editing) {
        return (
          <Input
            aria-label={t("field.rowField", {
              row: field.ordinal,
              field: t("field.comment"),
            })}
            value={field.comment}
            onChange={(event) =>
              updateField(field.id, "comment", event.target.value)
            }
          />
        );
      }
      if (!field.comment) return null;
      return (
        <FullTextPopover
          title={`${field.code || t("common.field")} · ${t("field.comment")}`}
          text={field.comment}
        >
          <button
            type="button"
            className="field-comment-trigger"
            aria-label={t("field.fullComment", {
              name: field.code || t("common.field"),
            })}
            title={t("field.clickViewComment")}
          >
            <HighlightedText
              text={field.comment}
              query={activeHighlightQuery}
            />
          </button>
        </FullTextPopover>
      );
    };

    const fieldDeleteTooltip = (field: FieldDefinition) => {
      if (field.is_primary_key) return t("field.pkCannotDelete");
      if (bindings.has(field.id)) return t("field.unbindBeforeDelete");
      return t("field.deleteBeforeSave");
    };

    useImperativeHandle(
      ref,
      () => ({
        save,
        discard: cancelEditing,
      }),
      [cancelEditing, save],
    );

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
                <span className="table-icon">
                  <TableGlyph />
                </span>
                {editing ? (
                  <span className="table-meta-editor">
                    <Input
                      aria-label={t("field.tableName")}
                      prefix={
                        <span className="table-meta-label">
                          {t("field.tableName")}
                        </span>
                      }
                      placeholder={t("field.tableName")}
                      value={draftTable.name}
                      onChange={(event) =>
                        setDraftTable((current) => ({
                          ...current,
                          name: event.target.value,
                        }))
                      }
                    />
                    <Input
                      aria-label={t("field.tableCode")}
                      prefix={
                        <span className="table-meta-label">
                          {t("field.tableCode")}
                        </span>
                      }
                      placeholder={t("field.tableCode")}
                      value={draftTable.code}
                      onChange={(event) =>
                        setDraftTable((current) => ({
                          ...current,
                          code: event.target.value,
                        }))
                      }
                    />
                    <Input
                      aria-label={t("field.tableDescription")}
                      prefix={
                        <span className="table-meta-label">
                          {t("field.tableDescription")}
                        </span>
                      }
                      placeholder={t("field.tableDescription")}
                      value={draftTable.comment}
                      onChange={(event) =>
                        setDraftTable((current) => ({
                          ...current,
                          comment: event.target.value,
                        }))
                      }
                    />
                  </span>
                ) : (
                  <span className="table-heading">
                    <strong>{detail.name || detail.code}</strong>
                    <small>
                      <code
                        className={
                          onOpenRelations ? "rel-open-code" : undefined
                        }
                        title={
                          onOpenRelations
                            ? t("field.clickViewRelations")
                            : undefined
                        }
                        role={onOpenRelations ? "button" : undefined}
                        tabIndex={onOpenRelations ? 0 : undefined}
                        onClick={onOpenRelations}
                        onKeyDown={(event) => {
                          if (
                            onOpenRelations &&
                            (event.key === "Enter" || event.key === " ")
                          ) {
                            event.preventDefault();
                            onOpenRelations();
                          }
                        }}
                      >
                        {detail.code}
                      </code>
                      {detail.comment && <i>·</i>}
                      {detail.comment && (
                        <FullTextPopover
                          title={t("field.tableExplanation")}
                          text={detail.comment}
                        >
                          <button
                            type="button"
                            className="table-comment-trigger"
                            aria-label={t("field.viewFullTableExplanation")}
                            title={t("field.clickViewFullExplanation")}
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
              <span>
                <strong>{t("field.dictionaryTitle")}</strong>
                <small>{t("field.selectTableDetails")}</small>
              </span>
            )}
          </div>
          {detail && (
            <div className="field-actions">
              {searchOpen ? (
                <div className="field-search-box">
                  <Input
                    ref={searchRef}
                    allowClear
                    prefix={
                      <button
                        type="button"
                        className="input-search-trigger"
                        aria-label={t("field.searchCurrentFields")}
                        title={t("common.search")}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={submitFieldSearch}
                      >
                        <SearchOutlined />
                      </button>
                    }
                    placeholder={t("field.searchCurrentFields")}
                    value={draftQuery}
                    onChange={(event) => setDraftQuery(event.target.value)}
                    onPressEnter={submitFieldSearch}
                    suffix={
                      <span className="hit-count">
                        {visibleFields.length}/{sourceFields.length}
                      </span>
                    }
                  />
                  <Tooltip title={t("field.closeSearch")}>
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
                  {t("field.searchFieldsShortcut")}
                </Button>
              )}
              {editing ? (
                <>
                  {draftValidation && (
                    <span
                      className="field-edit-error"
                      role="alert"
                      title={draftValidation}
                    >
                      {draftValidation}
                    </span>
                  )}
                  <Button
                    icon={<PlusOutlined />}
                    disabled={saving}
                    onClick={addField}
                  >
                    {t("field.add")}
                  </Button>
                  <Button
                    icon={<CloseOutlined />}
                    disabled={saving}
                    onClick={cancelEditing}
                  >
                    {t("common.cancel")}
                  </Button>
                  <Button
                    type="primary"
                    icon={<CheckOutlined />}
                    loading={saving}
                    disabled={!dirty || Boolean(draftValidation)}
                    onClick={save}
                  >
                    {t("field.saveChanges")}
                  </Button>
                </>
              ) : (
                <Button icon={<EditOutlined />} onClick={startEditing}>
                  {t("field.editDictionary")}
                </Button>
              )}
            </div>
          )}
        </header>
        <div ref={gridRef} className="field-grid data-grid">
          <div className="data-grid-head field-grid-columns">
            <span>#</span>
            <span>{t("field.primaryKey")}</span>
            <span>{t("field.englishName")}</span>
            <span>{t("field.description")}</span>
            <span>{t("field.dataType")}</span>
            <span>{t("field.length")}</span>
            <span>{t("field.nullable")}</span>
            <span>{t("field.defaultValue")}</span>
            <span>{t("field.comment")}</span>
            <span>{t("common.actions")}</span>
          </div>
          <div
            ref={scrollBodyRef}
            className="field-grid-body"
            data-testid="field-scroll-body"
          >
            {loading && (
              <div className="grid-loading">
                <Spin size="small" /> {t("field.readingDictionary")}
              </div>
            )}
            {!loading && !detail && (
              <div className="field-placeholder">
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description={t("field.selectTableFirst")}
                />
              </div>
            )}
            {!loading && detail && visibleFields.length === 0 && (
              <div className="field-placeholder">
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description={
                    editing && !query.trim()
                      ? t("field.noFields")
                      : t("field.noMatchingFields")
                  }
                />
              </div>
            )}
            {!loading &&
              visibleFields.map((field) => (
                <div
                  className={`data-grid-row field-grid-columns${field.is_new ? " is-new-field" : ""}`}
                  key={field.id}
                >
                  <span className="grid-index">
                    {String(field.ordinal).padStart(2, "0")}
                  </span>
                  <span>
                    {field.is_primary_key ? (
                      <b className="pk-badge">PK</b>
                    ) : null}
                  </span>
                  <span>{renderFieldCode(field)}</span>
                  <span>
                    {editing ? (
                      <Input
                        aria-label={t("field.rowField", {
                          row: field.ordinal,
                          field: t("field.description"),
                        })}
                        value={field.name}
                        onChange={(event) =>
                          updateField(field.id, "name", event.target.value)
                        }
                      />
                    ) : (
                      <span title={field.name}>
                        <HighlightedText
                          text={field.name || ""}
                          query={activeHighlightQuery}
                        />
                      </span>
                    )}
                  </span>
                  <span>
                    {editing ? (
                      <Input
                        aria-label={t("field.rowField", {
                          row: field.ordinal,
                          field: t("field.dataType"),
                        })}
                        value={field.data_type}
                        onChange={(event) =>
                          updateField(field.id, "data_type", event.target.value)
                        }
                      />
                    ) : (
                      <code>{field.data_type || ""}</code>
                    )}
                  </span>
                  <span>
                    {editing ? (
                      <Input
                        aria-label={t("field.rowField", {
                          row: field.ordinal,
                          field: t("field.length"),
                        })}
                        value={field.length}
                        onChange={(event) =>
                          updateField(field.id, "length", event.target.value)
                        }
                      />
                    ) : (
                      field.length || null
                    )}
                  </span>
                  <span>
                    <Checkbox
                      aria-label={t("field.rowField", {
                        row: field.ordinal,
                        field: t("field.nullable"),
                      })}
                      checked={field.nullable}
                      disabled={!editing}
                      onChange={(event) =>
                        updateField(field.id, "nullable", event.target.checked)
                      }
                    />
                  </span>
                  <span>{renderDefaultValue(field)}</span>
                  <span>{renderFieldComment(field)}</span>
                  <span className="field-row-action">
                    {editing ? (
                      <Tooltip title={fieldDeleteTooltip(field)}>
                        <span>
                          <Button
                            type="text"
                            danger
                            size="small"
                            icon={<DeleteOutlined />}
                            aria-label={t("field.deleteField", {
                              name: field.code || `${field.ordinal}`,
                            })}
                            disabled={
                              field.is_primary_key || bindings.has(field.id)
                            }
                            onClick={() => removeField(field.id)}
                          />
                        </span>
                      </Tooltip>
                    ) : null}
                  </span>
                </div>
              ))}
          </div>
        </div>
        <Drawer
          open={Boolean(drawerBinding)}
          width={520}
          className="field-dictionary-drawer"
          title={
            <span className="field-dictionary-drawer-title">
              <span>
                <strong>{drawerBinding?.dictionary_name}</strong>
                <small>{t("field.dictionaryLookup")}</small>
              </span>
              <Tag color="green">
                {t("field.itemCount", {
                  count: drawerBinding?.item_count || 0,
                })}
              </Tag>
            </span>
          }
          onClose={() => setDrawerBinding(null)}
        >
          <Input
            allowClear
            prefix={
              <button
                type="button"
                className="input-search-trigger"
                aria-label={t("field.searchDictionary")}
                title={t("common.search")}
                onMouseDown={(event) => event.preventDefault()}
                onClick={submitDrawerSearch}
              >
                <SearchOutlined />
              </button>
            }
            placeholder={t("field.searchDictionary")}
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
  },
);
