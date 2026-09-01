import { DeleteOutlined, SafetyCertificateOutlined } from "@ant-design/icons";
import { Modal } from "antd";
import { useI18n } from "../../preferences/PreferencesProvider";
import type { TableDeletePreview } from "../types";

interface TableDeleteConfirmModalProps {
    open: boolean;
    preview: TableDeletePreview | null;
    confirming: boolean;
    onCancel: () => void;
    onConfirm: () => void;
}

function targetSummary(
    preview: TableDeletePreview,
    t: (key: string, params?: Record<string, string | number>) => string,
) {
    if (preview.table_count === 1) {
        const table = preview.tables[0];
        return {
            title: table?.code || table?.name || t("table.unnamed"),
            detail: [table?.name, table?.relative_path]
                .filter(Boolean)
                .join(" · "),
        };
    }

    const codes = preview.tables
        .slice(0, 3)
        .map((table) => table.code || table.name)
        .filter(Boolean);
    const remaining = Math.max(0, preview.table_count - codes.length);
    return {
        title: t("delete.tables", { count: preview.table_count }),
        detail: `${codes.join("、")}${remaining > 0 ? ` … ${remaining}` : ""}`,
    };
}

export function TableDeleteConfirmModal({
    open,
    preview,
    confirming,
    onCancel,
    onConfirm,
}: TableDeleteConfirmModalProps) {
    const { t } = useI18n();
    const summary = preview ? targetSummary(preview, t) : null;

    return (
        <Modal
            open={open}
            centered
            width={480}
            className="table-delete-modal"
            title={
                <span
                    className="table-delete-modal-title"
                    aria-label={t("delete.title")}
                >
                    <span
                        className="table-delete-modal-title-icon"
                        aria-hidden="true"
                    >
                        <DeleteOutlined />
                    </span>
                    <span>{t("delete.title")}</span>
                </span>
            }
            okText={
                preview?.table_count === 1
                    ? t("delete.confirm")
                    : t("delete.tables", { count: preview?.table_count || 0 })
            }
            cancelText={t("common.cancel")}
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
                    <section
                        className="table-delete-target"
                        aria-label={t("delete.ariaTarget")}
                    >
                        <span>{t("delete.target")}</span>
                        <code title={summary.title}>{summary.title}</code>
                        <small title={summary.detail}>{summary.detail}</small>
                    </section>

                    <section
                        className="table-delete-impact"
                        aria-label={t("delete.ariaImpact")}
                    >
                        <span>
                            <b>{preview.field_count}</b>
                            <small>{t("common.field")}</small>
                        </span>
                        <span>
                            <b>{preview.relation_count}</b>
                            <small>{t("common.relations")}</small>
                        </span>
                        <span>
                            <b>{preview.binding_count}</b>
                            <small>{t("common.dictionaryBindings")}</small>
                        </span>
                        <span>
                            <b>{preview.pdm_count}</b>
                            <small>{t("common.pdm")}</small>
                        </span>
                    </section>

                    <div className="table-delete-backup-note">
                        <span
                            className="table-delete-backup-icon"
                            aria-hidden="true"
                        >
                            <SafetyCertificateOutlined />
                        </span>
                        <span>
                            <strong>{t("delete.backupTitle")}</strong>
                            <small>
                                {t("delete.backupDescription", {
                                    count: preview.pdm_count,
                                })}
                            </small>
                        </span>
                    </div>
                </div>
            ) : null}
        </Modal>
    );
}
