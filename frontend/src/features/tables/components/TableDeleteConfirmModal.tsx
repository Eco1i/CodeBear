import {
  DeleteOutlined,
  SafetyCertificateOutlined,
} from "@ant-design/icons";
import { Modal } from "antd";
import type { TableDeletePreview } from "../types";

interface TableDeleteConfirmModalProps {
  open: boolean;
  preview: TableDeletePreview | null;
  confirming: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

function targetSummary(preview: TableDeletePreview) {
  if (preview.table_count === 1) {
    const table = preview.tables[0];
    return {
      title: table?.code || table?.name || "未命名数据表",
      detail: [table?.name, table?.relative_path].filter(Boolean).join(" · "),
    };
  }

  const codes = preview.tables
    .slice(0, 3)
    .map((table) => table.code || table.name)
    .filter(Boolean);
  const remaining = Math.max(0, preview.table_count - codes.length);
  return {
    title: `${preview.table_count} 张数据表`,
    detail: `${codes.join("、")}${remaining > 0 ? ` 等 ${preview.table_count} 张` : ""}`,
  };
}

export function TableDeleteConfirmModal({
  open,
  preview,
  confirming,
  onCancel,
  onConfirm,
}: TableDeleteConfirmModalProps) {
  const summary = preview ? targetSummary(preview) : null;

  return (
    <Modal
      open={open}
      centered
      width={480}
      className="table-delete-modal"
      title={(
        <span className="table-delete-modal-title" aria-label="删除数据表">
          <span className="table-delete-modal-title-icon" aria-hidden="true"><DeleteOutlined /></span>
          <span>删除数据表</span>
        </span>
      )}
      okText={preview?.table_count === 1 ? "确认删除" : `删除 ${preview?.table_count || 0} 张表`}
      cancelText="取消"
      okButtonProps={{ danger: true }}
      cancelButtonProps={{ disabled: confirming }}
      confirmLoading={confirming}
      keyboard={!confirming}
      mask={{ closable: !confirming }}
      destroyOnHidden
      onCancel={onCancel}
      onOk={onConfirm}
    >
      {preview && summary ? (
        <div className="table-delete-dialog-content">
          <section className="table-delete-target" aria-label="待删除数据表">
            <span>待删除</span>
            <code title={summary.title}>{summary.title}</code>
            <small title={summary.detail}>{summary.detail}</small>
          </section>

          <section className="table-delete-impact" aria-label="删除影响范围">
            <span><b>{preview.field_count}</b><small>字段</small></span>
            <span><b>{preview.relation_count}</b><small>表关系</small></span>
            <span><b>{preview.binding_count}</b><small>字典绑定</small></span>
            <span><b>{preview.pdm_count}</b><small>PDM</small></span>
          </section>

          <div className="table-delete-backup-note">
            <span className="table-delete-backup-icon" aria-hidden="true">
              <SafetyCertificateOutlined />
            </span>
            <span>
              <strong>原文件自动备份</strong>
              <small>涉及的 {preview.pdm_count} 个 PDM 会在删除前保留原文件副本。</small>
            </span>
          </div>
        </div>
      ) : null}
    </Modal>
  );
}
