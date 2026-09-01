import { useRef, useState } from "react";
import type {
  CSSProperties,
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
} from "react";

export const SIDEBAR_MIN_WIDTH = 245;
export const SIDEBAR_MAX_WIDTH = 440;
const SIDEBAR_STORAGE_KEY = "maxiong.sidebarWidth";

function clampSidebarWidth(width: number): number {
  return Math.max(
    SIDEBAR_MIN_WIDTH,
    Math.min(SIDEBAR_MAX_WIDTH, Math.round(width)),
  );
}

function readStoredSidebarWidth(): number | null {
  try {
    const width = Number(window.localStorage.getItem(SIDEBAR_STORAGE_KEY));
    return Number.isFinite(width) &&
      width >= SIDEBAR_MIN_WIDTH &&
      width <= SIDEBAR_MAX_WIDTH
      ? width
      : null;
  } catch {
    return null;
  }
}

export function useSidebarResize() {
  const [sidebarWidth, setSidebarWidth] = useState<number | null>(
    readStoredSidebarWidth,
  );
  const [sidebarResizing, setSidebarResizing] = useState(false);
  const appRootRef = useRef<HTMLDivElement>(null);
  const sidebarResizerRef = useRef<HTMLDivElement>(null);
  const liveSidebarWidthRef = useRef<number | null>(sidebarWidth);
  const sidebarResizeLeftRef = useRef(0);
  const pendingSidebarWidthRef = useRef<number | null>(null);
  const sidebarResizeFrameRef = useRef<number | null>(null);
  const sidebarResizeActiveRef = useRef(false);

  const updateLiveWidth = (width: number) => {
    const nextWidth = clampSidebarWidth(width);
    liveSidebarWidthRef.current = nextWidth;
    appRootRef.current?.style.setProperty("--sidebar-width", `${nextWidth}px`);
    sidebarResizerRef.current?.setAttribute("aria-valuenow", String(nextWidth));
    return nextWidth;
  };

  const commitWidth = (width: number) =>
    setSidebarWidth(updateLiveWidth(width));

  const persistWidth = () => {
    const width = liveSidebarWidthRef.current;
    if (width === null) return;
    try {
      window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(width));
    } catch {
      // The resizer still works when browser storage is unavailable.
    }
  };

  const applyResizeFrame = () => {
    sidebarResizeFrameRef.current = null;
    const width = pendingSidebarWidthRef.current;
    if (width !== null) updateLiveWidth(width);
  };

  const startResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const navigatorRect = appRootRef.current
      ?.querySelector<HTMLElement>(".project-navigator")
      ?.getBoundingClientRect();
    sidebarResizeLeftRef.current =
      navigatorRect?.left ||
      appRootRef.current?.getBoundingClientRect().left ||
      0;
    const currentWidth = clampSidebarWidth(
      liveSidebarWidthRef.current ??
        navigatorRect?.width ??
        (window.innerWidth <= 1360 ? 292 : 326),
    );
    liveSidebarWidthRef.current = currentWidth;
    pendingSidebarWidthRef.current = currentWidth;
    sidebarResizeActiveRef.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    setSidebarResizing(true);
  };

  const moveResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (
      !sidebarResizeActiveRef.current ||
      !event.currentTarget.hasPointerCapture(event.pointerId)
    )
      return;
    pendingSidebarWidthRef.current = clampSidebarWidth(
      event.clientX - sidebarResizeLeftRef.current,
    );
    if (sidebarResizeFrameRef.current !== null) return;
    sidebarResizeFrameRef.current =
      window.requestAnimationFrame(applyResizeFrame);
  };

  const commitResize = () => {
    if (!sidebarResizeActiveRef.current) return;
    sidebarResizeActiveRef.current = false;
    if (sidebarResizeFrameRef.current !== null) {
      window.cancelAnimationFrame(sidebarResizeFrameRef.current);
      sidebarResizeFrameRef.current = null;
    }
    const width = pendingSidebarWidthRef.current ?? liveSidebarWidthRef.current;
    pendingSidebarWidthRef.current = null;
    if (width !== null) commitWidth(width);
    setSidebarResizing(false);
    persistWidth();
  };

  const finishResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!sidebarResizeActiveRef.current) return;
    pendingSidebarWidthRef.current = clampSidebarWidth(
      event.clientX - sidebarResizeLeftRef.current,
    );
    commitResize();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const resizeWithKeyboard = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const currentWidth =
      liveSidebarWidthRef.current ||
      appRootRef.current
        ?.querySelector<HTMLElement>(".project-navigator")
        ?.getBoundingClientRect().width ||
      326;
    const nextWidth =
      event.key === "ArrowLeft"
        ? currentWidth - 10
        : event.key === "ArrowRight"
          ? currentWidth + 10
          : event.key === "Home"
            ? SIDEBAR_MIN_WIDTH
            : event.key === "End"
              ? SIDEBAR_MAX_WIDTH
              : null;
    if (nextWidth === null) return;
    event.preventDefault();
    commitWidth(nextWidth);
    window.setTimeout(persistWidth, 0);
  };

  const rootStyle =
    sidebarWidth === null
      ? undefined
      : ({ "--sidebar-width": `${sidebarWidth}px` } as CSSProperties);

  return {
    appRootRef,
    sidebarResizerRef,
    sidebarResizing,
    rootStyle,
    effectiveWidth: sidebarWidth ?? (window.innerWidth <= 1360 ? 292 : 326),
    startResize,
    moveResize,
    finishResize,
    commitResize,
    resizeWithKeyboard,
  };
}
