import { App as AntApp, Button, Modal } from "antd";
import {
  CopyOutlined,
  DownloadOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
import { useI18n } from "../../preferences/PreferencesProvider";
import { formatPublishedAt, versionLabel } from "../model";
import type { UpdateState } from "../types";

interface UpdateModalProps {
  open: boolean;
  state: UpdateState | null;
  checking: boolean;
  onClose: () => void;
  onRefresh: () => void;
  onIgnore: (version: string) => void;
}

function releaseNoteLines(markdown: string): string[] {
  return markdown
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) =>
      line
        .replace(/^#{1,3}\s+/, "")
        .replace(/^[-*]\s+/, "")
        .replace(/^\d+[.、]\s*/, "")
        .replace(/^>\s?/, "")
        .replace(/`([^`]+)`/g, "$1")
        .replace(/\*\*([^*]+)\*\*/g, "$1")
        .replace(/\[([^\]]+)\]\(https?:\/\/[^\s)]+\)/g, "$1"),
    );
}

export function UpdateModal({
  open,
  state,
  checking,
  onClose,
  onRefresh,
  onIgnore,
}: UpdateModalProps) {
  const { message } = AntApp.useApp();
  const { t } = useI18n();
  const available = state?.status === "update_available" && state.latest;
  const latest = state?.latest || null;
  const notes = latest?.notes ? releaseNoteLines(latest.notes) : [];
  const isMac = state?.target.startsWith("mac-") ?? false;

  const copySha = async () => {
    if (!latest?.sha256) return;
    try {
      await navigator.clipboard.writeText(latest.sha256);
      message.success(t("update.shaCopied"));
    } catch {
      message.error(t("update.copyFailed"));
    }
  };

  return (
    <Modal
      open={open}
      width={680}
      centered
      onCancel={onClose}
      className="update-check-modal"
      title={
        <span className="update-modal-title">
          {available
            ? t("update.newVersion", { version: versionLabel(latest!.version) })
            : t("header.update")}
        </span>
      }
      footer={null}
    >
      {state ? (
        available ? (
          <div className="update-body">
            <div className="update-versions">
              <span>
                <small>{t("update.currentVersion")}</small>
                <b>{versionLabel(state.current_version)}</b>
              </span>
              <i aria-hidden="true">→</i>
              <span className="is-latest">
                <small>{t("update.latestVersion")}</small>
                <b>{versionLabel(latest!.version)}</b>
                <em>
                  {t("update.publishedAt", {
                    date: formatPublishedAt(latest!.published_at),
                  })}
                </em>
              </span>
            </div>

            <div className="update-steps">
              <small>{t("update.steps")}</small>
              {isMac ? (
                <ol>
                  <li>
                    <b>01</b>
                    {t("update.macStep1")}
                  </li>
                  <li>
                    <b>02</b>
                    {t("update.macStep2")}
                  </li>
                  <li>
                    <b>03</b>
                    {t("update.macStep3")}
                  </li>
                </ol>
              ) : (
                <ol>
                  <li>
                    <b>01</b>
                    {t("update.winStep1")}
                  </li>
                  <li>
                    <b>02</b>
                    {t("update.winStep2")}
                  </li>
                  <li>
                    <b>03</b>
                    {t("update.winStep3")}
                  </li>
                </ol>
              )}
            </div>

            <div className="update-notes">
              <div className="update-notes-heading">
                <small>{t("update.notes")}</small>
              </div>
              {notes.length ? (
                <div className="update-notes-content">
                  {notes.map((line, index) => (
                    <p key={`${index}-${line}`}>{line}</p>
                  ))}
                </div>
              ) : (
                <p>{t("update.noNotes")}</p>
              )}
            </div>

            {latest!.sha256 ? (
              <div className="update-sha-row">
                <code title={latest!.sha256}>{latest!.sha256}</code>
                <Button
                  size="small"
                  icon={<CopyOutlined />}
                  onClick={() => void copySha()}
                >
                  {t("update.copySha")}
                </Button>
              </div>
            ) : null}
          </div>
        ) : state.status === "unknown" ? (
          <div className="update-centered">
            <span className="update-empty">
              <b>{t("update.infoUnavailable")}</b>
              <small>{t("update.infoUnavailableDescription")}</small>
            </span>
            <Button
              icon={<ReloadOutlined />}
              loading={checking}
              onClick={onRefresh}
            >
              {t("update.recheck")}
            </Button>
          </div>
        ) : (
          <div className="update-centered">
            <span className="update-empty">
              <b>{t("update.latestTitle")}</b>
              <small>
                {t("update.latestDescription", {
                  version: versionLabel(state.current_version),
                })}
              </small>
            </span>
            <Button
              icon={<ReloadOutlined />}
              loading={checking}
              onClick={onRefresh}
            >
              {t("update.recheck")}
            </Button>
          </div>
        )
      ) : (
        <div className="update-centered">
          <ReloadOutlined spin /> {t("update.checking")}
        </div>
      )}

      {available ? (
        <div className="update-footer">
          <Button onClick={() => onIgnore(latest!.version)} disabled={checking}>
            {t("update.ignore")}
          </Button>
          <div>
            <Button onClick={onClose}>{t("common.close")}</Button>
            <Button
              type="primary"
              icon={<DownloadOutlined />}
              href={latest!.download_url || latest!.release_url}
              target="_blank"
              rel="noreferrer"
            >
              {t("update.download")}
            </Button>
          </div>
        </div>
      ) : null}
    </Modal>
  );
}
