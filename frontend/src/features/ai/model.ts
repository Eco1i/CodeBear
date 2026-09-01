import type {
  AiClarification,
  AiConfidence,
  AiConversationDetail,
  AiConversationMessage as StoredConversationMessage,
  AiConversationMessageInput,
  AiEvidenceTable,
  AiHistoryMessage,
  AiRetrievalSummary,
  AiScope,
  AiScopeType,
} from "./types";
import type { TableDetail } from "../tables/types";
import { readLanguagePreference } from "../preferences/model";
import { translateError } from "../preferences/messages";
import type { AppLanguage } from "../preferences/types";
import type { Project, WorkspaceNode } from "../workspace/types";

export const MODEL_ID = "deepseek-v4-flash";
export const DEFAULT_ASSISTANT_NAME = "小码";
export const AI_SCOPE_STORAGE_KEY = "maxiong.ai.scope-type";
const AI_ACTIVE_CONVERSATION_STORAGE_KEY = "maxiong.ai.active-conversation";

export interface ScopeOption {
  key: string;
  kind: string;
  value: string;
  scope: AiScope;
}

export interface ConversationMessage extends AiHistoryMessage {
  id: string;
  evidence?: AiEvidenceTable[];
  retrieval?: AiRetrievalSummary;
  model?: string;
  confidence?: AiConfidence;
  clarification?: AiClarification | null;
  error?: boolean;
}

export type ConversationDateGroup = "今天" | "昨天" | "更早";

export function readStoredScopeType(): AiScopeType {
  try {
    const stored = localStorage.getItem(AI_SCOPE_STORAGE_KEY);
    if (
      stored === "table" ||
      stored === "pdm" ||
      stored === "project" ||
      stored === "all"
    ) {
      return stored;
    }
  } catch {
    // Local storage can be unavailable in locked-down browser profiles.
  }
  return "project";
}

export function readStoredConversationId(): string {
  try {
    return localStorage.getItem(AI_ACTIVE_CONVERSATION_STORAGE_KEY) || "";
  } catch {
    return "";
  }
}

export function storeActiveConversationId(conversationId: string | null): void {
  try {
    if (conversationId)
      localStorage.setItem(AI_ACTIVE_CONVERSATION_STORAGE_KEY, conversationId);
    else localStorage.removeItem(AI_ACTIVE_CONVERSATION_STORAGE_KEY);
  } catch {
    // The conversation itself remains safe in SQLite when browser storage is unavailable.
  }
}

export function messageId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random()}`;
}

export function storedConversationMessage(
  item: StoredConversationMessage,
): ConversationMessage {
  return {
    id: item.id,
    role: item.role,
    content: item.content,
    evidence: item.evidence,
    retrieval: item.retrieval,
    model: item.model,
    confidence: item.confidence,
    clarification: item.clarification,
    error: item.error,
  };
}

export function conversationMessageInput(
  item: ConversationMessage,
  scopeOption?: ScopeOption,
): AiConversationMessageInput {
  return {
    id: item.id,
    role: item.role,
    content: item.content,
    payload: {
      ...(item.evidence?.length ? { evidence: item.evidence } : {}),
      ...(item.retrieval ? { retrieval: item.retrieval } : {}),
      ...(item.model ? { model: item.model } : {}),
      ...(item.confidence ? { confidence: item.confidence } : {}),
      ...(item.clarification ? { clarification: item.clarification } : {}),
      ...(item.error ? { error: true } : {}),
      ...(scopeOption
        ? {
            scope: scopeOption.scope,
            scope_kind: scopeOption.kind,
            scope_value: scopeOption.value,
          }
        : {}),
    },
  };
}

export function conversationDateGroup(value: string): ConversationDateGroup {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "更早";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  const difference = Math.round(
    (today.getTime() - target.getTime()) / 86_400_000,
  );
  if (difference <= 0) return "今天";
  if (difference === 1) return "昨天";
  return "更早";
}

export function conversationTime(
  value: string,
  language: AppLanguage = readLanguagePreference(),
): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  if (conversationDateGroup(value) !== "更早") {
    return date.toLocaleTimeString(language, {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  }
  return date.toLocaleDateString(language, {
    month: "numeric",
    day: "numeric",
  });
}

export function errorText(
  error: unknown,
  language: AppLanguage = readLanguagePreference(),
): string {
  return translateError(language, error);
}

export function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === "AbortError") ||
    (error instanceof Error && error.name === "AbortError")
  );
}

export function buildScopeOptions(
  activeProject: Project | undefined,
  selectedNode: WorkspaceNode | null,
  selectedTable: TableDetail | null,
): ScopeOption[] {
  const options: ScopeOption[] = [];
  if (selectedTable) {
    options.push({
      key: `table:${selectedTable.id}`,
      kind: "当前表",
      value: selectedTable.code || selectedTable.name,
      scope: { type: "table", table_id: selectedTable.id },
    });
  }
  const pdmProjectId =
    selectedTable?.project_id || selectedNode?.project_id || activeProject?.id;
  const pdmPath =
    selectedTable?.relative_path ||
    (selectedNode?.type === "pdm" ? selectedNode.relative_path : "");
  if (pdmProjectId && pdmPath) {
    options.push({
      key: `pdm:${pdmProjectId}:${pdmPath}`,
      kind: "当前 PDM",
      value: pdmPath.split("/").at(-1) || pdmPath,
      scope: { type: "pdm", project_id: pdmProjectId, scope_path: pdmPath },
    });
  }
  if (activeProject) {
    options.push({
      key: `project:${activeProject.id}`,
      kind: "当前项目",
      value: activeProject.name,
      scope: { type: "project", project_id: activeProject.id },
    });
  }
  options.push({
    key: "all",
    kind: "全局",
    value: "所有项目",
    scope: { type: "all" },
  });
  return options;
}

export function scopesMatch(left: AiScope, right: AiScope): boolean {
  return (
    left.type === right.type &&
    (left.project_id || "") === (right.project_id || "") &&
    (left.scope_path || "") === (right.scope_path || "") &&
    (left.table_id || "") === (right.table_id || "")
  );
}

export function restoredScopeFromConversation(
  conversation: AiConversationDetail,
  currentOptions: ScopeOption[],
): ScopeOption | null {
  const stored = [...conversation.messages]
    .reverse()
    .find((message) => message.role === "user" && message.scope);
  if (!stored?.scope) return null;
  const current = currentOptions.find((option) =>
    scopesMatch(option.scope, stored.scope as AiScope),
  );
  if (current) return current;
  const defaults: Record<AiScopeType, { kind: string; value: string }> = {
    table: {
      kind: "原查询表",
      value: stored.scope.table_id || "已保存的数据表",
    },
    pdm: {
      kind: "原 PDM",
      value: stored.scope.scope_path?.split("/").at(-1) || "已保存的 PDM",
    },
    project: {
      kind: "原项目",
      value: stored.scope.project_id || "已保存的项目",
    },
    all: { kind: "全局", value: "所有项目" },
  };
  const fallback = defaults[stored.scope.type];
  return {
    key: `history:${conversation.id}`,
    kind: stored.scope_kind || fallback.kind,
    value: stored.scope_value || fallback.value,
    scope: stored.scope,
  };
}
