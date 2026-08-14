import { useEffect } from "react";
import type { AiAccessory } from "../features/ai/types";
import { PolarBearMark } from "./AiMascot";

interface AiLauncherProps {
  assistantName?: string;
  assistantAccessory?: AiAccessory;
  onOpen: () => void;
}

export function AiLauncher({
  assistantName,
  assistantAccessory = "none",
  onOpen,
}: AiLauncherProps) {
  const displayName = assistantName?.trim() || "小码";

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if (!event.ctrlKey || event.altKey || event.metaKey || event.key.toLocaleLowerCase() !== "j") return;
      event.preventDefault();
      onOpen();
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [onOpen]);

  return (
    <button
      className="ai-launcher"
      type="button"
      aria-label={`打开 ${displayName}`}
      aria-expanded="false"
      onClick={onOpen}
    >
      <span className="ai-launcher-hint" aria-hidden="true">
        <span>和{displayName}聊聊</span>
        <kbd>Ctrl+J</kbd>
      </span>
      <PolarBearMark accessory={assistantAccessory} />
    </button>
  );
}
