/**
 * Compatibility facade for integrations that still import the historical `api` object.
 * Product code imports its own feature API so lazy feature chunks stay isolated.
 */
import { aiApi } from "./features/ai/api";
import { backupApi } from "./features/backup/api";
import { ddlApi } from "./features/ddl/api";
import { tablesApi } from "./features/tables/api";
import { workspaceApi } from "./features/workspace/api";

export { ApiError } from "./shared/api/client";

export const api = {
  settings: workspaceApi.settings,
  updateWorkspace: workspaceApi.updateWorkspace,
  projects: workspaceApi.projects,
  createProject: workspaceApi.createProject,
  renameProject: workspaceApi.renameProject,
  tree: workspaceApi.tree,
  refresh: workspaceApi.refresh,
  createFolder: workspaceApi.createFolder,
  renameNode: workspaceApi.renameNode,
  moveNode: workspaceApi.moveNode,
  trashNode: workspaceApi.trashNode,
  trash: workspaceApi.trash,
  restoreTrash: workspaceApi.restoreTrash,
  importPdm: workspaceApi.importPdm,
  tables: tablesApi.search,
  table: tablesApi.detail,
  saveFields: tablesApi.saveFields,
  aiSettings: aiApi.settings,
  saveAiSettings: aiApi.saveSettings,
  clearAiKey: aiApi.clearKey,
  testAi: aiApi.testConnection,
  aiChat: aiApi.chat,
  aiConversations: aiApi.conversations,
  aiConversation: aiApi.conversation,
  createAiConversation: aiApi.createConversation,
  appendAiConversationMessage: aiApi.appendConversationMessage,
  renameAiConversation: aiApi.renameConversation,
  deleteAiConversation: aiApi.deleteConversation,
  exportBackup: backupApi.export,
  inspectBackup: backupApi.inspect,
  inspectLegacyData: backupApi.inspectLegacy,
  importBackup: backupApi.import,
  discardBackup: backupApi.discard,
  ddlOptions: ddlApi.options,
  ddlCatalog: ddlApi.catalog,
  generateDdl: ddlApi.generate,
};
