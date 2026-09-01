import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Button, Drawer, Empty, Input, Spin } from "antd";
import {
  ApartmentOutlined,
  EditOutlined,
  PlusOutlined,
  SearchOutlined,
} from "@ant-design/icons";
import { useI18n } from "../../preferences/PreferencesProvider";
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

export function RelationDrawer({
  open,
  table,
  data,
  loading,
  onClose,
  onJump,
  onEdit,
  onCreate,
  onOpenGraph,
}: RelationDrawerProps) {
  const { t } = useI18n();
  const [tab, setTab] = useState<DirFilter>("all");
  const [search, setSearch] = useState("");
  const [searchDraft, setSearchDraft] = useState("");
  const [collapsed, setCollapsed] = useState<{ in: boolean; out: boolean }>({
    in: false,
    out: false,
  });
  const [tip, setTip] = useState<TipState | null>(null);

  const incoming = data?.incoming || [];
  const outgoing = data?.outgoing || [];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filterList = (list: Relation[]) =>
      list.filter((relation) => {
        if (!q) return true;
        const other =
          relation.source_table.id === table?.id
            ? relation.target_table
            : relation.source_table;
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
        title={`${t("relation.switch")} ${other.name}`}
        onClick={() => onJump(other.id)}
        onMouseEnter={(event) =>
          setTip({
            x: event.clientX + 14,
            y: event.clientY + 14,
            relation,
            isIn,
          })
        }
        onMouseMove={(event) =>
          setTip((current) =>
            current
              ? { ...current, x: event.clientX + 14, y: event.clientY + 14 }
              : current,
          )
        }
        onMouseLeave={() => setTip(null)}
      >
        <span className="rel-arrow">{isIn ? "←" : "→"}</span>
        <span className="rel-other">{other.code}</span>
        <span className="rel-joins">
          <b>{relation.source_field.code}</b> →{" "}
          <b>{relation.target_field.code}</b>
        </span>
        <span className={`rel-src-dot ${relation.source_type}`} />
        <span className="rel-go">{t("relation.switch")}</span>
        {relation.source_type === "manual" ? (
          <span
            className="rel-row-actions"
            onClick={(event) => event.stopPropagation()}
          >
            <Button
              type="link"
              size="small"
              icon={<EditOutlined />}
              onClick={() => onEdit(relation)}
            >
              {t("relation.edit")}
            </Button>
          </span>
        ) : null}
      </div>
    );
  };

  const group = (head: string, dir: "in" | "out", relations: Relation[]) =>
    relations.length ? (
      <div className="rel-group">
        <div
          className="relation-group-head"
          onClick={() =>
            setCollapsed((current) => ({ ...current, [dir]: !current[dir] }))
          }
        >
          <span className={`rel-dir ${dir}`} />
          {head}
          <span className="relation-group-count">
            · {t("relation.count", { count: relations.length })}
          </span>
          <span className={`fold${collapsed[dir] ? " collapsed" : ""}`}>▾</span>
        </div>
        {collapsed[dir]
          ? null
          : relations.map((relation) => entry(relation, dir === "in"))}
      </div>
    ) : null;

  const total = filtered.in.length + filtered.out.length;
  const tipContent = tip ? (
    <div className="relation-row-tip" style={{ left: tip.x, top: tip.y }}>
      <div className="tip-name">
        {tip.isIn
          ? tip.relation.source_table.name
          : tip.relation.target_table.name}
        {`（${tip.isIn ? tip.relation.source_table.code : tip.relation.target_table.code}）`}
      </div>
      <div className="tip-fk">{tip.relation.name || "FK"}</div>
      <div style={{ marginTop: 5, fontFamily: "'JetBrains Mono', inherit" }}>
        {tip.relation.source_field.code} → {tip.relation.target_field.code}
      </div>
      <div className="tip-meta">
        <span className="tip-badge card">
          {cardinalityText(tip.relation.cardinality)}
        </span>
        <span className={`tip-badge ${tip.relation.source_type}`}>
          {tip.relation.source_type === "auto"
            ? t("relation.auto")
            : t("relation.manual")}
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
              <b>
                {t("relation.title")}
                {table ? ` · ${table.name}` : ""}
              </b>
              <small>{t("relation.subtitle")}</small>
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
              <span className="relation-status">
                {t("relation.count", {
                  count: incoming.length + outgoing.length,
                })}
              </span>
            </>
          ) : null}
        </div>
        {loading ? (
          <div className="relation-centered">
            <Spin size="small" /> {t("relation.loading")}
          </div>
        ) : !data ? null : incoming.length + outgoing.length === 0 ? (
          <div className="relation-centered">
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={t("relation.empty")}
            >
              <span className="relation-empty-hint">
                {t("relation.emptyHint")}
              </span>
            </Empty>
          </div>
        ) : (
          <>
            <div className="relation-list-toolbar">
              <div className="relation-list-tabs">
                <Button
                  size="small"
                  type={tab === "all" ? "primary" : "text"}
                  onClick={() => setTab("all")}
                >
                  {t("relation.all")} {incoming.length + outgoing.length}
                </Button>
                <Button
                  size="small"
                  type={tab === "in" ? "primary" : "text"}
                  onClick={() => setTab("in")}
                >
                  {t("relation.incoming")} {incoming.length}
                </Button>
                <Button
                  size="small"
                  type={tab === "out" ? "primary" : "text"}
                  onClick={() => setTab("out")}
                >
                  {t("relation.outgoing")} {outgoing.length}
                </Button>
              </div>
              <div className="relation-list-search">
                <Input
                  allowClear
                  prefix={
                    <button
                      type="button"
                      className="input-search-trigger"
                      aria-label={t("relation.search")}
                      title={t("common.search")}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => setSearch(searchDraft.trim())}
                    >
                      <SearchOutlined />
                    </button>
                  }
                  value={searchDraft}
                  placeholder={t("relation.searchPlaceholder")}
                  onChange={(event) => setSearchDraft(event.target.value)}
                  onPressEnter={() => setSearch(searchDraft.trim())}
                />
              </div>
            </div>
            <div className="relation-list">
              {group(
                `${t("relation.relatedTable")}（${t("relation.incoming")}）`,
                "in",
                filtered.in,
              )}
              {group(
                `${t("relation.currentTable")}（${t("relation.outgoing")}）`,
                "out",
                filtered.out,
              )}
              {total === 0 ? (
                <div className="rel-empty-hint-row">
                  {t("relation.noMatch")}
                </div>
              ) : null}
            </div>
          </>
        )}
        <div className="relation-drawer-footer">
          <span>
            {t("relation.footer", {
              incoming: incoming.length,
              outgoing: outgoing.length,
            })}
          </span>
          <span className="relation-footer-actions">
            <Button
              size="small"
              icon={<ApartmentOutlined />}
              onClick={onOpenGraph}
            >
              {t("relation.graph")}
            </Button>
            <Button
              type="primary"
              size="small"
              icon={<PlusOutlined />}
              onClick={onCreate}
            >
              {t("relation.add")}
            </Button>
          </span>
        </div>
      </Drawer>
      {tip ? createPortal(tipContent, document.body) : null}
    </>
  );
}
