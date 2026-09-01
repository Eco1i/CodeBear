import {
    ApartmentOutlined,
    DatabaseFilled,
    FolderOutlined,
    InboxOutlined,
    UndoOutlined,
} from "@ant-design/icons";
import { Button, Empty, Modal, Spin, Tag, Tooltip } from "antd";
import { useI18n } from "../../preferences/PreferencesProvider";
import type { TrashItem } from "../../../types";

interface TrashModalProps {
    open: boolean;
    loading: boolean;
    items: TrashItem[];
    onClose: () => void;
    onRestore: (item: TrashItem) => void | Promise<void>;
}

export function TrashModal({
    open,
    loading,
    items,
    onClose,
    onRestore,
}: TrashModalProps) {
    const { t } = useI18n();
    return (
        <Modal
            open={open}
            title={
                <span>
                    <InboxOutlined /> {t("trash.title")}
                </span>
            }
            width={760}
            footer={<Button onClick={onClose}>{t("common.close")}</Button>}
            className="trash-modal"
            onCancel={onClose}
        >
            <div className="trash-list">
                {loading ? (
                    <div className="trash-loading">
                        <Spin /> {t("trash.reading")}
                    </div>
                ) : items.length ? (
                    items.map((item) => (
                        <div className="trash-item" key={item.id}>
                            <span className="trash-icon">
                                {item.kind === "project" ? (
                                    <ApartmentOutlined />
                                ) : item.kind === "folder" ? (
                                    <FolderOutlined />
                                ) : (
                                    <DatabaseFilled />
                                )}
                            </span>
                            <span className="trash-copy">
                                <strong>{item.name}</strong>
                                <small>
                                    {item.project_name} ·{" "}
                                    {item.deleted_at.replace("T", " ")}
                                </small>
                            </span>
                            <Tag>
                                {item.kind === "project"
                                    ? t("common.project")
                                    : item.kind === "folder"
                                      ? t("common.folder")
                                      : t("common.pdm")}
                            </Tag>
                            <Tooltip title={t("trash.restoreToOriginal")}>
                                <Button
                                    icon={<UndoOutlined />}
                                    onClick={() => onRestore(item)}
                                >
                                    {t("trash.restore")}
                                </Button>
                            </Tooltip>
                        </div>
                    ))
                ) : (
                    <Empty description={t("trash.empty")} />
                )}
            </div>
        </Modal>
    );
}
