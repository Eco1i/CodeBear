import { json, request } from "../../shared/api/client";
import type {
  AiChatResponse,
  AiConversationDetail,
  AiConversationMessageInput,
  AiConversationMessageResult,
  AiConversationSummary,
  AiHistoryMessage,
  AiScope,
  AiSettingsStatus,
} from "./types";

export const aiApi = {
  settings: () => request<AiSettingsStatus>("/api/ai/settings", { cache: "no-store" }),
  saveSettings: (payload: {
    api_key?: string;
    assistant_name?: string;
    assistant_accessory?: AiSettingsStatus["assistant_accessory"];
  }) => request<AiSettingsStatus>("/api/ai/settings", json("PUT", payload)),
  clearKey: () => request<AiSettingsStatus>("/api/ai/settings", { method: "DELETE" }),
  testConnection: (api_key?: string) =>
    request<{ connected: boolean; provider: string; model: string }>(
      "/api/ai/test",
      json("POST", api_key ? { api_key } : {}),
    ),
  chat: (question: string, scope: AiScope, history: AiHistoryMessage[], signal?: AbortSignal) =>
    request<AiChatResponse>("/api/ai/chat", {
      ...json("POST", { question, scope, history }),
      signal,
    }),
  conversations: (limit = 200) =>
    request<AiConversationSummary[]>(`/api/ai/conversations?limit=${limit}`, { cache: "no-store" }),
  conversation: (conversationId: string) =>
    request<AiConversationDetail>(`/api/ai/conversations/${encodeURIComponent(conversationId)}`, {
      cache: "no-store",
    }),
  createConversation: (first_message: AiConversationMessageInput) =>
    request<AiConversationDetail>("/api/ai/conversations", json("POST", { first_message })),
  appendConversationMessage: (conversationId: string, message: AiConversationMessageInput) =>
    request<AiConversationMessageResult>(
      `/api/ai/conversations/${encodeURIComponent(conversationId)}/messages`,
      json("POST", message),
    ),
  renameConversation: (conversationId: string, title: string) =>
    request<AiConversationSummary>(
      `/api/ai/conversations/${encodeURIComponent(conversationId)}`,
      json("PATCH", { title }),
    ),
  deleteConversation: (conversationId: string) =>
    request<{ deleted: boolean }>(`/api/ai/conversations/${encodeURIComponent(conversationId)}`, {
      method: "DELETE",
    }),
};
