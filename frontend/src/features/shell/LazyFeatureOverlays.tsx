import { lazy, Suspense } from "react";
import { Spin } from "antd";
import type {
  AiAccessory,
  AiEvidenceTable,
  AiLayoutMode,
  BackupImportResult,
  Project,
  TableDetail,
  WorkspaceNode,
} from "../../types";
import { AiLauncher } from "../../components/AiLauncher";
import type { UpdateState } from "../updates/types";

const AiAssistant = lazy(() =>
  import("../../components/AiAssistant").then((module) => ({ default: module.AiAssistant })),
);
const BackupMigrationModal = lazy(() =>
  import("../../components/BackupMigrationModal").then((module) => ({
    default: module.BackupMigrationModal,
  })),
);
const DdlExportModal = lazy(() =>
  import("../../components/DdlExportModal").then((module) => ({ default: module.DdlExportModal })),
);
const DictionaryCenterModal = lazy(() =>
  import("../../components/DictionaryCenterModal").then((module) => ({ default: module.DictionaryCenterModal })),
);
const UpdateModal = lazy(() =>
  import("../updates/components/UpdateModal").then((module) => ({ default: module.UpdateModal })),
);

interface LazyFeatureOverlaysProps {
  trees: WorkspaceNode[];
  selectedNode: WorkspaceNode | null;
  selectedTable: TableDetail | null;
  activeProject?: Project;
  hasUnsavedChanges: boolean;
  backupLoaded: boolean;
  backupOpen: boolean;
  ddlLoaded: boolean;
  ddlOpen: boolean;
  dictionaryLoaded: boolean;
  dictionaryOpen: boolean;
  updateLoaded: boolean;
  updateOpen: boolean;
  updateState: UpdateState | null;
  updateChecking: boolean;
  aiLoaded: boolean;
  aiOpen: boolean;
  aiMode: AiLayoutMode;
  aiAssistantName?: string;
  aiAssistantAccessory?: AiAccessory;
  onCloseBackup: () => void;
  onBackupImported: (result: BackupImportResult) => void | Promise<void>;
  onCloseDdl: () => void;
  onCloseDictionary: () => void;
  onDictionaryBindingsChanged: () => void;
  onCloseUpdate: () => void;
  onRefreshUpdate: () => void;
  onIgnoreUpdate: (version: string) => void;
  onRequestContextChange: (action: () => void) => void;
  onOpenAi: () => void;
  onAiOpenChange: (open: boolean) => void;
  onAiModeChange: (mode: AiLayoutMode) => void;
  onOpenAiTable: (evidence: AiEvidenceTable, options?: { exitFullscreen?: boolean }) => void;
}

export function LazyFeatureOverlays(props: LazyFeatureOverlaysProps) {
  return (
    <>
      {props.backupLoaded ? (
        <Suspense fallback={<div className="feature-loading" role="status"><Spin size="small" /> 正在打开备份迁移…</div>}>
          <BackupMigrationModal
            open={props.backupOpen}
            trees={props.trees}
            selectedNode={props.selectedNode}
            hasUnsavedChanges={props.hasUnsavedChanges}
            onClose={props.onCloseBackup}
            onRequestContextChange={props.onRequestContextChange}
            onImported={props.onBackupImported}
          />
        </Suspense>
      ) : null}

      {props.ddlLoaded ? (
        <Suspense fallback={<div className="feature-loading" role="status"><Spin size="small" /> 正在打开 SQL 导出…</div>}>
          <DdlExportModal
            open={props.ddlOpen}
            project={props.activeProject || null}
            selectedNode={props.selectedNode}
            hasUnsavedChanges={props.hasUnsavedChanges}
            onClose={props.onCloseDdl}
          />
        </Suspense>
      ) : null}

      {props.dictionaryLoaded ? (
        <Suspense fallback={<div className="feature-loading" role="status"><Spin size="small" /> 正在打开字典中心…</div>}>
          <DictionaryCenterModal
            open={props.dictionaryOpen}
            trees={props.trees}
            selectedNode={props.selectedNode}
            onClose={props.onCloseDictionary}
            onBindingsChanged={props.onDictionaryBindingsChanged}
          />
        </Suspense>
      ) : null}

      {props.updateLoaded ? (
        <Suspense fallback={<div className="feature-loading" role="status"><Spin size="small" /> 正在打开更新面板…</div>}>
          <UpdateModal
            open={props.updateOpen}
            state={props.updateState}
            checking={props.updateChecking}
            onClose={props.onCloseUpdate}
            onRefresh={props.onRefreshUpdate}
            onIgnore={props.onIgnoreUpdate}
          />
        </Suspense>
      ) : null}

      {props.aiLoaded ? (
        <Suspense fallback={<div className="feature-loading is-ai" role="status"><Spin size="small" /> 正在唤醒小码…</div>}>
          <AiAssistant
            open={props.aiOpen}
            mode={props.aiMode}
            activeProject={props.activeProject}
            selectedNode={props.selectedNode}
            selectedTable={props.selectedTable}
            onOpenChange={props.onAiOpenChange}
            onModeChange={props.onAiModeChange}
            onOpenTable={props.onOpenAiTable}
          />
        </Suspense>
      ) : (
        <AiLauncher
          assistantName={props.aiAssistantName}
          assistantAccessory={props.aiAssistantAccessory}
          onOpen={props.onOpenAi}
        />
      )}
    </>
  );
}
