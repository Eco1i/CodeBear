import { App as AntApp, Button, Modal } from "antd";
import { CopyOutlined, DownloadOutlined, ReloadOutlined } from "@ant-design/icons";
import { formatPublishedAt, releaseNotesHtml, versionLabel } from "../model";
import type { UpdateState } from "../types";

interface UpdateModalProps {
  open: boolean;
  state: UpdateState | null;
  checking: boolean;
  onClose: () => void;
  onRefresh: () => void;
  onIgnore: (version: string) => void;
}

export function UpdateModal({ open, state, checking, onClose, onRefresh, onIgnore }: UpdateModalProps) {
  const { message } = AntApp.useApp();
  const available = state?.status === "update_available" && state.latest;
  const latest = state?.latest || null;
  const notesHtml = latest?.notes ? releaseNotesHtml(latest.notes) : "";

  const copySha = async () => {
    if (!latest?.sha256) return;
    try {
      await navigator.clipboard.writeText(latest.sha256);
      message.success("官方 SHA-256 已复制");
    } catch {
      message.error("复制失败，请手动选择文本");
    }
  };

  return (
    <Modal
      open={open}
      width={680}
      centered
      onCancel={onClose}
      className="update-check-modal"
      title={<span className="update-modal-title">{available ? `发现新版本 ${versionLabel(latest!.version)}` : "检查更新"}</span>}
      footer={null}
    >
      {!state ? (
        <div className="update-centered"><ReloadOutlined spin /> 正在检查更新…</div>
      ) : available ? (
        <div className="update-body">
          <div className="update-versions">
            <span><small>当前版本</small><b>{versionLabel(state.current_version)}</b></span>
            <i aria-hidden="true">→</i>
            <span className="is-latest"><small>最新版本</small><b>{versionLabel(latest!.version)}</b><em>发布于 {formatPublishedAt(latest!.published_at)}</em></span>
          </div>

          <div className="update-steps">
            <small>升级步骤</small>
            <ol>
              <li><b>01</b>下载下方安装包，并用官方 SHA-256 校验完整性</li>
              <li><b>02</b>先从托盘右键退出旧版码熊，将新版完整解压到新目录后启动</li>
              <li><b>03</b>在新版右上角「备份迁移」读取旧版 data 目录完成迁移，旧目录不会被修改</li>
            </ol>
          </div>

          <div className="update-notes">
            <div className="update-notes-heading"><small>更新内容</small></div>
            {notesHtml ? (
              <div className="update-notes-content" dangerouslySetInnerHTML={{ __html: notesHtml }} />
            ) : (
              <p>暂无发布说明。</p>
            )}
          </div>

          <div className="update-sha-row">
            <code title={latest!.sha256}>{latest!.sha256}</code>
            <Button size="small" icon={<CopyOutlined />} onClick={() => void copySha()}>复制 SHA-256</Button>
          </div>
        </div>
      ) : state.status === "unknown" ? (
        <div className="update-centered">
          <span className="update-empty">
            <b>暂未获取到更新信息</b>
            <small>无法连接 GitHub 或尚未完成检查，可稍后重试。</small>
          </span>
          <Button icon={<ReloadOutlined />} loading={checking} onClick={onRefresh}>重新检查</Button>
        </div>
      ) : (
        <div className="update-centered">
          <span className="update-empty">
            <b>码熊已是最新版本</b>
            <small>当前版本 {versionLabel(state.current_version)}</small>
          </span>
          <Button icon={<ReloadOutlined />} loading={checking} onClick={onRefresh}>重新检查</Button>
        </div>
      )}

      {available ? (
        <div className="update-footer">
          <Button onClick={() => onIgnore(latest!.version)} disabled={checking}>忽略此版本</Button>
          <div>
            <Button onClick={onClose}>关闭</Button>
            <Button
              type="primary"
              icon={<DownloadOutlined />}
              href={latest!.zip_url || latest!.release_url}
              target="_blank"
              rel="noreferrer"
            >
              下载安装包
            </Button>
          </div>
        </div>
      ) : null}
    </Modal>
  );
}
