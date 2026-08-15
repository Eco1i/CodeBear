import { useEffect, useMemo, useState } from "react";
import {
  BookOutlined,
  DeleteOutlined,
  EditOutlined,
  FileExcelOutlined,
  FolderOpenOutlined,
  LinkOutlined,
  PlusOutlined,
  SearchOutlined,
  SettingOutlined,
  UploadOutlined,
} from "@ant-design/icons";
import {
  App as AntApp,
  Button,
  Empty,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  Spin,
  Table,
  Tabs,
  Tag,
  Tree,
  Upload,
} from "antd";
import type { DataNode } from "antd/es/tree";
import type { ColumnsType } from "antd/es/table";
import { dictionariesApi } from "../features/dictionaries/api";
import { importSuccessMessage } from "../features/dictionaries/model";
import type {
  DictionaryBoundField,
  DictionaryItem,
  DictionarySummary,
  ExcelInspection,
} from "../features/dictionaries/types";
import type { WorkspaceNode } from "../types";
import { errorMessage, getProjectId } from "../features/workspace/model";
import { FolderGlyph, PdmGlyph, ProjectGlyph, TreeChevronGlyph } from "./PrototypeGlyphs";

interface DictionaryCenterModalProps {
  open: boolean;
  trees: WorkspaceNode[];
  selectedNode: WorkspaceNode | null;
  onClose: () => void;
  onBindingsChanged: () => void;
}

type CenterMode = "browse" | "bind" | "unbind";

interface ScopeTreeNode extends DataNode {
  workspaceNode: WorkspaceNode;
  children?: ScopeTreeNode[];
}

interface DraftItem extends DictionaryItem {
  draftKey: string;
}

const DETAIL_PAGE_SIZE = 100;
const CANDIDATE_PAGE_SIZE = 50;
const MANAGE_PAGE_SIZE = 50;

const buildScopeTree = (node: WorkspaceNode, selectedId?: string | null): ScopeTreeNode => ({
  key: node.id,
  className: node.id === selectedId ? "navigator-tree-node-selected" : undefined,
  title: (
    <span className={`tree-title tree-title-${node.type}`} title={node.parse_error || node.name}>
      <span className="tree-label">
        {node.type === "project" ? (
          <ProjectGlyph className="tree-node-icon tree-project-icon" />
        ) : node.type === "folder" ? (
          <FolderGlyph className="tree-node-icon tree-folder-icon" />
        ) : (
          <PdmGlyph className={`tree-node-icon tree-pdm-icon${node.parse_error ? " is-error" : ""}`} />
        )}
        <span className="tree-name">{node.name}</span>
      </span>
      <span className={node.parse_error ? "tree-count is-error" : "tree-count"}>
        {node.type === "project"
          ? `${node.pdm_count || 0} PDM`
          : node.type === "folder"
            ? String(node.pdm_count || 0)
            : node.parse_error
              ? "!"
              : String(node.table_count || 0)}
      </span>
    </span>
  ),
  workspaceNode: node,
  children: node.children?.map((child) => buildScopeTree(child, selectedId)),
});

const scopeLabel = (node: WorkspaceNode | null) => {
  if (!node) return "尚未选择范围";
  return node.relative_path ? `${node.name} · ${node.relative_path}` : node.name;
};

const findScopePath = (
  nodes: ScopeTreeNode[],
  targetKey: React.Key,
  ancestors: React.Key[] = [],
): React.Key[] => {
  for (const node of nodes) {
    const path = [...ancestors, node.key];
    if (node.key === targetKey) return path;
    const childPath = findScopePath(node.children || [], targetKey, path);
    if (childPath.length) return childPath;
  }
  return [];
};

const formatDictionaryDate = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value.replace("T", " ").slice(0, 16)
    : new Intl.DateTimeFormat("zh-CN", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(date);
};

export function DictionaryCenterModal({
  open,
  trees,
  selectedNode,
  onClose,
  onBindingsChanged,
}: DictionaryCenterModalProps) {
  const { message } = AntApp.useApp();
  const [mode, setMode] = useState<CenterMode>("browse");
  const [loading, setLoading] = useState(false);
  const [dictionaries, setDictionaries] = useState<DictionarySummary[]>([]);
  const [dictionaryQuery, setDictionaryQuery] = useState("");
  const [dictionaryDraftQuery, setDictionaryDraftQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [items, setItems] = useState<DictionaryItem[]>([]);
  const [boundFields, setBoundFields] = useState<DictionaryBoundField[]>([]);
  const [detailQuery, setDetailQuery] = useState("");
  const [detailDraftQuery, setDetailDraftQuery] = useState("");
  const [detailRevision, setDetailRevision] = useState(0);
  const [activeTab, setActiveTab] = useState("items");
  const [detailPage, setDetailPage] = useState(1);
  const [detailLoading, setDetailLoading] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [manageLoading, setManageLoading] = useState(false);
  const [manageSaving, setManageSaving] = useState(false);
  const [managePage, setManagePage] = useState(1);
  const [manageId, setManageId] = useState<string | null>(null);
  const [manageName, setManageName] = useState("");
  const [manageDescription, setManageDescription] = useState("");
  const [draftItems, setDraftItems] = useState<DraftItem[]>([]);
  const [importOpen, setImportOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [inspecting, setInspecting] = useState(false);
  const [excelFile, setExcelFile] = useState<File | null>(null);
  const [excelInspection, setExcelInspection] = useState<ExcelInspection | null>(null);
  const [importForm] = Form.useForm();
  const watchedSheetName = Form.useWatch("sheetName", importForm);
  const watchedCodeColumns = Form.useWatch("codeColumns", importForm) ?? [];
  const [scope, setScope] = useState<WorkspaceNode | null>(null);
  const [scopeExpandedKeys, setScopeExpandedKeys] = useState<React.Key[]>([]);
  const [candidateQuery, setCandidateQuery] = useState("");
  const [candidates, setCandidates] = useState<DictionaryBoundField[]>([]);
  const [candidateLoading, setCandidateLoading] = useState(false);
  const [candidatePage, setCandidatePage] = useState(1);
  const [selectedFieldIds, setSelectedFieldIds] = useState<React.Key[]>([]);
  const [bindingSaving, setBindingSaving] = useState(false);

  const selectedDictionary = dictionaries.find((item) => item.id === selectedId) || null;
  const scopeTree = useMemo(() => trees.map((node) => buildScopeTree(node, scope?.id)), [trees, scope?.id]);
  const scopeIndex = useMemo(() => {
    const index = new Map<React.Key, WorkspaceNode>();
    const walk = (node: ScopeTreeNode) => {
      index.set(node.key, node.workspaceNode);
      node.children?.forEach(walk);
    };
    scopeTree.forEach(walk);
    return index;
  }, [scopeTree]);

  const loadDictionaries = async (preferredId?: string | null) => {
    setLoading(true);
    try {
      const result = await dictionariesApi.list();
      setDictionaries(result);
      setSelectedId((current) => {
        const preferred = preferredId || current;
        return result.some((item) => item.id === preferred) ? preferred : result[0]?.id || null;
      });
    } catch (error) {
      message.error(errorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    setMode("browse");
    setScope(selectedNode || trees[0] || null);
    setDictionaryQuery("");
    setDictionaryDraftQuery("");
    setDetailQuery("");
    setDetailDraftQuery("");
    setDetailPage(1);
    void loadDictionaries();
  }, [open]);

  useEffect(() => {
    if (!open || !selectedId) {
      setItems([]);
      setBoundFields([]);
      return;
    }
    let active = true;
    setDetailLoading(true);
    Promise.all([
      dictionariesApi.items(selectedId),
      dictionariesApi.boundFields(selectedId),
    ]).then(([itemResult, bindings]) => {
      if (!active) return;
      setItems(itemResult.items);
      setBoundFields(bindings);
    }).catch((error) => {
      if (active) message.error(errorMessage(error));
    }).finally(() => {
      if (active) setDetailLoading(false);
    });
    return () => { active = false; };
  }, [open, selectedId, detailRevision]);

  const submitDictionarySearch = () => setDictionaryQuery(dictionaryDraftQuery.trim());

  const submitDetailSearch = () => {
    setDetailQuery(detailDraftQuery.trim());
    setDetailPage(1);
  };

  const filteredDictionaries = useMemo(() => {
    const query = dictionaryQuery.trim().toLocaleLowerCase();
    if (!query) return dictionaries;
    return dictionaries.filter((item) => `${item.name}\n${item.description}\n${item.source_name}`.toLocaleLowerCase().includes(query));
  }, [dictionaries, dictionaryQuery]);

  const filteredItems = useMemo(() => {
    const query = detailQuery.trim().toLocaleLowerCase();
    if (!query) return items;
    return items.filter((item) => `${item.code}\n${item.name}\n${item.description}`.toLocaleLowerCase().includes(query));
  }, [detailQuery, items]);

  const filteredBindings = useMemo(() => {
    const query = detailQuery.trim().toLocaleLowerCase();
    if (!query) return boundFields;
    return boundFields.filter((item) => `${item.field_code}\n${item.field_name}\n${item.table_code}\n${item.pdm_path}\n${item.project_name}`.toLocaleLowerCase().includes(query));
  }, [boundFields, detailQuery]);

  const openManager = async (dictionary?: DictionarySummary) => {
    setManageId(dictionary?.id || null);
    setManageName(dictionary?.name || "");
    setManageDescription(dictionary?.description || "");
    setManageLoading(false);
    setDraftItems([]);
    setManagePage(1);
    if (dictionary) {
      if (dictionary.id === selectedId && items.length === dictionary.item_count) {
        setDraftItems(items.map((item) => ({ ...item, draftKey: item.id || crypto.randomUUID() })));
        setManageOpen(true);
        return;
      }
      setManageOpen(true);
      setManageLoading(true);
      try {
        const result = await dictionariesApi.items(dictionary.id);
        setDraftItems(result.items.map((item) => ({ ...item, draftKey: item.id || crypto.randomUUID() })));
      } catch (error) {
        message.error(errorMessage(error));
      } finally {
        setManageLoading(false);
      }
    } else {
      setDraftItems([{ draftKey: crypto.randomUUID(), code: "", name: "", description: "" }]);
      setManageOpen(true);
    }
  };

  const saveManager = async () => {
    if (!manageName.trim()) {
      message.warning("请输入字典名称");
      return;
    }
    const normalized = draftItems.filter((item) => item.code.trim()).map(({ code, name, description }) => ({
      code: code.trim(), name: name.trim(), description: description.trim(),
    }));
    setManageSaving(true);
    try {
      const dictionary = manageId
        ? await dictionariesApi.update(manageId, manageName.trim(), manageDescription.trim())
        : await dictionariesApi.create(manageName.trim(), manageDescription.trim());
      await dictionariesApi.replaceItems(dictionary.id, normalized);
      setManageOpen(false);
      await loadDictionaries(dictionary.id);
      message.success(manageId ? "字典已保存" : "字典已创建");
    } catch (error) {
      message.error(errorMessage(error));
    } finally {
      setManageSaving(false);
    }
  };

  const inspectExcel = async (file: File) => {
    setExcelFile(file);
    setInspecting(true);
    try {
      const inspection = await dictionariesApi.inspectExcel(file);
      setExcelInspection(inspection);
      const sheet = inspection.sheets[0];
      importForm.setFieldsValue({
        name: file.name.replace(/\.(xlsx|xlsm)$/i, ""),
        description: "",
        sheetName: sheet?.name,
        codeColumns: sheet?.columns[0] ? [sheet.columns[0]] : [],
        nameColumn: sheet?.columns[1] || sheet?.columns[0],
        descriptionColumn: undefined,
      });
    } catch (error) {
      setExcelInspection(null);
      message.error(errorMessage(error));
    } finally {
      setInspecting(false);
    }
    return false;
  };

  const importExcel = async () => {
    if (!excelFile || !excelInspection) return;
    try {
      const values = await importForm.validateFields();
      setImporting(true);
      const result = await dictionariesApi.importExcel({
        file: excelFile,
        name: values.name,
        description: values.description || "",
        sheetName: values.sheetName,
        codeColumns: values.codeColumns,
        nameColumn: values.nameColumn,
        descriptionColumn: values.descriptionColumn || "",
      });
      setImportOpen(false);
      setExcelFile(null);
      setExcelInspection(null);
      importForm.resetFields();
      await loadDictionaries(result.id);
      message.success(importSuccessMessage(result));
    } catch (error) {
      if (error && typeof error === "object" && "errorFields" in error) return;
      message.error(errorMessage(error));
    } finally {
      setImporting(false);
    }
  };

  const enterBindingMode = (nextMode: "bind" | "unbind") => {
    if (!selectedDictionary) return;
    const initialScope = selectedNode || trees[0] || null;
    setMode(nextMode);
    setScope(initialScope);
    const initialPath = initialScope ? findScopePath(scopeTree, initialScope.id) : [];
    setScopeExpandedKeys(initialScope?.type === "pdm" ? initialPath.slice(0, -1) : initialPath);
    setCandidateQuery("");
    setCandidates([]);
    setCandidatePage(1);
    setSelectedFieldIds([]);
  };

  const searchCandidates = async () => {
    if (!selectedDictionary || !scope) return;
    const projectId = getProjectId(scope);
    if (!projectId) return;
    setCandidateLoading(true);
    try {
      const result = await dictionariesApi.candidates({
        dictionaryId: selectedDictionary.id,
        projectId,
        scopeType: scope.type,
        scopePath: scope.relative_path,
        query: candidateQuery.trim(),
        mode: mode === "unbind" ? "unbind" : "bind",
      });
      setCandidates(result.items);
      setCandidatePage(1);
      setSelectedFieldIds([]);
    } catch (error) {
      message.error(errorMessage(error));
    } finally {
      setCandidateLoading(false);
    }
  };

  const submitCandidateSearch = () => {
    setCandidatePage(1);
    void searchCandidates();
  };

  const applyBinding = async () => {
    if (!selectedDictionary || !selectedFieldIds.length) return;
    setBindingSaving(true);
    try {
      const ids = selectedFieldIds.map(String);
      const result = mode === "unbind"
        ? await dictionariesApi.unbind(selectedDictionary.id, ids)
        : await dictionariesApi.bind(selectedDictionary.id, ids);
      message.success(mode === "unbind" ? `已解绑 ${result.count} 个字段` : `已绑定 ${result.count} 个字段`);
      onBindingsChanged();
      setMode("browse");
      setDetailRevision((current) => current + 1);
      await loadDictionaries(selectedDictionary.id);
    } catch (error) {
      message.error(errorMessage(error));
    } finally {
      setBindingSaving(false);
    }
  };

  const itemColumns: ColumnsType<DictionaryItem> = [
    { title: "序号", width: 58, render: (_value, _item, index) => String((detailPage - 1) * DETAIL_PAGE_SIZE + index + 1).padStart(2, "0") },
    { title: "字典值", dataIndex: "code", width: 190, render: (value) => <code>{value}</code> },
    { title: "字典值名称", dataIndex: "name", width: 260 },
    { title: "说明", dataIndex: "description", ellipsis: true },
  ];

  const bindingColumns: ColumnsType<DictionaryBoundField> = [
    { title: "字段", dataIndex: "field_code", width: 180, render: (value) => <code>{value}</code> },
    { title: "字段描述", dataIndex: "field_name", width: 180, ellipsis: true },
    { title: "表", dataIndex: "table_code", width: 180, render: (value) => <code>{value}</code> },
    { title: "所属 PDM", dataIndex: "pdm_path", ellipsis: true },
    { title: "项目", dataIndex: "project_name", width: 150, ellipsis: true },
  ];

  const draftColumns: ColumnsType<DraftItem> = [
    { title: "字典值", width: 190, render: (_value, record) => <Input value={record.code} onChange={(event) => setDraftItems((current) => current.map((item) => item.draftKey === record.draftKey ? { ...item, code: event.target.value } : item))} /> },
    { title: "字典值名称", width: 240, render: (_value, record) => <Input value={record.name} onChange={(event) => setDraftItems((current) => current.map((item) => item.draftKey === record.draftKey ? { ...item, name: event.target.value } : item))} /> },
    { title: "说明", render: (_value, record) => <Input value={record.description} onChange={(event) => setDraftItems((current) => current.map((item) => item.draftKey === record.draftKey ? { ...item, description: event.target.value } : item))} /> },
    { title: "", width: 42, render: (_value, record) => <Button type="text" danger icon={<DeleteOutlined />} aria-label="删除字典值" onClick={() => setDraftItems((current) => current.filter((item) => item.draftKey !== record.draftKey))} /> },
  ];

  const currentSheet = excelInspection?.sheets.find((sheet) => sheet.name === watchedSheetName) || excelInspection?.sheets[0];

  const codeColumnsExample = useMemo(() => {
    const row = currentSheet?.preview[0];
    const columns = currentSheet?.columns || [];
    if (!row || !Array.isArray(watchedCodeColumns) || watchedCodeColumns.length === 0) return "";
    const values = watchedCodeColumns.map((column: string) => row[columns.indexOf(column)]);
    if (values.some((value) => value === undefined)) return "";
    return values.join("|");
  }, [currentSheet, watchedCodeColumns]);
  const addDraftItem = () => {
    setDraftItems((current) => {
      const next = [...current, { draftKey: crypto.randomUUID(), code: "", name: "", description: "" }];
      setManagePage(Math.max(1, Math.ceil(next.length / MANAGE_PAGE_SIZE)));
      return next;
    });
  };

  return (
    <>
      <Modal
        open={open}
        width={1180}
        centered
        className="dictionary-center-modal"
        title={(
          <span className="dictionary-modal-title">
            <span className="dictionary-title-icon"><BookOutlined /></span>
            <span><b>{mode === "browse" ? "字典中心" : mode === "bind" ? "批量绑定" : "批量解绑"}</b><small>{mode === "browse" ? "集中维护字典内容与字段绑定关系" : `目标字典：${selectedDictionary?.name || "—"}`}</small></span>
          </span>
        )}
        footer={mode === "browse" ? null : [
          <Button key="cancel" onClick={() => setMode("browse")}>取消</Button>,
          <Button key="apply" type="primary" loading={bindingSaving} disabled={!selectedFieldIds.length} onClick={applyBinding}>
            {mode === "unbind" ? `解绑所选字段（${selectedFieldIds.length}）` : `绑定所选字段（${selectedFieldIds.length}）`}
          </Button>,
        ]}
        onCancel={mode === "browse" ? onClose : () => setMode("browse")}
      >
        {mode === "browse" ? (
          <div className="dictionary-center-layout">
            <aside className="dictionary-list-pane">
              <div className="dictionary-pane-heading"><span><b>全部字典</b><small>{dictionaries.length} 套字典</small></span></div>
              <Input
                allowClear
                prefix={(
                  <button
                    type="button"
                    className="input-search-trigger"
                    aria-label="搜索字典名称或来源"
                    title="搜索"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={submitDictionarySearch}
                  >
                    <SearchOutlined />
                  </button>
                )}
                placeholder="搜索字典名称或来源"
                value={dictionaryDraftQuery}
                onChange={(event) => setDictionaryDraftQuery(event.target.value)}
                onPressEnter={submitDictionarySearch}
                onClear={() => {
                  setDictionaryDraftQuery("");
                  setDictionaryQuery("");
                }}
              />
              <div className="dictionary-list-scroll">
                {loading ? <div className="dictionary-centered"><Spin size="small" /></div> : filteredDictionaries.length ? filteredDictionaries.map((dictionary) => (
                  <button key={dictionary.id} type="button" className={`dictionary-list-item${selectedId === dictionary.id ? " is-selected" : ""}`} onClick={() => { setSelectedId(dictionary.id); setDetailQuery(""); setDetailDraftQuery(""); }}>
                    <span className="dictionary-list-icon"><BookOutlined /></span>
                    <span className="dictionary-list-label"><b>{dictionary.name}</b></span>
                    <strong>{dictionary.item_count.toLocaleString()}</strong>
                  </button>
                )) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无字典" />}
              </div>
              <div className="dictionary-list-actions">
                <Button icon={<UploadOutlined />} onClick={() => setImportOpen(true)}>Excel 导入</Button>
                <Button type="primary" icon={<PlusOutlined />} onClick={() => void openManager()}>新建字典</Button>
              </div>
            </aside>
            <section className="dictionary-detail-pane">
              {selectedDictionary ? (
                <>
                  <header className="dictionary-detail-header">
                    <span><b>{selectedDictionary.name}</b><small>{selectedDictionary.description || "暂无字典说明"}</small></span>
                    <div>
                      <Button icon={<LinkOutlined />} onClick={() => enterBindingMode("unbind")}>批量解绑</Button>
                      <Button type="primary" icon={<LinkOutlined />} onClick={() => enterBindingMode("bind")}>批量绑定</Button>
                      <Button icon={<SettingOutlined />} onClick={() => void openManager(selectedDictionary)}>维护字典</Button>
                      <Popconfirm title="删除该字典？" description="字典值和全部字段绑定都会删除。" okText="删除" cancelText="取消" onConfirm={async () => { try { await dictionariesApi.remove(selectedDictionary.id); await loadDictionaries(); message.success("字典已删除"); } catch (error) { message.error(errorMessage(error)); } }}>
                        <Button danger icon={<DeleteOutlined />} aria-label="删除字典" />
                      </Popconfirm>
                    </div>
                  </header>
                  <div className="dictionary-metrics">
                    <span><small>数据来源</small><b>{selectedDictionary.source_type === "excel" ? "Excel 导入" : "手工维护"}</b></span>
                    <span><small>字典值</small><b>{selectedDictionary.item_count.toLocaleString()} 条</b></span>
                    <span><small>已绑定字段</small><b>{selectedDictionary.binding_count} 个 · {selectedDictionary.table_count} 张表</b></span>
                    <span><small>最近更新</small><b>{formatDictionaryDate(selectedDictionary.updated_at)}</b></span>
                  </div>
                  <div className="dictionary-detail-tabs">
                    <Tabs activeKey={activeTab} onChange={(key) => { setActiveTab(key); setDetailQuery(""); setDetailDraftQuery(""); setDetailPage(1); }} items={[{ key: "items", label: "字典明细" }, { key: "bindings", label: `已绑定字段（${selectedDictionary.binding_count}）` }]} />
                    <Input
                      allowClear
                      prefix={(
                        <button
                          type="button"
                          className="input-search-trigger"
                          aria-label={activeTab === "items" ? "搜索字典值或名称" : "搜索字段、表或 PDM"}
                          title="搜索"
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={submitDetailSearch}
                        >
                          <SearchOutlined />
                        </button>
                      )}
                      placeholder={activeTab === "items" ? "搜索字典值或名称" : "搜索字段、表或 PDM"}
                      value={detailDraftQuery}
                      onChange={(event) => setDetailDraftQuery(event.target.value)}
                      onPressEnter={submitDetailSearch}
                      onClear={() => {
                        setDetailDraftQuery("");
                        setDetailQuery("");
                        setDetailPage(1);
                      }}
                    />
                  </div>
                  <div className="dictionary-detail-table">
                    {activeTab === "items" ? (
                      <Table<DictionaryItem>
                        key={`items-${selectedId}`}
                        rowKey={(record) => record.id || `${record.code}-${record.ordinal}`}
                        loading={detailLoading}
                        size="small"
                        pagination={{ current: detailPage, pageSize: DETAIL_PAGE_SIZE, total: filteredItems.length, showSizeChanger: false, onChange: setDetailPage }}
                        columns={itemColumns}
                        dataSource={filteredItems}
                        scroll={{ y: 390 }}
                      />
                    ) : (
                      <Table<DictionaryBoundField>
                        key={`bindings-${selectedId}`}
                        rowKey="field_id"
                        loading={detailLoading}
                        size="small"
                        pagination={{ current: detailPage, pageSize: DETAIL_PAGE_SIZE, total: filteredBindings.length, showSizeChanger: false, onChange: setDetailPage }}
                        columns={bindingColumns}
                        dataSource={filteredBindings}
                        scroll={{ y: 390 }}
                      />
                    )}
                  </div>
                </>
              ) : <div className="dictionary-centered"><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="请新建或导入一个字典" /></div>}
            </section>
          </div>
        ) : (
          <div className="dictionary-binding-layout">
            <aside className="dictionary-scope-pane">
              <div className="dictionary-binding-target"><BookOutlined /><span><small>目标字典</small><b>{selectedDictionary?.name}</b></span></div>
              <div className="dictionary-pane-heading"><span><b>选择范围</b><small>项目 / 文件夹 / PDM</small></span></div>
              <div className="dictionary-scope-tree navigator-tree">
                <Tree
                  blockNode
                  showLine={{ showLeafIcon: false }}
                  motion={null}
                  autoExpandParent={false}
                  switcherIcon={(props) => <TreeChevronGlyph expanded={Boolean(props.expanded)} />}
                  expandedKeys={scopeExpandedKeys}
                  onExpand={(keys) => setScopeExpandedKeys(keys)}
                  selectedKeys={scope ? [scope.id] : []}
                  treeData={scopeTree}
                  onSelect={(keys) => {
                    const node = keys[0] ? scopeIndex.get(keys[0]) : null;
                    if (node) {
                      setScope(node);
                      setCandidates([]);
                      setCandidatePage(1);
                      setSelectedFieldIds([]);
                    }
                  }}
                />
              </div>
            </aside>
            <section className="dictionary-candidate-pane">
              <div className="dictionary-current-scope"><FolderOpenOutlined /><small>当前范围</small><b>{scopeLabel(scope)}</b></div>
              <div className="dictionary-candidate-search">
                <Input
                  allowClear
                  prefix={(
                    <button
                      type="button"
                      className="input-search-trigger"
                      aria-label="搜索字段、表或 PDM"
                      title="搜索"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={submitCandidateSearch}
                    >
                      <SearchOutlined />
                    </button>
                  )}
                  placeholder="搜索字段名、表名或 PDM，例如 L_BUSIN_FLAG"
                  value={candidateQuery}
                  onChange={(event) => setCandidateQuery(event.target.value)}
                  onPressEnter={submitCandidateSearch}
                />
              </div>
              <div className="dictionary-candidate-summary"><span><b>搜索结果</b><small>共 {candidates.length} 个字段</small></span><strong>已选择 {selectedFieldIds.length} 个</strong></div>
              <Table<DictionaryBoundField>
                rowKey="field_id"
                size="small"
                loading={candidateLoading}
                pagination={{ current: candidatePage, pageSize: CANDIDATE_PAGE_SIZE, total: candidates.length, showSizeChanger: false, onChange: setCandidatePage }}
                columns={bindingColumns}
                dataSource={candidates}
                rowSelection={{ preserveSelectedRowKeys: true, selectedRowKeys: selectedFieldIds, onChange: setSelectedFieldIds }}
                scroll={{ y: 390 }}
                locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="选择范围并搜索字段" /> }}
              />
            </section>
          </div>
        )}
      </Modal>

      <Modal open={manageOpen} width={900} centered destroyOnHidden className="dictionary-manage-modal" title={<span className="dictionary-submodal-title"><EditOutlined /> {manageId ? "维护字典" : "新建字典"}</span>} okText="保存字典" cancelText="取消" confirmLoading={manageSaving} onOk={() => void saveManager()} onCancel={() => setManageOpen(false)}>
        <div className="dictionary-manage-meta">
          <label><span>字典名称</span><Input value={manageName} maxLength={160} placeholder="例如：O32 业务标志" onChange={(event) => setManageName(event.target.value)} /></label>
          <label><span>字典说明</span><Input value={manageDescription} maxLength={1000} placeholder="可选" onChange={(event) => setManageDescription(event.target.value)} /></label>
        </div>
        <div className="dictionary-manage-toolbar"><span><b>字典值</b><small>共 {draftItems.length.toLocaleString()} 条，空字典值不会保存</small></span><Button icon={<PlusOutlined />} onClick={addDraftItem}>新增一行</Button></div>
        <Table
          rowKey="draftKey"
          size="small"
          pagination={{ current: managePage, pageSize: MANAGE_PAGE_SIZE, total: draftItems.length, showSizeChanger: false, onChange: setManagePage }}
          loading={manageLoading}
          columns={draftColumns}
          dataSource={draftItems}
          scroll={{ y: 338 }}
        />
      </Modal>

      <Modal open={importOpen} width={760} centered className="dictionary-import-modal" title={<span className="dictionary-submodal-title"><FileExcelOutlined /> Excel 导入字典</span>} okText="导入字典" cancelText="取消" okButtonProps={{ disabled: !excelInspection }} confirmLoading={importing} onOk={() => void importExcel()} onCancel={() => { setImportOpen(false); setExcelFile(null); setExcelInspection(null); importForm.resetFields(); }}>
        <Upload.Dragger accept=".xlsx,.xlsm" maxCount={1} fileList={excelFile ? [{ uid: "dictionary-excel", name: excelFile.name, status: "done" }] : []} beforeUpload={(file) => inspectExcel(file as File)} onRemove={() => { setExcelFile(null); setExcelInspection(null); importForm.resetFields(); return true; }}>
          <p className="ant-upload-drag-icon"><FileExcelOutlined /></p>
          <p className="ant-upload-text">选择或拖入 Excel 文件</p>
          <p className="ant-upload-hint">支持 .xlsx / .xlsm，导入时可指定工作表和字段列，字典值列可多选组合</p>
        </Upload.Dragger>
        <div className="dictionary-import-body">
          {inspecting ? <div className="dictionary-centered"><Spin size="small" /> 正在读取表头…</div> : excelInspection ? (
            <Form form={importForm} layout="vertical">
              <div className="dictionary-import-grid">
                <Form.Item label="字典名称" name="name" rules={[{ required: true, message: "请输入字典名称" }]}><Input /></Form.Item>
                <Form.Item label="工作表" name="sheetName" rules={[{ required: true }]}><Select options={excelInspection.sheets.map((sheet) => ({ value: sheet.name, label: `${sheet.name}（${sheet.row_count} 行）` }))} onChange={(sheetName) => { const sheet = excelInspection.sheets.find((item) => item.name === sheetName); importForm.setFieldsValue({ codeColumns: sheet?.columns[0] ? [sheet.columns[0]] : [], nameColumn: sheet?.columns[1] || sheet?.columns[0], descriptionColumn: undefined }); }} /></Form.Item>
                <Form.Item label="字典值列（可多选组合）" name="codeColumns" rules={[{ required: true, message: "请选择字典值列" }]} extra={codeColumnsExample ? `组合示例：${codeColumnsExample}` : "多选时按选择顺序用 | 连接，例如 0|1"}><Select mode="multiple" maxCount={3} optionFilterProp="label" options={(currentSheet?.columns || []).map((column) => ({ value: column, label: column }))} /></Form.Item>
                <Form.Item label="字典值名称列" name="nameColumn" rules={[{ required: true }]}><Select options={(currentSheet?.columns || []).map((column) => ({ value: column, label: column }))} /></Form.Item>
                <Form.Item label="说明列（可选）" name="descriptionColumn"><Select allowClear options={(currentSheet?.columns || []).map((column) => ({ value: column, label: column }))} /></Form.Item>
                <Form.Item label="字典说明" name="description"><Input /></Form.Item>
              </div>
              <div className="dictionary-excel-preview"><Tag color="green">表头预览</Tag>{(currentSheet?.columns || []).slice(0, 6).map((column) => <span key={column}>{column}</span>)}</div>
            </Form>
          ) : <div className="dictionary-import-placeholder">选择文件后，可配置工作表及字典值列。</div>}
        </div>
      </Modal>
    </>
  );
}
