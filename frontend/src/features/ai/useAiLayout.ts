import { useCallback, useRef, useState } from "react";
import type { AiLayoutMode } from "./types";

const AI_LAYOUT_STORAGE_KEY = "maxiong.ai.layout-mode";

function readStoredAiLayoutMode(): AiLayoutMode {
  try {
    const mode = window.localStorage.getItem(AI_LAYOUT_STORAGE_KEY);
    if (mode === "sidebar" || mode === "floating") return mode;
    if (mode === "fullscreen") window.localStorage.setItem(AI_LAYOUT_STORAGE_KEY, "sidebar");
  } catch {
    // Local storage can be unavailable in locked-down browser profiles.
  }
  return "sidebar";
}

export function useAiLayout() {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [mode, setMode] = useState<AiLayoutMode>(readStoredAiLayoutMode);
  const lastNonFullscreenModeRef = useRef<Exclude<AiLayoutMode, "fullscreen">>(
    mode === "fullscreen" ? "sidebar" : mode,
  );

  const changeMode = useCallback((nextMode: AiLayoutMode) => {
    setMode(nextMode);
    if (nextMode === "fullscreen") return;
    lastNonFullscreenModeRef.current = nextMode;
    try {
      window.localStorage.setItem(AI_LAYOUT_STORAGE_KEY, nextMode);
    } catch {
      // Keep the current-session choice when storage is unavailable.
    }
  }, []);

  const changeOpen = useCallback((nextOpen: boolean) => {
    if (nextOpen) {
      setMode((currentMode) => (
        currentMode === "fullscreen" ? lastNonFullscreenModeRef.current : currentMode
      ));
    }
    setOpen(nextOpen);
  }, []);

  const openAssistant = useCallback(() => {
    setLoaded(true);
    changeOpen(true);
  }, [changeOpen]);

  return {
    open,
    loaded,
    mode,
    lastNonFullscreenModeRef,
    changeMode,
    changeOpen,
    openAssistant,
  };
}
