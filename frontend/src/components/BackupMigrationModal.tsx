import { useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircleOutlined,
  DownloadOutlined,
  FileZipOutlined,
  FolderOpenOutlined,
  ImportOutlined,
  SafetyCertificateOutlined,
  UploadOutlined,
} from "@ant-design/icons";
import {
  Alert,
  App as AntApp,
  Button,
  Empty,
  Input,
  Modal,
  Radio,
  Segmented,
  Spin,
  Tabs,
  Tag,
  Tree,
} from "antd";
import type { DataNode } from "antd/es/tree";

import { api } from "../api";
import type {
  BackupExportNode,
  BackupImportNode,
  BackupImportResult,
  BackupInspection,
  NodeType,
  WorkspaceNode,
} from "../types";
import { FolderGlyph, PdmGlyph, ProjectGlyph, TreeChevronGlyph } from "./PrototypeGlyphs";

type ConflictPolicy = "skip" | "rename" | "overwrite";
type ImportSource = "archive" | "legacy";

interface TransferNode extends DataNode {
  key: string;
  label: string;
  nodeType: NodeType;
  size: number;
  exportSelection?: BackupExportNode;
  importSelection?: BackupImportNode;
  children?: TransferNode[];
}

interface TreeIndex {
  nodes: Map<string, TransferNode>;
  parents: Map<string, string>;
  keys: string[];
}

interface SelectionSummary {
  projectCount: number;
  folderCount: number;
  pdmCount: number;
  totalBytes: number;
}

interface BackupMigrationModalProps {
  open: boolean;
  trees: WorkspaceNode[];
  selectedNode: WorkspaceNode | null;
  hasUnsavedChanges: boolean;
  onClose: () => void;
  onRequestContextChange: (action: () => void) => void;
  onImported: (result: BackupImportResult) => void | Promise<void>;
}

function normalizeProjectNode(node: WorkspaceNode, projectId: string): WorkspaceNode {
  return {
    ...node,
    project_id: node.project_id || projectId,
    children: node.children?.map((child) => normalizeProjectNode(child, projectId)),
  };
}

function exportTreeNode(node: WorkspaceNode): TransferNode {
  const projectId = node.project_id || node.id.replace("project:", "");
  return {
    key: node.id,
    title: node.name,
    label: node.name,
    nodeType: node.type,
    size: node.file_size || 0,
    isLeaf: node.type === "pdm",
    exportSelection: {
      project_id: projectId,
      type: node.type,
      relative_path: node.relative_path,
    },
    children: node.children?.map(exportTreeNode),
  };
}

function backupTree(inspection: BackupInspection): TransferNode[] {
  return inspection.projects.map((project) => {
    const projectKey = `backup:${project.key}:project`;
    const projectNode: TransferNode = {
      key: projectKey,
      title: project.name,
      label: project.name,
      nodeType: "project",
      size: 0,
      importSelection: { project_key: project.key, type: "project", relative_path: "" },
      children: [],
    };
    const folderNodes = new Map<string, TransferNode>();
    const sortedEntries = [...project.entries].sort((left, right) => {
      const depth = left.path.split("/").length - right.path.split("/").length;
      if (depth) return depth;
      if (left.type !== right.type) return left.type === "folder" ? -1 : 1;
      return left.path.localeCompare(right.path, "zh-CN");
    });

    sortedEntries.forEach((entry) => {
      const key = `backup:${project.key}:${entry.type}:${entry.path}`;
      const label = entry.path.split("/").at(-1) || entry.path;
      const node: TransferNode = {
        key,
        title: label,
        label,
        nodeType: entry.type,
        size: entry.size || 0,
        isLeaf: entry.type === "pdm",
        importSelection: {
          project_key: project.key,
          type: entry.type,
          relative_path: entry.path,
        },
        children: entry.type === "folder" ? [] : undefined,
      };
      const slash = entry.path.lastIndexOf("/");
      const parentPath = slash === -1 ? "" : entry.path.slice(0, slash);
      const parent = parentPath ? folderNodes.get(parentPath) : projectNode;
      (parent?.children || projectNode.children)?.push(node);
      if (entry.type === "folder") folderNodes.set(entry.path, node);
    });
    return projectNode;
  });
}

function buildTreeIndex(tree: TransferNode[]): TreeIndex {
  const nodes = new Map<string, TransferNode>();
  const parents = new Map<string, string>();
  const keys: string[] = [];
  const walk = (items: TransferNode[], parent?: string) => {
    items.forEach((item) => {
      nodes.set(item.key, item);
      keys.push(item.key);
      if (parent) parents.set(item.key, parent);
      walk(item.children || [], item.key);
    });
  };
  walk(tree);
  return { nodes, parents, keys };
}

function collectSubtreeKeys(node: TransferNode, result: string[]): void {
  result.push(node.key);
  node.children?.forEach((child) => collectSubtreeKeys(child, result));
}

function compactSelection(keys: string[], index: TreeIndex): TransferNode[] {
  const checked = new Set(keys);
  return keys
    .filter((key) => {
      let parent = index.parents.get(key);
      while (parent) {
        if (checked.has(parent)) return false;
        parent = index.parents.get(parent);
      }
      return true;
    })
    .map((key) => index.nodes.get(key))
    .filter((node): node is TransferNode => Boolean(node));
}

function selectionSummary(keys: string[], index: TreeIndex): SelectionSummary {
  const projects = new Set<string>();
  let folderCount = 0;
  let pdmCount = 0;
  let totalBytes = 0;
  keys.forEach((key) => {
    const node = index.nodes.get(key);
    if (!node) return;
    const selection = node.exportSelection || node.importSelection;
    if (node.nodeType === "project") {
      projects.add(node.exportSelection?.project_id || node.importSelection?.project_key || key);
    } else if (selection) {
      projects.add(
        "project_id" in selection ? selection.project_id : selection.project_key,
      );
    }
    if (node.nodeType === "folder") folderCount += 1;
    if (node.nodeType === "pdm") {
      pdmCount += 1;
      totalBytes += node.size;
    }
  });
  return { projectCount: projects.size, folderCount, pdmCount, totalBytes };
}

function filterTree(node: TransferNode, query: string): TransferNode | null {
  if (!query) return node;
  const children = (node.children || [])
    .map((child) => filterTree(child, query))
    .filter((child): child is TransferNode => Boolean(child));
  if (node.label.toLocaleLowerCase().includes(query) || children.length) {
    return { ...node, children };
  }
  return null;
}

function formatBytes(bytes: number): string {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const order = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** order;
  return `${value >= 10 || order === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[order]}`;
}

function formatCreatedAt(value: string): string {
  if (!value) return "旧版数据目录";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("zh-CN", { hour12: false });
}

function nodeTitle(node: TransferNode) {
  const icon =
    node.nodeType === "project" ? (
      <ProjectGlyph className="backup-node-icon backup-project-icon" />
    ) : node.nodeType === "folder" ? (
      <FolderGlyph className="backup-node-icon backup-folder-icon" />
    ) : (
      <PdmGlyph className="backup-node-icon backup-pdm-icon" />
    );
  return (
    <span className="backup-node-title" title={node.label}>
      {icon}
      <span>{node.label}</span>
      {node.nodeType === "pdm" && node.size > 0 && <small>{formatBytes(node.size)}</small>}
    </span>
  );
}

function SelectionReceipt({ summary }: { summary: SelectionSummary }) {
  return (
    <div className="backup-receipt">
      <span><b>{summary.projectCount}</b><small>项目</small></span>
      <span><b>{summary.folderCount}</b><small>文件夹</small></span>
      <span><b>{summary.pdmCount}</b><small>PDM</small></span>
      <span><b>{formatBytes(summary.totalBytes)}</b><small>文件总量</small></span>
    </div>
  );
}

export function BackupMigrationModal({
  open,
  trees,
  selectedNode,
  hasUnsavedChanges,
  onClose,
  onRequestContextChange,
  onImported,
}: BackupMigrationModalProps) {
  const { message, modal } = AntApp.useApp();
  const [activeTab, setActiveTab] = useState("export");
  const [exportQuery, setExportQuery] = useState("");
  const [exportCheckedKeys, setExportCheckedKeys] = useState<string[]>([]);
  const [exportExpandedKeys, setExportExpandedKeys] = useState<string[]>([]);
  const [exporting, setExporting] = useState(false);
  const [importSource, setImportSource] = useState<ImportSource>("archive");
  const [legacyPath, setLegacyPath] = useState("");
  const [inspection, setInspection] = useState<BackupInspection | null>(null);
  const [importQuery, setImportQuery] = useState("");
  const [importCheckedKeys, setImportCheckedKeys] = useState<string[]>([]);
  const [importExpandedKeys, setImportExpandedKeys] = useState<string[]>([]);
  const [conflictPolicy, setConflictPolicy] = useState<ConflictPolicy>("rename");
  const [inspecting, setInspecting] = useState(false);
  const [importing, setImporting] = useState(false);
  const backupInputRef = useRef<HTMLInputElement>(null);

  const exportTree = useMemo(
    () =>
      trees.map((tree) => {
        const projectId = tree.project_id || tree.id.replace("project:", "");
        return exportTreeNode(normalizeProjectNode(tree, projectId));
      }),
    [trees],
  );
  const exportIndex = useMemo(() => buildTreeIndex(exportTree), [exportTree]);
  const visibleExportTree = useMemo(() => {
    const query = exportQuery.trim().toLocaleLowerCase();
    return exportTree
      .map((node) => filterTree(node, query))
      .filter((node): node is TransferNode => Boolean(node));
  }, [exportQuery, exportTree]);
  const exportSummary = useMemo(
    () => selectionSummary(exportCheckedKeys, exportIndex),
    [exportCheckedKeys, exportIndex],
  );

  const importTree = useMemo(() => (inspection ? backupTree(inspection) : []), [inspection]);
  const importIndex = useMemo(() => buildTreeIndex(importTree), [importTree]);
  const visibleImportTree = useMemo(() => {
    const query = importQuery.trim().toLocaleLowerCase();
    return importTree
      .map((node) => filterTree(node, query))
      .filter((node): node is TransferNode => Boolean(node));
  }, [importQuery, importTree]);
  const importSummary = useMemo(
    () => selectionSummary(importCheckedKeys, importIndex),
    [importCheckedKeys, importIndex],
  );

  useEffect(() => {
    if (!open || !exportIndex.keys.length) return;
    const selected = selectedNode ? exportIndex.nodes.get(selectedNode.id) : undefined;
    const initial: string[] = [];
    collectSubtreeKeys(selected || exportTree[0], initial);
    setExportCheckedKeys(initial);
  }, [exportIndex, exportTree, open, selectedNode]);

  useEffect(() => {
    if (!open) {
      setExportExpandedKeys([]);
      return;
    }
    const expanded = new Set(exportTree.map((node) => node.key));
    let parent = selectedNode ? exportIndex.parents.get(selectedNode.id) : undefined;
    while (parent) {
      expanded.add(parent);
      parent = exportIndex.parents.get(parent);
    }
    setExportExpandedKeys([...expanded]);
  }, [exportIndex, exportTree, open, selectedNode]);

  useEffect(() => {
    if (inspection) {
      setImportCheckedKeys(importIndex.keys);
      setImportExpandedKeys(importTree.map((node) => node.key));
    } else {
      setImportExpandedKeys([]);
    }
  }, [importIndex, importTree, inspection]);

  const discardInspection = (current = inspection) => {
    if (current?.token) void api.discardBackup(current.token).catch(() => undefined);
    setInspection(null);
    setImportCheckedKeys([]);
    setImportExpandedKeys([]);
    setImportQuery("");
  };

  const closeModal = () => {
    if (exporting || inspecting || importing) return;
    discardInspection();
    onClose();
  };

  const exportSelected = async () => {
    const nodes = compactSelection(exportCheckedKeys, exportIndex)
      .map((node) => node.exportSelection)
      .filter((node): node is BackupExportNode => Boolean(node));
    if (!nodes.length) {
      message.warning("请至少选择一个待导出节点");
      return;
    }
    setExporting(true);
    try {
      const result = await api.exportBackup(nodes);
      const url = URL.createObjectURL(result.blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = result.fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      message.success(`备份已生成：${result.fileName}`);
    } catch (error) {
      message.error(error instanceof Error ? error.message : "导出备份失败");
    } finally {
      setExporting(false);
    }
  };

  const inspectArchive = async (file: File) => {
    if (file.size > 2 * 1024 * 1024 * 1024) {
      message.error("备份包不能超过 2 GB");
      return;
    }
    setInspecting(true);
    const previous = inspection;
    try {
      const result = await api.inspectBackup(file);
      if (previous) void api.discardBackup(previous.token).catch(() => undefined);
      setInspection(result);
    } catch (error) {
      message.error(error instanceof Error ? error.message : "无法读取备份包");
    } finally {
      setInspecting(false);
    }
  };

  const inspectLegacy = async () => {
    if (!legacyPath.trim()) {
      message.warning("请输入旧版码熊的 data 目录路径");
      return;
    }
    setInspecting(true);
    const previous = inspection;
    try {
      const result = await api.inspectLegacyData(legacyPath.trim());
      if (previous) void api.discardBackup(previous.token).catch(() => undefined);
      setInspection(result);
    } catch (error) {
      message.error(error instanceof Error ? error.message : "无法读取旧版 data 目录");
    } finally {
      setInspecting(false);
    }
  };

  const performImport = async () => {
    if (!inspection) return;
    const nodes = compactSelection(importCheckedKeys, importIndex)
      .map((node) => node.importSelection)
      .filter((node): node is BackupImportNode => Boolean(node));
    if (!nodes.length) {
      message.warning("请至少选择一个待导入节点");
      return;
    }
    setImporting(true);
    try {
      const result = await api.importBackup(inspection.token, nodes, conflictPolicy);
      await api.discardBackup(inspection.token).catch(() => undefined);
      await onImported(result);
      const suffix = result.parse_errors.length ? `，${result.parse_errors.length} 个 PDM 解析失败` : "";
      message.success(`已导入 ${result.imported.length} 个 PDM${suffix}`);
      setInspection(null);
      setImportCheckedKeys([]);
      onClose();
    } catch (error) {
      message.error(error instanceof Error ? error.message : "导入失败");
    } finally {
      setImporting(false);
    }
  };

  const requestImport = () => {
    onRequestContextChange(() => {
      if (conflictPolicy !== "overwrite") {
        void performImport();
        return;
      }
      modal.confirm({
        title: "确认覆盖同路径 PDM？",
        content: "码熊会先保存内部备份，但当前工作区中的同路径 PDM 将被备份包版本替换。",
        okText: "确认覆盖并导入",
        cancelText: "取消",
        okButtonProps: { danger: true },
        onOk: performImport,
      });
    });
  };

  const exportPanel = (
    <div className="backup-layout">
      <section className="backup-tree-pane">
        <div className="backup-pane-heading">
          <span><b>选择导出范围</b><small>可勾选项目、文件夹或单个 PDM</small></span>
          <span className="backup-mini-actions">
            <Button type="link" size="small" onClick={() => setExportCheckedKeys(exportIndex.keys)}>全选</Button>
            <Button type="link" size="small" onClick={() => setExportCheckedKeys([])}>清空</Button>
          </span>
        </div>
        <Input.Search
          allowClear
          value={exportQuery}
          onChange={(event) => setExportQuery(event.target.value)}
          placeholder="筛选项目、文件夹或 PDM"
          className="backup-tree-search"
        />
        <div className="backup-tree-scroll">
          {visibleExportTree.length ? (
            <Tree
              checkable
              blockNode
              selectable={false}
              motion={null}
              showLine={{ showLeafIcon: false }}
              switcherIcon={(props) => <TreeChevronGlyph expanded={Boolean(props.expanded)} />}
              treeData={visibleExportTree}
              titleRender={(data) => nodeTitle(data as TransferNode)}
              checkedKeys={exportCheckedKeys}
              expandedKeys={exportQuery ? exportIndex.keys : exportExpandedKeys}
              onExpand={(keys) => {
                if (!exportQuery) setExportExpandedKeys(keys.map(String));
              }}
              onCheck={(keys) => setExportCheckedKeys((Array.isArray(keys) ? keys : keys.checked).map(String))}
            />
          ) : (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="没有匹配的节点" />
          )}
        </div>
      </section>
      <aside className="backup-summary-pane">
        <span className="backup-summary-icon"><SafetyCertificateOutlined /></span>
        <h3>生成可迁移备份</h3>
        <p>保留所选目录结构和原始 PDM。数据库索引不打包，导入后由码熊重新建立，体积更小也更可靠。</p>
        <SelectionReceipt summary={exportSummary} />
        <div className="backup-note-list">
          <span><CheckCircleOutlined /> 包含空文件夹和所选 PDM</span>
          <span><CheckCircleOutlined /> 每个文件写入 SHA-256 校验值</span>
          <span><CheckCircleOutlined /> 不包含缓存、回收站和本机设置</span>
        </div>
        {hasUnsavedChanges && (
          <Alert type="warning" showIcon message="请先保存或放弃当前字段修改，再导出备份。" />
        )}
        <Button
          type="primary"
          size="large"
          block
          icon={<DownloadOutlined />}
          loading={exporting}
          disabled={!exportCheckedKeys.length || hasUnsavedChanges}
          onClick={() => void exportSelected()}
        >
          导出 .cbbak 备份包
        </Button>
      </aside>
    </div>
  );

  const importPanel = (
    <div className="backup-layout">
      <section className="backup-tree-pane backup-import-pane">
        <div className="backup-source-row">
          <Segmented<ImportSource>
            value={importSource}
            disabled={inspecting || importing}
            onChange={(value) => {
              discardInspection();
              setImportSource(value);
            }}
            options={[
              { label: "备份包", value: "archive", icon: <FileZipOutlined /> },
              { label: "旧版 data 目录", value: "legacy", icon: <FolderOpenOutlined /> },
            ]}
          />
          {importSource === "archive" ? (
            <Button
              icon={<UploadOutlined />}
              loading={inspecting}
              disabled={importing}
              onClick={() => backupInputRef.current?.click()}
            >
              选择 .cbbak
            </Button>
          ) : null}
        </div>
        {importSource === "legacy" && (
          <div className="backup-legacy-row">
            <Input
              value={legacyPath}
              disabled={inspecting || importing}
              onChange={(event) => setLegacyPath(event.target.value)}
              onPressEnter={() => void inspectLegacy()}
              placeholder="例如 D:\\Program Files (x86)\\CodeBear-v0.2.1-win-x64\\data"
            />
            <Button
              type="primary"
              loading={inspecting}
              disabled={importing}
              onClick={() => void inspectLegacy()}
            >
              读取目录
            </Button>
          </div>
        )}
        {inspection && (
          <>
            <div className="backup-pane-heading backup-import-heading">
              <span><b>选择导入范围</b><small>{inspection.file_name}</small></span>
              <span className="backup-mini-actions">
                <Button type="link" size="small" onClick={() => setImportCheckedKeys(importIndex.keys)}>全选</Button>
                <Button type="link" size="small" onClick={() => setImportCheckedKeys([])}>清空</Button>
              </span>
            </div>
            <Input.Search
              allowClear
              value={importQuery}
              onChange={(event) => setImportQuery(event.target.value)}
              placeholder="筛选备份中的节点"
              className="backup-tree-search"
            />
          </>
        )}
        <div className="backup-tree-scroll">
          {inspecting ? (
            <div className="backup-inspecting"><Spin /><span>正在读取并校验内容…</span></div>
          ) : inspection ? (
            <Tree
              checkable
              blockNode
              selectable={false}
              motion={null}
              showLine={{ showLeafIcon: false }}
              switcherIcon={(props) => <TreeChevronGlyph expanded={Boolean(props.expanded)} />}
              treeData={visibleImportTree}
              titleRender={(data) => nodeTitle(data as TransferNode)}
              checkedKeys={importCheckedKeys}
              expandedKeys={importQuery ? importIndex.keys : importExpandedKeys}
              onExpand={(keys) => {
                if (!importQuery) setImportExpandedKeys(keys.map(String));
              }}
              onCheck={(keys) => setImportCheckedKeys((Array.isArray(keys) ? keys : keys.checked).map(String))}
            />
          ) : (
            <div className="backup-source-empty">
              {importSource === "archive" ? <FileZipOutlined /> : <FolderOpenOutlined />}
              <strong>{importSource === "archive" ? "选择码熊备份包" : "读取旧版 data 目录"}</strong>
              <span>
                {importSource === "archive"
                  ? "校验通过后，才能选择要导入的项目和节点。"
                  : "适用于没有导出功能的旧版绿色程序。原目录不会被修改。"}
              </span>
            </div>
          )}
        </div>
      </section>
      <aside className="backup-summary-pane">
        {inspection ? (
          <>
            <span className="backup-summary-icon is-import"><ImportOutlined /></span>
            <h3>确认迁移内容</h3>
            <div className="backup-source-meta">
              <span><small>来源版本</small><b>{inspection.app_version || "未知"}</b></span>
              <span><small>创建时间</small><b>{formatCreatedAt(inspection.created_at)}</b></span>
            </div>
            <SelectionReceipt summary={importSummary} />
            <div className="backup-policy">
              <label>同路径 PDM 已存在时</label>
              <Radio.Group
                value={conflictPolicy}
                onChange={(event) => setConflictPolicy(event.target.value as ConflictPolicy)}
                optionType="button"
                buttonStyle="solid"
                options={[
                  { label: "自动改名", value: "rename" },
                  { label: "跳过", value: "skip" },
                  { label: "覆盖", value: "overwrite" },
                ]}
              />
              <small>
                {conflictPolicy === "rename"
                  ? "保留现有文件，新文件自动添加“(导入)”后缀。"
                  : conflictPolicy === "skip"
                    ? "保留现有文件，仅导入没有冲突的内容。"
                    : "用备份内容替换现有 PDM，操作前会再次确认。"}
              </small>
            </div>
            <Alert
              type="info"
              showIcon
              message="导入只写入当前程序工作区，备份包和旧版 data 均不会被修改。"
            />
            <Button
              type="primary"
              size="large"
              block
              icon={<ImportOutlined />}
              loading={importing}
              disabled={!importCheckedKeys.length}
              onClick={requestImport}
            >
              开始导入所选节点
            </Button>
          </>
        ) : (
          <>
            <span className="backup-summary-icon is-muted"><SafetyCertificateOutlined /></span>
            <h3>先检查，再写入</h3>
            <p>码熊会验证备份格式、路径边界、文件大小和校验值。检查阶段不会改动当前工作区。</p>
            <div className="backup-note-list">
              <span><CheckCircleOutlined /> 支持按项目、目录、PDM 选择</span>
              <span><CheckCircleOutlined /> 支持旧版绿色程序 data 迁移</span>
              <span><CheckCircleOutlined /> 冲突处理由你决定</span>
            </div>
          </>
        )}
      </aside>
    </div>
  );

  return (
    <Modal
      open={open}
      title={<span className="backup-modal-title"><SafetyCertificateOutlined /> 备份与迁移</span>}
      width={1040}
      footer={null}
      closable={!exporting && !inspecting && !importing}
      mask={{ closable: false }}
      destroyOnHidden
      className="backup-migration-modal"
      onCancel={closeModal}
    >
      <input
        ref={backupInputRef}
        className="hidden-file-input"
        type="file"
        accept=".cbbak,application/zip,application/octet-stream"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void inspectArchive(file);
        }}
      />
      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={[
          { key: "export", label: <span><DownloadOutlined /> 导出备份</span>, children: exportPanel },
          { key: "import", label: <span><ImportOutlined /> 导入 / 迁移</span>, children: importPanel },
        ]}
      />
    </Modal>
  );
}
