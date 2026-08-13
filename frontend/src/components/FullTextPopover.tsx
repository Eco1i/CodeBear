import { useEffect, useRef } from "react";
import type { ReactElement } from "react";
import { CopyOutlined } from "@ant-design/icons";
import { App as AntApp, Button, Popover } from "antd";

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

export function FullTextPopover({ title, text, children }: FullTextPopoverProps) {
  const { message } = AntApp.useApp();
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
      if (mountedRef.current) message.success("已复制完整内容");
    } catch {
      if (mountedRef.current) message.error("复制失败，请手动选择文本");
    }
  };

  const content = (
    <div className="full-text-content">
      <div className="full-text-header">
        <strong>{title}</strong>
        <Button type="text" size="small" icon={<CopyOutlined />} onClick={handleCopy}>
          复制
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
