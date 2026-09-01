import { useEffect, useMemo, useRef, useState } from "react";
import {
  BookOutlined,
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
  Checkbox,
  Empty,
  Input,
  Modal,
  Radio,
  Segmented,
  Spin,
  Tabs,
  Tree,
} from "antd";
import { backupApi } from "../features/backup/api";
import {
  backupTree,
  buildTreeIndex,
  collectSubtreeKeys,
  compactSelection,
  exportTreeNode,
  filterTree,
  formatBytes,
  formatCreatedAt,
  normalizeProjectNode,
  selectionSummary,
} from "../features/backup/model";
import type {
  ConflictPolicy,
  ImportSource,
  SelectionSummary,
  TransferNode,
} from "../features/backup/model";
import type {
  BackupExportNode,
  BackupImportNode,
  BackupImportResult,
  BackupInspection,
  WorkspaceNode,
} from "../types";
import { useI18n } from "../features/preferences/PreferencesProvider";
import { DraggableModal } from "./DraggableModal";
import {
  FolderGlyph,
  PdmGlyph,
  ProjectGlyph,
  TreeChevronGlyph,
} from "./PrototypeGlyphs";

interface BackupMigrationModalProps {
  open: boolean;
  trees: WorkspaceNode[];
  selectedNode: WorkspaceNode | null;
  hasUnsavedChanges: boolean;
  onClose: () => void;
  onRequestContextChange: (action: () => void) => void;
  onImported: (result: BackupImportResult) => void | Promise<void>;
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
      {node.nodeType === "pdm" && node.size > 0 && (
        <small>{formatBytes(node.size)}</small>
      )}
    </span>
  );
}

type Translate = (
  key: string,
  params?: Record<string, string | number>,
) => string;

function SelectionReceipt({
  summary,
  t,
}: {
  summary: SelectionSummary;
  t: Translate;
}) {
  return (
    <div className="backup-receipt">
      <span>
        <b>{summary.projectCount}</b>
        <small>{t("common.project")}</small>
      </span>
      <span>
        <b>{summary.folderCount}</b>
        <small>{t("common.folder")}</small>
      </span>
      <span>
        <b>{summary.pdmCount}</b>
        <small>{t("common.pdm")}</small>
      </span>
      <span>
        <b>{formatBytes(summary.totalBytes)}</b>
        <small>{t("backup.totalFileSize")}</small>
      </span>
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
  const { t, language, errorText } = useI18n();
  const [activeTab, setActiveTab] = useState("export");
  const [exportQuery, setExportQuery] = useState("");
  const [exportCheckedKeys, setExportCheckedKeys] = useState<string[]>([]);
  const [exportExpandedKeys, setExportExpandedKeys] = useState<string[]>([]);
  const [exporting, setExporting] = useState(false);
  const [includeDictionaries, setIncludeDictionaries] = useState(true);
  const [includeDictionaryBindings, setIncludeDictionaryBindings] =
    useState(true);
  const [includeRelations, setIncludeRelations] = useState(true);
  const [importSource, setImportSource] = useState<ImportSource>("archive");
  const [legacyPath, setLegacyPath] = useState("");
  const [inspection, setInspection] = useState<BackupInspection | null>(null);
  const [importQuery, setImportQuery] = useState("");
  const [importCheckedKeys, setImportCheckedKeys] = useState<string[]>([]);
  const [importExpandedKeys, setImportExpandedKeys] = useState<string[]>([]);
  const [conflictPolicy, setConflictPolicy] =
    useState<ConflictPolicy>("rename");
  const [inspecting, setInspecting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const backupInputRef = useRef<HTMLInputElement>(null);
  const importProgressTimerRef = useRef<number | null>(null);

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

  const importTree = useMemo(
    () => (inspection ? backupTree(inspection) : []),
    [inspection],
  );
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
    const selected = selectedNode
      ? exportIndex.nodes.get(selectedNode.id)
      : undefined;
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
    let parent = selectedNode
      ? exportIndex.parents.get(selectedNode.id)
      : undefined;
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

  useEffect(
    () => () => {
      if (importProgressTimerRef.current !== null) {
        window.clearInterval(importProgressTimerRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    if (!importing) return undefined;
    const confirmBeforeLeaving = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", confirmBeforeLeaving);
    return () =>
      window.removeEventListener("beforeunload", confirmBeforeLeaving);
  }, [importing]);

  const stopImportProgressTimer = () => {
    if (importProgressTimerRef.current === null) return;
    window.clearInterval(importProgressTimerRef.current);
    importProgressTimerRef.current = null;
  };

  const startImportProgress = () => {
    stopImportProgressTimer();
    setImportProgress(6);
    importProgressTimerRef.current = window.setInterval(() => {
      setImportProgress((current) =>
        Math.min(92, current + Math.max(0.7, (92 - current) * 0.075)),
      );
    }, 180);
  };

  const discardInspection = (current = inspection) => {
    if (current?.token)
      void backupApi.discard(current.token).catch(() => undefined);
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
      message.warning(t("backup.selectExportRequired"));
      return;
    }
    setExporting(true);
    try {
      const result = await backupApi.export(nodes, {
        includeDictionaries,
        includeDictionaryBindings:
          includeDictionaries && includeDictionaryBindings,
        includeRelations,
      });
      const url = URL.createObjectURL(result.blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = result.fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      message.success(t("backup.generated", { file: result.fileName }));
    } catch (error) {
      message.error(errorText(error, "backup.exportFailed"));
    } finally {
      setExporting(false);
    }
  };

  const inspectArchive = async (file: File) => {
    if (file.size > 2 * 1024 * 1024 * 1024) {
      message.error(t("backup.tooLarge"));
      return;
    }
    setInspecting(true);
    const previous = inspection;
    try {
      const result = await backupApi.inspect(file);
      if (previous)
        void backupApi.discard(previous.token).catch(() => undefined);
      setInspection(result);
    } catch (error) {
      message.error(errorText(error, "backup.readArchiveFailed"));
    } finally {
      setInspecting(false);
    }
  };

  const inspectLegacy = async () => {
    if (!legacyPath.trim()) {
      message.warning(t("backup.enterLegacyPath"));
      return;
    }
    setInspecting(true);
    const previous = inspection;
    try {
      const result = await backupApi.inspectLegacy(legacyPath.trim());
      if (previous)
        void backupApi.discard(previous.token).catch(() => undefined);
      setInspection(result);
    } catch (error) {
      message.error(errorText(error, "backup.readLegacyFailed"));
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
      message.warning(t("backup.selectImportRequired"));
      return;
    }
    setImporting(true);
    startImportProgress();
    try {
      const result = await backupApi.import(
        inspection.token,
        nodes,
        conflictPolicy,
      );
      stopImportProgressTimer();
      setImportProgress(100);
      await new Promise((resolve) => window.setTimeout(resolve, 420));
      await backupApi.discard(inspection.token).catch(() => undefined);
      await onImported(result);
      const suffix = result.parse_errors.length
        ? t("backup.partialPdmFailure", { count: result.parse_errors.length })
        : "";
      message.success(
        t("backup.imported", { count: result.imported.length, suffix }),
      );
      setInspection(null);
      setImportCheckedKeys([]);
      onClose();
    } catch (error) {
      stopImportProgressTimer();
      setImportProgress(0);
      message.error(errorText(error, "backup.importFailed"));
    } finally {
      stopImportProgressTimer();
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
        title: t("backup.confirmOverwriteTitle"),
        content: t("backup.confirmOverwriteContent"),
        okText: t("backup.confirmOverwrite"),
        cancelText: t("common.cancel"),
        okButtonProps: { danger: true },
        onOk: performImport,
      });
    });
  };

  const exportPanel = (
    <div className="backup-layout">
      <section className="backup-tree-pane">
        <div className="backup-pane-heading">
          <span>
            <b>{t("backup.exportScope")}</b>
            <small>{t("backup.exportScopeHint")}</small>
          </span>
          <span className="backup-mini-actions">
            <Button
              type="link"
              size="small"
              onClick={() => setExportCheckedKeys(exportIndex.keys)}
            >
              {t("backup.selectAll")}
            </Button>
            <Button
              type="link"
              size="small"
              onClick={() => setExportCheckedKeys([])}
            >
              {t("backup.clear")}
            </Button>
          </span>
        </div>
        <Input.Search
          allowClear
          value={exportQuery}
          onChange={(event) => setExportQuery(event.target.value)}
          placeholder={t("backup.filterNodes")}
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
              switcherIcon={(props) => (
                <TreeChevronGlyph expanded={Boolean(props.expanded)} />
              )}
              treeData={visibleExportTree}
              titleRender={(data) => nodeTitle(data as TransferNode)}
              checkedKeys={exportCheckedKeys}
              expandedKeys={exportQuery ? exportIndex.keys : exportExpandedKeys}
              onExpand={(keys) => {
                if (!exportQuery) setExportExpandedKeys(keys.map(String));
              }}
              onCheck={(keys) =>
                setExportCheckedKeys(
                  (Array.isArray(keys) ? keys : keys.checked).map(String),
                )
              }
            />
          ) : (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={t("backup.noMatchingNodes")}
            />
          )}
        </div>
      </section>
      <aside className="backup-summary-pane">
        <span className="backup-summary-icon">
          <SafetyCertificateOutlined />
        </span>
        <h3>{t("backup.generateTitle")}</h3>
        <p>{t("backup.generateDescription")}</p>
        <SelectionReceipt summary={exportSummary} t={t} />
        <div className="backup-note-list">
          <span>
            <CheckCircleOutlined /> {t("backup.includesFiles")}
          </span>
          <span>
            <CheckCircleOutlined /> {t("backup.includesHashes")}
          </span>
          <span>
            <CheckCircleOutlined /> {t("backup.excludesLocal")}
          </span>
        </div>
        <div className="backup-dictionary-options">
          <Checkbox
            checked={includeDictionaries}
            onChange={(event) => {
              setIncludeDictionaries(event.target.checked);
              if (!event.target.checked) setIncludeDictionaryBindings(false);
            }}
          >
            {t("backup.exportDictionaries")}
          </Checkbox>
          <Checkbox
            checked={includeDictionaries && includeDictionaryBindings}
            disabled={!includeDictionaries}
            onChange={(event) =>
              setIncludeDictionaryBindings(event.target.checked)
            }
          >
            {t("backup.exportBindings")}
          </Checkbox>
          <Checkbox
            checked={includeRelations}
            onChange={(event) => setIncludeRelations(event.target.checked)}
          >
            {t("backup.exportRelations")}
          </Checkbox>
        </div>
        {hasUnsavedChanges && (
          <Alert
            type="warning"
            showIcon
            message={t("backup.saveBeforeExport")}
          />
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
          {t("backup.exportPackage")}
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
              {
                label: t("backup.archive"),
                value: "archive",
                icon: <FileZipOutlined />,
              },
              {
                label: t("backup.legacy"),
                value: "legacy",
                icon: <FolderOpenOutlined />,
              },
            ]}
          />
          {importSource === "archive" ? (
            <Button
              icon={<UploadOutlined />}
              loading={inspecting}
              disabled={importing}
              onClick={() => backupInputRef.current?.click()}
            >
              {t("backup.chooseArchive")}
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
              placeholder={t("backup.legacyPath")}
            />
            <Button
              type="primary"
              loading={inspecting}
              disabled={importing}
              onClick={() => void inspectLegacy()}
            >
              {t("backup.readDirectory")}
            </Button>
          </div>
        )}
        {inspection && (
          <>
            <div className="backup-pane-heading backup-import-heading">
              <span>
                <b>{t("backup.importScope")}</b>
                <small>{inspection.file_name}</small>
              </span>
              <span className="backup-mini-actions">
                <Button
                  type="link"
                  size="small"
                  onClick={() => setImportCheckedKeys(importIndex.keys)}
                >
                  {t("backup.selectAll")}
                </Button>
                <Button
                  type="link"
                  size="small"
                  onClick={() => setImportCheckedKeys([])}
                >
                  {t("backup.clear")}
                </Button>
              </span>
            </div>
            <Input.Search
              allowClear
              value={importQuery}
              onChange={(event) => setImportQuery(event.target.value)}
              placeholder={t("backup.filterNodesInArchive")}
              className="backup-tree-search"
            />
          </>
        )}
        <div className="backup-tree-scroll">
          {inspecting ? (
            <div className="backup-inspecting">
              <Spin />
              <span>{t("backup.inspecting")}</span>
            </div>
          ) : inspection ? (
            <Tree
              checkable
              blockNode
              selectable={false}
              motion={null}
              showLine={{ showLeafIcon: false }}
              switcherIcon={(props) => (
                <TreeChevronGlyph expanded={Boolean(props.expanded)} />
              )}
              treeData={visibleImportTree}
              titleRender={(data) => nodeTitle(data as TransferNode)}
              checkedKeys={importCheckedKeys}
              expandedKeys={importQuery ? importIndex.keys : importExpandedKeys}
              onExpand={(keys) => {
                if (!importQuery) setImportExpandedKeys(keys.map(String));
              }}
              onCheck={(keys) =>
                setImportCheckedKeys(
                  (Array.isArray(keys) ? keys : keys.checked).map(String),
                )
              }
            />
          ) : (
            <div className="backup-source-empty">
              {importSource === "archive" ? (
                <FileZipOutlined />
              ) : (
                <FolderOpenOutlined />
              )}
              <strong>
                {importSource === "archive"
                  ? t("backup.chooseArchiveTitle")
                  : t("backup.chooseLegacyTitle")}
              </strong>
              <span>
                {importSource === "archive"
                  ? t("backup.archiveHint")
                  : t("backup.legacyHint")}
              </span>
            </div>
          )}
        </div>
      </section>
      <aside className="backup-summary-pane">
        {inspection ? (
          <>
            <span className="backup-summary-icon is-import">
              <ImportOutlined />
            </span>
            <h3>{t("backup.confirmTitle")}</h3>
            <div className="backup-source-meta">
              <span>
                <small>{t("backup.sourceVersion")}</small>
                <b>{inspection.app_version || t("backup.unknown")}</b>
              </span>
              <span>
                <small>{t("backup.createdAt")}</small>
                <b>{formatCreatedAt(inspection.created_at, language)}</b>
              </span>
            </div>
            <SelectionReceipt summary={importSummary} t={t} />
            {inspection.stats.dictionary_count ||
            inspection.stats.binding_count ? (
              <div className="backup-dictionary-receipt">
                <BookOutlined />
                <span>
                  <b>
                    {t("backup.dictionarySummary", {
                      count: inspection.stats.dictionary_count || 0,
                    })}
                  </b>
                  <small>
                    {t("backup.bindingRestoreSummary", {
                      count: inspection.stats.binding_count || 0,
                    })}
                  </small>
                </span>
              </div>
            ) : null}
            <div className="backup-policy">
              <label>{t("backup.conflictWhenExists")}</label>
              <Radio.Group
                value={conflictPolicy}
                onChange={(event) =>
                  setConflictPolicy(event.target.value as ConflictPolicy)
                }
                optionType="button"
                buttonStyle="solid"
                options={[
                  { label: t("backup.rename"), value: "rename" },
                  { label: t("backup.skip"), value: "skip" },
                  { label: t("backup.overwrite"), value: "overwrite" },
                ]}
              />
              <small>
                {conflictPolicy === "rename"
                  ? t("backup.renameHint")
                  : conflictPolicy === "skip"
                    ? t("backup.skipHint")
                    : t("backup.overwriteHint")}
              </small>
            </div>
            <Alert type="info" showIcon message={t("backup.importInfo")} />
            {importing ? (
              <div
                className="backup-import-progress"
                role="progressbar"
                aria-label={t("backup.importProgress")}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(importProgress)}
                aria-valuetext={t("backup.importedPercent", {
                  percent: Math.round(importProgress),
                })}
              >
                <div
                  className="backup-import-progress-track"
                  aria-hidden="true"
                >
                  <span style={{ width: `${importProgress}%` }} />
                </div>
                <b>{Math.round(importProgress)}%</b>
              </div>
            ) : (
              <Button
                type="primary"
                size="large"
                block
                icon={<ImportOutlined />}
                disabled={!importCheckedKeys.length}
                onClick={requestImport}
              >
                {t("backup.startImport")}
              </Button>
            )}
          </>
        ) : (
          <>
            <span className="backup-summary-icon is-muted">
              <SafetyCertificateOutlined />
            </span>
            <h3>{t("backup.checkFirstTitle")}</h3>
            <p>{t("backup.checkFirstDescription")}</p>
            <div className="backup-note-list">
              <span>
                <CheckCircleOutlined /> {t("backup.supportSelection")}
              </span>
              <span>
                <CheckCircleOutlined /> {t("backup.supportLegacy")}
              </span>
              <span>
                <CheckCircleOutlined /> {t("backup.chooseConflict")}
              </span>
            </div>
          </>
        )}
      </aside>
    </div>
  );

  return (
    <DraggableModal
      open={open}
      title={
        <span className="backup-modal-title">
          <SafetyCertificateOutlined /> {t("backup.modalTitle")}
        </span>
      }
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
          {
            key: "export",
            label: (
              <span>
                <DownloadOutlined /> {t("backup.modalExport")}
              </span>
            ),
            children: exportPanel,
          },
          {
            key: "import",
            label: (
              <span>
                <ImportOutlined /> {t("backup.modalImport")}
              </span>
            ),
            children: importPanel,
          },
        ]}
      />
    </DraggableModal>
  );
}
