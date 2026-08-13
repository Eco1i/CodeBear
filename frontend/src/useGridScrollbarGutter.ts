import { useEffect } from "react";
import type { RefObject } from "react";

/**
 * Keeps a grid header aligned with rows inside a vertically scrolling body.
 * Browser zoom changes the scrollbar gutter in CSS pixels, so a fixed value
 * cannot stay aligned at every zoom level.
 */
export function useGridScrollbarGutter(
  gridRef: RefObject<HTMLElement | null>,
  scrollBodyRef: RefObject<HTMLElement | null>,
): void {
  useEffect(() => {
    const grid = gridRef.current;
    const scrollBody = scrollBodyRef.current;
    if (!grid || !scrollBody) return;

    let animationFrame: number | null = null;
    const syncGutter = () => {
      if (animationFrame !== null) window.cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(() => {
        animationFrame = null;
        const bodyWidth = scrollBody.getBoundingClientRect().width;
        const gutterWidth = Math.max(0, bodyWidth - scrollBody.clientWidth);
        grid.style.setProperty("--grid-scrollbar-gutter", `${gutterWidth}px`);
      });
    };

    syncGutter();
    const resizeObserver = new ResizeObserver(syncGutter);
    resizeObserver.observe(scrollBody);
    window.addEventListener("resize", syncGutter);
    window.visualViewport?.addEventListener("resize", syncGutter);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", syncGutter);
      window.visualViewport?.removeEventListener("resize", syncGutter);
      if (animationFrame !== null) window.cancelAnimationFrame(animationFrame);
    };
  }, [gridRef, scrollBodyRef]);
}
