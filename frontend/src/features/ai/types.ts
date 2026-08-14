export type AiScopeType = "table" | "pdm" | "project" | "all";
export type AiLayoutMode = "sidebar" | "floating" | "fullscreen";
export type AiConfidence = "high" | "medium" | "low";
export type AiAccessory =
  | "none"
  | "blue_scarf"
  | "red_cap"
  | "knit_hat"
  | "round_glasses"
  | "headphones"
  | "bow_tie"
  | "data_crown";

export interface AiSettingsStatus {
  provider: "deepseek";
  model: string;
  base_url: string;
  assistant_name: string;
  assistant_accessory: AiAccessory;
  configured: boolean;
  key_hint: string;
  storage: "none" | "environment" | "windows_dpapi";
  error: string;
}

export interface AiScope {
  type: AiScopeType;
  project_id?: string;
  scope_path?: string;
  table_id?: string;
}

export interface AiHistoryMessage {
  role: "user" | "assistant";
  content: string;
  evidence?: AiHistoryEvidence[];
  retrieval?: AiHistoryRetrieval;
}

export interface AiHistoryEvidence {
  table_id: string;
  table_code: string;
  table_name: string;
  relevance: "direct" | "related" | "candidate";
}

export interface AiEvidenceField {
  name: string;
  code: string;
  data_type: string;
  comment: string;
}

export interface AiEvidenceTable {
  table_id: string;
  table_name: string;
  table_code: string;
  table_comment: string;
  project_id: string;
  project_name: string;
  pdm_id: string;
  relative_path: string;
  relevance: "direct" | "related" | "candidate";
  reason: string;
  retrieval_rank: number;
  matched_fields: AiEvidenceField[];
}

export interface AiHistoryRetrieval {
  intent: "find_tables" | "find_field" | "describe_table" | "out_of_scope" | "sensitive_request";
  resolved_question: string;
  scope_terms: string[];
  business_terms: string[];
  code_terms: string[];
  target_role: string;
  exclude_roles: string[];
  only_target_role: boolean;
}

export interface AiRetrievalSummary extends AiHistoryRetrieval {
  candidate_count: number;
  raw_match_count: number;
  reviewed_count: number;
  direct_count: number;
  related_count: number;
  local_candidate_count: number;
  matched_sources: string[];
  search_terms: string[];
  selection_source: "model" | "none";
  planner_fallback: boolean;
  intent_label: string;
  ranking_reasons: string[];
  confidence: AiConfidence;
  scope_label: string;
  applied_scope_type: AiScopeType | "";
  scope_changed: boolean;
}

export interface AiClarificationOption {
  label: string;
  query: string;
}

export interface AiClarification {
  question: string;
  options: AiClarificationOption[];
}

export interface AiChatResponse {
  answer: string;
  model: string;
  scope_label: string;
  uncertain: boolean;
  confidence: AiConfidence;
  clarification: AiClarification | null;
  evidence: AiEvidenceTable[];
  retrieval: AiRetrievalSummary;
  usage: Record<string, number>;
}

export interface AiConversationSummary {
  id: string;
  title: string;
  preview: string;
  message_count: number;
  created_at: string;
  updated_at: string;
}

export interface AiConversationMessagePayload {
  evidence?: AiEvidenceTable[];
  retrieval?: AiRetrievalSummary;
  model?: string;
  confidence?: AiConfidence;
  clarification?: AiClarification | null;
  error?: boolean;
  scope?: AiScope;
  scope_kind?: string;
  scope_value?: string;
}

export interface AiConversationMessage extends AiConversationMessagePayload {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
}

export interface AiConversationDetail extends AiConversationSummary {
  messages: AiConversationMessage[];
}

export interface AiConversationMessageInput {
  id: string;
  role: "user" | "assistant";
  content: string;
  payload: AiConversationMessagePayload;
}

export interface AiConversationMessageResult {
  conversation: AiConversationSummary;
  message: AiConversationMessage;
}
