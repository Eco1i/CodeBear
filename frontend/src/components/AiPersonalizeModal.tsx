import { useEffect, useMemo, useState } from "react";
import { Button, Input, Modal } from "antd";
import { CheckOutlined, LeftOutlined, RightOutlined } from "@ant-design/icons";
import type { AiAccessory } from "../types";
import { AI_ACCESSORY_OPTIONS, PolarBearMark } from "./AiMascot";


interface AiPersonalizeModalProps {
  open: boolean;
  name: string;
  accessory: AiAccessory;
  busy: boolean;
  onCancel: () => void;
  onSave: (name: string, accessory: AiAccessory) => void | Promise<void>;
}

const DEFAULT_ASSISTANT_NAME = "小码";
const DEFAULT_ACCESSORY: AiAccessory = "none";

export function AiPersonalizeModal({
  open,
  name,
  accessory,
  busy,
  onCancel,
  onSave,
}: AiPersonalizeModalProps) {
  const [draftName, setDraftName] = useState(name);
  const [draftAccessory, setDraftAccessory] = useState<AiAccessory>(accessory);

  useEffect(() => {
    if (!open) return;
    setDraftName(name);
    setDraftAccessory(accessory);
  }, [accessory, name, open]);

  const accessoryIndex = useMemo(
    () => Math.max(0, AI_ACCESSORY_OPTIONS.findIndex((option) => option.id === draftAccessory)),
    [draftAccessory],
  );

  const cycleAccessory = (direction: -1 | 1) => {
    const nextIndex = (
      accessoryIndex + direction + AI_ACCESSORY_OPTIONS.length
    ) % AI_ACCESSORY_OPTIONS.length;
    setDraftAccessory(AI_ACCESSORY_OPTIONS[nextIndex].id);
  };

  const reset = () => {
    setDraftName(DEFAULT_ASSISTANT_NAME);
    setDraftAccessory(DEFAULT_ACCESSORY);
  };

  const submit = () => {
    const normalizedName = draftName.trim().replace(/\s+/g, " ");
    if (!normalizedName || busy) return;
    void onSave(normalizedName, draftAccessory);
  };

  return (
    <Modal
      className="ai-personalize-modal"
      open={open}
      width={760}
      footer={null}
      centered
      closable={!busy}
      keyboard={!busy}
      mask={{ closable: !busy }}
      onCancel={onCancel}
    >
      <form
        className="ai-personalize-shell"
        aria-labelledby="ai-personalize-title"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <h2 id="ai-personalize-title">个性化你的 AI 小助手</h2>

        <div className="ai-persona-preview-row">
          <button
            type="button"
            aria-label="上一个配饰"
            title="上一个配饰"
            onClick={() => cycleAccessory(-1)}
          >
            <LeftOutlined />
          </button>
          <span className="ai-persona-preview-bear">
            <PolarBearMark accessory={draftAccessory} />
          </span>
          <button
            type="button"
            aria-label="下一个配饰"
            title="下一个配饰"
            onClick={() => cycleAccessory(1)}
          >
            <RightOutlined />
          </button>
        </div>

        <label className="ai-persona-name-field">
          <span className="sr-only">助手名称</span>
          <Input
            value={draftName}
            maxLength={20}
            autoComplete="off"
            autoFocus
            placeholder="给助手起个名字"
            aria-label="助手名称"
            onChange={(event) => setDraftName(event.target.value)}
          />
        </label>

        <section className="ai-persona-accessories" aria-labelledby="ai-accessory-title">
          <div className="ai-persona-section-title">
            <strong id="ai-accessory-title">选择配饰</strong>
            <span>{AI_ACCESSORY_OPTIONS[accessoryIndex].label}</span>
          </div>
          <div className="ai-persona-accessory-grid">
            {AI_ACCESSORY_OPTIONS.map((option) => {
              const selected = option.id === draftAccessory;
              return (
                <button
                  className={selected ? "is-selected" : ""}
                  type="button"
                  key={option.id}
                  aria-label={option.label}
                  aria-pressed={selected}
                  onClick={() => setDraftAccessory(option.id)}
                >
                  <span className="ai-persona-accessory-art">
                    <PolarBearMark compact accessory={option.id} animated={false} />
                  </span>
                  <span>{option.label}</span>
                  {selected ? <i className="ai-persona-option-check"><CheckOutlined /></i> : null}
                </button>
              );
            })}
          </div>
        </section>

        <footer className="ai-persona-actions">
          <Button type="text" onClick={reset} disabled={busy}>重置</Button>
          <Button type="primary" htmlType="submit" loading={busy} disabled={!draftName.trim()}>
            完成
          </Button>
        </footer>
      </form>
    </Modal>
  );
}
