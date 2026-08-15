import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Button, Drawer, Empty, Input, Spin } from "antd";
import { ApartmentOutlined, EditOutlined, PlusOutlined, SearchOutlined } from "@ant-design/icons";
import { cardinalityText } from "../model";
import type { Relation, TableRelations } from "../types";

export interface RelationTableInfo {
  id: string;
  name: string;
  code: string;
  comment: string;
}

interface RelationDrawerProps {
  open: boolean;
  table: RelationTableInfo | null;
  data: TableRelations | null;
  loading: boolean;
  onClose: () => void;
  onJump: (tableId: string) => void;
  onEdit: (relation: Relation) => void;
  onCreate: () => void;
  onOpenGraph: () => void;
}

type DirFilter = "all" | "in" | "out";

interface TipState {
  x: number;
  y: number;
  relation: Relation;
  isIn: boolean;
}

export function RelationDrawer({ open, table, data, loading, onClose, onJump, onEdit, onCreate, onOpenGraph }: RelationDrawerProps) {
  const [tab, setTab] = useState<DirFilter>("all");
  const [search, setSearch] = useState("");
  const [searchDraft, setSearchDraft] = useState("");
  const [collapsed, setCollapsed] = useState<{ in: boolean; out: boolean }>({ in: false, out: false });
  const [tip, setTip] = useState<TipState | null>(null);

  const incoming = data?.incoming || [];
  const outgoing = data?.outgoing || [];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filterList = (list: Relation[]) =>
      list.filter((relation) => {
        if (!q) return true;
        const other = relation.source_table.id === table?.id ? relation.target_table : relation.source_table;
        return `${other.code} ${other.name} ${relation.source_field.code} ${relation.target_field.code} ${relation.name}`
          .toLowerCase()
          .includes(q);
      });
    return {
      in: tab === "out" ? [] : filterList(incoming),
      out: tab === "in" ? [] : filterList(outgoing),
    };
  }, [incoming, outgoing, tab, search, table?.id]);

  const entry = (relation: Relation, isIn: boolean) => {
    const other = isIn ? relation.source_table : relation.target_table;
    return (
      <div
        className={`rel-entry ${isIn ? "in" : "out"}`}
        key={relation.id}
        title={`切换到「${other.name}」`}
        onClick={() => onJump(other.id)}
        onMouseEnter={(event) => setTip({ x: event.clientX + 14, y: event.clientY + 14, relation, isIn })}
        onMouseMove={(event) => setTip((current) => (current ? { ...current, x: event.clientX + 14, y: event.clientY + 14 } : current))}
        onMouseLeave={() => setTip(null)}
      >
        <span className="rel-arrow">{isIn ? "←" : "→"}</span>
        <span className="rel-other">{other.code}</span>
        <span className="rel-joins">
          <b>{relation.source_field.code}</b> → <b>{relation.target_field.code}</b>
        </span>
        <span className={`rel-src-dot ${relation.source_type}`} />
        <span className="rel-go">切换 ↗</span>
        {relation.source_type === "manual" ? (
          <span className="rel-row-actions" onClick={(event) => event.stopPropagation()}>
            <Button type="link" size="small" icon={<EditOutlined />} onClick={() => onEdit(relation)}>
              编辑
            </Button>
          </span>
        ) : null}
      </div>
    );
  };

  const group = (head: string, dir: "in" | "out", relations: Relation[]) =>
    relations.length ? (
      <div className="rel-group">
        <div className="relation-group-head" onClick={() => setCollapsed((current) => ({ ...current, [dir]: !current[dir] }))}>
          <span className={`rel-dir ${dir}`} />
          {head}
          <span className="relation-group-count">· {relations.length} 条</span>
          <span className={`fold${collapsed[dir] ? " collapsed" : ""}`}>▾</span>
        </div>
        {collapsed[dir] ? null : relations.map((relation) => entry(relation, dir === "in"))}
      </div>
    ) : null;

  const total = filtered.in.length + filtered.out.length;
  const tipContent = tip ? (
    <div className="relation-row-tip" style={{ left: tip.x, top: tip.y }}>
      <div className="tip-name">
        {tip.isIn ? tip.relation.source_table.name : tip.relation.target_table.name}
        {`（${tip.isIn ? tip.relation.source_table.code : tip.relation.target_table.code}）`}
      </div>
      <div className="tip-fk">{tip.relation.name || "FK"}</div>
      <div style={{ marginTop: 5, fontFamily: "'JetBrains Mono', inherit" }}>
        {tip.relation.source_field.code} → {tip.relation.target_field.code}
      </div>
      <div className="tip-meta">
        <span className="tip-badge card">{cardinalityText(tip.relation.cardinality)}</span>
        <span className={`tip-badge ${tip.relation.source_type}`}>
          {tip.relation.source_type === "auto" ? "自动解析" : "手工维护"}
        </span>
      </div>
    </div>
  ) : null;

  return (
    <>
      <Drawer
        open={open}
        onClose={onClose}
        width={520}
        className="relation-drawer"
        title={
          <span className="relation-drawer-title">
            <span className="relation-title-icon">
              <ApartmentOutlined />
            </span>
            <span>
              <b>表关系{table ? ` · ${table.name}` : ""}</b>
              <small>自动解析 PDM 外键 + 手工维护关系</small>
            </span>
          </span>
        }
      >
        <div className="relation-context">
          {table ? (
            <>
              <span className="relation-context-route">
                {table.name} <code>{table.code}</code>
                {table.comment ? ` · ${table.comment}` : ""}
              </span>
              <span className="relation-status">{incoming.length + outgoing.length} 条关系</span>
            </>
          ) : null}
        </div>
        {loading ? (
          <div className="relation-centered">
            <Spin size="small" /> 正在加载表关系…
          </div>
        ) : !data ? null : incoming.length + outgoing.length === 0 ? (
          <div className="relation-centered">
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="该表暂无关系">
              <span className="relation-empty-hint">PDM 未包含关系定义时，可点击下方「新增关系」手工维护</span>
            </Empty>
          </div>
        ) : (
          <>
            <div className="relation-list-toolbar">
              <div className="relation-list-tabs">
                <Button size="small" type={tab === "all" ? "primary" : "text"} onClick={() => setTab("all")}>
                  全部 {incoming.length + outgoing.length}
                </Button>
                <Button size="small" type={tab === "in" ? "primary" : "text"} onClick={() => setTab("in")}>
                  入向 {incoming.length}
                </Button>
                <Button size="small" type={tab === "out" ? "primary" : "text"} onClick={() => setTab("out")}>
                  出向 {outgoing.length}
                </Button>
              </div>
              <div className="relation-list-search">
                <Input
                  allowClear
                  prefix={
                    <button
                      type="button"
                      className="input-search-trigger"
                      aria-label="搜索关系"
                      title="搜索"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => setSearch(searchDraft.trim())}
                    >
                      <SearchOutlined />
                    </button>
                  }
                  value={searchDraft}
                  placeholder="搜索表代码 / 字段"
                  onChange={(event) => setSearchDraft(event.target.value)}
                  onPressEnter={() => setSearch(searchDraft.trim())}
                />
              </div>
            </div>
            <div className="relation-list">
              {group("引用本表的表（入向）", "in", filtered.in)}
              {group("本表引用的表（出向）", "out", filtered.out)}
              {total === 0 ? <div className="rel-empty-hint-row">没有匹配的关系</div> : null}
            </div>
          </>
        )}
        <div className="relation-drawer-footer">
          <span>入向 {incoming.length} · 出向 {outgoing.length} · 悬停行看详情 · 点击行切换查看</span>
          <span className="relation-footer-actions">
            <Button size="small" icon={<ApartmentOutlined />} onClick={onOpenGraph}>
              关系图
            </Button>
            <Button type="primary" size="small" icon={<PlusOutlined />} onClick={onCreate}>
              新增关系
            </Button>
          </span>
        </div>
      </Drawer>
      {tip ? createPortal(tipContent, document.body) : null}
    </>
  );
}
