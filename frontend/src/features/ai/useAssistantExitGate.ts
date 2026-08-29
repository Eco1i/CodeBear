import { useCallback, useEffect, useRef, useState } from "react";
import type { TransitionEvent as ReactTransitionEvent } from "react";

const ASSISTANT_EXIT_FALLBACK_MS = 400;

export function useAssistantExitGate(open: boolean) {
  const [launcherVisible, setLauncherVisible] = useState(!open);
  const latestOpenRef = useRef(open);
  const wasOpenRef = useRef(open);
  const fallbackTimerRef = useRef<number | null>(null);
  const revealFrameRef = useRef<number | null>(null);

  const clearScheduledReveal = useCallback(() => {
    if (fallbackTimerRef.current !== null) {
      window.clearTimeout(fallbackTimerRef.current);
      fallbackTimerRef.current = null;
    }
    if (revealFrameRef.current !== null) {
      window.cancelAnimationFrame(revealFrameRef.current);
      revealFrameRef.current = null;
    }
  }, []);

  const revealAfterPaint = useCallback(() => {
    clearScheduledReveal();
    revealFrameRef.current = window.requestAnimationFrame(() => {
      revealFrameRef.current = null;
      if (!latestOpenRef.current) setLauncherVisible(true);
    });
  }, [clearScheduledReveal]);

  useEffect(() => {
    latestOpenRef.current = open;
    clearScheduledReveal();

    if (open) {
      setLauncherVisible(false);
    } else if (!wasOpenRef.current) {
      setLauncherVisible(true);
    } else if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setLauncherVisible(true);
    } else {
      setLauncherVisible(false);
      fallbackTimerRef.current = window.setTimeout(
        revealAfterPaint,
        ASSISTANT_EXIT_FALLBACK_MS,
      );
    }

    wasOpenRef.current = open;
    return clearScheduledReveal;
  }, [clearScheduledReveal, open, revealAfterPaint]);

  useEffect(() => clearScheduledReveal, [clearScheduledReveal]);

  const onAssistantTransitionEnd = useCallback(
    (event: ReactTransitionEvent<HTMLElement>) => {
      if (
        latestOpenRef.current
        || event.target !== event.currentTarget
        || event.propertyName !== "visibility"
      ) return;
      revealAfterPaint();
    },
    [revealAfterPaint],
  );

  return { launcherVisible, onAssistantTransitionEnd };
}
