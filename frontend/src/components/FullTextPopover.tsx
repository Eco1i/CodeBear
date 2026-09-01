import { useEffect, useRef } from "react";
import type { ReactElement } from "react";
import { CopyOutlined } from "@ant-design/icons";
import { App as AntApp, Button, Popover } from "antd";
import { useI18n } from "../features/preferences/PreferencesProvider";

interface FullTextPopoverProps {
  title: string;
  text: string;
  children: ReactElement;
}

async function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  if (!copied) throw new Error("copy failed");
}

export function FullTextPopover({
  title,
  text,
  children,
}: FullTextPopoverProps) {
  const { message } = AntApp.useApp();
  const { t } = useI18n();
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const handleCopy = async () => {
    try {
      await copyText(text);
      if (mountedRef.current) message.success(t("common.copied"));
    } catch {
      if (mountedRef.current) message.error(t("common.copyFailed"));
    }
  };

  const content = (
    <div className="full-text-content">
      <div className="full-text-header">
        <strong>{title}</strong>
        <Button
          type="text"
          size="small"
          icon={<CopyOutlined />}
          onClick={handleCopy}
        >
          {t("common.copy")}
        </Button>
      </div>
      <div className="full-text-body">{text}</div>
    </div>
  );

  return (
    <Popover
      arrow={false}
      placement="bottomLeft"
      trigger="click"
      content={content}
      classNames={{ root: "full-text-popover" }}
      destroyOnHidden
    >
      {children}
    </Popover>
  );
}
