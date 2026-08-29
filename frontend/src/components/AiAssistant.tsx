import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { App as AntApp, Button, Input, Spin } from "antd";
import type { TextAreaRef } from "antd/es/input/TextArea";
import {
  ArrowLeftOutlined,
  CheckOutlined,
  CloseOutlined,
  DatabaseOutlined,
  DeleteOutlined,
  EditOutlined,
  ExportOutlined,
  HistoryOutlined,
  KeyOutlined,
  LineChartOutlined,
  PlusOutlined,
  SearchOutlined,
  SendOutlined,
  SettingOutlined,
  StopOutlined,
} from "@ant-design/icons";
import { aiApi } from "../features/ai/api";
import {
  AI_SCOPE_STORAGE_KEY,
  buildScopeOptions,
  conversationDateGroup,
  conversationMessageInput,
  conversationTime,
  DEFAULT_ASSISTANT_NAME,
  errorText,
  isAbortError,
  messageId,
  MODEL_ID,
  readStoredConversationId,
  readStoredScopeType,
  restoredScopeFromConversation,
  scopesMatch,
  storeActiveConversationId,
  storedConversationMessage,
} from "../features/ai/model";
import type {
  ConversationDateGroup,
  ConversationMessage,
  ScopeOption,
} from "../features/ai/model";
import { tablesApi } from "../features/tables/api";
import { useAssistantExitGate } from "../features/ai/useAssistantExitGate";
import type {
  AiAccessory,
  AiClarification,
  AiChatResponse,
  AiConfidence,
  AiConversationDetail,
  AiConversationSummary,
  AiEvidenceTable,
  AiHistoryMessage,
  AiLayoutMode,
  AiRetrievalSummary,
  AiScopeType,
  AiSettingsStatus,
  Project,
  TableDetail,
  WorkspaceNode,
} from "../types";
import { AiLauncher } from "./AiLauncher";
import { PolarBearMark } from "./AiMascot";
import { AiPersonalizeModal } from "./AiPersonalizeModal";
import { TableGlyph } from "./PrototypeGlyphs";

interface AiAssistantProps {
  open: boolean;
  mode: AiLayoutMode;
  activeProject?: Project;
  selectedNode: WorkspaceNode | null;
  selectedTable: TableDetail | null;
  onOpenChange: (open: boolean) => void;
  onModeChange: (mode: AiLayoutMode) => void;
  onOpenTable: (evidence: AiEvidenceTable, options?: { exitFullscreen?: boolean }) => void;
}

export function isAssistantToggleShortcut(event: KeyboardEvent): boolean {
  const hasSinglePrimaryModifier = event.ctrlKey !== event.metaKey;
  return !event.repeat
    && hasSinglePrimaryModifier
    && !event.altKey
    && !event.shiftKey
    && event.key.toLowerCase() === "j";
}

const AI_LAYOUT_OPTIONS: Array<{ mode: AiLayoutMode; label: string; description: string }> = [
  { mode: "sidebar", label: "侧边栏", description: "与数据表并排查看" },
  { mode: "floating", label: "浮动", description: "悬浮在工作区右下角" },
  { mode: "fullscreen", label: "全屏", description: "专注查看完整对话" },
];

function LayoutGlyph({ mode }: { mode: AiLayoutMode }) {
  return (
    <svg className={`ai-layout-glyph is-${mode}`} viewBox="0 0 18 18" aria-hidden="true">
      <rect x="2.25" y="2.25" width="13.5" height="13.5" rx="2" />
      {mode === "sidebar" ? <path d="M10.25 2.8v12.4" /> : null}
      {mode === "floating" ? <rect x="8.1" y="8" width="6.15" height="5.65" rx="1" /> : null}
      {mode === "fullscreen" ? <rect className="ai-layout-glyph-fill" x="4.2" y="4.2" width="9.6" height="9.6" rx="1" /> : null}
    </svg>
  );
}

function LayoutModePicker({
  mode,
  onChange,
  onBeforeOpen,
}: {
  mode: AiLayoutMode;
  onChange: (mode: AiLayoutMode) => void;
  onBeforeOpen?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const closeOnOutside = (event: PointerEvent) => {
      if (!pickerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  return (
    <div className="ai-layout-picker" ref={pickerRef}>
      <button
        className={open ? "is-active" : ""}
        type="button"
        aria-label="切换 AI 显示方式"
        aria-haspopup="menu"
        aria-expanded={open}
        title="显示方式"
        onClick={() => {
          if (!open) onBeforeOpen?.();
          setOpen((current) => !current);
        }}
      >
        <LayoutGlyph mode={mode} />
      </button>
      {open ? (
        <div className="ai-layout-menu" role="menu" aria-label="AI 显示方式">
          <span className="ai-layout-menu-title">显示方式</span>
          {AI_LAYOUT_OPTIONS.map((option) => (
            <button
              className={option.mode === mode ? "is-selected" : ""}
              type="button"
              role="menuitemradio"
              aria-checked={option.mode === mode}
              key={option.mode}
              onClick={() => {
                onChange(option.mode);
                setOpen(false);
              }}
            >
              <LayoutGlyph mode={option.mode} />
              <span><b>{option.label}</b><small>{option.description}</small></span>
              <svg className="ai-layout-check" viewBox="0 0 16 16" aria-hidden="true"><path d="m3 8 3 3 7-7" /></svg>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ScopePicker({
  options,
  selectedKey,
  onChange,
}: {
  options: ScopeOption[];
  selectedKey: string;
  onChange: (option: ScopeOption) => void;
}) {
  const [open, setOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const selected = options.find((option) => option.key === selectedKey) || options[0];

  useEffect(() => {
    const closeOnOutside = (event: PointerEvent) => {
      if (!pickerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  const focusOption = (index: number) => {
    optionRefs.current[(index + options.length) % options.length]?.focus();
  };

  const handleButtonKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    setOpen(true);
    const selectedIndex = Math.max(
      0,
      options.findIndex((option) => option.key === selected.key),
    );
    window.setTimeout(() => focusOption(selectedIndex), 0);
  };

  const handleOptionKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      focusOption(index + 1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      focusOption(index - 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      focusOption(0);
    } else if (event.key === "End") {
      event.preventDefault();
      focusOption(options.length - 1);
    }
  };

  return (
    <div className="ai-scope-picker" ref={pickerRef}>
      <button
        className="ai-scope-control"
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls="ai-scope-menu"
        onClick={() => setOpen((current) => !current)}
        onKeyDown={handleButtonKeyDown}
      >
        <span className="ai-scope-selection">
          <b>{selected.kind}</b>
          <span>{selected.value}</span>
        </span>
        <svg className="ai-scope-chevron" viewBox="0 0 16 16" aria-hidden="true">
          <path d="m4 6 4 4 4-4" />
        </svg>
      </button>
      {open ? (
        <div className="ai-scope-menu" id="ai-scope-menu" role="listbox" aria-label="AI 查询范围">
          {options.map((option, index) => {
            const isSelected = option.key === selected.key;
            return (
              <button
                key={option.key}
                ref={(element) => { optionRefs.current[index] = element; }}
                className={`ai-scope-option${isSelected ? " is-selected" : ""}`}
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => {
                  onChange(option);
                  setOpen(false);
                }}
                onKeyDown={(event) => handleOptionKeyDown(event, index)}
              >
                <b>{option.kind}</b>
                <span>{option.value}</span>
                <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m3.5 8 3 3 6-6" /></svg>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function EvidenceCard({ evidence, onOpen }: { evidence: AiEvidenceTable; onOpen: () => void }) {
  return (
    <button className={`ai-evidence-card is-${evidence.relevance}`} type="button" onClick={onOpen}>
      <span className="ai-evidence-heading">
        <span className="ai-evidence-icon"><TableGlyph /></span>
        <span>
          <span className="ai-evidence-title-line">
            <strong>{evidence.table_name || evidence.table_code}</strong>
          </span>
          <code>{evidence.table_code}</code>
        </span>
        <em>查看字段</em>
      </span>
      {evidence.reason ? <span className="ai-evidence-reason">{evidence.reason}</span> : null}
      {evidence.matched_fields.length ? (
        <span className="ai-evidence-fields">
          {evidence.matched_fields.slice(0, 3).map((field) => (
            <span key={`${field.code}:${field.name}`}>
              <code>{field.code || field.name}</code>
              {field.name && field.code ? <small>{field.name}</small> : null}
            </span>
          ))}
        </span>
      ) : null}
      <span className="ai-evidence-path">{evidence.project_name} / {evidence.relative_path}</span>
    </button>
  );
}

function EvidenceList({
  evidence,
  retrieval,
  onOpen,
}: {
  evidence: AiEvidenceTable[];
  retrieval?: AiRetrievalSummary;
  onOpen: (item: AiEvidenceTable) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const direct = evidence.filter((item) => item.relevance === "direct");
  const related = evidence.filter((item) => item.relevance !== "direct");
  const visibleRelated = expanded ? related : related.slice(0, 3);
  const hiddenCount = related.length - visibleRelated.length;

  return (
    <div className="ai-evidence-list">
      <span className="ai-evidence-summary">
        <b>本机检索证据</b>
        {retrieval ? (
          <small>匹配 {retrieval.candidate_count} 张 · AI 复核 {retrieval.reviewed_count} 张</small>
        ) : null}
      </span>
      {retrieval?.matched_sources.length ? (
        <span className="ai-evidence-source">
          已限定来源 · {retrieval.matched_sources.join("、")}
        </span>
      ) : null}
      {direct.length ? (
        <div className="ai-evidence-group">
          <span className="ai-evidence-group-label">直接相关 <b>{direct.length}</b></span>
          {direct.map((item) => (
            <EvidenceCard key={item.table_id} evidence={item} onOpen={() => onOpen(item)} />
          ))}
        </div>
      ) : null}
      {related.length ? (
        <div className="ai-evidence-group">
          <span className="ai-evidence-group-label">关联候选 <b>{related.length}</b></span>
          {visibleRelated.map((item) => (
            <EvidenceCard key={item.table_id} evidence={item} onOpen={() => onOpen(item)} />
          ))}
          {hiddenCount > 0 ? (
            <button className="ai-evidence-expand" type="button" onClick={() => setExpanded(true)}>
              展开其余 {hiddenCount} 张候选
            </button>
          ) : expanded && related.length > 3 ? (
            <button className="ai-evidence-expand" type="button" onClick={() => setExpanded(false)}>
              收起关联候选
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function TablePeek({
  evidence,
  detail,
  loading,
  error,
  query,
  onQueryChange,
  onClose,
  onRetry,
  onOpenWorkspace,
}: {
  evidence: AiEvidenceTable;
  detail: TableDetail | null;
  loading: boolean;
  error: string;
  query: string;
  onQueryChange: (value: string) => void;
  onClose: () => void;
  onRetry: () => void;
  onOpenWorkspace: () => void;
}) {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const fields = useMemo(() => {
    const source = detail?.fields || [];
    if (!normalizedQuery) return source;
    return source.filter((field) =>
      [field.code, field.name, field.comment, field.data_type, field.default_value]
        .join(" ")
        .toLocaleLowerCase()
        .includes(normalizedQuery),
    );
  }, [detail, normalizedQuery]);
  const tableName = detail?.name || evidence.table_name || evidence.table_code;
  const tableCode = detail?.code || evidence.table_code;
  const tableComment = detail?.comment || evidence.table_comment;

  return (
    <>
      <button className="ai-table-peek-backdrop" type="button" aria-label="关闭表格速览" onClick={onClose} />
      <section className="ai-table-peek" role="dialog" aria-modal="false" aria-label={`${tableName}表格速览`}>
        <header className="ai-table-peek-header">
          <button className="ai-table-peek-back" type="button" autoFocus aria-label="返回对话" title="返回对话" onClick={onClose}>
            <ArrowLeftOutlined />
          </button>
          <span className="ai-table-peek-icon"><TableGlyph /></span>
          <span className="ai-table-peek-title">
            <small>表格速览</small>
            <strong title={tableName}>{tableName}</strong>
            <code title={tableCode}>{tableCode}</code>
          </span>
          <Button size="small" icon={<ExportOutlined />} onClick={onOpenWorkspace}>
            在工作区打开
          </Button>
        </header>

        <div className="ai-table-peek-context">
          {tableComment ? <p title={tableComment}>{tableComment}</p> : <p>当前表暂无说明</p>}
          <span title={`${evidence.project_name} / ${evidence.relative_path}`}>
            {evidence.project_name} / {evidence.relative_path}
          </span>
        </div>

        <div className="ai-table-peek-toolbar">
          <label>
            <SearchOutlined />
            <input
              value={query}
              placeholder="搜索字段英文名、描述或备注"
              aria-label="搜索预览字段"
              onChange={(event) => onQueryChange(event.target.value)}
            />
            {query ? (
              <button type="button" aria-label="清空字段搜索" onClick={() => onQueryChange("")}>
                <CloseOutlined />
              </button>
            ) : null}
          </label>
          <span>{loading ? "读取中" : `${fields.length} / ${detail?.fields.length || 0} 个字段`}</span>
        </div>

        <div className="ai-table-peek-body">
          {loading ? (
            <div className="ai-table-peek-state" aria-live="polite">
              <Spin size="small" />
              <span>正在读取本机字段字典…</span>
            </div>
          ) : error ? (
            <div className="ai-table-peek-state is-error" role="alert">
              <strong>表格读取失败</strong>
              <span>{error}</span>
              <Button size="small" onClick={onRetry}>重新读取</Button>
            </div>
          ) : (
            <div className="ai-table-peek-grid">
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>主键</th>
                    <th>字段英文名</th>
                    <th>字段描述</th>
                    <th>数据类型</th>
                    <th>长度</th>
                    <th>可空</th>
                    <th>缺省值</th>
                    <th>字段备注</th>
                  </tr>
                </thead>
                <tbody>
                  {fields.map((field) => (
                    <tr key={field.id}>
                      <td>{String(field.ordinal).padStart(2, "0")}</td>
                      <td>{field.is_primary_key ? <b className="ai-table-peek-pk">PK</b> : <span>—</span>}</td>
                      <td><code title={field.code}>{field.code || "—"}</code></td>
                      <td title={field.name}>{field.name || "—"}</td>
                      <td><code title={field.data_type}>{field.data_type || "—"}</code></td>
                      <td>{field.length || "—"}</td>
                      <td>{field.nullable ? "✓" : "—"}</td>
                      <td title={field.default_value}>{field.default_value || "—"}</td>
                      <td title={field.comment}>{field.comment || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!fields.length ? (
                <div className="ai-table-peek-empty">没有匹配“{query}”的字段</div>
              ) : null}
            </div>
          )}
        </div>

        <footer className="ai-table-peek-footer">
          <span><i />只读预览，不会修改 PDM</span>
          <span><kbd>Esc</kbd> 返回原对话位置</span>
        </footer>
      </section>
    </>
  );
}

const CONFIDENCE_LABELS: Record<AiConfidence, string> = {
  high: "把握较高",
  medium: "需要核对",
  low: "需要确认",
};

const ROLE_NAMES: Record<string, string> = {
  core: "业务主表",
  execution: "执行表",
  history: "历史表",
  log: "日志表",
  temporary: "临时表",
  delete: "删除表",
  parameter: "参数表",
  extension: "扩展表",
  all: "全部角色",
};

function RetrievalProcess({
  retrieval,
  evidenceCount,
}: {
  retrieval: AiRetrievalSummary;
  evidenceCount: number;
}) {
  const [expanded, setExpanded] = useState(false);
  if (!retrieval.resolved_question) return null;
  const filters = retrieval.ranking_reasons.length
    ? retrieval.ranking_reasons
    : [retrieval.only_target_role ? `只保留${ROLE_NAMES[retrieval.target_role] || retrieval.target_role}` : `优先${ROLE_NAMES[retrieval.target_role] || retrieval.target_role}`];

  return (
    <section className={`ai-retrieval-process is-${retrieval.confidence}`}>
      <button
        className="ai-retrieval-toggle"
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded((current) => !current)}
      >
        <span><SearchOutlined />为什么这样搜</span>
        <span className={`ai-confidence is-${retrieval.confidence}`}>{CONFIDENCE_LABELS[retrieval.confidence]}</span>
        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4" /></svg>
      </button>
      {expanded ? (
        <div className="ai-retrieval-detail">
          <div className="ai-retrieval-row is-understanding">
            <b>理解</b>
            <span>{retrieval.intent_label} · {retrieval.resolved_question}</span>
          </div>
          <div className="ai-retrieval-row">
            <b>范围</b>
            <span>{retrieval.scope_label}</span>
          </div>
          {retrieval.business_terms.length ? (
            <div className="ai-retrieval-row">
              <b>业务词</b>
              <span className="ai-retrieval-tags">
                {retrieval.business_terms.map((term) => <i key={term}>{term}</i>)}
              </span>
            </div>
          ) : null}
          {retrieval.code_terms.length ? (
            <div className="ai-retrieval-row">
              <b>英文词根</b>
              <span className="ai-retrieval-tags is-code">
                {retrieval.code_terms.map((term) => <i key={term}>{term}</i>)}
              </span>
            </div>
          ) : null}
          <div className="ai-retrieval-row">
            <b>筛选</b>
            <span className="ai-retrieval-filters">{filters.map((reason) => <i key={reason}>{reason}</i>)}</span>
          </div>
          <div className="ai-retrieval-pipeline" aria-label="检索数量">
            <span><b>{retrieval.raw_match_count}</b><small>原始命中</small></span>
            <i>→</i>
            <span><b>{retrieval.candidate_count}</b><small>本机候选</small></span>
            <i>→</i>
            <span><b>{retrieval.reviewed_count}</b><small>AI 复核</small></span>
            <i>→</i>
            <span><b>{evidenceCount}</b><small>返回结果</small></span>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function ClarificationCard({
  clarification,
  onChoose,
}: {
  clarification: AiClarification;
  onChoose: (query: string) => void;
}) {
  return (
    <div className="ai-clarification" aria-label="请选择要查询的业务方向">
      <span>选择一个方向，我会按这个口径继续查：</span>
      <div>
        {clarification.options.map((option) => (
          <button type="button" key={`${option.label}:${option.query}`} onClick={() => onChoose(option.query)}>
            {option.label}
            <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m6 3 5 5-5 5" /></svg>
          </button>
        ))}
      </div>
    </div>
  );
}

function ConversationHistory({
  conversations,
  activeConversationId,
  loading,
  error,
  busyId,
  onBack,
  onNew,
  onOpen,
  onRename,
  onDelete,
  onRetry,
}: {
  conversations: AiConversationSummary[];
  activeConversationId: string | null;
  loading: boolean;
  error: string;
  busyId: string | null;
  onBack: () => void;
  onNew: () => void;
  onOpen: (conversationId: string) => void;
  onRename: (conversationId: string, title: string) => Promise<void>;
  onDelete: (conversation: AiConversationSummary) => void;
  onRetry: () => void;
}) {
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renamingTitle, setRenamingTitle] = useState("");
  const grouped = useMemo(() => {
    const result: Record<ConversationDateGroup, AiConversationSummary[]> = {
      今天: [],
      昨天: [],
      更早: [],
    };
    conversations.forEach((conversation) => {
      result[conversationDateGroup(conversation.updated_at)].push(conversation);
    });
    return result;
  }, [conversations]);

  const beginRename = (conversation: AiConversationSummary) => {
    setRenamingId(conversation.id);
    setRenamingTitle(conversation.title);
  };

  const finishRename = async (conversationId: string) => {
    const title = renamingTitle.trim();
    if (!title) return;
    try {
      await onRename(conversationId, title);
      setRenamingId(null);
      setRenamingTitle("");
    } catch {
      // The parent keeps the editor open and reports the concrete API error.
    }
  };

  return (
    <section className="ai-history-view" aria-label="AI 对话记录">
      <div className="ai-history-toolbar">
        <button type="button" className="ai-history-back" onClick={onBack} aria-label="返回当前对话">
          <ArrowLeftOutlined />
        </button>
        <span className="ai-history-heading">
          <strong>对话记录</strong>
          <small>仅保存在本机 · 不随备份导出</small>
        </span>
        <button type="button" className="ai-history-new" onClick={onNew}>
          <PlusOutlined />
          <span>新对话</span>
        </button>
      </div>

      <div className="ai-history-list">
        {loading ? (
          <div className="ai-history-status"><Spin size="small" /><span>正在读取本机记录…</span></div>
        ) : error ? (
          <div className="ai-history-status is-error">
            <HistoryOutlined />
            <span>{error}</span>
            <button type="button" onClick={onRetry}>重新读取</button>
          </div>
        ) : !conversations.length ? (
          <div className="ai-history-empty">
            <span><HistoryOutlined /></span>
            <strong>还没有对话记录</strong>
            <p>开始提问后，对话会自动保存在这台电脑上。</p>
            <button type="button" onClick={onNew}>开始新对话</button>
          </div>
        ) : (
          (["今天", "昨天", "更早"] as ConversationDateGroup[]).map((group) => (
            grouped[group].length ? (
              <div className="ai-history-group" key={group}>
                <div className="ai-history-group-label">{group}</div>
                {grouped[group].map((conversation) => {
                  const active = conversation.id === activeConversationId;
                  const renaming = conversation.id === renamingId;
                  const busy = conversation.id === busyId;
                  return (
                    <article className={`ai-history-item${active ? " is-active" : ""}${busy ? " is-busy" : ""}`} key={conversation.id}>
                      {renaming ? (
                        <form
                          className="ai-history-rename"
                          onSubmit={(event) => {
                            event.preventDefault();
                            void finishRename(conversation.id);
                          }}
                        >
                          <input
                            autoFocus
                            maxLength={80}
                            value={renamingTitle}
                            aria-label="对话标题"
                            onChange={(event) => setRenamingTitle(event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === "Escape") {
                                event.preventDefault();
                                setRenamingId(null);
                              }
                            }}
                          />
                          <button type="submit" disabled={!renamingTitle.trim() || busy} aria-label="保存标题">
                            <CheckOutlined />
                          </button>
                          <button type="button" disabled={busy} aria-label="取消重命名" onClick={() => setRenamingId(null)}>
                            <CloseOutlined />
                          </button>
                        </form>
                      ) : (
                        <>
                          <button
                            type="button"
                            className="ai-history-item-main"
                            disabled={busy}
                            aria-current={active ? "true" : undefined}
                            onClick={() => onOpen(conversation.id)}
                          >
                            <span className="ai-history-item-title">
                              <strong>{conversation.title}</strong>
                              <time dateTime={conversation.updated_at}>{conversationTime(conversation.updated_at)}</time>
                            </span>
                            <span className="ai-history-item-preview">{conversation.preview}</span>
                            <small>{conversation.message_count} 条消息</small>
                          </button>
                          <span className="ai-history-item-actions">
                            <button type="button" disabled={busy} aria-label={`重命名：${conversation.title}`} onClick={() => beginRename(conversation)}>
                              <EditOutlined />
                            </button>
                            <button type="button" disabled={busy} aria-label={`删除：${conversation.title}`} onClick={() => onDelete(conversation)}>
                              <DeleteOutlined />
                            </button>
                          </span>
                        </>
                      )}
                      {busy ? <Spin className="ai-history-item-spinner" size="small" /> : null}
                    </article>
                  );
                })}
              </div>
            ) : null
          ))
        )}
      </div>
    </section>
  );
}

export function AiAssistant({
  open,
  mode,
  activeProject,
  selectedNode,
  selectedTable,
  onOpenChange,
  onModeChange,
  onOpenTable,
}: AiAssistantProps) {
  const { message: notice, modal } = AntApp.useApp();
  const [settings, setSettings] = useState<AiSettingsStatus | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [personalizeOpen, setPersonalizeOpen] = useState(false);
  const [personalizeBusy, setPersonalizeBusy] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [assistantName, setAssistantName] = useState(DEFAULT_ASSISTANT_NAME);
  const [assistantAccessory, setAssistantAccessory] = useState<AiAccessory>("none");
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<AiConversationSummary[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState("");
  const [historyBusyId, setHistoryBusyId] = useState<string | null>(null);
  const [conversationLoading, setConversationLoading] = useState(true);
  const [question, setQuestion] = useState("");
  const [sending, setSending] = useState(false);
  const [tablePeekEvidence, setTablePeekEvidence] = useState<AiEvidenceTable | null>(null);
  const [tablePeekDetail, setTablePeekDetail] = useState<TableDetail | null>(null);
  const [tablePeekLoading, setTablePeekLoading] = useState(false);
  const [tablePeekError, setTablePeekError] = useState("");
  const [tablePeekQuery, setTablePeekQuery] = useState("");
  const [tablePeekRevision, setTablePeekRevision] = useState(0);
  const conversationRef = useRef<HTMLDivElement>(null);
  const latestAssistantRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<TextAreaRef>(null);
  const aiRequestAbortRef = useRef<AbortController | null>(null);
  const aiRequestRevisionRef = useRef(0);
  const conversationSelectionRevisionRef = useRef(0);
  const scopeOptions = useMemo(
    () => buildScopeOptions(activeProject, selectedNode, selectedTable),
    [activeProject, selectedNode, selectedTable],
  );
  const scopeOptionsRef = useRef(scopeOptions);
  scopeOptionsRef.current = scopeOptions;
  const { launcherVisible, onAssistantTransitionEnd } = useAssistantExitGate(open);
  const [scopeType, setScopeType] = useState<AiScopeType>(readStoredScopeType);
  const [restoredScopeOption, setRestoredScopeOption] = useState<ScopeOption | null>(null);
  const matchingRestoredScope = restoredScopeOption
    ? scopeOptions.find((option) => scopesMatch(option.scope, restoredScopeOption.scope))
    : undefined;
  const availableScopeOptions = restoredScopeOption && !matchingRestoredScope
    ? [restoredScopeOption, ...scopeOptions]
    : scopeOptions;
  const selectedScope =
    matchingRestoredScope
    || restoredScopeOption
    || scopeOptions.find((option) => option.scope.type === scopeType)
    || scopeOptions.find((option) => option.scope.type === "project")
    || scopeOptions.find((option) => option.scope.type === "all")
    || scopeOptions[0];

  useEffect(() => {
    aiApi.settings()
      .then((nextSettings) => {
        setSettings(nextSettings);
        setAssistantName(nextSettings.assistant_name || DEFAULT_ASSISTANT_NAME);
        setAssistantAccessory(nextSettings.assistant_accessory || "none");
      })
      .catch((error) => {
        setSettings(null);
        notice.error(errorText(error));
      });
  }, [notice]);

  useEffect(() => {
    let cancelled = false;
    const selectionRevision = conversationSelectionRevisionRef.current + 1;
    conversationSelectionRevisionRef.current = selectionRevision;
    setHistoryLoading(true);
    setConversationLoading(true);
    aiApi.conversations()
      .then(async (items) => {
        if (cancelled || selectionRevision !== conversationSelectionRevisionRef.current) return;
        setConversations(items);
        setHistoryError("");
        if (!items.length) {
          storeActiveConversationId(null);
          return;
        }
        const storedConversationId = readStoredConversationId();
        const initialConversation = items.find((item) => item.id === storedConversationId) || items[0];
        const detail = await aiApi.conversation(initialConversation.id);
        if (cancelled || selectionRevision !== conversationSelectionRevisionRef.current) return;
        setActiveConversationId(detail.id);
        storeActiveConversationId(detail.id);
        setMessages(detail.messages.map(storedConversationMessage));
        const currentScopeOptions = scopeOptionsRef.current;
        const restoredScope = restoredScopeFromConversation(detail, currentScopeOptions);
        if (restoredScope) {
          setScopeType(restoredScope.scope.type);
          setRestoredScopeOption(
            currentScopeOptions.some((option) => option.key === restoredScope.key) ? null : restoredScope,
          );
          try {
            localStorage.setItem(AI_SCOPE_STORAGE_KEY, restoredScope.scope.type);
          } catch {
            // The restored scope remains active for this session.
          }
        } else setRestoredScopeOption(null);
      })
      .catch((error) => {
        if (cancelled || selectionRevision !== conversationSelectionRevisionRef.current) return;
        setHistoryError(errorText(error));
      })
      .finally(() => {
        if (cancelled || selectionRevision !== conversationSelectionRevisionRef.current) return;
        setHistoryLoading(false);
        setConversationLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!open) {
      setSettingsOpen(false);
      setPersonalizeOpen(false);
      return;
    }
    window.setTimeout(() => inputRef.current?.focus(), 220);
  }, [open]);

  useEffect(() => {
    if (!open || mode !== "fullscreen") {
      setTablePeekEvidence(null);
      setTablePeekDetail(null);
      setTablePeekLoading(false);
      setTablePeekError("");
      setTablePeekQuery("");
    }
  }, [mode, open]);

  useEffect(() => {
    if (!tablePeekEvidence) return;
    const controller = new AbortController();
    setTablePeekLoading(true);
    setTablePeekError("");
    setTablePeekDetail(null);
    tablesApi.detail(tablePeekEvidence.table_id, controller.signal)
      .then((nextDetail) => {
        if (!controller.signal.aborted) setTablePeekDetail(nextDetail);
      })
      .catch((error) => {
        if (!controller.signal.aborted && !isAbortError(error)) setTablePeekError(errorText(error));
      })
      .finally(() => {
        if (!controller.signal.aborted) setTablePeekLoading(false);
      });
    return () => controller.abort();
  }, [tablePeekEvidence, tablePeekRevision]);

  useEffect(() => () => aiRequestAbortRef.current?.abort(), []);

  useEffect(() => {
    if (!tablePeekEvidence) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setTablePeekEvidence(null);
      setTablePeekDetail(null);
      setTablePeekError("");
      setTablePeekQuery("");
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [tablePeekEvidence]);

  useEffect(() => {
    if (!historyOpen || mode !== "fullscreen") return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setHistoryOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [historyOpen, mode]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      if (!conversationRef.current) return;
      if (sending) {
        conversationRef.current.scrollTop = conversationRef.current.scrollHeight;
        return;
      }
      latestAssistantRef.current?.scrollIntoView({ block: "start" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [messages, sending]);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if (!isAssistantToggleShortcut(event)) return;
      event.preventDefault();
      onOpenChange(!open);
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [onOpenChange, open]);

  const chooseScope = (type: AiScopeType) => {
    setRestoredScopeOption(null);
    setScopeType(type);
    try {
      localStorage.setItem(AI_SCOPE_STORAGE_KEY, type);
    } catch {
      // Keep the current-session choice when storage is unavailable.
    }
  };

  const chooseScopeOption = (option: ScopeOption) => {
    setRestoredScopeOption(option.key.startsWith("history:") ? option : null);
    setScopeType(option.scope.type);
    try {
      localStorage.setItem(AI_SCOPE_STORAGE_KEY, option.scope.type);
    } catch {
      // Keep the current-session choice when storage is unavailable.
    }
  };

  const rememberConversation = (conversation: AiConversationSummary | AiConversationDetail) => {
    setConversations((current) => [
      conversation,
      ...current.filter((item) => item.id !== conversation.id),
    ].sort((left, right) => right.updated_at.localeCompare(left.updated_at)));
  };

  const reloadConversationHistory = async () => {
    setHistoryLoading(true);
    setHistoryError("");
    try {
      setConversations(await aiApi.conversations());
    } catch (error) {
      setHistoryError(errorText(error));
    } finally {
      setHistoryLoading(false);
    }
  };

  const openConversationHistory = () => {
    setSettingsOpen(false);
    setPersonalizeOpen(false);
    setTablePeekEvidence(null);
    setTablePeekDetail(null);
    setTablePeekError("");
    setTablePeekQuery("");
    setHistoryOpen(true);
    void reloadConversationHistory();
  };

  const cancelPendingAnswer = () => {
    aiRequestRevisionRef.current += 1;
    aiRequestAbortRef.current?.abort();
    aiRequestAbortRef.current = null;
    setSending(false);
  };

  const openConversation = async (conversationId: string) => {
    if (conversationId === activeConversationId) {
      if (mode !== "fullscreen") {
        setHistoryOpen(false);
        window.setTimeout(() => inputRef.current?.focus(), 0);
      }
      return;
    }
    cancelPendingAnswer();
    const selectionRevision = conversationSelectionRevisionRef.current + 1;
    conversationSelectionRevisionRef.current = selectionRevision;
    setHistoryBusyId(conversationId);
    try {
      const detail = await aiApi.conversation(conversationId);
      if (selectionRevision !== conversationSelectionRevisionRef.current) return;
      setActiveConversationId(detail.id);
      storeActiveConversationId(detail.id);
      setMessages(detail.messages.map(storedConversationMessage));
      const restoredScope = restoredScopeFromConversation(detail, scopeOptions);
      if (restoredScope) {
        setScopeType(restoredScope.scope.type);
        setRestoredScopeOption(
          scopeOptions.some((option) => option.key === restoredScope.key) ? null : restoredScope,
        );
        try {
          localStorage.setItem(AI_SCOPE_STORAGE_KEY, restoredScope.scope.type);
        } catch {
          // The restored scope remains active for this session.
        }
      } else setRestoredScopeOption(null);
      setQuestion("");
      setConversationLoading(false);
      setTablePeekEvidence(null);
      setTablePeekDetail(null);
      setTablePeekError("");
      setTablePeekQuery("");
      rememberConversation(detail);
      if (mode !== "fullscreen") {
        setHistoryOpen(false);
        window.setTimeout(() => inputRef.current?.focus(), 0);
      }
    } catch (error) {
      if (selectionRevision === conversationSelectionRevisionRef.current) notice.error(errorText(error));
    } finally {
      if (selectionRevision === conversationSelectionRevisionRef.current) setHistoryBusyId(null);
    }
  };

  const renameConversation = async (conversationId: string, title: string) => {
    setHistoryBusyId(conversationId);
    try {
      rememberConversation(await aiApi.renameConversation(conversationId, title));
    } catch (error) {
      notice.error(errorText(error));
      throw error;
    } finally {
      setHistoryBusyId(null);
    }
  };

  const deleteConversation = (conversation: AiConversationSummary) => {
    modal.confirm({
      title: "删除这段对话？",
      content: `“${conversation.title}”只会从这台电脑删除，无法恢复。`,
      okText: "删除对话",
      okButtonProps: { danger: true },
      cancelText: "取消",
      onOk: async () => {
        setHistoryBusyId(conversation.id);
        try {
          if (conversation.id === activeConversationId) cancelPendingAnswer();
          await aiApi.deleteConversation(conversation.id);
          setConversations((current) => current.filter((item) => item.id !== conversation.id));
          if (conversation.id === activeConversationId) {
            conversationSelectionRevisionRef.current += 1;
            setActiveConversationId(null);
            storeActiveConversationId(null);
            setMessages([]);
            setQuestion("");
            setConversationLoading(false);
            setTablePeekEvidence(null);
            setTablePeekDetail(null);
            setTablePeekError("");
            setTablePeekQuery("");
          }
        } catch (error) {
          notice.error(errorText(error));
          throw error;
        } finally {
          setHistoryBusyId(null);
        }
      },
    });
  };

  const closeSettings = () => {
    setApiKey("");
    setSettingsOpen(false);
  };

  const saveSettings = async () => {
    const normalizedKey = apiKey.trim();
    if (!normalizedKey) {
      setSettingsOpen(false);
      return;
    }
    setSettingsBusy(true);
    try {
      await aiApi.testConnection(normalizedKey);
      const nextSettings = await aiApi.saveSettings({
        api_key: normalizedKey,
      });
      setSettings(nextSettings);
      setAssistantName(nextSettings.assistant_name);
      setAssistantAccessory(nextSettings.assistant_accessory);
      setApiKey("");
      setSettingsOpen(false);
      notice.success(`${nextSettings.model} 连接测试通过`);
    } catch (error) {
      notice.error(errorText(error));
    } finally {
      setSettingsBusy(false);
    }
  };

  const openPersonalization = () => {
    setSettingsOpen(false);
    setHistoryOpen(false);
    setPersonalizeOpen(true);
  };

  const savePersonalization = async (name: string, accessory: AiAccessory) => {
    setPersonalizeBusy(true);
    try {
      const nextSettings = await aiApi.saveSettings({
        assistant_name: name,
        assistant_accessory: accessory,
      });
      setSettings(nextSettings);
      setAssistantName(nextSettings.assistant_name);
      setAssistantAccessory(nextSettings.assistant_accessory);
      setPersonalizeOpen(false);
      notice.success("小助手形象已保存");
    } catch (error) {
      notice.error(errorText(error));
    } finally {
      setPersonalizeBusy(false);
    }
  };

  const clearKey = () => {
    modal.confirm({
      title: "移除 DeepSeek API Key？",
      content: "只会删除码熊本机保存的加密密钥，不会影响 DeepSeek 账户。",
      okText: "移除密钥",
      okButtonProps: { danger: true },
      cancelText: "取消",
      onOk: async () => {
        const nextSettings = await aiApi.clearKey();
        setSettings(nextSettings);
        setAssistantName(nextSettings.assistant_name);
        setAssistantAccessory(nextSettings.assistant_accessory);
        setApiKey("");
        notice.success("本机 API Key 已移除");
      },
    });
  };

  const resetConversation = () => {
    cancelPendingAnswer();
    conversationSelectionRevisionRef.current += 1;
    setActiveConversationId(null);
    storeActiveConversationId(null);
    setMessages([]);
    setQuestion("");
    setHistoryOpen(false);
    setConversationLoading(false);
    setTablePeekEvidence(null);
    setTablePeekDetail(null);
    setTablePeekLoading(false);
    setTablePeekError("");
    setTablePeekQuery("");
    window.setTimeout(() => inputRef.current?.focus(), 0);
  };

  const closeTablePeek = () => {
    setTablePeekEvidence(null);
    setTablePeekDetail(null);
    setTablePeekLoading(false);
    setTablePeekError("");
    setTablePeekQuery("");
  };

  const openEvidenceTable = (evidence: AiEvidenceTable) => {
    if (mode !== "fullscreen") {
      onOpenTable(evidence);
      return;
    }
    setTablePeekLoading(true);
    setTablePeekDetail(null);
    setTablePeekError("");
    setTablePeekEvidence(evidence);
    setTablePeekQuery("");
  };

  const stopQuestion = () => {
    if (!aiRequestAbortRef.current) return;
    cancelPendingAnswer();
    notice.info("已停止本次回答");
    window.setTimeout(() => inputRef.current?.focus(), 0);
  };

  const sendQuestion = async (value = question) => {
    const normalized = value.trim();
    if (!normalized || sending || aiRequestAbortRef.current) return;
    if (!settings?.configured) {
      setHistoryOpen(false);
      setSettingsOpen(true);
      notice.warning("请先配置 DeepSeek API Key");
      return;
    }
    const userMessage: ConversationMessage = { id: messageId(), role: "user", content: normalized };
    const scopeOption = selectedScope;
    const scope = scopeOption.scope;
    const targetConversationSelectionRevision = conversationSelectionRevisionRef.current;
    const history: AiHistoryMessage[] = messages
      .filter((item) => !item.error)
      .map(({ role, content, evidence, retrieval }) => ({
        role,
        content,
        ...(evidence?.length ? {
          evidence: evidence.map((item) => ({
            table_id: item.table_id,
            table_code: item.table_code,
            table_name: item.table_name,
            relevance: item.relevance,
          })),
        } : {}),
        ...(role === "assistant" && retrieval ? {
          retrieval: {
            intent: retrieval.intent,
            resolved_question: retrieval.resolved_question,
            scope_terms: retrieval.scope_terms,
            business_terms: retrieval.business_terms,
            code_terms: retrieval.code_terms,
            target_role: retrieval.target_role,
            exclude_roles: retrieval.exclude_roles,
            only_target_role: retrieval.only_target_role,
          },
        } : {}),
      }))
      .slice(-8);
    setMessages((current) => [...current, userMessage]);
    setQuestion("");
    setSending(true);
    const controller = new AbortController();
    const requestRevision = aiRequestRevisionRef.current + 1;
    aiRequestRevisionRef.current = requestRevision;
    aiRequestAbortRef.current = controller;
    let conversationId = activeConversationId;
    try {
      if (conversationId) {
        const stored = await aiApi.appendConversationMessage(
          conversationId,
          conversationMessageInput(userMessage, scopeOption),
        );
        rememberConversation(stored.conversation);
      } else {
        const created = await aiApi.createConversation(conversationMessageInput(userMessage, scopeOption));
        conversationId = created.id;
        rememberConversation(created);
        if (targetConversationSelectionRevision === conversationSelectionRevisionRef.current) {
          setActiveConversationId(created.id);
          storeActiveConversationId(created.id);
        }
      }
      if (controller.signal.aborted || requestRevision !== aiRequestRevisionRef.current) return;
      const result: AiChatResponse = await aiApi.chat(
        normalized,
        scope,
        history,
        controller.signal,
      );
      if (controller.signal.aborted || requestRevision !== aiRequestRevisionRef.current) return;
      if (result.retrieval.scope_changed && result.retrieval.applied_scope_type) {
        chooseScope(result.retrieval.applied_scope_type);
      }
      const assistantMessage: ConversationMessage = {
        id: messageId(),
        role: "assistant",
        content: result.answer,
        evidence: result.evidence,
        retrieval: result.retrieval,
        model: result.model,
        confidence: result.confidence,
        clarification: result.clarification,
      };
      setMessages((current) => [...current, assistantMessage]);
      try {
        const stored = await aiApi.appendConversationMessage(
          conversationId,
          conversationMessageInput(assistantMessage),
        );
        rememberConversation(stored.conversation);
      } catch (saveError) {
        notice.warning(`回答已显示，但未能保存到对话记录：${errorText(saveError)}`);
      }
    } catch (error) {
      if (controller.signal.aborted || isAbortError(error) || requestRevision !== aiRequestRevisionRef.current) {
        return;
      }
      const failureMessage: ConversationMessage = {
        id: messageId(),
        role: "assistant",
        content: errorText(error),
        error: true,
      };
      setMessages((current) => [...current, failureMessage]);
      if (conversationId) {
        try {
          const stored = await aiApi.appendConversationMessage(
            conversationId,
            conversationMessageInput(failureMessage),
          );
          rememberConversation(stored.conversation);
        } catch {
          // The visible request error remains useful even if local history storage also failed.
        }
      }
    } finally {
      if (requestRevision === aiRequestRevisionRef.current) {
        aiRequestAbortRef.current = null;
        setSending(false);
        window.setTimeout(() => inputRef.current?.focus(), 0);
      }
    }
  };

  const configured = Boolean(settings?.configured);
  const displayName = assistantName.trim() || settings?.assistant_name || DEFAULT_ASSISTANT_NAME;
  const conversationHistory = (
    <ConversationHistory
      conversations={conversations}
      activeConversationId={activeConversationId}
      loading={historyLoading}
      error={historyError}
      busyId={historyBusyId}
      onBack={() => setHistoryOpen(false)}
      onNew={resetConversation}
      onOpen={(conversationId) => void openConversation(conversationId)}
      onRename={renameConversation}
      onDelete={deleteConversation}
      onRetry={() => void reloadConversationHistory()}
    />
  );

  return (
    <>
      <AiLauncher
        assistantName={displayName}
        assistantAccessory={assistantAccessory}
        shortcutEnabled={false}
        visible={launcherVisible}
        onOpen={() => onOpenChange(true)}
      />

      <aside
        className={`ai-assistant is-${mode}${open ? " is-open" : ""}${!conversationLoading && (!historyOpen || mode === "fullscreen") && !messages.length && !sending && !settingsOpen ? " is-empty" : ""}${historyOpen ? " is-history" : ""}${tablePeekEvidence ? " has-table-peek" : ""}`}
        aria-hidden={!open}
        onTransitionEnd={onAssistantTransitionEnd}
      >
        <header className="ai-assistant-header">
          <span className="ai-assistant-identity">
            <span className="ai-header-avatar"><PolarBearMark compact accessory={assistantAccessory} /></span>
            <span>
              <strong>{displayName}</strong>
              <small><i className={configured ? "is-ready" : ""} />DeepSeek V4 Flash · {configured ? "待命" : "待配置"}</small>
            </span>
          </span>
          <span className="ai-assistant-actions">
            <button
              className={historyOpen ? "is-active" : ""}
              type="button"
              aria-label="查看 AI 对话记录"
              aria-expanded={historyOpen}
              title="对话记录"
              onClick={historyOpen ? () => setHistoryOpen(false) : openConversationHistory}
            >
              <HistoryOutlined />
            </button>
            <button type="button" aria-label="新建 AI 对话" title="新建对话" onClick={resetConversation}>
              <PlusOutlined />
            </button>
            <LayoutModePicker
              mode={mode}
              onChange={onModeChange}
              onBeforeOpen={() => setHistoryOpen(false)}
            />
            <button
              className={personalizeOpen ? "is-active" : ""}
              type="button"
              aria-label="个性化 AI 小助手"
              aria-expanded={personalizeOpen}
              title="个性化"
              onClick={openPersonalization}
            >
              <EditOutlined />
            </button>
            <button
              className={settingsOpen ? "is-active" : ""}
              type="button"
              aria-label="AI 设置"
              aria-expanded={settingsOpen}
              title="AI 设置"
              onClick={() => {
                if (settingsOpen) closeSettings();
                else {
                  setPersonalizeOpen(false);
                  setHistoryOpen(false);
                  setSettingsOpen(true);
                }
              }}
            >
              <SettingOutlined />
            </button>
            <button
              type="button"
              aria-label="收起 AI 助手"
              title="收起"
              onClick={() => {
                setHistoryOpen(false);
                onOpenChange(false);
              }}
            >
              <CloseOutlined />
            </button>
          </span>
        </header>

        {!historyOpen || mode === "fullscreen" ? (
          <div className="ai-scope-strip">
            <span className="ai-scope-label">查询范围</span>
            <ScopePicker
              options={availableScopeOptions}
              selectedKey={selectedScope.key}
              onChange={chooseScopeOption}
            />
            <span className="ai-readonly-pill">只读</span>
          </div>
        ) : null}

        {settingsOpen ? (
          <form
            className="ai-settings-panel"
            aria-label="AI 连接设置"
            autoComplete="off"
            onSubmit={(event) => {
              event.preventDefault();
              void saveSettings();
            }}
          >
            <input
              className="ai-credential-username"
              name="username"
              value="deepseek"
              autoComplete="username"
              readOnly
              tabIndex={-1}
              aria-hidden="true"
            />
            <div className="ai-settings-title">
              <strong>连接设置</strong>
              <span>{settings?.storage === "environment" ? "环境变量提供" : "仅保存在本机"}</span>
            </div>
            <label className="ai-settings-field">
              <span>模型</span>
              <Input value={settings?.model || MODEL_ID} disabled autoComplete="off" />
            </label>
            <label className="ai-settings-field">
              <span>API Key</span>
              <Input.Password
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                placeholder={settings?.configured ? `已配置 · ${settings.key_hint}` : "输入 DeepSeek API Key"}
                prefix={<KeyOutlined />}
                autoComplete="new-password"
              />
            </label>
            <p className="ai-privacy-note">
              正式版只发送问题和命中的表、字段结构，不上传原始 PDM 文件。密钥由操作系统安全存储保护。
            </p>
            {settings?.error ? <p className="ai-settings-error">{settings.error}</p> : null}
            <div className="ai-settings-actions">
              {settings?.configured && settings.storage !== "environment" ? (
                <Button danger type="text" size="small" onClick={clearKey}>移除密钥</Button>
              ) : <span />}
              <span>
                <Button size="small" onClick={closeSettings}>取消</Button>
                <Button type="primary" size="small" htmlType="submit" loading={settingsBusy}>
                  {apiKey.trim() ? "保存并测试" : "完成"}
                </Button>
              </span>
            </div>
          </form>
        ) : null}

        {historyOpen && mode !== "fullscreen" ? (
          conversationHistory
        ) : (
        <>
        <div className="ai-conversation" ref={conversationRef} aria-live="polite">
          <div className="ai-conversation-inner">
          {conversationLoading ? (
            <div className="ai-conversation-loading"><Spin size="small" /><span>正在恢复上次对话…</span></div>
          ) : !messages.length && !sending ? (
            <div className="ai-empty-state">
              <span className="ai-empty-avatar-control">
                <span className="ai-empty-bear">
                  <PolarBearMark accessory={assistantAccessory} />
                </span>
                <button className="ai-personalize-trigger" type="button" onClick={openPersonalization}>
                  <EditOutlined />
                  <span>个性化</span>
                </button>
              </span>
              <h2>想找哪张表或哪个字段？</h2>
              <p>直接描述业务含义。码熊先查本机 PDM 索引，再让 AI 根据命中的结构给出判断。</p>
              <div className="ai-suggestions">
                <button type="button" onClick={() => void sendQuestion("行情价在哪张表？")}>
                  <LineChartOutlined /><span>行情价在哪张表？</span>
                </button>
                <button type="button" onClick={() => void sendQuestion("这张表主要存什么数据？")}>
                  <DatabaseOutlined /><span>这张表主要存什么数据？</span>
                </button>
                <button type="button" onClick={() => void sendQuestion("帮我找和产品估值有关的表")}>
                  <SearchOutlined /><span>帮我找和产品估值有关的表</span>
                </button>
              </div>
            </div>
          ) : null}

          {messages.map((item, index) => (
            <div
              className={`ai-message-row is-${item.role}${item.error ? " is-error" : ""}`}
              key={item.id}
              ref={item.role === "assistant" && index === messages.length - 1 ? latestAssistantRef : undefined}
            >
              {item.role === "assistant" ? (
                <span className="ai-message-avatar">
                  <PolarBearMark compact accessory={assistantAccessory} />
                </span>
              ) : null}
              <div className={`ai-message-content${item.retrieval || item.evidence?.length ? " has-supporting-content" : ""}`}>
                <p>{item.content}</p>
                {item.clarification ? (
                  <ClarificationCard clarification={item.clarification} onChoose={(query) => void sendQuestion(query)} />
                ) : null}
                {item.retrieval ? (
                  <RetrievalProcess retrieval={item.retrieval} evidenceCount={item.evidence?.length || 0} />
                ) : null}
                {item.evidence?.length ? (
                  <EvidenceList evidence={item.evidence} retrieval={item.retrieval} onOpen={openEvidenceTable} />
                ) : null}
                {item.model ? <small className="ai-message-model">{item.model}</small> : null}
              </div>
            </div>
          ))}

          {sending ? (
            <div className="ai-message-row is-assistant">
              <span className="ai-message-avatar">
                <PolarBearMark compact accessory={assistantAccessory} />
              </span>
              <div className="ai-thinking" aria-label={`${displayName}正在分析`}>
                <span /><span /><span />
                <em>正在检索本机索引并分析…</em>
              </div>
            </div>
          ) : null}
          </div>
        </div>

        <footer className="ai-composer-shell">
          <div className="ai-composer-frame">
            <div className="ai-composer">
              <Input.TextArea
                ref={inputRef}
                value={question}
                maxLength={1000}
                autoSize={{ minRows: 2, maxRows: 5 }}
                placeholder="例如：行情价在哪里？"
                onChange={(event) => setQuestion(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void sendQuestion();
                  }
                }}
              />
              <button
                className={`ai-send-button${sending ? " is-stop" : ""}`}
                type="button"
                aria-label={sending ? "停止本次回答" : "发送问题"}
                title={sending ? "停止回答" : "发送问题"}
                disabled={!sending && !question.trim()}
                onClick={sending ? stopQuestion : () => void sendQuestion()}
              >
                {sending ? <StopOutlined /> : <SendOutlined />}
              </button>
            </div>
            <div className="ai-composer-meta">
              <span className="ai-model-signature" title="DeepSeek 模型 · 仅查询，不会修改 PDM">
                <i className={configured ? "is-ready" : ""} />
                <strong>{settings?.model || MODEL_ID}</strong>
                <em>· 只读查询</em>
              </span>
              <span className="ai-shortcuts"><kbd>Enter</kbd> 发送 · <kbd>Shift</kbd> + <kbd>Enter</kbd> 换行</span>
            </div>
          </div>
        </footer>
        </>
        )}

        {mode === "fullscreen" ? (
          <div
            className={`ai-history-drawer-layer${historyOpen ? " is-open" : ""}`}
            aria-hidden={!historyOpen}
          >
            <button
              className="ai-history-drawer-backdrop"
              type="button"
              aria-label="关闭对话记录"
              onClick={() => setHistoryOpen(false)}
            />
            <section className="ai-history-drawer" role="dialog" aria-modal="true" aria-label="AI 对话记录抽屉">
              {conversationHistory}
            </section>
          </div>
        ) : null}

        {!historyOpen && tablePeekEvidence && mode === "fullscreen" ? (
          <TablePeek
            evidence={tablePeekEvidence}
            detail={tablePeekDetail}
            loading={tablePeekLoading}
            error={tablePeekError}
            query={tablePeekQuery}
            onQueryChange={setTablePeekQuery}
            onClose={closeTablePeek}
            onRetry={() => setTablePeekRevision((current) => current + 1)}
            onOpenWorkspace={() => onOpenTable(tablePeekEvidence, { exitFullscreen: true })}
          />
        ) : null}
      </aside>

      <AiPersonalizeModal
        open={personalizeOpen}
        name={displayName}
        accessory={assistantAccessory}
        busy={personalizeBusy}
        onCancel={() => setPersonalizeOpen(false)}
        onSave={savePersonalization}
      />
    </>
  );
}
