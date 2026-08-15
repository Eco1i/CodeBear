import { useCallback, useEffect, useState } from "react";
import { App as AntApp } from "antd";
import { relationsApi } from "../api";
import type { Relation, TableRelations } from "../types";
import { RelationDrawer, RelationTableInfo } from "./RelationDrawer";
import { RelationFormModal } from "./RelationFormModal";
import { RelationGraphModal } from "./RelationGraphModal";

interface RelationCenterProps {
  open: boolean;
  table: RelationTableInfo | null;
  onClose: () => void;
  onJump: (tableId: string) => void;
}

export function RelationCenter({ open, table, onClose, onJump }: RelationCenterProps) {
  const { message } = AntApp.useApp();
  const [data, setData] = useState<TableRelations | null>(null);
  const [loading, setLoading] = useState(false);
  const [formState, setFormState] = useState<{ editing: Relation | null } | null>(null);
  const [graphOpen, setGraphOpen] = useState(false);

  const load = useCallback(() => {
    if (!table) return;
    setLoading(true);
    relationsApi
      .fetch(table.id)
      .then(setData)
      .catch((error) => {
        message.error(error instanceof Error ? error.message : "加载表关系失败");
      })
      .finally(() => setLoading(false));
  }, [table?.id, message]);

  useEffect(() => {
    if (!open || !table) return;
    load();
  }, [open, table?.id, load]);

  const jump = (tableId: string) => {
    onJump(tableId);
  };

  const relations = data ? [...data.incoming, ...data.outgoing] : [];

  return (
    <>
      <RelationDrawer
        open={open}
        table={table}
        data={data}
        loading={loading}
        onClose={onClose}
        onJump={jump}
        onEdit={(relation) => setFormState({ editing: relation })}
        onCreate={() => setFormState({ editing: null })}
        onOpenGraph={() => setGraphOpen(true)}
      />
      {table && data ? (
        <RelationFormModal
          open={formState !== null}
          tableId={table.id}
          editing={formState?.editing || null}
          options={data.options}
          onClose={() => setFormState(null)}
          onSaved={load}
        />
      ) : null}
      {table ? (
        <RelationGraphModal
          open={graphOpen}
          centerTableId={table.id}
          relations={relations}
          tables={data?.options || []}
          onClose={() => setGraphOpen(false)}
          onJump={jump}
        />
      ) : null}
    </>
  );
}
