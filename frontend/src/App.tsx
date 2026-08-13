import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from "react";
import {
  App as AntApp,
  Button,
  Empty,
  Input,
  Modal,
  Spin,
  Tag,
  Tooltip,
} from "antd";
import {
  ApartmentOutlined,
  CodeOutlined,
  DatabaseFilled,
  DeleteOutlined,
  FolderOutlined,
  InboxOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
  SettingOutlined,
  UndoOutlined,
} from "@ant-design/icons";
import { ApiError, api } from "./api";
import { AiAssistant } from "./components/AiAssistant";
import { BackupMigrationModal } from "./components/BackupMigrationModal";
import { DdlExportModal } from "./components/DdlExportModal";
import { FieldPanel } from "./components/FieldPanel";
import { ProjectNavigator } from "./components/ProjectNavigator";
import { ProjectGlyph } from "./components/PrototypeGlyphs";
import { TablePanel } from "./components/TablePanel";
import type {
  AiEvidenceTable,
  AiLayoutMode,
  BackupImportResult,
  FieldDefinition,
  Project,
  SearchMode,
  Settings,
  TableDetail,
  TableSummary,
  TrashItem,
  WorkspaceNode,
} from "./types";

type DialogKind = "project" | "folder" | "rename" | "settings" | null;

const SIDEBAR_MIN_WIDTH = 245;
const SIDEBAR_MAX_WIDTH = 440;
const SIDEBAR_STORAGE_KEY = "maxiong.sidebarWidth";
const AI_LAYOUT_STORAGE_KEY = "maxiong.ai.layout-mode";
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

function clampSidebarWidth(width: number): number {
  return Math.max(SIDEBAR_MIN_WIDTH, Math.min(SIDEBAR_MAX_WIDTH, Math.round(width)));
}

function readStoredSidebarWidth(): number | null {
  try {
    const width = Number(window.localStorage.getItem(SIDEBAR_STORAGE_KEY));
    return Number.isFinite(width) && width >= SIDEBAR_MIN_WIDTH && width <= SIDEBAR_MAX_WIDTH ? width : null;
  } catch {
    return null;
  }
}

function readStoredAiLayoutMode(): AiLayoutMode {
  try {
    const mode = window.localStorage.getItem(AI_LAYOUT_STORAGE_KEY);
    // Fullscreen is a temporary focus mode. Never use it as the launch mode.
    if (mode === "sidebar" || mode === "floating") return mode;
    if (mode === "fullscreen") {
      window.localStorage.setItem(AI_LAYOUT_STORAGE_KEY, "sidebar");
    }
  } catch {
    // Local storage can be unavailable in locked-down browser profiles.
  }
  return "sidebar";
}

interface DialogState {
  kind: DialogKind;
  node?: WorkspaceNode;
}

function walkNodes(nodes: WorkspaceNode[], visit: (node: WorkspaceNode) => boolean): WorkspaceNode | null {
  for (const node of nodes) {
    if (visit(node)) return node;
    const child = walkNodes(node.children || [], visit);
    if (child) return child;
  }
  return null;
}

function pathParent(path: string): string {
  const index = path.lastIndexOf("/");
  return index === -1 ? "" : path.slice(0, index);
}

function getProjectId(node: WorkspaceNode | null): string | undefined {
  return node?.project_id || (node?.type === "project" ? node.id.replace("project:", "") : undefined);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "操作失败，请稍后重试";
}

function projectForNode(projects: Project[], node: WorkspaceNode | null): Project | undefined {
  const projectId = getProjectId(node);
  return projects.find((project) => project.id === projectId);
}

function normalizeWorkspacePath(path: string): string {
  return path.trim().replaceAll("/", "\\").replace(/\\+$/, "").toLocaleLowerCase();
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
  const [ddlExportOpen, setDdlExportOpen] = useState(false);
  const [aiAssistantOpen, setAiAssistantOpen] = useState(false);
  const [aiLayoutMode, setAiLayoutMode] = useState<AiLayoutMode>(readStoredAiLayoutMode);
  const lastNonFullscreenAiModeRef = useRef<Exclude<AiLayoutMode, "fullscreen">>(
    aiLayoutMode === "fullscreen" ? "sidebar" : aiLayoutMode,
  );
  const [trashItems, setTrashItems] = useState<TrashItem[]>([]);
  const [trashLoading, setTrashLoading] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState<number | null>(readStoredSidebarWidth);
  const [sidebarResizing, setSidebarResizing] = useState(false);
  const appRootRef = useRef<HTMLDivElement>(null);
  const sidebarResizerRef = useRef<HTMLDivElement>(null);
  const liveSidebarWidthRef = useRef<number | null>(sidebarWidth);
  const sidebarResizeLeftRef = useRef(0);
  const pendingSidebarWidthRef = useRef<number | null>(null);
  const sidebarResizeFrameRef = useRef<number | null>(null);
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
      const [nextSettings, nextProjects] = await Promise.all([api.settings(), api.projects()]);
      const nextTrees = await Promise.all(nextProjects.map((project) => api.tree(project.id)));
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
        const nextSettings = await api.settings();
        if (!active) return;
        if (!settings) {
          setSettings(nextSettings);
          return;
        }
        handleExternalWorkspaceChange(nextSettings);
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
        const result = await api.tables({
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
    api
      .table(selectedTableId)
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

  const changeAiLayoutMode = useCallback((mode: AiLayoutMode) => {
    setAiLayoutMode(mode);
    if (mode === "fullscreen") return;
    lastNonFullscreenAiModeRef.current = mode;
    try {
      window.localStorage.setItem(AI_LAYOUT_STORAGE_KEY, mode);
    } catch {
      // Keep the current-session choice when storage is unavailable.
    }
  }, []);

  const changeAiAssistantOpen = useCallback((nextOpen: boolean) => {
    if (nextOpen) {
      setAiLayoutMode((currentMode) => (
        currentMode === "fullscreen" ? lastNonFullscreenAiModeRef.current : currentMode
      ));
    }
    setAiAssistantOpen(nextOpen);
  }, []);

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
      const nextSettings = await api.settings();
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
        const project = await api.createProject(value);
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
        await api.createFolder(projectId, parent, value);
        await refreshAfterMutation(node);
        message.success("文件夹已创建");
      } else if (dialog.kind === "rename" && dialog.node) {
        const node = dialog.node;
        const projectId = getProjectId(node)!;
        await api.renameNode(projectId, node.relative_path, value);
        await refreshAfterMutation(null);
        message.success("节点已重命名");
      } else if (dialog.kind === "settings") {
        const updated = await api.updateWorkspace(value);
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
    const result = await api.importPdm(projectId, parentPath, files, overwrite);
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
      const result = await api.refresh(projectId, force);
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
      await api.moveNode(getProjectId(source)!, source.relative_path, target.relative_path);
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
        await api.trashNode(getProjectId(node)!, node.relative_path);
        await refreshAfterMutation(null);
        message.success("已移入回收站");
      },
    });
  };

  const openTrash = async () => {
    setTrashOpen(true);
    setTrashLoading(true);
    try {
      setTrashItems(await api.trash());
    } catch (error) {
      message.error(errorMessage(error));
    } finally {
      setTrashLoading(false);
    }
  };

  const restoreTrash = async (item: TrashItem) => {
    try {
      await api.restoreTrash(item.id);
      setTrashItems((current) => current.filter((candidate) => candidate.id !== item.id));
      await refreshAfterMutation(null);
      message.success(`“${item.name}”已恢复`);
    } catch (error) {
      message.error(errorMessage(error));
    }
  };

  const saveFields = async (fields: FieldDefinition[]) => {
    if (!detail) return;
    setSaving(true);
    try {
      const updated = await api.saveFields(detail.id, detail.source_hash, fields);
      setDetail(updated);
      message.success("字段字典已写回项目 PDM，原文件备份已保留");
    } catch (error) {
      message.error(errorMessage(error));
      throw error;
    } finally {
      setSaving(false);
    }
  };

  const dialogTitle =
    dialog.kind === "project"
      ? "新建项目"
      : dialog.kind === "folder"
        ? "新建子文件夹"
        : dialog.kind === "rename"
          ? "重命名节点"
          : "本机工作区设置";

  const updateLiveSidebarWidth = (width: number) => {
    const nextWidth = clampSidebarWidth(width);
    liveSidebarWidthRef.current = nextWidth;
    appRootRef.current?.style.setProperty("--sidebar-width", `${nextWidth}px`);
    sidebarResizerRef.current?.setAttribute("aria-valuenow", String(nextWidth));
    return nextWidth;
  };

  const commitSidebarWidth = (width: number) => {
    setSidebarWidth(updateLiveSidebarWidth(width));
  };

  const persistSidebarWidth = () => {
    const width = liveSidebarWidthRef.current;
    if (width === null) return;
    try {
      window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(width));
    } catch {
      // The resizer still works when browser storage is unavailable.
    }
  };

  const startSidebarResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    sidebarResizeLeftRef.current =
      appRootRef.current?.querySelector<HTMLElement>(".project-navigator")?.getBoundingClientRect().left ||
      appRootRef.current?.getBoundingClientRect().left ||
      0;
    pendingSidebarWidthRef.current = liveSidebarWidthRef.current;
    event.currentTarget.setPointerCapture(event.pointerId);
    setSidebarResizing(true);
  };

  const moveSidebarResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    pendingSidebarWidthRef.current = event.clientX - sidebarResizeLeftRef.current;
    if (sidebarResizeFrameRef.current !== null) return;
    sidebarResizeFrameRef.current = window.requestAnimationFrame(() => {
      sidebarResizeFrameRef.current = null;
      const width = pendingSidebarWidthRef.current;
      if (width !== null) updateLiveSidebarWidth(width);
    });
  };

  const commitSidebarResize = () => {
    if (sidebarResizeFrameRef.current !== null) {
      window.cancelAnimationFrame(sidebarResizeFrameRef.current);
      sidebarResizeFrameRef.current = null;
    }
    const width = pendingSidebarWidthRef.current ?? liveSidebarWidthRef.current;
    pendingSidebarWidthRef.current = null;
    if (width !== null) commitSidebarWidth(width);
    setSidebarResizing(false);
    persistSidebarWidth();
  };

  const finishSidebarResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    pendingSidebarWidthRef.current = event.clientX - sidebarResizeLeftRef.current;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    commitSidebarResize();
  };

  const resizeSidebarWithKeyboard = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const currentWidth =
      liveSidebarWidthRef.current ||
      appRootRef.current?.querySelector<HTMLElement>(".project-navigator")?.getBoundingClientRect().width ||
      326;
    const nextWidth =
      event.key === "ArrowLeft"
        ? currentWidth - 10
        : event.key === "ArrowRight"
          ? currentWidth + 10
          : event.key === "Home"
            ? SIDEBAR_MIN_WIDTH
            : event.key === "End"
              ? SIDEBAR_MAX_WIDTH
              : null;
    if (nextWidth === null) return;
    event.preventDefault();
    commitSidebarWidth(nextWidth);
    window.setTimeout(persistSidebarWidth, 0);
  };

  const appRootStyle =
    sidebarWidth === null ? undefined : ({ "--sidebar-width": `${sidebarWidth}px` } as CSSProperties);
  const effectiveSidebarWidth = sidebarWidth ?? (window.innerWidth <= 1360 ? 292 : 326);

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
          <Button icon={<SafetyCertificateOutlined />} onClick={() => setBackupOpen(true)}>
            备份迁移
          </Button>
          <Button
            icon={<CodeOutlined />}
            disabled={!activeProject || activeProject.table_count === 0}
            onClick={() => setDdlExportOpen(true)}
          >
            导出 SQL
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
              onSave={saveFields}
              onDirtyChange={handleDirtyChange}
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

      <Modal
        open={dialog.kind !== null}
        title={dialogTitle}
        okText={dialog.kind === "settings" ? "保存设置" : "确定"}
        cancelText="取消"
        confirmLoading={dialogBusy}
        onOk={submitDialog}
        onCancel={closeDialog}
        destroyOnHidden
      >
        {dialog.kind === "settings" ? (
          <div className="dialog-form">
            <label>工作区根目录</label>
            <Input
              value={dialogValue}
              disabled={projects.length > 0}
              onChange={(event) => setDialogValue(event.target.value)}
              onPressEnter={submitDialog}
              prefix={<SettingOutlined />}
            />
            <small>
              {projects.length
                ? "当前已有项目。为防止项目路径失联，需清空或移入回收站后才能切换工作区。"
                : "新项目和码熊的回收站、备份目录都会保存在这里。"}
            </small>
          </div>
        ) : (
          <div className="dialog-form">
            <label>{dialog.kind === "project" ? "项目名称" : dialog.kind === "folder" ? "文件夹名称" : "新名称"}</label>
            <Input
              autoFocus
              value={dialogValue}
              onChange={(event) => setDialogValue(event.target.value)}
              onPressEnter={submitDialog}
              placeholder="请输入名称"
            />
          </div>
        )}
      </Modal>

      <Modal
        open={trashOpen}
        title={<span><InboxOutlined /> 码熊回收站</span>}
        width={760}
        footer={<Button onClick={() => setTrashOpen(false)}>关闭</Button>}
        className="trash-modal"
        onCancel={() => setTrashOpen(false)}
      >
        <div className="trash-list">
          {trashLoading ? (
            <div className="trash-loading"><Spin /> 正在读取回收站…</div>
          ) : trashItems.length ? (
            trashItems.map((item) => (
              <div className="trash-item" key={item.id}>
                <span className="trash-icon">
                  {item.kind === "project" ? <ApartmentOutlined /> : item.kind === "folder" ? <FolderOutlined /> : <DatabaseFilled />}
                </span>
                <span className="trash-copy">
                  <strong>{item.name}</strong>
                  <small>{item.project_name} · {item.deleted_at.replace("T", " ")}</small>
                </span>
                <Tag>{item.kind === "project" ? "项目" : item.kind === "folder" ? "文件夹" : "PDM"}</Tag>
                <Tooltip title="恢复到原位置">
                  <Button icon={<UndoOutlined />} onClick={() => restoreTrash(item)}>恢复</Button>
                </Tooltip>
              </div>
            ))
          ) : (
            <Empty description="回收站是空的" />
          )}
        </div>
      </Modal>

      <BackupMigrationModal
        open={backupOpen}
        trees={trees}
        selectedNode={selectedNode}
        hasUnsavedChanges={hasUnsavedChanges}
        onClose={() => setBackupOpen(false)}
        onRequestContextChange={requestContextChange}
        onImported={handleBackupImported}
      />

      <DdlExportModal
        open={ddlExportOpen}
        project={activeProject || null}
        selectedNode={selectedNode}
        hasUnsavedChanges={hasUnsavedChanges}
        onClose={() => setDdlExportOpen(false)}
      />

      <AiAssistant
        open={aiAssistantOpen}
        mode={aiLayoutMode}
        activeProject={activeProject}
        selectedNode={selectedNode}
        selectedTable={detail}
        onOpenChange={changeAiAssistantOpen}
        onModeChange={changeAiLayoutMode}
        onOpenTable={openAiEvidenceTable}
      />
    </div>
  );
}
