import { App as AntApp, Button, Drawer, Empty, Spin } from "antd";
import { ApartmentOutlined, EditOutlined, PlusOutlined } from "@ant-design/icons";
import { cardinalityText, relationDisplayName } from "../model";
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

export function RelationDrawer({ open, table, data, loading, onClose, onJump, onEdit, onCreate, onOpenGraph }: RelationDrawerProps) {
  const incoming = data?.incoming || [];
  const outgoing = data?.outgoing || [];

  const entry = (relation: Relation, isIncoming: boolean) => {
    const other = isIncoming ? relation.source_table : relation.target_table;
    const srcName = isIncoming ? other.name : "本表";
    const srcField = isIncoming ? relation.source_field : relation.target_field;
    const dstName = isIncoming ? "本表" : other.name;
    const dstField = isIncoming ? relation.target_field : relation.source_field;
    return (
      <div className="rel-entry" key={relation.id}>
        <div className="rel-entry-main">
          <div className="rel-entry-row1">
            <code className="rel-name">{relationDisplayName(relation)}</code>
            <span className={`rel-source-badge ${relation.source_type}`}>
              {relation.source_type === "auto" ? "自动解析" : "手工维护"}
            </span>
            <span className="rel-cardinality">{cardinalityText(relation.cardinality)}</span>
          </div>
          <div className="rel-entry-row2">
            <span>{srcName}</span>
            <code>{srcField.code}</code>
            <span className="rel-arrow">→</span>
            <span>{dstName}</span>
            <code>{dstField.code}</code>
          </div>
          {relation.note ? <div className="rel-entry-row3">{relation.note}</div> : null}
        </div>
        <div className="rel-entry-side">
          <span className="rel-jump" onClick={() => onJump(other.id)} title={`切换到「${other.name}」`}>
            <code>{other.code}</code> ↗
          </span>
          {relation.source_type === "manual" ? (
            <span className="rel-row-actions">
              <Button type="link" size="small" icon={<EditOutlined />} onClick={() => onEdit(relation)}>
                编辑
              </Button>
            </span>
          ) : (
            <span className="rel-auto-hint">来自 PDM 解析</span>
          )}
        </div>
      </div>
    );
  };

  const group = (head: string, direction: "in" | "out", relations: Relation[]) => (
    <div className="rel-group">
      <div className="rel-group-head">
        <span className={`rel-dir ${direction}`} />
        {head}
        <span className="rel-group-count">· {relations.length} 条</span>
      </div>
      {relations.map((relation) => entry(relation, direction === "in"))}
    </div>
  );

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width={560}
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
        <div className="relation-list">
          {incoming.length ? group("引用本表的表（入向）", "in", incoming) : null}
          {outgoing.length ? group("本表引用的表（出向）", "out", outgoing) : null}
        </div>
      )}
      <div className="relation-drawer-footer">
        <span>入向 {incoming.length} · 出向 {outgoing.length} · 点击相关表可切换查看</span>
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
  );
}
