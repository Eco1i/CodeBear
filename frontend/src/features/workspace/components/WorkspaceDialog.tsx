import { SettingOutlined } from "@ant-design/icons";
import { Input, Modal } from "antd";
import type { Project } from "../../../types";
import { useI18n } from "../../preferences/PreferencesProvider";
import type { DialogState } from "../model";

interface WorkspaceDialogProps {
    dialog: DialogState;
    value: string;
    busy: boolean;
    projects: Project[];
    onValueChange: (value: string) => void;
    onSubmit: () => void | Promise<void>;
    onClose: () => void;
}

export function WorkspaceDialog({
    dialog,
    value,
    busy,
    projects,
    onValueChange,
    onSubmit,
    onClose,
}: WorkspaceDialogProps) {
    const { t } = useI18n();
    const title = (() => {
        switch (dialog.kind) {
            case "project":
                return t("dialog.newProject");
            case "folder":
                return t("dialog.newSubfolder");
            case "rename":
                return t("dialog.renameNode");
            default:
                return t("dialog.workspaceSettings");
        }
    })();

    return (
        <Modal
            open={dialog.kind !== null}
            title={title}
            okText={
                dialog.kind === "settings"
                    ? t("dialog.saveSettings")
                    : t("common.confirm")
            }
            cancelText={t("common.cancel")}
            confirmLoading={busy}
            onOk={onSubmit}
            onCancel={onClose}
            destroyOnHidden
        >
            {dialog.kind === "settings" ? (
                <div className="dialog-form">
                    <label>{t("dialog.workspaceRoot")}</label>
                    <Input
                        value={value}
                        disabled={projects.length > 0}
                        onChange={(event) => onValueChange(event.target.value)}
                        onPressEnter={onSubmit}
                        prefix={<SettingOutlined />}
                    />
                    <small>
                        {projects.length
                            ? t("dialog.workspaceLocked")
                            : t("dialog.workspaceHint")}
                    </small>
                </div>
            ) : (
                <div className="dialog-form">
                    <label>
                        {dialog.kind === "project"
                            ? t("dialog.projectName")
                            : dialog.kind === "folder"
                              ? t("dialog.folderName")
                              : t("dialog.newName")}
                    </label>
                    <Input
                        autoFocus
                        value={value}
                        onChange={(event) => onValueChange(event.target.value)}
                        onPressEnter={onSubmit}
                        placeholder={t("dialog.enterName")}
                    />
                </div>
            )}
        </Modal>
    );
}
