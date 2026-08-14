import { useCallback, useEffect, useRef, useState } from "react";
import { App as AntApp, Button, Tag } from "antd";
import {
  BookOutlined,
  CodeOutlined,
  DeleteOutlined,
  SafetyCertificateOutlined,
} from "@ant-design/icons";
import { tablesApi } from "./features/tables/api";
import { workspaceApi } from "./features/workspace/api";
import { ApiError } from "./shared/api/client";
import { FieldPanel } from "./components/FieldPanel";
import { ProjectNavigator } from "./components/ProjectNavigator";
import { ProjectGlyph } from "./components/PrototypeGlyphs";
import { TablePanel } from "./components/TablePanel";
import { useAiLayout } from "./features/ai/useAiLayout";
import { LazyFeatureOverlays } from "./features/shell/LazyFeatureOverlays";
import {
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
  useSidebarResize,
} from "./features/shell/useSidebarResize";
import { TrashModal } from "./features/workspace/components/TrashModal";
import { WorkspaceDialog } from "./features/workspace/components/WorkspaceDialog";
import {
  errorMessage,
  getProjectId,
  normalizeWorkspacePath,
  pathParent,
  projectForNode,
  walkNodes,
} from "./features/workspace/model";
import type { DialogKind, DialogState } from "./features/workspace/model";
import type {
  AiEvidenceTable,
  BackupImportResult,
  FieldDefinition,
  Project,
  SearchMode,
  Settings,
  TableDetail,
  TableMetadataUpdate,
  TableSummary,
  TrashItem,
  WorkspaceNode,
} from "./types";

const TABLE_PAGE_SIZE = 100;
const TABLE_PREFETCH_ROWS = 50;

interface TableQuery {
  projectId?: string;
  scopeType: string;
  scopePath: string;
  mode: SearchMode;
  query: string;
  allNodes: boolean;
}


export default function App() {
  const { message, modal } = AntApp.useApp();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [trees, setTrees] = useState<WorkspaceNode[]>([]);
  const [selectedNode, setSelectedNode] = useState<WorkspaceNode | null>(null);
  const [navigationLoading, setNavigationLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tables, setTables] = useState<Array<TableSummary | undefined>>([]);
  const [tableTotal, setTableTotal] = useState(0);
  const [tableFieldTotal, setTableFieldTotal] = useState(0);
  const [tablePdmTotal, setTablePdmTotal] = useState(0);
  const [tableDatasetRevision, setTableDatasetRevision] = useState(0);
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [navigatorLocateRevision, setNavigatorLocateRevision] = useState(0);
  const [tableLoading, setTableLoading] = useState(false);
  const [detail, setDetail] = useState<TableDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [searchMode, setSearchMode] = useState<SearchMode>("table");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchRevision, setSearchRevision] = useState(0);
  const [allNodes, setAllNodes] = useState(false);
  const [revision, setRevision] = useState(0);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [dialog, setDialog] = useState<DialogState>({ kind: null });
  const [dialogValue, setDialogValue] = useState("");
  const [dialogBusy, setDialogBusy] = useState(false);
  const [trashOpen, setTrashOpen] = useState(false);
  const [backupOpen, setBackupOpen] = useState(false);
  const [backupFeatureLoaded, setBackupFeatureLoaded] = useState(false);
  const [ddlExportOpen, setDdlExportOpen] = useState(false);
  const [ddlFeatureLoaded, setDdlFeatureLoaded] = useState(false);
  const [dictionaryOpen, setDictionaryOpen] = useState(false);
  const [dictionaryFeatureLoaded, setDictionaryFeatureLoaded] = useState(false);
  const [dictionaryBindingRevision, setDictionaryBindingRevision] = useState(0);
  const {
    open: aiAssistantOpen,
    loaded: aiFeatureLoaded,
    mode: aiLayoutMode,
    lastNonFullscreenModeRef: lastNonFullscreenAiModeRef,
    changeMode: changeAiLayoutMode,
    changeOpen: changeAiAssistantOpen,
    openAssistant: openAiAssistant,
  } = useAiLayout();
  const [trashItems, setTrashItems] = useState<TrashItem[]>([]);
  const [trashLoading, setTrashLoading] = useState(false);
  const {
    appRootRef,
    sidebarResizerRef,
    sidebarResizing,
    rootStyle: appRootStyle,
    effectiveWidth: effectiveSidebarWidth,
    startResize: startSidebarResize,
    moveResize: moveSidebarResize,
    finishResize: finishSidebarResize,
    commitResize: commitSidebarResize,
    resizeWithKeyboard: resizeSidebarWithKeyboard,
  } = useSidebarResize();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const importTargetRef = useRef<WorkspaceNode | null>(null);
  const tableQueryRef = useRef<TableQuery | null>(null);
  const tableGenerationRef = useRef(0);
  const loadedTablePagesRef = useRef<Set<number>>(new Set());
  const pendingTablePagesRef = useRef<Set<number>>(new Set());
  const tableAbortControllersRef = useRef<Set<AbortController>>(new Set());
  const pendingAiTableIdRef = useRef<string | null>(null);
  const discardConfirmOpenRef = useRef(false);
  const workspaceChangeConfirmOpenRef = useRef(false);
  const allowForcedReloadRef = useRef(false);

  const loadWorkspace = useCallback(async (preferred?: WorkspaceNode | null) => {
    setNavigationLoading(true);
    try {
      const [nextSettings, nextProjects] = await Promise.all([
        workspaceApi.settings(),
        workspaceApi.projects(),
      ]);
      const nextTrees = await Promise.all(
        nextProjects.map((project) => workspaceApi.tree(project.id)),
      );
      setSettings(nextSettings);
      setProjects(nextProjects);
      setTrees(nextTrees);
      setSelectedNode((current) => {
        const target = preferred || current;
        if (target) {
          const targetProjectId = getProjectId(target);
          const matched = walkNodes(
            nextTrees,
            (node) =>
              (node.id === target.id ||
                (node.type === target.type && node.relative_path === target.relative_path)) &&
              getProjectId(node) === targetProjectId,
          );
          if (matched) return matched;
        }
        return nextTrees[0] || null;
      });
    } catch (error) {
      message.error(errorMessage(error));
    } finally {
      setNavigationLoading(false);
    }
  }, [message]);

  useEffect(() => {
    void loadWorkspace();
  }, [loadWorkspace]);

  const handleExternalWorkspaceChange = useCallback(
    (nextSettings: Settings): boolean => {
      if (
        !settings ||
        normalizeWorkspacePath(settings.workspace_root) ===
          normalizeWorkspacePath(nextSettings.workspace_root)
      ) {
        return false;
      }

      if (!hasUnsavedChanges) {
        window.location.reload();
        return true;
      }
      if (workspaceChangeConfirmOpenRef.current) return true;

      workspaceChangeConfirmOpenRef.current = true;
      modal.confirm({
        title: "检测到工作区已变化",
        content: `程序当前工作区已变为“${nextSettings.workspace_root}”。重新加载会放弃当前表尚未保存的修改。`,
        okText: "放弃修改并重新加载",
        cancelText: "暂不重新加载",
        okButtonProps: { danger: true },
        onOk: () => {
          allowForcedReloadRef.current = true;
          window.location.reload();
        },
        onCancel: () => {
          workspaceChangeConfirmOpenRef.current = false;
        },
        afterClose: () => {
          workspaceChangeConfirmOpenRef.current = false;
        },
      });
      return true;
    },
    [hasUnsavedChanges, modal, settings],
  );

  useEffect(() => {
    let active = true;
    let checking = false;

    const syncWorkspace = async () => {
      if (checking || document.visibilityState === "hidden") return;
      checking = true;
      try {
        const nextSettings = await workspaceApi.settings();
        if (!active) return;
        if (!settings) {
          setSettings(nextSettings);
          return;
        }
        if (handleExternalWorkspaceChange(nextSettings)) return;
        setSettings(nextSettings);
      } catch {
        // The local service may still be restarting; the next focus will retry.
      } finally {
        checking = false;
      }
    };

    const handleFocus = () => void syncWorkspace();
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") void syncWorkspace();
    };
    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      active = false;
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [handleExternalWorkspaceChange, settings]);

  const requestTablePage = useCallback(
    async (query: TableQuery, page: number, generation: number, initial = false) => {
      if (
        generation !== tableGenerationRef.current ||
        loadedTablePagesRef.current.has(page) ||
        pendingTablePagesRef.current.has(page)
      ) {
        return;
      }

      pendingTablePagesRef.current.add(page);
      const controller = new AbortController();
      tableAbortControllersRef.current.add(controller);
      if (initial) setTableLoading(true);

      try {
        const offset = page * TABLE_PAGE_SIZE;
        const result = await tablesApi.search({
          ...query,
          limit: TABLE_PAGE_SIZE,
          offset,
          signal: controller.signal,
        });
        if (generation !== tableGenerationRef.current) return;

        loadedTablePagesRef.current.add(page);
        setTables((current) => {
          const next: Array<TableSummary | undefined> =
            current.length === result.total ? current.slice() : new Array(result.total);
          result.items.forEach((table, index) => {
            next[offset + index] = table;
          });
          return next;
        });
        setTableTotal(result.total);
        setTableFieldTotal(result.field_total);
        setTablePdmTotal(result.pdm_total);
        if (page === 0) {
          const preferredTableId = pendingAiTableIdRef.current;
          setSelectedTableId(preferredTableId || result.items[0]?.id || null);
          if (preferredTableId) pendingAiTableIdRef.current = null;
        }
      } catch (error) {
        if (controller.signal.aborted || generation !== tableGenerationRef.current) return;
        if (initial) {
          setTables([]);
          setTableTotal(0);
          setTableFieldTotal(0);
          setTablePdmTotal(0);
          setSelectedTableId(null);
          pendingAiTableIdRef.current = null;
        }
        message.error(errorMessage(error));
      } finally {
        pendingTablePagesRef.current.delete(page);
        tableAbortControllersRef.current.delete(controller);
        if (initial && generation === tableGenerationRef.current) setTableLoading(false);
      }
    },
    [message],
  );

  const requestTableRange = useCallback(
    (startIndex: number, endIndex: number) => {
      const query = tableQueryRef.current;
      if (!query || endIndex <= startIndex) return;
      const generation = tableGenerationRef.current;
      const firstPage = Math.floor(Math.max(0, startIndex - TABLE_PREFETCH_ROWS) / TABLE_PAGE_SIZE);
      const lastPage = Math.floor(
        Math.max(startIndex, endIndex + TABLE_PREFETCH_ROWS - 1) / TABLE_PAGE_SIZE,
      );
      for (let page = firstPage; page <= lastPage; page += 1) {
        void requestTablePage(query, page, generation);
      }
    },
    [requestTablePage],
  );

  useEffect(() => {
    const generation = tableGenerationRef.current + 1;
    tableGenerationRef.current = generation;
    tableAbortControllersRef.current.forEach((controller) => controller.abort());
    tableAbortControllersRef.current.clear();
    loadedTablePagesRef.current.clear();
    pendingTablePagesRef.current.clear();
    tableQueryRef.current = null;
    setTables([]);
    setTableTotal(0);
    setTableFieldTotal(0);
    setTablePdmTotal(0);
    setSelectedTableId(null);
    setTableDatasetRevision((value) => value + 1);

    const projectId = getProjectId(selectedNode);
    if (!allNodes && !projectId) {
      setTableLoading(false);
      return;
    }

    const query: TableQuery = {
      projectId,
      scopeType: selectedNode?.type || "project",
      scopePath: selectedNode?.relative_path || "",
      mode: searchMode,
      query: searchQuery,
      allNodes,
    };
    tableQueryRef.current = query;
    void requestTablePage(query, 0, generation, true);
  }, [
    selectedNode?.id,
    selectedNode?.type,
    selectedNode?.relative_path,
    searchMode,
    searchQuery,
    searchRevision,
    allNodes,
    revision,
    requestTablePage,
  ]);

  useEffect(
    () => () => {
      tableAbortControllersRef.current.forEach((controller) => controller.abort());
    },
    [],
  );

  useEffect(() => {
    if (!selectedTableId) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    tablesApi
      .detail(selectedTableId)
      .then((result) => {
        if (!cancelled) setDetail(result);
      })
      .catch((error) => {
        if (!cancelled) {
          setDetail(null);
          message.error(errorMessage(error));
        }
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedTableId, message]);

  const handleDirtyChange = useCallback((dirty: boolean) => {
    setHasUnsavedChanges(dirty);
  }, []);

  const requestContextChange = useCallback(
    (action: () => void) => {
      if (!hasUnsavedChanges) {
        action();
        return;
      }
      if (discardConfirmOpenRef.current) return;
      discardConfirmOpenRef.current = true;
      modal.confirm({
        title: "放弃未保存的修改？",
        content: "当前表的字段修改尚未保存。切换后这些修改会丢失。",
        okText: "放弃并切换",
        cancelText: "继续编辑",
        okButtonProps: { danger: true },
        onOk: () => {
          discardConfirmOpenRef.current = false;
          setHasUnsavedChanges(false);
          action();
        },
        onCancel: () => {
          discardConfirmOpenRef.current = false;
        },
        afterClose: () => {
          discardConfirmOpenRef.current = false;
        },
      });
    },
    [hasUnsavedChanges, modal],
  );

  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const preventAccidentalExit = (event: BeforeUnloadEvent) => {
      if (allowForcedReloadRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", preventAccidentalExit);
    return () => window.removeEventListener("beforeunload", preventAccidentalExit);
  }, [hasUnsavedChanges]);

  const selectNode = (node: WorkspaceNode) => {
    if (selectedNode?.id === node.id) return;
    requestContextChange(() => setSelectedNode(node));
  };

  const selectTable = (table: TableSummary) => {
    if (selectedTableId === table.id) return;
    requestContextChange(() => setSelectedTableId(table.id));
  };

  const locateSelectedTable = () => {
    if (!detail) {
      message.info("请先选择一张数据表");
      return;
    }
    const pdmNode = walkNodes(
      trees,
      (node) =>
        node.type === "pdm" &&
        getProjectId(node) === detail.project_id &&
        (node.pdm_id === detail.pdm_id || node.relative_path === detail.relative_path),
    );
    if (!pdmNode) {
      message.warning("没有在项目目录中找到该表所属的 PDM");
      return;
    }
    requestContextChange(() => {
      setSelectedNode(pdmNode);
      setNavigatorLocateRevision((value) => value + 1);
    });
  };

  const openAiEvidenceTable = (evidence: AiEvidenceTable, options?: { exitFullscreen?: boolean }) => {
    requestContextChange(() => {
      const pdmNode = walkNodes(
        trees,
        (node) =>
          node.type === "pdm" &&
          getProjectId(node) === evidence.project_id &&
          node.relative_path === evidence.relative_path,
      );
      pendingAiTableIdRef.current = evidence.table_id;
      if (pdmNode) setSelectedNode(pdmNode);
      setSearchMode("table");
      setSearchQuery(evidence.table_code || evidence.table_name);
      setAllNodes(false);
      setSearchRevision((value) => value + 1);
      if (options?.exitFullscreen && aiLayoutMode === "fullscreen") {
        changeAiLayoutMode(lastNonFullscreenAiModeRef.current);
      }
    });
  };

  const activeProject = projectForNode(projects, selectedNode);
  const scopeTitle = allNodes ? "所有项目" : selectedNode?.name || "码熊工作区";
  const scopeDescription = allNodes
    ? "正在全局检索所有项目节点"
    : selectedNode?.type === "pdm"
      ? "当前 PDM · 展示文件中的数据表"
      : selectedNode?.type === "folder"
        ? "当前文件夹 · 包含所有下级 PDM"
        : "当前项目 · 展示范围内的数据表";
  const submitTableSearch = (mode: SearchMode, query: string, searchAllNodes: boolean) => {
    requestContextChange(() => {
      setSearchMode(mode);
      setSearchQuery(query.trim());
      setAllNodes(searchAllNodes);
      setSearchRevision((value) => value + 1);
    });
  };

  const refreshAfterMutation = async (preferred?: WorkspaceNode | null) => {
    await loadWorkspace(preferred);
    setRevision((value) => value + 1);
  };

  const handleBackupImported = async (_result: BackupImportResult) => {
    setHasUnsavedChanges(false);
    await refreshAfterMutation(null);
  };

  const openDialog = (kind: Exclude<DialogKind, null>, node?: WorkspaceNode) => {
    setDialog({ kind, node });
    setDialogValue(kind === "rename" ? node?.name || "" : "");
  };

  const openSettingsDialog = async () => {
    try {
      const nextSettings = await workspaceApi.settings();
      if (handleExternalWorkspaceChange(nextSettings)) return;
      setSettings(nextSettings);
      setDialogValue(nextSettings.workspace_root);
      setDialog({ kind: "settings" });
    } catch (error) {
      message.error(errorMessage(error));
    }
  };

  const closeDialog = () => {
    if (dialogBusy) return;
    setDialog({ kind: null });
    setDialogValue("");
  };

  const submitDialog = async () => {
    const value = dialogValue.trim();
    if (!value) {
      message.warning(dialog.kind === "settings" ? "请输入工作区路径" : "请输入名称");
      return;
    }
    setDialogBusy(true);
    try {
      if (dialog.kind === "project") {
        const project = await workspaceApi.createProject(value);
        await refreshAfterMutation({
          id: `project:${project.id}`,
          project_id: project.id,
          type: "project",
          name: project.name,
          relative_path: "",
        });
        message.success(`项目“${project.name}”已创建`);
      } else if (dialog.kind === "folder" && dialog.node) {
        const node = dialog.node;
        const projectId = getProjectId(node)!;
        const parent = node.type === "folder" ? node.relative_path : node.type === "pdm" ? pathParent(node.relative_path) : "";
        await workspaceApi.createFolder(projectId, parent, value);
        await refreshAfterMutation(node);
        message.success("文件夹已创建");
      } else if (dialog.kind === "rename" && dialog.node) {
        const node = dialog.node;
        const projectId = getProjectId(node)!;
        await workspaceApi.renameNode(projectId, node.relative_path, value);
        await refreshAfterMutation(null);
        message.success("节点已重命名");
      } else if (dialog.kind === "settings") {
        const updated = await workspaceApi.updateWorkspace(value);
        setSettings(updated);
        await refreshAfterMutation(null);
        message.success("工作区已更新");
      }
      setDialog({ kind: null });
      setDialogValue("");
    } catch (error) {
      message.error(errorMessage(error));
    } finally {
      setDialogBusy(false);
    }
  };

  const triggerImport = (node: WorkspaceNode | null) => {
    const target = node || selectedNode || trees[0] || null;
    if (!target) {
      message.info("请先新建一个项目");
      return;
    }
    importTargetRef.current = target;
    fileInputRef.current?.click();
  };

  const uploadFiles = async (files: File[], target: WorkspaceNode, overwrite: boolean) => {
    const projectId = getProjectId(target);
    if (!projectId) throw new Error("无法识别导入目标项目");
    const parentPath =
      target.type === "folder" ? target.relative_path : target.type === "pdm" ? pathParent(target.relative_path) : "";
    const result = await workspaceApi.importPdm(projectId, parentPath, files, overwrite);
    await refreshAfterMutation(target);
    if (result.imported.length) {
      message.success(`已导入 ${result.imported.length} 个 PDM，共解析 ${result.imported.reduce((sum, item) => sum + item.table_count, 0)} 张表`);
    }
    if (result.errors.length) {
      modal.warning({
        title: "部分文件未能导入",
        content: result.errors.map((item) => `${item.name}：${item.error}`).join("；"),
      });
    }
  };

  const handleFileSelection = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    const target = importTargetRef.current;
    event.target.value = "";
    if (!files.length || !target) return;
    const key = "pdm-import";
    message.loading({ key, content: `正在复制并解析 ${files.length} 个 PDM…`, duration: 0 });
    try {
      await uploadFiles(files, target, false);
      message.destroy(key);
    } catch (error) {
      message.destroy(key);
      if (error instanceof ApiError && error.code === "import_conflict") {
        const data = error.data as { conflicts?: string[] } | undefined;
        modal.confirm({
          title: "发现同名 PDM",
          content: `以下文件已存在：${data?.conflicts?.join("、") || "同名文件"}。是否备份旧文件并覆盖项目副本？`,
          okText: "覆盖导入",
          cancelText: "取消",
          onOk: async () => {
            message.loading({ key, content: "正在备份、覆盖并重新解析…", duration: 0 });
            try {
              await uploadFiles(files, target, true);
            } finally {
              message.destroy(key);
            }
          },
        });
      } else {
        message.error(errorMessage(error));
      }
    }
  };

  const runProjectRefresh = async (node: WorkspaceNode | null, force: boolean) => {
    const projectId = getProjectId(node) || projects[0]?.id;
    if (!projectId) return;
    const key = force ? "project-force-refresh" : "project-refresh";
    setRefreshing(true);
    message.loading({
      key,
      content: force ? "正在强制重新解析当前项目的全部 PDM…" : "正在扫描 PDM 文件变化…",
      duration: 0,
    });
    try {
      const result = await workspaceApi.refresh(projectId, force);
      await refreshAfterMutation(node);
      const summary = force
        ? `强制重新解析完成：成功 ${result.indexed} 个，失败 ${result.errors.length} 个`
        : result.pdm_count === 0
          ? "扫描完成：当前项目没有 PDM"
          : `扫描完成：重新解析 ${result.indexed} 个，未变化 ${result.unchanged} 个，失败 ${result.errors.length} 个`;
      const notify = result.errors.length ? message.warning : message.success;
      notify({
        key,
        content: summary,
      });
    } catch (error) {
      message.error({ key, content: errorMessage(error) });
    } finally {
      setRefreshing(false);
    }
  };

  const refreshNode = (node: WorkspaceNode | null) => {
    if (refreshing) return;
    requestContextChange(() => void runProjectRefresh(node, false));
  };

  const forceRefreshNode = (node: WorkspaceNode | null) => {
    if (refreshing) return;
    const projectId = getProjectId(node) || projects[0]?.id;
    if (!projectId) return;
    const projectName = projects.find((project) => project.id === projectId)?.name || "当前项目";
    modal.confirm({
      title: "强制全部重新解析？",
      content: `将忽略文件大小和修改时间，重新解析项目“${projectName}”中的全部 PDM。文件较多时可能需要等待一段时间。`,
      okText: "强制重新解析",
      cancelText: "取消",
      onOk: () => requestContextChange(() => void runProjectRefresh(node, true)),
    });
  };

  const moveNode = async (source: WorkspaceNode, target: WorkspaceNode) => {
    try {
      await workspaceApi.moveNode(getProjectId(source)!, source.relative_path, target.relative_path);
      await refreshAfterMutation(target);
      message.success("节点已移动");
    } catch (error) {
      message.error(errorMessage(error));
    }
  };

  const trashNode = (node: WorkspaceNode) => {
    modal.confirm({
      title: `将“${node.name}”移入回收站？`,
      icon: <DeleteOutlined style={{ color: "#e25c5c" }} />,
      content: node.type === "project" ? "项目目录及其全部 PDM 会进入码熊回收站，可稍后恢复。" : "节点会从当前项目移除，可稍后从回收站恢复。",
      okText: "移入回收站",
      okButtonProps: { danger: true },
      cancelText: "取消",
      onOk: async () => {
        await workspaceApi.trashNode(getProjectId(node)!, node.relative_path);
        await refreshAfterMutation(null);
        message.success("已移入回收站");
      },
    });
  };

  const openTrash = async () => {
    setTrashOpen(true);
    setTrashLoading(true);
    try {
      setTrashItems(await workspaceApi.trash());
    } catch (error) {
      message.error(errorMessage(error));
    } finally {
      setTrashLoading(false);
    }
  };

  const restoreTrash = async (item: TrashItem) => {
    try {
      await workspaceApi.restoreTrash(item.id);
      setTrashItems((current) => current.filter((candidate) => candidate.id !== item.id));
      await refreshAfterMutation(null);
      message.success(`“${item.name}”已恢复`);
    } catch (error) {
      message.error(errorMessage(error));
    }
  };

  const saveDictionary = async (table: TableMetadataUpdate, fields: FieldDefinition[]) => {
    if (!detail) return;
    setSaving(true);
    try {
      const updated = await tablesApi.saveDictionary(
        detail.id,
        detail.source_hash,
        table,
        fields,
      );
      setDetail(updated);
      setTables((current) =>
        current.map((item) =>
          item?.id === updated.id
            ? {
                ...item,
                name: updated.name,
                code: updated.code,
                comment: updated.comment,
                source_hash: updated.source_hash,
              }
            : item,
        ),
      );
      message.success("数据字典已写回项目 PDM，原文件备份已保留");
    } catch (error) {
      message.error(errorMessage(error));
      throw error;
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      ref={appRootRef}
      className={`app-root${sidebarResizing ? " is-sidebar-resizing" : ""}${aiAssistantOpen ? ` ai-assistant-open ai-mode-${aiLayoutMode}` : ""}`}
      style={appRootStyle}
    >
      <header className="app-header">
        <div className="brand-block">
          <img className="brand-mark" src="/codebear-icon-v3.png" alt="" aria-hidden="true" />
          <span className="brand-copy">
            <span><strong>码熊</strong><b>CODE BEAR</b></span>
            <small>PDM 数据字典工作台</small>
          </span>
        </div>
        <div className="header-context">
          <span>码熊工作区</span>
          <i>/</i>
          <strong>{activeProject?.name || "欢迎使用"}</strong>
          <Tag color="blue">本地工作台</Tag>
        </div>
        <div className="header-actions">
          <Button
            icon={<SafetyCertificateOutlined />}
            onClick={() => {
              setBackupFeatureLoaded(true);
              setBackupOpen(true);
            }}
          >
            备份迁移
          </Button>
          <Button
            icon={<CodeOutlined />}
            disabled={!activeProject || activeProject.table_count === 0}
            onClick={() => {
              setDdlFeatureLoaded(true);
              setDdlExportOpen(true);
            }}
          >
            导出 SQL
          </Button>
          <Button
            icon={<BookOutlined />}
            onClick={() => {
              setDictionaryFeatureLoaded(true);
              setDictionaryOpen(true);
            }}
          >
            字典中心
          </Button>
        </div>
      </header>
      <div className="app-body">
        <ProjectNavigator
          trees={trees}
          selectedNode={selectedNode}
          settings={settings}
          loading={navigationLoading || refreshing}
          locateNode={detail ? {
            projectId: detail.project_id,
            pdmId: detail.pdm_id,
            relativePath: detail.relative_path,
          } : null}
          locateRevision={navigatorLocateRevision}
          onLocate={locateSelectedTable}
          onSelect={selectNode}
          onCreateProject={() => openDialog("project")}
          onImport={triggerImport}
          onCreateFolder={(node) => openDialog("folder", node)}
          onRefresh={refreshNode}
          onForceRefresh={forceRefreshNode}
          onRename={(node) => openDialog("rename", node)}
          onTrash={trashNode}
          onMove={moveNode}
          onOpenTrash={openTrash}
          onOpenSettings={() => void openSettingsDialog()}
        />
        <div
          ref={sidebarResizerRef}
          className={`sidebar-resizer${sidebarResizing ? " is-dragging" : ""}`}
          role="separator"
          aria-label="调整项目目录宽度"
          aria-orientation="vertical"
          aria-valuemin={SIDEBAR_MIN_WIDTH}
          aria-valuemax={SIDEBAR_MAX_WIDTH}
          aria-valuenow={Math.round(effectiveSidebarWidth)}
          tabIndex={0}
          title="拖动调整目录宽度"
          onPointerDown={startSidebarResize}
          onPointerMove={moveSidebarResize}
          onPointerUp={finishSidebarResize}
          onPointerCancel={commitSidebarResize}
          onLostPointerCapture={commitSidebarResize}
          onKeyDown={resizeSidebarWithKeyboard}
        />
        <main className="workspace-main">
          <section className="scope-header">
            <span className="scope-icon">
              <ProjectGlyph />
            </span>
            <span className="scope-copy">
              <strong>{scopeTitle}</strong>
              <small>{scopeDescription}</small>
            </span>
            <div className="scope-stats">
              <span><b>{tableTotal}</b> 张表</span>
              <span><b>{tableFieldTotal}</b> 个字段</span>
              <span><b>{tablePdmTotal}</b> 个 PDM</span>
            </div>
          </section>
          <div className="workspace-stack">
            <TablePanel
              tables={tables}
              total={tableTotal}
              datasetRevision={tableDatasetRevision}
              selectedTableId={selectedTableId}
              loading={tableLoading}
              mode={searchMode}
              query={searchQuery}
              allNodes={allNodes}
              onSearch={submitTableSearch}
              onSelect={selectTable}
              onRequestRange={requestTableRange}
            />
            <FieldPanel
              detail={detail}
              loading={detailLoading}
              saving={saving}
              highlightQuery={searchMode === "field" ? searchQuery : ""}
              onSave={saveDictionary}
              onDirtyChange={handleDirtyChange}
              bindingRevision={dictionaryBindingRevision}
            />
          </div>
        </main>
      </div>

      <input
        ref={fileInputRef}
        className="hidden-file-input"
        type="file"
        accept=".pdm,application/xml,text/xml"
        multiple
        onChange={handleFileSelection}
      />

      <WorkspaceDialog
        dialog={dialog}
        value={dialogValue}
        busy={dialogBusy}
        projects={projects}
        onValueChange={setDialogValue}
        onSubmit={submitDialog}
        onClose={closeDialog}
      />

      <TrashModal
        open={trashOpen}
        loading={trashLoading}
        items={trashItems}
        onClose={() => setTrashOpen(false)}
        onRestore={restoreTrash}
      />

      <LazyFeatureOverlays
        trees={trees}
        selectedNode={selectedNode}
        selectedTable={detail}
        activeProject={activeProject}
        hasUnsavedChanges={hasUnsavedChanges}
        backupLoaded={backupFeatureLoaded}
        backupOpen={backupOpen}
        ddlLoaded={ddlFeatureLoaded}
        ddlOpen={ddlExportOpen}
        dictionaryLoaded={dictionaryFeatureLoaded}
        dictionaryOpen={dictionaryOpen}
        aiLoaded={aiFeatureLoaded}
        aiOpen={aiAssistantOpen}
        aiMode={aiLayoutMode}
        aiAssistantName={settings?.assistant_name}
        aiAssistantAccessory={settings?.assistant_accessory}
        onCloseBackup={() => setBackupOpen(false)}
        onBackupImported={handleBackupImported}
        onCloseDdl={() => setDdlExportOpen(false)}
        onCloseDictionary={() => setDictionaryOpen(false)}
        onDictionaryBindingsChanged={() => setDictionaryBindingRevision((current) => current + 1)}
        onRequestContextChange={requestContextChange}
        onOpenAi={openAiAssistant}
        onAiOpenChange={changeAiAssistantOpen}
        onAiModeChange={changeAiLayoutMode}
        onOpenAiTable={openAiEvidenceTable}
      />
    </div>
  );
}
