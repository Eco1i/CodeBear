import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import type {
  CSSProperties,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
} from "react";
import type { AiAccessory } from "../features/ai/types";
import { PolarBearMark } from "./AiMascot";

interface AiLauncherProps {
  assistantName?: string;
  assistantAccessory?: AiAccessory;
  onOpen: () => void;
  shortcutEnabled?: boolean;
  visible?: boolean;
}

interface LauncherPosition {
  x: number;
  y: number;
}

interface LauncherDragState {
  pointerId: number;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
  moved: boolean;
}

export const AI_LAUNCHER_POSITION_STORAGE_KEY = "maxiong.ai.launcher-position";

const LAUNCHER_SIZE = 58;
const LAUNCHER_EDGE_INSET = 12;
const LAUNCHER_DRAG_THRESHOLD = 5;
const LAUNCHER_KEYBOARD_STEP = 16;

function readStoredLauncherPosition(): LauncherPosition | null {
  try {
    const stored = window.localStorage.getItem(AI_LAUNCHER_POSITION_STORAGE_KEY);
    if (!stored) return null;
    const parsed = JSON.parse(stored) as Partial<LauncherPosition>;
    return Number.isFinite(parsed.x) && Number.isFinite(parsed.y)
      ? { x: Number(parsed.x), y: Number(parsed.y) }
      : null;
  } catch {
    return null;
  }
}

function launcherDimensions(element: HTMLButtonElement | null) {
  const rect = element?.getBoundingClientRect();
  return {
    width: rect?.width || element?.offsetWidth || LAUNCHER_SIZE,
    height: rect?.height || element?.offsetHeight || LAUNCHER_SIZE,
  };
}

function clampLauncherPosition(
  position: LauncherPosition,
  element: HTMLButtonElement | null,
): LauncherPosition {
  const { width, height } = launcherDimensions(element);
  const availableX = Math.max(0, window.innerWidth - width);
  const availableY = Math.max(0, window.innerHeight - height);
  const minX = Math.min(LAUNCHER_EDGE_INSET, availableX);
  const minY = Math.min(LAUNCHER_EDGE_INSET, availableY);
  const maxX = Math.max(minX, availableX - LAUNCHER_EDGE_INSET);
  const maxY = Math.max(minY, availableY - LAUNCHER_EDGE_INSET);
  return {
    x: Math.round(Math.max(minX, Math.min(maxX, position.x))),
    y: Math.round(Math.max(minY, Math.min(maxY, position.y))),
  };
}

function storeLauncherPosition(position: LauncherPosition) {
  try {
    window.localStorage.setItem(
      AI_LAUNCHER_POSITION_STORAGE_KEY,
      JSON.stringify(position),
    );
  } catch {
    // Dragging remains available when browser storage is unavailable.
  }
}

function isMacLikePlatform() {
  return /Mac|iPhone|iPad|iPod/i.test(window.navigator.platform);
}

export function AiLauncher({
  assistantName,
  assistantAccessory = "none",
  onOpen,
  shortcutEnabled = true,
  visible = true,
}: AiLauncherProps) {
  const displayName = assistantName?.trim() || "小码";
  const descriptionId = useId();
  const launcherRef = useRef<HTMLButtonElement>(null);
  const dragStateRef = useRef<LauncherDragState | null>(null);
  const positionRef = useRef<LauncherPosition | null>(null);
  const suppressClickRef = useRef(false);
  const suppressClickTimerRef = useRef<number | null>(null);
  const [position, setPosition] = useState<LauncherPosition | null>(() => {
    const stored = readStoredLauncherPosition();
    positionRef.current = stored;
    return stored;
  });
  const [dragging, setDragging] = useState(false);

  const updatePosition = useCallback((nextPosition: LauncherPosition, persist = false) => {
    const clamped = clampLauncherPosition(nextPosition, launcherRef.current);
    positionRef.current = clamped;
    setPosition(clamped);
    if (persist) storeLauncherPosition(clamped);
  }, []);

  useLayoutEffect(() => {
    if (positionRef.current) updatePosition(positionRef.current, true);
  }, [updatePosition]);

  useEffect(() => {
    if (!shortcutEnabled) return undefined;
    const handleShortcut = (event: KeyboardEvent) => {
      const hasSinglePrimaryModifier = event.ctrlKey !== event.metaKey;
      if (
        event.repeat
        || !hasSinglePrimaryModifier
        || event.altKey
        || event.shiftKey
        || event.key.toLocaleLowerCase() !== "j"
      ) return;
      event.preventDefault();
      onOpen();
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [onOpen, shortcutEnabled]);

  useEffect(() => {
    const keepInsideViewport = () => {
      const currentPosition = positionRef.current;
      if (currentPosition) updatePosition(currentPosition, true);
    };
    window.addEventListener("resize", keepInsideViewport);
    return () => window.removeEventListener("resize", keepInsideViewport);
  }, [updatePosition]);

  useEffect(() => () => {
    if (suppressClickTimerRef.current !== null) {
      window.clearTimeout(suppressClickTimerRef.current);
    }
  }, []);

  const handlePointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0 || event.isPrimary === false) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const origin = positionRef.current || { x: rect.left, y: rect.top };
    dragStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: origin.x,
      originY: origin.y,
      moved: false,
    };
    suppressClickRef.current = false;
    try {
      event.currentTarget.setPointerCapture?.(event.pointerId);
    } catch {
      // Pointer capture is an enhancement; window-bound clamping still keeps the launcher usable.
    }
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - dragState.startX;
    const deltaY = event.clientY - dragState.startY;
    if (!dragState.moved && Math.hypot(deltaX, deltaY) < LAUNCHER_DRAG_THRESHOLD) return;
    if (!dragState.moved) {
      dragState.moved = true;
      setDragging(true);
    }
    event.preventDefault();
    updatePosition({
      x: dragState.originX + deltaX,
      y: dragState.originY + deltaY,
    });
  };

  const finishPointerInteraction = (
    event: ReactPointerEvent<HTMLButtonElement>,
    cancelled = false,
  ) => {
    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) return;
    dragStateRef.current = null;
    const deltaX = event.clientX - dragState.startX;
    const deltaY = event.clientY - dragState.startY;
    const moved = dragState.moved
      || (!cancelled && Math.hypot(deltaX, deltaY) >= LAUNCHER_DRAG_THRESHOLD);

    if (moved && !cancelled) {
      updatePosition({
        x: dragState.originX + deltaX,
        y: dragState.originY + deltaY,
      }, true);
    } else if (dragState.moved && positionRef.current) {
      storeLauncherPosition(positionRef.current);
    }

    try {
      if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    } catch {
      // The browser may already have released capture after a cancelled pointer.
    }

    setDragging(false);
    if (moved) {
      event.currentTarget.blur();
    }
    suppressClickRef.current = moved;
    if (suppressClickTimerRef.current !== null) {
      window.clearTimeout(suppressClickTimerRef.current);
    }
    suppressClickTimerRef.current = window.setTimeout(() => {
      suppressClickRef.current = false;
      suppressClickTimerRef.current = null;
    }, 0);
  };

  const handleClick = (event: ReactMouseEvent<HTMLButtonElement>) => {
    if (suppressClickRef.current) {
      event.preventDefault();
      event.stopPropagation();
      suppressClickRef.current = false;
      return;
    }
    onOpen();
  };

  const handleKeyboardMove = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (!event.altKey || event.ctrlKey || event.metaKey) return;
    const direction = event.key === "ArrowLeft"
      ? { x: -1, y: 0 }
      : event.key === "ArrowRight"
        ? { x: 1, y: 0 }
        : event.key === "ArrowUp"
          ? { x: 0, y: -1 }
          : event.key === "ArrowDown"
            ? { x: 0, y: 1 }
            : null;
    if (!direction) return;
    event.preventDefault();
    const rect = launcherRef.current?.getBoundingClientRect();
    const currentPosition = positionRef.current || {
      x: rect?.left || 0,
      y: rect?.top || 0,
    };
    const step = event.shiftKey ? LAUNCHER_KEYBOARD_STEP * 3 : LAUNCHER_KEYBOARD_STEP;
    updatePosition({
      x: currentPosition.x + direction.x * step,
      y: currentPosition.y + direction.y * step,
    }, true);
  };

  const launcherStyle = position
    ? ({ left: position.x, top: position.y, right: "auto", bottom: "auto" } satisfies CSSProperties)
    : undefined;
  const hintOnRight = position !== null
    && position.x + LAUNCHER_SIZE / 2 < window.innerWidth / 2;
  const macLikePlatform = isMacLikePlatform();
  const movementModifier = macLikePlatform ? "Option" : "Alt";
  const shortcutLabel = macLikePlatform ? "⌘J" : "Ctrl+J";

  return (
    <>
      <button
        ref={launcherRef}
        className={`ai-launcher${dragging ? " is-dragging" : ""}${hintOnRight ? " is-hint-right" : ""}${visible ? "" : " is-hidden"}`}
        style={launcherStyle}
        type="button"
        aria-label={`打开 ${displayName}`}
        aria-describedby={descriptionId}
        aria-expanded="false"
        aria-keyshortcuts="Control+J Meta+J Alt+ArrowUp Alt+ArrowDown Alt+ArrowLeft Alt+ArrowRight"
        title={`拖动可移动；${movementModifier} + 方向键可微调位置`}
        draggable={false}
        onClick={handleClick}
        onKeyDown={handleKeyboardMove}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={(event) => finishPointerInteraction(event)}
        onPointerCancel={(event) => finishPointerInteraction(event, true)}
        onLostPointerCapture={(event) => finishPointerInteraction(event, true)}
      >
        <span className="ai-launcher-hint" aria-hidden="true">
          <span>和{displayName}聊聊</span>
          <kbd>{shortcutLabel}</kbd>
        </span>
        <PolarBearMark accessory={assistantAccessory} />
      </button>
      <span id={descriptionId} className="sr-only">
        可拖动到窗口内任意位置；也可按
        {movementModifier}
        加方向键移动。
      </span>
    </>
  );
}
