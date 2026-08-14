import { SettingOutlined } from "@ant-design/icons";
import { Input, Modal } from "antd";
import type { Project } from "../../../types";
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
  const title =
    dialog.kind === "project"
      ? "新建项目"
      : dialog.kind === "folder"
        ? "新建子文件夹"
        : dialog.kind === "rename"
          ? "重命名节点"
          : "本机工作区设置";

  return (
    <Modal
      open={dialog.kind !== null}
      title={title}
      okText={dialog.kind === "settings" ? "保存设置" : "确定"}
      cancelText="取消"
      confirmLoading={busy}
      onOk={onSubmit}
      onCancel={onClose}
      destroyOnHidden
    >
      {dialog.kind === "settings" ? (
        <div className="dialog-form">
          <label>工作区根目录</label>
          <Input
            value={value}
            disabled={projects.length > 0}
            onChange={(event) => onValueChange(event.target.value)}
            onPressEnter={onSubmit}
            prefix={<SettingOutlined />}
          />
          <small>
            {projects.length
              ? "当前已有项目。为防止项目路径失联，需清空或移入回收站后才能切换工作区。"
              : "新项目和码熊的回收站、备份目录都会保存在这里。"}
          </small>
        </div>
      ) : (
        <div className="dialog-form">
          <label>
            {dialog.kind === "project"
              ? "项目名称"
              : dialog.kind === "folder"
                ? "文件夹名称"
                : "新名称"}
          </label>
          <Input
            autoFocus
            value={value}
            onChange={(event) => onValueChange(event.target.value)}
            onPressEnter={onSubmit}
            placeholder="请输入名称"
          />
        </div>
      )}
    </Modal>
  );
}
