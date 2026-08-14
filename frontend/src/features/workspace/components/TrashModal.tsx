import {
  ApartmentOutlined,
  DatabaseFilled,
  FolderOutlined,
  InboxOutlined,
  UndoOutlined,
} from "@ant-design/icons";
import { Button, Empty, Modal, Spin, Tag, Tooltip } from "antd";
import type { TrashItem } from "../../../types";

interface TrashModalProps {
  open: boolean;
  loading: boolean;
  items: TrashItem[];
  onClose: () => void;
  onRestore: (item: TrashItem) => void | Promise<void>;
}

export function TrashModal({ open, loading, items, onClose, onRestore }: TrashModalProps) {
  return (
    <Modal
      open={open}
      title={<span><InboxOutlined /> 码熊回收站</span>}
      width={760}
      footer={<Button onClick={onClose}>关闭</Button>}
      className="trash-modal"
      onCancel={onClose}
    >
      <div className="trash-list">
        {loading ? (
          <div className="trash-loading"><Spin /> 正在读取回收站…</div>
        ) : items.length ? (
          items.map((item) => (
            <div className="trash-item" key={item.id}>
              <span className="trash-icon">
                {item.kind === "project"
                  ? <ApartmentOutlined />
                  : item.kind === "folder"
                    ? <FolderOutlined />
                    : <DatabaseFilled />}
              </span>
              <span className="trash-copy">
                <strong>{item.name}</strong>
                <small>{item.project_name} · {item.deleted_at.replace("T", " ")}</small>
              </span>
              <Tag>
                {item.kind === "project" ? "项目" : item.kind === "folder" ? "文件夹" : "PDM"}
              </Tag>
              <Tooltip title="恢复到原位置">
                <Button icon={<UndoOutlined />} onClick={() => onRestore(item)}>恢复</Button>
              </Tooltip>
            </div>
          ))
        ) : (
          <Empty description="回收站是空的" />
        )}
      </div>
    </Modal>
  );
}
