import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircleOutlined,
  CodeOutlined,
  CopyOutlined,
  DownloadOutlined,
  EditOutlined,
  ExclamationCircleOutlined,
  FileTextOutlined,
  InfoCircleOutlined,
  ReloadOutlined,
  SearchOutlined,
  WarningOutlined,
} from "@ant-design/icons";
import {
  Alert,
  App as AntApp,
  Button,
  Checkbox,
  Input,
  InputNumber,
  Select,
  Spin,
  Tag,
  Tooltip,
} from "antd";

import { ddlApi } from "../features/ddl/api";
import { useI18n } from "../features/preferences/PreferencesProvider";
import { DraggableModal } from "./DraggableModal";
import {
  cacheCatalogTables,
  cleanFileName,
  compactNumber,
  DEFAULT_CONFIG,
  mergeCatalogGroups,
  optionText,
  scopeIncludesGroup,
} from "../features/ddl/model";
import type { EditorView } from "@codemirror/view";
import type {
  DdlCatalog,
  DdlCatalogGroup,
  DdlCatalogTable,
  DdlConfig,
  DdlDatabase,
  DdlDatabaseOption,
  DdlGenerateResult,
  DdlOptions,
  DdlValueOption,
  DdlWarning,
  Project,
  WorkspaceNode,
} from "../types";
import { DdlTableTree } from "./DdlTableTree";

const DdlScriptEditor = lazy(() =>
  import("./DdlScriptEditor").then((module) => ({
    default: module.DdlScriptEditor,
  })),
);

interface DdlExportModalProps {
  open: boolean;
  project: Project | null;
  selectedNode: WorkspaceNode | null;
  hasUnsavedChanges: boolean;
  onClose: () => void;
}

type PreviewTab = "script" | "problems";
type DdlGenerateMeta = Omit<DdlGenerateResult, "script">;

const ENGLISH_DATABASE_LABELS: Record<DdlDatabase, string> = {
  mysql: "MySQL",
  oracle: "Oracle",
  dameng: "Dameng",
  tdsql: "TDSQL for MySQL",
  ignite: "Apache Ignite",
};

function databaseLabel(
  database: DdlDatabase,
  label: string | undefined,
  language: string,
): string {
  return language === "en-US"
    ? ENGLISH_DATABASE_LABELS[database]
    : label || database;
}

function DatabaseLogo({ database }: { database: DdlDatabase }) {
  if (database === "mysql") {
    return (
      <span className="ddl-database-logo is-mysql" aria-hidden="true">
        <svg viewBox="0 0 42 30">
          <path d="M6 20c5-9 12-13 23-12-3 2-5 5-5 8 4-1 8 0 11 3-4-1-8 0-11 2-5 3-11 3-18-1Z" />
          <path d="M28 8c4 1 7 3 9 6-3-1-6-1-9 0" />
          <text x="7" y="26">
            MySQL
          </text>
        </svg>
      </span>
    );
  }
  if (database === "oracle") {
    return (
      <span className="ddl-database-logo is-oracle" aria-hidden="true">
        <svg viewBox="0 0 42 30">
          <path d="M12 7h18a8 8 0 0 1 0 16H12A8 8 0 0 1 12 7Zm1 5a3 3 0 0 0 0 6h16a3 3 0 0 0 0-6Z" />
          <text x="9" y="28">
            ORACLE
          </text>
        </svg>
      </span>
    );
  }
  if (database === "dameng") {
    return (
      <span className="ddl-database-logo is-dameng" aria-hidden="true">
        <svg viewBox="0 0 42 30">
          <ellipse cx="16" cy="8" rx="10" ry="4" />
          <path d="M6 8v12c0 2 4 4 10 4s10-2 10-4V8M6 14c0 2 4 4 10 4s10-2 10-4" />
          <text x="27" y="19">
            DM
          </text>
        </svg>
      </span>
    );
  }
  if (database === "tdsql") {
    return (
      <span className="ddl-database-logo is-tdsql" aria-hidden="true">
        <svg viewBox="0 0 42 30">
          <circle cx="9" cy="8" r="4" />
          <circle cx="9" cy="22" r="4" />
          <circle cx="31" cy="15" r="5" />
          <path d="m13 9 13 4M13 21l13-4" />
          <text x="15" y="28">
            TDSQL
          </text>
        </svg>
      </span>
    );
  }
  return (
    <span className="ddl-database-logo is-ignite" aria-hidden="true">
      <svg viewBox="0 0 42 30">
        <path
          className="ignite-flame-a"
          d="M18 3c2 6-5 7-3 14 1 4 5 7 9 6 5-2 6-8 2-12-1 4-4 4-4 0 0-3-1-6-4-8Z"
        />
        <path
          className="ignite-flame-b"
          d="M14 8c-5 5-4 12 1 16-7-2-9-9-5-14 1-1 2-2 4-2Z"
        />
        <text x="27" y="19">
          IG
        </text>
      </svg>
    </span>
  );
}

function ValueSelect({
  value,
  options,
  onChange,
  searchable = false,
  ariaLabel,
}: {
  value: string;
  options: DdlValueOption[];
  onChange: (value: string) => void;
  searchable?: boolean;
  ariaLabel: string;
}) {
  const { t } = useI18n();
  return (
    <Select
      aria-label={ariaLabel}
      className="ddl-system-select"
      classNames={{ popup: { root: "ddl-system-select-popup" } }}
      value={value}
      showSearch={searchable}
      optionFilterProp="searchText"
      filterOption={(input, option) =>
        String(option?.searchText || "")
          .toLocaleLowerCase()
          .includes(input.toLocaleLowerCase())
      }
      options={options.map((option) => ({
        value: option.value,
        label: option.label || option.value,
        searchText: optionText(option),
        source: option,
      }))}
      optionRender={(item) => {
        const option = item.data.source as DdlValueOption;
        return (
          <div className="ddl-select-option">
            <span>
              <b>{option.label || option.value}</b>
              {option.recommended ? <em>{t("ddl.recommended")}</em> : null}
              {option.default_for_charset && !option.recommended ? (
                <em>{t("ddl.default")}</em>
              ) : null}
              {option.deprecated ? (
                <em className="is-muted">{t("ddl.deprecated")}</em>
              ) : null}
              {option.optional ? (
                <em className="is-muted">{t("ddl.optionalComponent")}</em>
              ) : null}
            </span>
            {option.description || option.default_collation ? (
              <small>
                {option.description}
                {option.default_collation
                  ? ` · ${t("ddl.defaultCollation", { value: option.default_collation })}`
                  : ""}
              </small>
            ) : null}
          </div>
        );
      }}
      onChange={onChange}
    />
  );
}

function DatabaseSelect({
  value,
  options,
  onChange,
}: {
  value: DdlDatabase;
  options: DdlDatabaseOption[];
  onChange: (value: DdlDatabase) => void;
}) {
  const { t, language } = useI18n();
  const selected = options.find((option) => option.value === value);
  return (
    <Select
      aria-label={t("ddl.targetDatabase")}
      className="ddl-system-select ddl-database-select"
      classNames={{
        popup: { root: "ddl-system-select-popup ddl-database-select-popup" },
      }}
      value={value}
      options={options.map((option) => ({
        value: option.value,
        label: databaseLabel(option.value, option.label, language),
        source: option,
      }))}
      labelRender={() => (
        <span className="ddl-database-selection">
          <DatabaseLogo database={value} />
          <span>
            <b>{databaseLabel(value, selected?.label, language)}</b>
            <small>{selected?.description || ""}</small>
          </span>
        </span>
      )}
      optionRender={(item) => {
        const option = item.data.source as DdlDatabaseOption;
        return (
          <div className="ddl-database-option">
            <DatabaseLogo database={option.value} />
            <span>
              <b>{databaseLabel(option.value, option.label, language)}</b>
              <small>
                {option.description} · {option.versions.join(" / ")}
              </small>
            </span>
          </div>
        );
      }}
      onChange={onChange}
    />
  );
}

function warningIcon(warning: DdlWarning) {
  if (warning.severity === "error") return <ExclamationCircleOutlined />;
  if (warning.severity === "info") return <InfoCircleOutlined />;
  return <WarningOutlined />;
}

export function DdlExportModal({
  open,
  project,
  selectedNode,
  hasUnsavedChanges,
  onClose,
}: DdlExportModalProps) {
  const { message } = AntApp.useApp();
  const { t, language, errorText } = useI18n();
  const [options, setOptions] = useState<DdlOptions | null>(null);
  const [catalog, setCatalog] = useState<DdlCatalog | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [reloadRevision, setReloadRevision] = useState(0);
  const [draftQuery, setDraftQuery] = useState("");
  const [query, setQuery] = useState("");
  const [searchGroups, setSearchGroups] = useState<DdlCatalogGroup[] | null>(
    null,
  );
  const [searching, setSearching] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [loadingGroupIds, setLoadingGroupIds] = useState<Set<string>>(
    new Set(),
  );
  const [groupErrors, setGroupErrors] = useState<Map<string, string>>(
    new Map(),
  );
  const [allSelecting, setAllSelecting] = useState(false);
  const [config, setConfig] = useState<DdlConfig>(DEFAULT_CONFIG);
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<DdlGenerateMeta | null>(null);
  const [scriptDirty, setScriptDirty] = useState(false);
  const [editorRevision, setEditorRevision] = useState(0);
  const [editorStats, setEditorStats] = useState({
    lineCount: 0,
    charCount: 0,
  });
  const [generatedSignature, setGeneratedSignature] = useState("");
  const [activeTab, setActiveTab] = useState<PreviewTab>("script");
  const generateAbortRef = useRef<AbortController | null>(null);
  const searchAbortRef = useRef<AbortController | null>(null);
  const groupLoadControllersRef = useRef<Map<string, AbortController>>(
    new Map(),
  );
  const groupLoadPromisesRef = useRef<
    Map<string, Promise<DdlCatalogGroup | null>>
  >(new Map());
  const tableByIdRef = useRef<Map<string, DdlCatalogTable>>(new Map());
  const preSearchExpandedRef = useRef<Set<string> | null>(null);
  const scriptEditorViewRef = useRef<EditorView | null>(null);
  const scriptValueRef = useRef("");
  const scriptDirtyRef = useRef(false);

  useEffect(() => {
    if (!open || !project) return;
    const controller = new AbortController();
    setLoading(true);
    setLoadError("");
    setOptions(null);
    setCatalog(null);
    setDraftQuery("");
    setQuery("");
    setSearchGroups(null);
    setSearching(false);
    setLoadingGroupIds(new Set());
    setGroupErrors(new Map());
    setAllSelecting(false);
    setResult(null);
    setScriptDirty(false);
    setEditorStats({ lineCount: 0, charCount: 0 });
    setGeneratedSignature("");
    setActiveTab("script");
    tableByIdRef.current.clear();
    preSearchExpandedRef.current = null;
    scriptValueRef.current = "";
    scriptDirtyRef.current = false;
    const loadCatalog = async () => {
      try {
        const [nextOptions, summaryCatalog] = await Promise.all([
          ddlApi.options(),
          ddlApi.catalog(
            project.id,
            { includeTables: false },
            controller.signal,
          ),
        ]);
        if (controller.signal.aborted) return;
        const projectScope = !selectedNode || selectedNode.type === "project";
        const scopedGroups = projectScope
          ? summaryCatalog.groups
          : summaryCatalog.groups.filter((group) =>
              scopeIncludesGroup(selectedNode, group),
            );
        const expansionSource = scopedGroups.length
          ? scopedGroups
          : summaryCatalog.groups;
        const initialExpandedGroups =
          expansionSource.length > 8
            ? expansionSource.slice(0, 2)
            : expansionSource;
        const hydrateIds = projectScope
          ? initialExpandedGroups.map((group) => group.id)
          : scopedGroups.map((group) => group.id);
        let nextCatalog = summaryCatalog;
        if (hydrateIds.length) {
          const hydratedCatalog = await ddlApi.catalog(
            project.id,
            { includeTables: true, pdmIds: hydrateIds },
            controller.signal,
          );
          if (controller.signal.aborted) return;
          nextCatalog = mergeCatalogGroups(summaryCatalog, hydratedCatalog);
          cacheCatalogTables(tableByIdRef.current, hydratedCatalog.groups);
        }
        setOptions(nextOptions);
        setCatalog(nextCatalog);
        const database =
          nextOptions.databases.find((item) => item.value === "mysql") ||
          nextOptions.databases[0];
        setConfig({
          ...DEFAULT_CONFIG,
          database: database.value,
          version: database.default_version,
        });
        const hydratedScopeGroups = projectScope
          ? []
          : nextCatalog.groups.filter((group) =>
              scopeIncludesGroup(selectedNode, group),
            );
        const scopedTableIds = hydratedScopeGroups.flatMap((group) =>
          group.tables.map((table) => table.id),
        );
        setSelectedIds(new Set(scopedTableIds));
        if (!projectScope && !scopedGroups.length) {
          message.warning(t("ddl.noExportTables"));
        }
        setExpandedIds(new Set(initialExpandedGroups.map((group) => group.id)));
      } catch (error) {
        if (!controller.signal.aborted) {
          setLoadError(errorText(error, "ddl.loadFailed"));
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    void loadCatalog();
    return () => {
      controller.abort();
      searchAbortRef.current?.abort();
      groupLoadControllersRef.current.forEach((pendingController) =>
        pendingController.abort(),
      );
      groupLoadControllersRef.current.clear();
      groupLoadPromisesRef.current.clear();
    };
  }, [open, project?.id, reloadRevision, selectedNode?.id]);

  useEffect(
    () => () => {
      generateAbortRef.current?.abort();
      searchAbortRef.current?.abort();
      groupLoadControllersRef.current.forEach((controller) =>
        controller.abort(),
      );
    },
    [],
  );

  const currentDatabase =
    options?.databases.find((item) => item.value === config.database) || null;
  const currentSignature = useMemo(
    () => JSON.stringify({ tableIds: [...selectedIds].sort(), config }),
    [config, selectedIds],
  );
  const stale = Boolean(result && generatedSignature !== currentSignature);
  const edited = Boolean(result && scriptDirty);
  const visibleGroups = query ? searchGroups || [] : catalog?.groups || [];

  const selectionMetrics = useMemo(() => {
    let fieldCount = 0;
    const groupCounts = new Map<string, number>();
    selectedIds.forEach((tableId) => {
      const table = tableByIdRef.current.get(tableId);
      if (!table) return;
      fieldCount += table.field_count;
      groupCounts.set(table.pdm_id, (groupCounts.get(table.pdm_id) || 0) + 1);
    });
    return { fieldCount, groupCounts, pdmCount: groupCounts.size };
  }, [selectedIds]);
  const selectedFieldCount = selectionMetrics.fieldCount;
  const selectedPdmCount = selectionMetrics.pdmCount;

  const updateConfig = <K extends keyof DdlConfig>(
    key: K,
    value: DdlConfig[K],
  ) => {
    setConfig((current) => ({ ...current, [key]: value }));
  };

  const clearTableSearch = () => {
    searchAbortRef.current?.abort();
    searchAbortRef.current = null;
    setDraftQuery("");
    setQuery("");
    setSearchGroups(null);
    setSearching(false);
    if (preSearchExpandedRef.current) {
      setExpandedIds(new Set(preSearchExpandedRef.current));
      preSearchExpandedRef.current = null;
    }
  };

  const submitTableSearch = async () => {
    const nextQuery = draftQuery.trim();
    if (!nextQuery) {
      clearTableSearch();
      return;
    }
    if (!project) return;
    if (!query) preSearchExpandedRef.current = new Set(expandedIds);
    searchAbortRef.current?.abort();
    const controller = new AbortController();
    searchAbortRef.current = controller;
    setQuery(nextQuery);
    setSearchGroups(null);
    setSearching(true);
    try {
      const searchCatalog = await ddlApi.catalog(
        project.id,
        { includeTables: true, query: nextQuery },
        controller.signal,
      );
      if (controller.signal.aborted) return;
      cacheCatalogTables(tableByIdRef.current, searchCatalog.groups);
      setSearchGroups(searchCatalog.groups);
      setExpandedIds(new Set(searchCatalog.groups.map((group) => group.id)));
    } catch (error) {
      if (!controller.signal.aborted) {
        setSearchGroups([]);
        message.error(errorText(error, "ddl.readTablesFailed"));
      }
    } finally {
      if (searchAbortRef.current === controller) {
        searchAbortRef.current = null;
        setSearching(false);
      }
    }
  };

  const changeCharset = (charset: string) => {
    const charsetOption = options?.mysql_character_sets.find(
      (item) => item.value === charset,
    );
    const defaultCollation =
      charsetOption?.default_collation ||
      options?.mysql_collations.find(
        (item) => item.charset === charset && item.default_for_charset,
      )?.value ||
      "";
    setConfig((current) => ({
      ...current,
      charset,
      collation: defaultCollation,
    }));
  };

  const changeDatabase = (database: DdlDatabase) => {
    const databaseOption = options?.databases.find(
      (item) => item.value === database,
    );
    if (!databaseOption) return;
    setConfig((current) => ({
      ...current,
      database,
      version: databaseOption.default_version,
      schema:
        database === "ignite" && !current.schema ? "PUBLIC" : current.schema,
    }));
  };

  const ensureGroupTables = (
    groupId: string,
    force = false,
  ): Promise<DdlCatalogGroup | null> => {
    if (!project) return Promise.resolve(null);
    const cachedGroup = catalog?.groups.find((group) => group.id === groupId);
    if (!force && cachedGroup?.tables_loaded)
      return Promise.resolve(cachedGroup);
    const pending = groupLoadPromisesRef.current.get(groupId);
    if (pending) return pending;
    const controller = new AbortController();
    groupLoadControllersRef.current.set(groupId, controller);
    setLoadingGroupIds((current) => new Set(current).add(groupId));
    setGroupErrors((current) => {
      const next = new Map(current);
      next.delete(groupId);
      return next;
    });
    const promise = ddlApi
      .catalog(
        project.id,
        { includeTables: true, pdmIds: [groupId] },
        controller.signal,
      )
      .then((nextCatalog) => {
        if (controller.signal.aborted) return null;
        const hydratedGroup = nextCatalog.groups[0] || null;
        if (!hydratedGroup) throw new Error(t("ddl.pdmMissing"));
        cacheCatalogTables(tableByIdRef.current, [hydratedGroup]);
        setCatalog((current) =>
          current ? mergeCatalogGroups(current, nextCatalog) : current,
        );
        return hydratedGroup;
      })
      .catch((error) => {
        if (controller.signal.aborted) return null;
        const errorMessage = errorText(error, "ddl.readTablesFailed");
        setGroupErrors((current) =>
          new Map(current).set(groupId, errorMessage),
        );
        return null;
      })
      .finally(() => {
        groupLoadPromisesRef.current.delete(groupId);
        groupLoadControllersRef.current.delete(groupId);
        setLoadingGroupIds((current) => {
          const next = new Set(current);
          next.delete(groupId);
          return next;
        });
      });
    groupLoadPromisesRef.current.set(groupId, promise);
    return promise;
  };

  const setAllVisible = async (checked: boolean) => {
    if (!checked) {
      if (!query) {
        setSelectedIds(new Set());
        return;
      }
      const visibleTableIds = visibleGroups.flatMap((group) =>
        group.tables.map((table) => table.id),
      );
      setSelectedIds((current) => {
        const next = new Set(current);
        visibleTableIds.forEach((tableId) => next.delete(tableId));
        return next;
      });
      return;
    }
    if (query) {
      cacheCatalogTables(tableByIdRef.current, visibleGroups);
      const visibleTableIds = visibleGroups.flatMap((group) =>
        group.tables.map((table) => table.id),
      );
      setSelectedIds((current) => new Set([...current, ...visibleTableIds]));
      return;
    }
    if (!project) return;
    setAllSelecting(true);
    try {
      const fullCatalog = await ddlApi.catalog(project.id, {
        includeTables: true,
      });
      cacheCatalogTables(tableByIdRef.current, fullCatalog.groups);
      setCatalog((current) =>
        current ? mergeCatalogGroups(current, fullCatalog) : fullCatalog,
      );
      setSelectedIds(
        new Set(
          fullCatalog.groups.flatMap((group) =>
            group.tables.map((table) => table.id),
          ),
        ),
      );
    } catch (error) {
      message.error(errorText(error, "ddl.selectAllFailed"));
    } finally {
      setAllSelecting(false);
    }
  };

  const toggleGroup = async (group: DdlCatalogGroup, checked: boolean) => {
    const targetGroup =
      query || group.tables_loaded ? group : await ensureGroupTables(group.id);
    if (!targetGroup) return;
    cacheCatalogTables(tableByIdRef.current, [targetGroup]);
    setSelectedIds((current) => {
      const next = new Set(current);
      targetGroup.tables.forEach((table) =>
        checked ? next.add(table.id) : next.delete(table.id),
      );
      return next;
    });
  };

  const toggleTable = (table: DdlCatalogTable, checked: boolean) => {
    tableByIdRef.current.set(table.id, table);
    setSelectedIds((current) => {
      const next = new Set(current);
      if (checked) next.add(table.id);
      else next.delete(table.id);
      return next;
    });
  };

  const toggleExpanded = (group: DdlCatalogGroup) => {
    const expanding = !expandedIds.has(group.id);
    setExpandedIds((current) => {
      const next = new Set(current);
      if (expanding) next.add(group.id);
      else next.delete(group.id);
      return next;
    });
    if (expanding && !query && !group.tables_loaded)
      void ensureGroupTables(group.id);
  };

  const markScriptDirty = () => {
    if (scriptDirtyRef.current) return;
    scriptDirtyRef.current = true;
    setScriptDirty(true);
  };

  const getCurrentScript = () =>
    scriptEditorViewRef.current?.state.doc.toString() ?? scriptValueRef.current;

  const activatePreviewTab = (tab: PreviewTab) => {
    if (tab !== "script" && scriptEditorViewRef.current) {
      const document = scriptEditorViewRef.current.state.doc;
      scriptValueRef.current = document.toString();
      setEditorStats({ lineCount: document.lines, charCount: document.length });
    }
    setActiveTab(tab);
  };

  const generateScript = async () => {
    if (!selectedIds.size) {
      message.warning(t("ddl.selectOneRequired"));
      return;
    }
    generateAbortRef.current?.abort();
    const controller = new AbortController();
    generateAbortRef.current = controller;
    const signature = currentSignature;
    setGenerating(true);
    try {
      const nextResult = await ddlApi.generate(
        [...selectedIds],
        config,
        controller.signal,
      );
      if (controller.signal.aborted) return;
      const { script: nextScript, ...nextMeta } = nextResult;
      scriptValueRef.current = nextScript;
      scriptDirtyRef.current = false;
      setResult(nextMeta);
      setScriptDirty(false);
      setEditorStats({
        lineCount: nextResult.line_count,
        charCount: nextResult.char_count,
      });
      setEditorRevision((value) => value + 1);
      setGeneratedSignature(signature);
      setActiveTab("script");
      message.success(
        t("ddl.generated", {
          count: nextResult.table_count,
          database: databaseLabel(
            config.database,
            nextResult.database_label,
            language,
          ),
        }),
      );
    } catch (error) {
      if (!controller.signal.aborted) {
        message.error(errorText(error, "ddl.generateFailed"));
      }
    } finally {
      if (generateAbortRef.current === controller) {
        generateAbortRef.current = null;
        setGenerating(false);
      }
    }
  };

  const copyScript = async () => {
    const script = getCurrentScript();
    if (!script) return;
    try {
      await navigator.clipboard.writeText(script);
      message.success(t("ddl.sqlCopied"));
    } catch {
      const textArea = document.createElement("textarea");
      textArea.value = script;
      textArea.style.position = "fixed";
      textArea.style.opacity = "0";
      document.body.appendChild(textArea);
      textArea.select();
      const copied = document.execCommand("copy");
      textArea.remove();
      if (copied) message.success(t("ddl.sqlCopied"));
      else message.error(t("ddl.copyFailed"));
    }
  };

  const downloadScript = () => {
    const script = getCurrentScript();
    if (!script || !project) return;
    const fileName =
      cleanFileName(
        `${project.name}_${databaseLabel(config.database, result?.database_label || currentDatabase?.label, language)}_${result?.version || config.version}`,
        language,
      ) + (result?.extension || ".sql");
    const url = URL.createObjectURL(
      new Blob([script], { type: "text/sql;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    message.success(t("ddl.downloaded", { file: fileName }));
  };

  const closeModal = () => {
    generateAbortRef.current?.abort();
    searchAbortRef.current?.abort();
    groupLoadControllersRef.current.forEach((controller) => controller.abort());
    generateAbortRef.current = null;
    searchAbortRef.current = null;
    groupLoadControllersRef.current.clear();
    groupLoadPromisesRef.current.clear();
    setGenerating(false);
    onClose();
  };

  const renderDynamicConfig = () => {
    if (!options) return null;
    if (config.database === "mysql") {
      const collations = options.mysql_collations.filter(
        (item) => item.charset === config.charset,
      );
      return (
        <>
          <label className="ddl-config-field">
            <span>{t("ddl.storageEngine")}</span>
            <ValueSelect
              ariaLabel={t("ddl.storageEngine")}
              value={config.engine}
              options={options.mysql_storage_engines}
              searchable
              onChange={(value) => updateConfig("engine", value)}
            />
          </label>
          <label className="ddl-config-field">
            <span>
              {t("ddl.charsets", {
                count: options.mysql_character_sets.length,
              })}
              <Tooltip title={t("ddl.mysqlCharsetHint")}>
                <InfoCircleOutlined />
              </Tooltip>
            </span>
            <ValueSelect
              ariaLabel={t("ddl.charsets", {
                count: options.mysql_character_sets.length,
              })}
              value={config.charset}
              options={options.mysql_character_sets}
              searchable
              onChange={changeCharset}
            />
          </label>
          <label className="ddl-config-field">
            <span>
              {t("ddl.collations", { count: collations.length })}
              <Tooltip title={t("ddl.collationHint")}>
                <InfoCircleOutlined />
              </Tooltip>
            </span>
            <ValueSelect
              ariaLabel={t("ddl.collations", { count: collations.length })}
              value={config.collation}
              options={collations}
              searchable
              onChange={(value) => updateConfig("collation", value)}
            />
          </label>
        </>
      );
    }
    if (config.database === "tdsql") {
      return (
        <>
          <label className="ddl-config-field">
            <span>{t("ddl.tableType")}</span>
            <ValueSelect
              ariaLabel={t("ddl.tableType")}
              value={config.tdsql_mode}
              options={options.tdsql_table_modes}
              onChange={(value) =>
                updateConfig("tdsql_mode", value as DdlConfig["tdsql_mode"])
              }
            />
          </label>
          <label className="ddl-config-field">
            <span>
              {t("ddl.charsets", {
                count: options.mysql_character_sets.length,
              })}
            </span>
            <ValueSelect
              ariaLabel={t("ddl.charsets", {
                count: options.mysql_character_sets.length,
              })}
              value={config.charset}
              options={options.mysql_character_sets}
              searchable
              onChange={changeCharset}
            />
          </label>
        </>
      );
    }
    if (config.database === "oracle" || config.database === "dameng") {
      return (
        <label className="ddl-config-field">
          <span>{t("ddl.tablespace")}</span>
          <Input
            aria-label={t("ddl.tablespace")}
            value={config.tablespace}
            placeholder={t("ddl.tablespacePlaceholder")}
            onChange={(event) => updateConfig("tablespace", event.target.value)}
          />
        </label>
      );
    }
    return (
      <>
        <label className="ddl-config-field">
          <span>{t("ddl.cacheTemplate")}</span>
          <ValueSelect
            ariaLabel={t("ddl.cacheTemplate")}
            value={config.ignite_template}
            options={options.ignite_templates}
            onChange={(value) =>
              updateConfig(
                "ignite_template",
                value as DdlConfig["ignite_template"],
              )
            }
          />
        </label>
        <label className="ddl-config-field is-number">
          <span>{t("ddl.backupReplicas")}</span>
          <InputNumber
            aria-label={t("ddl.backupReplicas")}
            min={0}
            max={10}
            precision={0}
            value={config.ignite_backups}
            onChange={(value) => updateConfig("ignite_backups", value ?? 0)}
          />
        </label>
        <label className="ddl-config-field">
          <span>{t("ddl.atomicityMode")}</span>
          <ValueSelect
            ariaLabel={t("ddl.atomicityMode")}
            value={config.ignite_atomicity}
            options={options.ignite_atomicity_modes}
            onChange={(value) =>
              updateConfig(
                "ignite_atomicity",
                value as DdlConfig["ignite_atomicity"],
              )
            }
          />
        </label>
        <label className="ddl-config-field">
          <span>{t("ddl.writeSyncMode")}</span>
          <ValueSelect
            ariaLabel={t("ddl.writeSyncMode")}
            value={config.ignite_write_sync}
            options={options.ignite_write_sync_modes}
            onChange={(value) =>
              updateConfig(
                "ignite_write_sync",
                value as DdlConfig["ignite_write_sync"],
              )
            }
          />
        </label>
        <label className="ddl-config-field">
          <span>{t("ddl.cacheGroup")}</span>
          <Input
            aria-label={t("ddl.cacheGroup")}
            value={config.ignite_cache_group}
            placeholder={t("ddl.cacheGroupPlaceholder")}
            onChange={(event) =>
              updateConfig("ignite_cache_group", event.target.value)
            }
          />
        </label>
      </>
    );
  };

  let footerStatus: string;
  if (generating) footerStatus = t("ddl.generating");
  else if (!result)
    footerStatus = selectedIds.size
      ? t("ddl.waiting", { count: selectedIds.size })
      : t("ddl.selectTables");
  else if (stale) footerStatus = t("ddl.stale");
  else if (edited) footerStatus = t("ddl.edited");
  else
    footerStatus = t("ddl.completed", {
      tables: result.table_count,
      warnings: result.warning_count,
    });

  return (
    <DraggableModal
      open={open}
      title={
        <div className="ddl-modal-title">
          <span className="ddl-title-icon">
            <CodeOutlined />
          </span>
          <span className="ddl-title-copy">
            <span>
              <b>{t("ddl.exportTitle")}</b>
            </span>
            <small>{t("ddl.exportSubtitle")}</small>
          </span>
          <span className="ddl-title-flow">
            <span>
              <FileTextOutlined />{" "}
              {t("ddl.pdmTables", { count: selectedIds.size })}
            </span>
            <i>→</i>
            <span className="is-target">
              <DatabaseLogo database={config.database} />
              {databaseLabel(config.database, currentDatabase?.label, language)}{" "}
              {config.version} · .sql
            </span>
          </span>
        </div>
      }
      className="ddl-export-modal"
      width="min(1360px, calc(100vw - 40px))"
      centered
      destroyOnHidden
      mask={{ closable: false }}
      keyboard={!generating}
      onCancel={closeModal}
      footer={
        <div className="ddl-modal-footer">
          <span
            className={`ddl-footer-status${result && !stale ? " is-ready" : ""}${stale ? " is-stale" : ""}`}
          >
            <i />
            <b>{footerStatus}</b>
            {hasUnsavedChanges ? (
              <small>{t("ddl.unsavedWarning")}</small>
            ) : null}
          </span>
          <span className="ddl-footer-actions">
            <Button
              icon={<CopyOutlined />}
              disabled={!result || generating}
              onClick={() => void copyScript()}
            >
              {t("ddl.copySql")}
            </Button>
            <Button
              icon={<DownloadOutlined />}
              disabled={!result || generating}
              onClick={downloadScript}
            >
              {t("ddl.downloadSql")}
            </Button>
            <Button
              type="primary"
              icon={result ? <ReloadOutlined /> : <CodeOutlined />}
              loading={generating}
              disabled={!selectedIds.size || loading || Boolean(loadError)}
              onClick={() => void generateScript()}
            >
              {result ? t("ddl.regenerate") : t("ddl.generateScript")}
            </Button>
          </span>
        </div>
      }
    >
      {loading ? (
        <div className="ddl-modal-loading">
          <Spin size="large" />
          <span>{t("ddl.readingCatalog")}</span>
        </div>
      ) : loadError ? (
        <div className="ddl-modal-error">
          <Alert
            type="error"
            showIcon
            message={t("ddl.openFailed")}
            description={loadError}
          />
          <Button
            icon={<ReloadOutlined />}
            onClick={() => setReloadRevision((value) => value + 1)}
          >
            {t("ddl.reload")}
          </Button>
        </div>
      ) : options && catalog ? (
        <div className="ddl-modal-body">
          <aside className="ddl-table-picker">
            <div className="ddl-section-heading">
              <span>
                <b>{t("ddl.tableSelection")}</b>
                <small>
                  {!selectedNode || selectedNode.type === "project"
                    ? t("ddl.projectSelectionHint")
                    : t("ddl.nodeSelectionHint")}
                </small>
              </span>
              <span className="ddl-picker-actions">
                <Button
                  type="text"
                  size="small"
                  loading={allSelecting}
                  disabled={searching}
                  onClick={() => void setAllVisible(true)}
                >
                  {t("backup.selectAll")}
                </Button>
                <i />
                <Button
                  type="text"
                  size="small"
                  disabled={allSelecting || searching}
                  onClick={() => void setAllVisible(false)}
                >
                  {t("backup.clear")}
                </Button>
              </span>
            </div>
            <Input
              className="ddl-table-search"
              aria-label={t("ddl.tableSelection")}
              prefix={
                <button
                  type="button"
                  className="input-search-trigger"
                  aria-label={t("common.search")}
                  title={t("common.search")}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={submitTableSearch}
                >
                  <SearchOutlined />
                </button>
              }
              allowClear
              value={draftQuery}
              placeholder={t("ddl.searchPlaceholder")}
              onChange={(event) => setDraftQuery(event.target.value)}
              onPressEnter={() => void submitTableSearch()}
              onClear={clearTableSearch}
            />
            <DdlTableTree
              groups={visibleGroups}
              selectedIds={selectedIds}
              selectedGroupCounts={selectionMetrics.groupCounts}
              expandedIds={expandedIds}
              loadingGroupIds={loadingGroupIds}
              groupErrors={groupErrors}
              searching={searching}
              queryActive={Boolean(query)}
              viewRevision={query}
              onToggleExpanded={toggleExpanded}
              onToggleGroup={(group, checked) =>
                void toggleGroup(group, checked)
              }
              onToggleTable={toggleTable}
              onRetryGroup={(group) => void ensureGroupTables(group.id, true)}
            />
            <div className="ddl-selection-summary">
              <span className="ddl-summary-check">
                <CheckCircleOutlined />
              </span>
              <span>
                <b>
                  {t("ddl.selectedTables", {
                    count: compactNumber(selectedIds.size, language),
                  })}
                </b>
                <small>
                  {t("ddl.fromPdms", {
                    count: selectedPdmCount,
                    fields: compactNumber(selectedFieldCount, language),
                  })}
                </small>
              </span>
              <strong>
                ≈ {Math.max(1, Math.ceil(selectedFieldCount * 0.18))} KB
              </strong>
            </div>
          </aside>

          <section className="ddl-generation-pane">
            <div className="ddl-config-panel">
              <div className="ddl-section-heading">
                <span>
                  <b>{t("ddl.configuration")}</b>
                  <small>{t("ddl.configurationHint")}</small>
                </span>
                <strong>
                  {t("ddl.supportedDatabases", {
                    count: options.databases.length,
                  })}
                </strong>
              </div>
              <div className="ddl-config-primary">
                <label className="ddl-config-field is-database">
                  <span>{t("ddl.targetDatabase")}</span>
                  <DatabaseSelect
                    value={config.database}
                    options={options.databases}
                    onChange={changeDatabase}
                  />
                </label>
                <label className="ddl-config-field">
                  <span>{t("ddl.targetVersion")}</span>
                  <ValueSelect
                    ariaLabel={t("ddl.targetVersion")}
                    value={config.version}
                    options={(currentDatabase?.versions || []).map(
                      (version) => ({ value: version }),
                    )}
                    onChange={(value) => updateConfig("version", value)}
                  />
                </label>
                <label className="ddl-config-field">
                  <span>
                    {config.database === "mysql" || config.database === "tdsql"
                      ? t("ddl.database")
                      : t("ddl.schemaMode")}
                  </span>
                  <Input
                    aria-label={t("ddl.schemaMode")}
                    value={config.schema}
                    placeholder={
                      config.database === "ignite"
                        ? "PUBLIC"
                        : t("ddl.schemaPlaceholder")
                    }
                    onChange={(event) =>
                      updateConfig("schema", event.target.value)
                    }
                  />
                </label>
              </div>
              <div className={`ddl-config-secondary is-${config.database}`}>
                <div className="ddl-generation-options">
                  <span>{t("ddl.generatedContent")}</span>
                  <div>
                    <Checkbox
                      checked={config.include_comments}
                      onChange={(event) =>
                        updateConfig("include_comments", event.target.checked)
                      }
                    >
                      {t("ddl.tableAndFieldComments")}
                    </Checkbox>
                    <Checkbox
                      checked={config.drop_table}
                      onChange={(event) =>
                        updateConfig("drop_table", event.target.checked)
                      }
                    >
                      DROP TABLE
                    </Checkbox>
                    {["mysql", "tdsql", "ignite"].includes(config.database) ? (
                      <Checkbox
                        checked={config.if_not_exists}
                        onChange={(event) =>
                          updateConfig("if_not_exists", event.target.checked)
                        }
                      >
                        IF NOT EXISTS
                      </Checkbox>
                    ) : null}
                    {config.database === "ignite" ? (
                      <Checkbox
                        checked={config.ignite_affinity_key}
                        onChange={(event) =>
                          updateConfig(
                            "ignite_affinity_key",
                            event.target.checked,
                          )
                        }
                      >
                        {t("ddl.firstPrimaryKey")}
                      </Checkbox>
                    ) : null}
                  </div>
                </div>
                {renderDynamicConfig()}
              </div>
            </div>

            <div className="ddl-preview-panel">
              <div className="ddl-preview-tabs">
                <span>
                  <button
                    type="button"
                    className={activeTab === "script" ? "is-active" : ""}
                    onClick={() => activatePreviewTab("script")}
                  >
                    {t("ddl.scriptPreview")}
                  </button>
                  <button
                    type="button"
                    className={activeTab === "problems" ? "is-active" : ""}
                    onClick={() => activatePreviewTab("problems")}
                  >
                    {t("ddl.problemCheck", {
                      count: result ? result.warning_count : "—",
                    })}
                  </button>
                </span>
                <small>
                  {result
                    ? `${result.table_count} TABLES · ${result.column_count} COLUMNS · UTF-8`
                    : t("ddl.notGenerated")}
                </small>
              </div>
              {activeTab === "script" ? (
                <div className="ddl-script-view">
                  {result?.warning_count ? (
                    <button
                      type="button"
                      className="ddl-warning-banner"
                      onClick={() => activatePreviewTab("problems")}
                    >
                      <WarningOutlined />
                      <b>
                        {t("ddl.conversionWarnings", {
                          count: result.warning_count,
                        })}
                      </b>
                      <span>{result.warnings[0]?.message}</span>
                      <em>{t("ddl.viewDetails")}</em>
                    </button>
                  ) : result ? (
                    <div className="ddl-success-banner">
                      <CheckCircleOutlined /> {t("ddl.noConversionIssues")}
                    </div>
                  ) : null}
                  <div className="ddl-editor-toolbar">
                    <span>{t("ddl.sqlScript")}</span>
                    {result ? (
                      <Tag color="green" icon={<EditOutlined />}>
                        {t("ddl.editable")}
                      </Tag>
                    ) : null}
                    {edited ? <Tag color="blue">{t("ddl.changed")}</Tag> : null}
                    {stale ? (
                      <Tag color="orange">{t("ddl.configurationChanged")}</Tag>
                    ) : null}
                    <small>
                      {result
                        ? t("ddl.editorStats", {
                            lines: editorStats.lineCount,
                            chars: editorStats.charCount,
                          })
                        : t("ddl.editorStats", { lines: 0, chars: 0 })}
                    </small>
                  </div>
                  {result ? (
                    <Suspense
                      fallback={
                        <div className="ddl-editor-loading">
                          <Spin size="small" /> {t("ddl.openingEditor")}
                        </div>
                      }
                    >
                      <DdlScriptEditor
                        key={editorRevision}
                        value={scriptValueRef.current}
                        onDirty={markScriptDirty}
                        onStats={(lineCount, charCount) =>
                          setEditorStats({ lineCount, charCount })
                        }
                        editorViewRef={scriptEditorViewRef}
                      />
                    </Suspense>
                  ) : (
                    <div className="ddl-script-empty">
                      <span>
                        <FileTextOutlined />
                      </span>
                      <b>{t("ddl.scriptNotGenerated")}</b>
                      <p>{t("ddl.scriptNotGeneratedHint")}</p>
                      <Tag>
                        {t("ddl.currentTarget", {
                          database: databaseLabel(
                            config.database,
                            currentDatabase?.label,
                            language,
                          ),
                          version: config.version,
                        })}
                      </Tag>
                    </div>
                  )}
                </div>
              ) : (
                <div className="ddl-problem-list">
                  {result?.warnings.length ? (
                    result.warnings.map((warning, index) => (
                      <div
                        className={`ddl-problem-item is-${warning.severity}`}
                        key={`${warning.code}-${warning.table_id}-${warning.field_code}-${index}`}
                      >
                        <span>{warningIcon(warning)}</span>
                        <span>
                          <b>{warning.message}</b>
                          <small>
                            {[
                              warning.table_code &&
                                `${t("table.name")} ${warning.table_code}`,
                              warning.field_code &&
                                `${t("common.field")} ${warning.field_code}`,
                              warning.code,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </small>
                        </span>
                      </div>
                    ))
                  ) : (
                    <div className="ddl-problem-empty">
                      {result ? (
                        <CheckCircleOutlined />
                      ) : (
                        <InfoCircleOutlined />
                      )}
                      <b>{result ? t("ddl.noIssues") : t("ddl.checkNotRun")}</b>
                      <span>
                        {result
                          ? t("ddl.resultEditable")
                          : t("ddl.warningHint")}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>
        </div>
      ) : null}
    </DraggableModal>
  );
}
