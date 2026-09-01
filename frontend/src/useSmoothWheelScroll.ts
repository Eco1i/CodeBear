import { useEffect } from "react";

const WHEEL_DELTA_LINE = 1;
const WHEEL_DELTA_PAGE = 2;
const MOUSE_WHEEL_THRESHOLD = 50;
const DEFAULT_WHEEL_STEP = 32;
const MAX_ROW_BOUNDARY_TOLERANCE = 2;
const OBSERVED_POSITION_EPSILON = 0.01;
const PAGE_WHEEL_SCALE = 0.75;
const MIN_ANIMATION_MS = 180;
const MAX_ANIMATION_MS = 800;

// Move at a restrained, nearly drag-like speed so one animation frame never
// advances by a visibly large portion of a row.
const SCROLL_PIXELS_PER_SECOND = 160;

type ScrollAxis = "x" | "y";

interface ScrollAnimation {
  element: HTMLElement;
  fromX: number;
  fromY: number;
  targetX: number;
  targetY: number;
  startedAt: number;
  duration: number;
  frame: number;
}

interface RowScrollState {
  rowStep: number;
  rowIndex: number;
  observedPosition: number;
}

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));

function overflowAllowsScroll(element: HTMLElement, axis: ScrollAxis): boolean {
  const style = window.getComputedStyle(element);
  const overflow = axis === "x" ? style.overflowX : style.overflowY;
  return overflow === "auto" || overflow === "scroll" || overflow === "overlay";
}

function maximumScroll(element: HTMLElement, axis: ScrollAxis): number {
  return Math.max(
    0,
    axis === "x"
      ? element.scrollWidth - element.clientWidth
      : element.scrollHeight - element.clientHeight,
  );
}

const SCROLL_ITEM_SELECTOR = [
  ".table-virtual-space > .data-grid-row",
  ".ddl-tree-virtual-row",
  ".data-grid-row",
  ".ant-table-row",
  '[role="row"]',
  "tr",
  '[role="listitem"]',
].join(", ");

const ROW_SCROLL_CONTAINER_SELECTOR = [
  ".table-grid-body",
  ".field-grid-body",
  ".ant-table-body",
  ".field-dictionary-drawer-table",
  ".ai-table-peek-grid",
  ".ddl-table-tree",
].join(", ");

function rowStepFor(element: HTMLElement, axis: ScrollAxis): number | null {
  if (axis !== "y") return null;
  const items = Array.from(
    element.querySelectorAll<HTMLElement>(SCROLL_ITEM_SELECTOR),
  );
  const positions = items.slice(0, 8).map((item) => item.offsetTop);
  for (let index = 1; index < positions.length; index += 1) {
    const distance = Math.abs(positions[index] - positions[index - 1]);
    if (distance >= 8 && distance <= 128) return Math.round(distance);
  }

  const firstItem = items[0];
  if (firstItem) {
    const size = firstItem.getBoundingClientRect().height;
    if (size >= 8 && size <= 128) return Math.round(size);
  }

  return element.matches(ROW_SCROLL_CONTAINER_SELECTOR)
    ? DEFAULT_WHEEL_STEP
    : null;
}

function canScrollInDirection(
  element: HTMLElement,
  axis: ScrollAxis,
  delta: number,
): boolean {
  if (!overflowAllowsScroll(element, axis)) return false;
  const maximum = maximumScroll(element, axis);
  if (maximum <= 0 || delta === 0) return false;
  const position = axis === "x" ? element.scrollLeft : element.scrollTop;
  return delta < 0 ? position > 0 : position < maximum;
}

function elementFromTarget(target: EventTarget | null): HTMLElement | null {
  if (target instanceof HTMLElement) return target;
  if (!(target instanceof Element)) return null;

  let parent: Element | null = target.parentElement;
  while (parent && !(parent instanceof HTMLElement)) {
    parent = parent.parentElement;
  }
  return parent;
}

function rawDeltaForAxis(
  event: WheelEvent,
  axis: ScrollAxis,
  element: HTMLElement,
): number {
  if (axis === "y") return event.deltaY;
  if (event.deltaX !== 0) return event.deltaX;
  if (
    event.shiftKey ||
    element.classList.contains("table-tabs-scroll") ||
    maximumScroll(element, "y") === 0
  ) {
    return event.deltaY;
  }
  return 0;
}

function findScrollableTarget(
  event: WheelEvent,
): { element: HTMLElement; axis: ScrollAxis; rawDelta: number } | null {
  const start = elementFromTarget(event.target);
  // The relation graph owns the wheel gesture for zooming.
  if (!start || start.closest(".relation-graph-wrap")) return null;

  const preferredAxis: ScrollAxis =
    event.shiftKey || Math.abs(event.deltaX) > Math.abs(event.deltaY)
      ? "x"
      : "y";
  const secondaryAxis: ScrollAxis = preferredAxis === "x" ? "y" : "x";

  for (
    let element: HTMLElement | null = start;
    element;
    element = element.parentElement
  ) {
    const preferredDelta = rawDeltaForAxis(event, preferredAxis, element);
    if (canScrollInDirection(element, preferredAxis, preferredDelta)) {
      return { element, axis: preferredAxis, rawDelta: preferredDelta };
    }

    const secondaryDelta = rawDeltaForAxis(event, secondaryAxis, element);
    if (canScrollInDirection(element, secondaryAxis, secondaryDelta)) {
      return { element, axis: secondaryAxis, rawDelta: secondaryDelta };
    }
  }

  return null;
}

/**
 * Converts browser wheel units into a restrained, consistent scroll step.
 * Large pixel deltas are typical of a mouse wheel; small pixel deltas remain
 * precise so high-resolution trackpads retain their natural control.
 */
export function normalizeWheelDelta(
  rawDelta: number,
  deltaMode: number,
  viewportSize: number,
  wheelStep = DEFAULT_WHEEL_STEP,
): number {
  if (deltaMode === WHEEL_DELTA_PAGE) {
    return rawDelta * viewportSize * PAGE_WHEEL_SCALE;
  }
  if (deltaMode === WHEEL_DELTA_LINE) {
    return rawDelta === 0 ? 0 : Math.sign(rawDelta) * wheelStep;
  }
  return Math.abs(rawDelta) >= MOUSE_WHEEL_THRESHOLD
    ? Math.sign(rawDelta) * wheelStep
    : rawDelta;
}

export function nextRowBoundary(
  currentPosition: number,
  direction: number,
  rowStep: number,
  maximum: number,
): number {
  if (direction === 0 || rowStep <= 0) return currentPosition;
  const currentRow = currentPosition / rowStep;
  const nearestRow = Math.round(currentRow);
  const boundaryTolerance = Math.min(MAX_ROW_BOUNDARY_TOLERANCE, rowStep / 4);
  const isQuantizedBoundary =
    Math.abs(currentPosition - nearestRow * rowStep) <= boundaryTolerance;
  let nextRow: number;
  if (isQuantizedBoundary) {
    nextRow = nearestRow + Math.sign(direction);
  } else if (direction > 0) {
    nextRow = Math.floor(currentRow) + 1;
  } else {
    nextRow = Math.ceil(currentRow) - 1;
  }
  const lastWholeRow = Math.floor(maximum / rowStep) * rowStep;
  return clamp(nextRow * rowStep, 0, lastWholeRow);
}

class RowScrollTracker {
  private readonly states = new Map<HTMLElement, RowScrollState>();
  private resizeFrame = 0;
  private resizePending = false;

  nextPosition(
    element: HTMLElement,
    currentPosition: number,
    direction: number,
    rowStep: number,
    maximum: number,
    hasAnimation: boolean,
  ): number {
    const state = this.states.get(element);
    const trackingIsCurrent =
      state !== undefined &&
      Math.abs(state.rowStep - rowStep) < OBSERVED_POSITION_EPSILON &&
      (hasAnimation ||
        this.resizePending ||
        Math.abs(currentPosition - state.observedPosition) <
          OBSERVED_POSITION_EPSILON);
    const lastWholeRowIndex = Math.floor(maximum / rowStep);
    const rowIndex = trackingIsCurrent
      ? clamp(state.rowIndex + Math.sign(direction), 0, lastWholeRowIndex)
      : Math.round(
          nextRowBoundary(currentPosition, direction, rowStep, maximum) /
            rowStep,
        );
    this.states.set(element, {
      rowStep,
      rowIndex,
      observedPosition: currentPosition,
    });
    return rowIndex * rowStep;
  }

  observe(element: HTMLElement): void {
    const state = this.states.get(element);
    if (state) state.observedPosition = element.scrollTop;
  }

  forget(element: HTMLElement): void {
    this.states.delete(element);
  }

  handleViewportResize = (): void => {
    this.resizePending = true;
    if (this.resizeFrame) window.cancelAnimationFrame(this.resizeFrame);
    this.resizeFrame = window.requestAnimationFrame(() => {
      this.states.forEach((state, element) => {
        if (element.isConnected) state.observedPosition = element.scrollTop;
        else this.states.delete(element);
      });
      this.resizePending = false;
      this.resizeFrame = 0;
    });
  };

  dispose(): void {
    if (this.resizeFrame) window.cancelAnimationFrame(this.resizeFrame);
    this.states.clear();
  }
}

function animationDuration(distance: number): number {
  return clamp(
    (distance / SCROLL_PIXELS_PER_SECOND) * 1000,
    MIN_ANIMATION_MS,
    MAX_ANIMATION_MS,
  );
}

/**
 * Applies one animated wheel interaction to every native scroll container in
 * the application. Delegating from document capture also covers portals and
 * feature panels mounted after the application starts.
 */
export function useSmoothWheelScroll(): void {
  useEffect(() => {
    const animations = new Map<HTMLElement, ScrollAnimation>();
    const rowScrollTracker = new RowScrollTracker();

    const reducedMotion = () =>
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

    const animate = (animation: ScrollAnimation, timestamp: number) => {
      if (animations.get(animation.element) !== animation) return;
      if (!animation.element.isConnected) {
        animations.delete(animation.element);
        return;
      }

      const progress = clamp(
        (timestamp - animation.startedAt) / animation.duration,
        0,
        1,
      );
      const nextX =
        progress >= 1
          ? animation.targetX
          : Math.round(
              animation.fromX +
                (animation.targetX - animation.fromX) * progress,
            );
      const nextY =
        progress >= 1
          ? animation.targetY
          : Math.round(
              animation.fromY +
                (animation.targetY - animation.fromY) * progress,
            );
      animation.element.scrollLeft = nextX;
      animation.element.scrollTop = nextY;
      rowScrollTracker.observe(animation.element);

      if (progress >= 1) {
        animations.delete(animation.element);
        return;
      }
      animation.frame = window.requestAnimationFrame((nextTimestamp) =>
        animate(animation, nextTimestamp),
      );
    };

    const handleWheel = (event: WheelEvent) => {
      if (event.ctrlKey) return;

      const target = findScrollableTarget(event);
      if (!target) return;

      const viewportSize =
        target.axis === "x"
          ? target.element.clientWidth
          : target.element.clientHeight;
      const rowStep = rowStepFor(target.element, target.axis);
      const delta = normalizeWheelDelta(
        target.rawDelta,
        event.deltaMode,
        viewportSize,
        rowStep ?? DEFAULT_WHEEL_STEP,
      );
      if (delta === 0) return;

      const currentAnimation = animations.get(target.element);
      const currentX = target.element.scrollLeft;
      const currentY = target.element.scrollTop;
      const basePosition =
        target.axis === "x"
          ? (currentAnimation?.targetX ?? currentX)
          : (currentAnimation?.targetY ?? currentY);
      const maximum = maximumScroll(target.element, target.axis);
      const isDiscreteWheel =
        event.deltaMode === WHEEL_DELTA_LINE ||
        Math.abs(target.rawDelta) >= MOUSE_WHEEL_THRESHOLD;
      let nextPosition: number;
      if (isDiscreteWheel && rowStep !== null) {
        nextPosition = rowScrollTracker.nextPosition(
          target.element,
          basePosition,
          delta,
          rowStep,
          maximum,
          currentAnimation !== undefined,
        );
      } else {
        rowScrollTracker.forget(target.element);
        nextPosition = clamp(Math.round(basePosition + delta), 0, maximum);
      }
      if (nextPosition === basePosition) {
        if (isDiscreteWheel && rowStep !== null) event.preventDefault();
        return;
      }

      if (currentAnimation) window.cancelAnimationFrame(currentAnimation.frame);
      if (reducedMotion()) {
        if (target.axis === "x") target.element.scrollLeft = nextPosition;
        else target.element.scrollTop = nextPosition;
        rowScrollTracker.observe(target.element);
        animations.delete(target.element);
        event.preventDefault();
        return;
      }

      const animation: ScrollAnimation = {
        element: target.element,
        fromX: currentX,
        fromY: currentY,
        targetX:
          target.axis === "x"
            ? nextPosition
            : (currentAnimation?.targetX ?? currentX),
        targetY:
          target.axis === "y"
            ? nextPosition
            : (currentAnimation?.targetY ?? currentY),
        startedAt: performance.now(),
        duration: animationDuration(
          Math.abs(nextPosition - (target.axis === "x" ? currentX : currentY)),
        ),
        frame: 0,
      };
      animations.set(target.element, animation);
      animation.frame = window.requestAnimationFrame((timestamp) =>
        animate(animation, timestamp),
      );
      event.preventDefault();
    };

    document.addEventListener("wheel", handleWheel, {
      capture: true,
      passive: false,
    });
    window.addEventListener("resize", rowScrollTracker.handleViewportResize);
    window.visualViewport?.addEventListener(
      "resize",
      rowScrollTracker.handleViewportResize,
    );

    return () => {
      document.removeEventListener("wheel", handleWheel, { capture: true });
      window.removeEventListener(
        "resize",
        rowScrollTracker.handleViewportResize,
      );
      window.visualViewport?.removeEventListener(
        "resize",
        rowScrollTracker.handleViewportResize,
      );
      animations.forEach((animation) =>
        window.cancelAnimationFrame(animation.frame),
      );
      animations.clear();
      rowScrollTracker.dispose();
    };
  }, []);
}
