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
  Modal,
  Select,
  Spin,
  Tag,
  Tooltip,
} from "antd";

import { api } from "../api";
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
  import("./DdlScriptEditor").then((module) => ({ default: module.DdlScriptEditor })),
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

const DEFAULT_CONFIG: DdlConfig = {
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


function DatabaseLogo({ database }: { database: DdlDatabase }) {
  if (database === "mysql") {
    return (
      <span className="ddl-database-logo is-mysql" aria-hidden="true">
        <svg viewBox="0 0 42 30">
          <path d="M6 20c5-9 12-13 23-12-3 2-5 5-5 8 4-1 8 0 11 3-4-1-8 0-11 2-5 3-11 3-18-1Z" />
          <path d="M28 8c4 1 7 3 9 6-3-1-6-1-9 0" />
          <text x="7" y="26">MySQL</text>
        </svg>
      </span>
    );
  }
  if (database === "oracle") {
    return (
      <span className="ddl-database-logo is-oracle" aria-hidden="true">
        <svg viewBox="0 0 42 30">
          <path d="M12 7h18a8 8 0 0 1 0 16H12A8 8 0 0 1 12 7Zm1 5a3 3 0 0 0 0 6h16a3 3 0 0 0 0-6Z" />
          <text x="9" y="28">ORACLE</text>
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
          <text x="27" y="19">DM</text>
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
          <text x="15" y="28">TDSQL</text>
        </svg>
      </span>
    );
  }
  return (
    <span className="ddl-database-logo is-ignite" aria-hidden="true">
      <svg viewBox="0 0 42 30">
        <path className="ignite-flame-a" d="M18 3c2 6-5 7-3 14 1 4 5 7 9 6 5-2 6-8 2-12-1 4-4 4-4 0 0-3-1-6-4-8Z" />
        <path className="ignite-flame-b" d="M14 8c-5 5-4 12 1 16-7-2-9-9-5-14 1-1 2-2 4-2Z" />
        <text x="27" y="19">IG</text>
      </svg>
    </span>
  );
}


function optionText(option: DdlValueOption): string {
  return [option.value, option.label, option.description, option.default_collation, option.charset]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase();
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
  return (
    <Select
      aria-label={ariaLabel}
      className="ddl-system-select"
      classNames={{ popup: { root: "ddl-system-select-popup" } }}
      value={value}
      showSearch={searchable}
      optionFilterProp="searchText"
      filterOption={(input, option) =>
        String(option?.searchText || "").toLocaleLowerCase().includes(input.toLocaleLowerCase())
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
              {option.recommended ? <em>推荐</em> : null}
              {option.default_for_charset && !option.recommended ? <em>默认</em> : null}
              {option.deprecated ? <em className="is-muted">已弃用</em> : null}
              {option.optional ? <em className="is-muted">可选组件</em> : null}
            </span>
            {option.description || option.default_collation ? (
              <small>
                {option.description}
                {option.default_collation ? ` · 默认排序规则 ${option.default_collation}` : ""}
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
  const selected = options.find((option) => option.value === value);
  return (
    <Select
      aria-label="目标数据库"
      className="ddl-system-select ddl-database-select"
      classNames={{ popup: { root: "ddl-system-select-popup ddl-database-select-popup" } }}
      value={value}
      options={options.map((option) => ({ value: option.value, label: option.label, source: option }))}
      labelRender={() => (
        <span className="ddl-database-selection">
          <DatabaseLogo database={value} />
          <span>
            <b>{selected?.label || value}</b>
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
              <b>{option.label}</b>
              <small>{option.description} · {option.versions.join(" / ")}</small>
            </span>
          </div>
        );
      }}
      onChange={onChange}
    />
  );
}


function scopeIncludesGroup(node: WorkspaceNode | null, group: DdlCatalogGroup): boolean {
  if (!node || node.type === "project") return true;
  if (node.type === "pdm") {
    return node.pdm_id === group.id || node.relative_path === group.relative_path;
  }
  const prefix = node.relative_path.replace(/\/+$/, "");
  return !prefix || group.relative_path.startsWith(`${prefix}/`);
}


function mergeCatalogGroups(base: DdlCatalog, hydrated: DdlCatalog): DdlCatalog {
  const hydratedById = new Map(hydrated.groups.map((group) => [group.id, group]));
  return {
    ...base,
    groups: base.groups.map((group) => hydratedById.get(group.id) || group),
  };
}


function cacheCatalogTables(target: Map<string, DdlCatalogTable>, groups: DdlCatalogGroup[]) {
  groups.forEach((group) => group.tables.forEach((table) => target.set(table.id, table)));
}


function compactNumber(value: number): string {
  return new Intl.NumberFormat("zh-CN").format(value);
}


function cleanFileName(value: string): string {
  return value.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").replace(/[. ]+$/g, "").slice(0, 120) || "码熊建表脚本";
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
  const [options, setOptions] = useState<DdlOptions | null>(null);
  const [catalog, setCatalog] = useState<DdlCatalog | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [reloadRevision, setReloadRevision] = useState(0);
  const [draftQuery, setDraftQuery] = useState("");
  const [query, setQuery] = useState("");
  const [searchGroups, setSearchGroups] = useState<DdlCatalogGroup[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [loadingGroupIds, setLoadingGroupIds] = useState<Set<string>>(new Set());
  const [groupErrors, setGroupErrors] = useState<Map<string, string>>(new Map());
  const [allSelecting, setAllSelecting] = useState(false);
  const [config, setConfig] = useState<DdlConfig>(DEFAULT_CONFIG);
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<DdlGenerateMeta | null>(null);
  const [scriptDirty, setScriptDirty] = useState(false);
  const [editorRevision, setEditorRevision] = useState(0);
  const [editorStats, setEditorStats] = useState({ lineCount: 0, charCount: 0 });
  const [generatedSignature, setGeneratedSignature] = useState("");
  const [activeTab, setActiveTab] = useState<PreviewTab>("script");
  const generateAbortRef = useRef<AbortController | null>(null);
  const searchAbortRef = useRef<AbortController | null>(null);
  const groupLoadControllersRef = useRef<Map<string, AbortController>>(new Map());
  const groupLoadPromisesRef = useRef<Map<string, Promise<DdlCatalogGroup | null>>>(new Map());
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
          api.ddlOptions(),
          api.ddlCatalog(project.id, { includeTables: false }, controller.signal),
        ]);
        if (controller.signal.aborted) return;
        const projectScope = !selectedNode || selectedNode.type === "project";
        const scopedGroups = projectScope
          ? summaryCatalog.groups
          : summaryCatalog.groups.filter((group) => scopeIncludesGroup(selectedNode, group));
        const expansionSource = scopedGroups.length ? scopedGroups : summaryCatalog.groups;
        const initialExpandedGroups = expansionSource.length > 8
          ? expansionSource.slice(0, 2)
          : expansionSource;
        const hydrateIds = projectScope
          ? initialExpandedGroups.map((group) => group.id)
          : scopedGroups.map((group) => group.id);
        let nextCatalog = summaryCatalog;
        if (hydrateIds.length) {
          const hydratedCatalog = await api.ddlCatalog(
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
        const database = nextOptions.databases.find((item) => item.value === "mysql") || nextOptions.databases[0];
        setConfig({
          ...DEFAULT_CONFIG,
          database: database.value,
          version: database.default_version,
        });
        const hydratedScopeGroups = projectScope
          ? []
          : nextCatalog.groups.filter((group) => scopeIncludesGroup(selectedNode, group));
        const scopedTableIds = hydratedScopeGroups.flatMap((group) => group.tables.map((table) => table.id));
        setSelectedIds(new Set(scopedTableIds));
        if (!projectScope && !scopedGroups.length) {
          message.warning("当前节点下没有可导出的数据表");
        }
        setExpandedIds(new Set(initialExpandedGroups.map((group) => group.id)));
      } catch (error) {
        if (!controller.signal.aborted) {
          setLoadError(error instanceof Error ? error.message : "无法读取导出数据");
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    void loadCatalog();
    return () => {
      controller.abort();
      searchAbortRef.current?.abort();
      groupLoadControllersRef.current.forEach((pendingController) => pendingController.abort());
      groupLoadControllersRef.current.clear();
      groupLoadPromisesRef.current.clear();
    };
  }, [open, project?.id, reloadRevision, selectedNode?.id]);

  useEffect(
    () => () => {
      generateAbortRef.current?.abort();
      searchAbortRef.current?.abort();
      groupLoadControllersRef.current.forEach((controller) => controller.abort());
    },
    [],
  );

  const currentDatabase = options?.databases.find((item) => item.value === config.database) || null;
  const currentSignature = useMemo(
    () => JSON.stringify({ tableIds: [...selectedIds].sort(), config }),
    [config, selectedIds],
  );
  const stale = Boolean(result && generatedSignature !== currentSignature);
  const edited = Boolean(result && scriptDirty);
  const visibleGroups = query ? (searchGroups || []) : (catalog?.groups || []);

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

  const updateConfig = <K extends keyof DdlConfig>(key: K, value: DdlConfig[K]) => {
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
      const searchCatalog = await api.ddlCatalog(
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
        message.error(error instanceof Error ? error.message : "搜索数据表失败");
      }
    } finally {
      if (searchAbortRef.current === controller) {
        searchAbortRef.current = null;
        setSearching(false);
      }
    }
  };

  const changeCharset = (charset: string) => {
    const charsetOption = options?.mysql_character_sets.find((item) => item.value === charset);
    const defaultCollation = charsetOption?.default_collation
      || options?.mysql_collations.find((item) => item.charset === charset && item.default_for_charset)?.value
      || "";
    setConfig((current) => ({ ...current, charset, collation: defaultCollation }));
  };

  const changeDatabase = (database: DdlDatabase) => {
    const databaseOption = options?.databases.find((item) => item.value === database);
    if (!databaseOption) return;
    setConfig((current) => ({
      ...current,
      database,
      version: databaseOption.default_version,
      schema: database === "ignite" && !current.schema ? "PUBLIC" : current.schema,
    }));
  };

  const ensureGroupTables = (groupId: string, force = false): Promise<DdlCatalogGroup | null> => {
    if (!project) return Promise.resolve(null);
    const cachedGroup = catalog?.groups.find((group) => group.id === groupId);
    if (!force && cachedGroup?.tables_loaded) return Promise.resolve(cachedGroup);
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
    const promise = api.ddlCatalog(
      project.id,
      { includeTables: true, pdmIds: [groupId] },
      controller.signal,
    )
      .then((nextCatalog) => {
        if (controller.signal.aborted) return null;
        const hydratedGroup = nextCatalog.groups[0] || null;
        if (!hydratedGroup) throw new Error("该 PDM 已不存在，请重新打开导出窗口");
        cacheCatalogTables(tableByIdRef.current, [hydratedGroup]);
        setCatalog((current) => current ? mergeCatalogGroups(current, nextCatalog) : current);
        return hydratedGroup;
      })
      .catch((error) => {
        if (controller.signal.aborted) return null;
        const errorMessage = error instanceof Error ? error.message : "读取数据表失败";
        setGroupErrors((current) => new Map(current).set(groupId, errorMessage));
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
      const visibleTableIds = visibleGroups.flatMap((group) => group.tables.map((table) => table.id));
      setSelectedIds((current) => {
        const next = new Set(current);
        visibleTableIds.forEach((tableId) => next.delete(tableId));
        return next;
      });
      return;
    }
    if (query) {
      cacheCatalogTables(tableByIdRef.current, visibleGroups);
      const visibleTableIds = visibleGroups.flatMap((group) => group.tables.map((table) => table.id));
      setSelectedIds((current) => new Set([...current, ...visibleTableIds]));
      return;
    }
    if (!project) return;
    setAllSelecting(true);
    try {
      const fullCatalog = await api.ddlCatalog(project.id, { includeTables: true });
      cacheCatalogTables(tableByIdRef.current, fullCatalog.groups);
      setCatalog((current) => current ? mergeCatalogGroups(current, fullCatalog) : fullCatalog);
      setSelectedIds(new Set(fullCatalog.groups.flatMap((group) => group.tables.map((table) => table.id))));
    } catch (error) {
      message.error(error instanceof Error ? error.message : "全选数据表失败");
    } finally {
      setAllSelecting(false);
    }
  };

  const toggleGroup = async (group: DdlCatalogGroup, checked: boolean) => {
    const targetGroup = query || group.tables_loaded ? group : await ensureGroupTables(group.id);
    if (!targetGroup) return;
    cacheCatalogTables(tableByIdRef.current, [targetGroup]);
    setSelectedIds((current) => {
      const next = new Set(current);
      targetGroup.tables.forEach((table) => (checked ? next.add(table.id) : next.delete(table.id)));
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
    if (expanding && !query && !group.tables_loaded) void ensureGroupTables(group.id);
  };

  const markScriptDirty = () => {
    if (scriptDirtyRef.current) return;
    scriptDirtyRef.current = true;
    setScriptDirty(true);
  };

  const getCurrentScript = () => scriptEditorViewRef.current?.state.doc.toString() ?? scriptValueRef.current;

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
      message.warning("请至少选择一张数据表");
      return;
    }
    generateAbortRef.current?.abort();
    const controller = new AbortController();
    generateAbortRef.current = controller;
    const signature = currentSignature;
    setGenerating(true);
    try {
      const nextResult = await api.generateDdl([...selectedIds], config, controller.signal);
      if (controller.signal.aborted) return;
      const { script: nextScript, ...nextMeta } = nextResult;
      scriptValueRef.current = nextScript;
      scriptDirtyRef.current = false;
      setResult(nextMeta);
      setScriptDirty(false);
      setEditorStats({ lineCount: nextResult.line_count, charCount: nextResult.char_count });
      setEditorRevision((value) => value + 1);
      setGeneratedSignature(signature);
      setActiveTab("script");
      message.success(`已生成 ${nextResult.table_count} 张表的 ${nextResult.database_label} 脚本`);
    } catch (error) {
      if (!controller.signal.aborted) {
        message.error(error instanceof Error ? error.message : "生成脚本失败");
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
      message.success("SQL 已复制到剪贴板");
    } catch {
      const textArea = document.createElement("textarea");
      textArea.value = script;
      textArea.style.position = "fixed";
      textArea.style.opacity = "0";
      document.body.appendChild(textArea);
      textArea.select();
      const copied = document.execCommand("copy");
      textArea.remove();
      if (copied) message.success("SQL 已复制到剪贴板");
      else message.error("复制失败，请在编辑区手动复制");
    }
  };

  const downloadScript = () => {
    const script = getCurrentScript();
    if (!script || !project) return;
    const fileName = cleanFileName(
      `${project.name}_${result?.database_label || currentDatabase?.label || config.database}_${result?.version || config.version}`,
    ) + (result?.extension || ".sql");
    const url = URL.createObjectURL(new Blob([script], { type: "text/sql;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    message.success(`已下载 ${fileName}`);
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
      const collations = options.mysql_collations.filter((item) => item.charset === config.charset);
      return (
        <>
          <label className="ddl-config-field">
            <span>存储引擎</span>
            <ValueSelect
              ariaLabel="存储引擎"
              value={config.engine}
              options={options.mysql_storage_engines}
              searchable
              onChange={(value) => updateConfig("engine", value)}
            />
          </label>
          <label className="ddl-config-field">
            <span>
              字符集（{options.mysql_character_sets.length}）
              <Tooltip title="MySQL 8.x 完整字符集清单；utf8mb4 为推荐默认值">
                <InfoCircleOutlined />
              </Tooltip>
            </span>
            <ValueSelect
              ariaLabel="字符集"
              value={config.charset}
              options={options.mysql_character_sets}
              searchable
              onChange={changeCharset}
            />
          </label>
          <label className="ddl-config-field">
            <span>
              排序规则（{collations.length}）
              <Tooltip title="排序规则随字符集联动；utf8mb4 包含 utf8mb4_0900_bin 等 89 项规则">
                <InfoCircleOutlined />
              </Tooltip>
            </span>
            <ValueSelect
              ariaLabel="排序规则"
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
            <span>表类型</span>
            <ValueSelect
              ariaLabel="TDSQL 表类型"
              value={config.tdsql_mode}
              options={options.tdsql_table_modes}
              onChange={(value) => updateConfig("tdsql_mode", value as DdlConfig["tdsql_mode"])}
            />
          </label>
          <label className="ddl-config-field">
            <span>字符集（{options.mysql_character_sets.length}）</span>
            <ValueSelect
              ariaLabel="TDSQL 字符集"
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
          <span>表空间（可选）</span>
          <Input
            aria-label="表空间"
            value={config.tablespace}
            placeholder="留空则使用数据库默认表空间"
            onChange={(event) => updateConfig("tablespace", event.target.value)}
          />
        </label>
      );
    }
    return (
      <>
        <label className="ddl-config-field">
          <span>缓存模板</span>
          <ValueSelect
            ariaLabel="Ignite 缓存模板"
            value={config.ignite_template}
            options={options.ignite_templates}
            onChange={(value) => updateConfig("ignite_template", value as DdlConfig["ignite_template"])}
          />
        </label>
        <label className="ddl-config-field is-number">
          <span>备份副本</span>
          <InputNumber
            aria-label="Ignite 备份副本"
            min={0}
            max={10}
            precision={0}
            value={config.ignite_backups}
            onChange={(value) => updateConfig("ignite_backups", value ?? 0)}
          />
        </label>
        <label className="ddl-config-field">
          <span>原子性模式</span>
          <ValueSelect
            ariaLabel="Ignite 原子性模式"
            value={config.ignite_atomicity}
            options={options.ignite_atomicity_modes}
            onChange={(value) => updateConfig("ignite_atomicity", value as DdlConfig["ignite_atomicity"])}
          />
        </label>
        <label className="ddl-config-field">
          <span>写同步模式</span>
          <ValueSelect
            ariaLabel="Ignite 写同步模式"
            value={config.ignite_write_sync}
            options={options.ignite_write_sync_modes}
            onChange={(value) => updateConfig("ignite_write_sync", value as DdlConfig["ignite_write_sync"])}
          />
        </label>
        <label className="ddl-config-field">
          <span>缓存组（可选）</span>
          <Input
            aria-label="Ignite 缓存组"
            value={config.ignite_cache_group}
            placeholder="例如 INVESTMENT"
            onChange={(event) => updateConfig("ignite_cache_group", event.target.value)}
          />
        </label>
      </>
    );
  };

  const footerStatus = generating
    ? "正在生成脚本…"
    : result
      ? stale
        ? "配置或选表已变化，请重新生成"
        : edited
          ? "脚本已生成并经过手动编辑"
          : `生成完成 · ${result.table_count} 张表，${result.warning_count} 项提醒`
      : selectedIds.size
        ? `等待生成 · 已选 ${selectedIds.size} 张表`
        : "请选择要导出的数据表";

  return (
    <Modal
      open={open}
      title={
        <div className="ddl-modal-title">
          <span className="ddl-title-icon"><CodeOutlined /></span>
          <span className="ddl-title-copy">
            <span><b>导出建表脚本</b><Tag color="blue">V1 · 基础可用</Tag></span>
            <small>把 PDM 中的表结构转换为目标数据库可执行的 DDL</small>
          </span>
          <span className="ddl-title-flow">
            <span><FileTextOutlined /> PDM · {selectedIds.size} 张表</span>
            <i>→</i>
            <span className="is-target">
              <DatabaseLogo database={config.database} />
              {currentDatabase?.label || "目标数据库"} {config.version} · .sql
            </span>
          </span>
        </div>
      }
      className="ddl-export-modal"
      width="min(1680px, calc(100vw - 40px))"
      centered
      destroyOnHidden
      mask={{ closable: false }}
      keyboard={!generating}
      onCancel={closeModal}
      footer={
        <div className="ddl-modal-footer">
          <span className={`ddl-footer-status${result && !stale ? " is-ready" : ""}${stale ? " is-stale" : ""}`}>
            <i />
            <b>{footerStatus}</b>
            {hasUnsavedChanges ? <small>当前字段页有未保存修改，本次生成使用已保存内容</small> : null}
          </span>
          <span className="ddl-footer-actions">
            <Button icon={<CopyOutlined />} disabled={!result || generating} onClick={() => void copyScript()}>
              复制 SQL
            </Button>
            <Button icon={<DownloadOutlined />} disabled={!result || generating} onClick={downloadScript}>
              下载 .sql
            </Button>
            <Button
              type="primary"
              icon={result ? <ReloadOutlined /> : <CodeOutlined />}
              loading={generating}
              disabled={!selectedIds.size || loading || Boolean(loadError)}
              onClick={() => void generateScript()}
            >
              {result ? "重新生成" : "生成脚本"}
            </Button>
          </span>
        </div>
      }
    >
      {loading ? (
        <div className="ddl-modal-loading"><Spin size="large" /><span>正在读取项目中的 PDM 和数据表…</span></div>
      ) : loadError ? (
        <div className="ddl-modal-error">
          <Alert type="error" showIcon message="无法打开导出功能" description={loadError} />
          <Button icon={<ReloadOutlined />} onClick={() => setReloadRevision((value) => value + 1)}>重新加载</Button>
        </div>
      ) : options && catalog ? (
        <div className="ddl-modal-body">
          <aside className="ddl-table-picker">
            <div className="ddl-section-heading">
              <span>
                <b>选择数据表</b>
                <small>
                  {!selectedNode || selectedNode.type === "project"
                    ? "项目入口默认不选表，请按 PDM 勾选；展开时按需加载"
                    : "已按当前节点预选，可继续按 PDM 展开、收起或调整"}
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
                  全选
                </Button>
                <i />
                <Button
                  type="text"
                  size="small"
                  disabled={allSelecting || searching}
                  onClick={() => void setAllVisible(false)}
                >
                  清空
                </Button>
              </span>
            </div>
            <Input
              className="ddl-table-search"
              aria-label="搜索 PDM 或数据表"
              prefix={(
                <button
                  type="button"
                  className="input-search-trigger"
                  aria-label="搜索 PDM 或数据表"
                  title="搜索"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={submitTableSearch}
                >
                  <SearchOutlined />
                </button>
              )}
              allowClear
              value={draftQuery}
              placeholder="搜索 PDM、表名、表英文名或描述"
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
              onToggleGroup={(group, checked) => void toggleGroup(group, checked)}
              onToggleTable={toggleTable}
              onRetryGroup={(group) => void ensureGroupTables(group.id, true)}
            />
            <div className="ddl-selection-summary">
              <span className="ddl-summary-check"><CheckCircleOutlined /></span>
              <span>
                <b>已选择 {compactNumber(selectedIds.size)} 张表</b>
                <small>来自 {selectedPdmCount} 个 PDM，共 {compactNumber(selectedFieldCount)} 个字段</small>
              </span>
              <strong>≈ {Math.max(1, Math.ceil(selectedFieldCount * 0.18))} KB</strong>
            </div>
          </aside>

          <section className="ddl-generation-pane">
            <div className="ddl-config-panel">
              <div className="ddl-section-heading">
                <span>
                  <b>生成配置</b>
                  <small>选择目标数据库并设置基础参数；变更配置不会自动覆盖已编辑脚本</small>
                </span>
                <strong>已支持 {options.databases.length} 种数据库</strong>
              </div>
              <div className="ddl-config-primary">
                <label className="ddl-config-field is-database">
                  <span>目标数据库</span>
                  <DatabaseSelect value={config.database} options={options.databases} onChange={changeDatabase} />
                </label>
                <label className="ddl-config-field">
                  <span>目标版本</span>
                  <ValueSelect
                    ariaLabel="目标版本"
                    value={config.version}
                    options={(currentDatabase?.versions || []).map((version) => ({ value: version }))}
                    onChange={(value) => updateConfig("version", value)}
                  />
                </label>
                <label className="ddl-config-field">
                  <span>{config.database === "mysql" || config.database === "tdsql" ? "数据库" : "Schema / 模式"}</span>
                  <Input
                    aria-label="数据库或 Schema"
                    value={config.schema}
                    placeholder={config.database === "ignite" ? "PUBLIC" : "留空则不限定"}
                    onChange={(event) => updateConfig("schema", event.target.value)}
                  />
                </label>
              </div>
              <div className={`ddl-config-secondary is-${config.database}`}>
                <div className="ddl-generation-options">
                  <span>生成内容</span>
                  <div>
                    <Checkbox checked={config.include_comments} onChange={(event) => updateConfig("include_comments", event.target.checked)}>
                      表与字段注释
                    </Checkbox>
                    <Checkbox checked={config.drop_table} onChange={(event) => updateConfig("drop_table", event.target.checked)}>
                      DROP TABLE
                    </Checkbox>
                    {["mysql", "tdsql", "ignite"].includes(config.database) ? (
                      <Checkbox checked={config.if_not_exists} onChange={(event) => updateConfig("if_not_exists", event.target.checked)}>
                        IF NOT EXISTS
                      </Checkbox>
                    ) : null}
                    {config.database === "ignite" ? (
                      <Checkbox checked={config.ignite_affinity_key} onChange={(event) => updateConfig("ignite_affinity_key", event.target.checked)}>
                        首主键作亲和键
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
                  <button type="button" className={activeTab === "script" ? "is-active" : ""} onClick={() => activatePreviewTab("script")}>脚本预览</button>
                  <button type="button" className={activeTab === "problems" ? "is-active" : ""} onClick={() => activatePreviewTab("problems")}>问题检查 {result ? result.warning_count : "—"}</button>
                </span>
                <small>
                  {result ? `${result.table_count} TABLES · ${result.column_count} COLUMNS · UTF-8` : "尚未生成"}
                </small>
              </div>
              {activeTab === "script" ? (
                <div className="ddl-script-view">
                  {result?.warning_count ? (
                    <button type="button" className="ddl-warning-banner" onClick={() => activatePreviewTab("problems")}>
                      <WarningOutlined />
                      <b>{result.warning_count} 项转换提醒</b>
                      <span>{result.warnings[0]?.message}</span>
                      <em>查看详情</em>
                    </button>
                  ) : result ? (
                    <div className="ddl-success-banner"><CheckCircleOutlined /> 未发现需要人工确认的转换问题</div>
                  ) : null}
                  <div className="ddl-editor-toolbar">
                    <span>SQL 脚本</span>
                    {result ? <Tag color="green" icon={<EditOutlined />}>可直接编辑</Tag> : null}
                    {edited ? <Tag color="blue">已修改</Tag> : null}
                    {stale ? <Tag color="orange">配置已变化</Tag> : null}
                    <small>{result ? `${editorStats.lineCount} 行 · ${editorStats.charCount} 字符` : "0 行 · 0 字符"}</small>
                  </div>
                  {result ? (
                    <Suspense fallback={<div className="ddl-editor-loading"><Spin size="small" /> 正在打开大文档编辑器…</div>}>
                      <DdlScriptEditor
                        key={editorRevision}
                        value={scriptValueRef.current}
                        onDirty={markScriptDirty}
                        onStats={(lineCount, charCount) => setEditorStats({ lineCount, charCount })}
                        editorViewRef={scriptEditorViewRef}
                      />
                    </Suspense>
                  ) : (
                    <div className="ddl-script-empty">
                      <span><FileTextOutlined /></span>
                      <b>尚未生成脚本</b>
                      <p>确认左侧表范围和上方数据库配置后，点击底部“生成脚本”。生成结果会出现在这里，并可继续编辑。</p>
                      <Tag>当前目标 · {currentDatabase?.label} {config.version}</Tag>
                    </div>
                  )}
                </div>
              ) : (
                <div className="ddl-problem-list">
                  {result?.warnings.length ? result.warnings.map((warning, index) => (
                    <div className={`ddl-problem-item is-${warning.severity}`} key={`${warning.code}-${warning.table_id}-${warning.field_code}-${index}`}>
                      <span>{warningIcon(warning)}</span>
                      <span>
                        <b>{warning.message}</b>
                        <small>
                          {[warning.table_code && `表 ${warning.table_code}`, warning.field_code && `字段 ${warning.field_code}`, warning.code]
                            .filter(Boolean)
                            .join(" · ")}
                        </small>
                      </span>
                    </div>
                  )) : (
                    <div className="ddl-problem-empty">
                      {result ? <CheckCircleOutlined /> : <InfoCircleOutlined />}
                      <b>{result ? "未发现转换问题" : "尚未执行问题检查"}</b>
                      <span>{result ? "当前生成结果可以继续编辑或下载。" : "生成脚本后，这里会列出类型映射、分表键和兼容性提醒。"}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>
        </div>
      ) : null}
    </Modal>
  );
}
