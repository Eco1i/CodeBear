import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useSidebarResize } from "./useSidebarResize";

function dispatchPointerEvent(
  element: Element,
  type: "pointerdown" | "pointermove" | "pointerup" | "lostpointercapture",
  options: { pointerId: number; clientX: number; button?: number },
) {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    button: options.button ?? 0,
    clientX: options.clientX,
  });
  Object.defineProperty(event, "pointerId", { value: options.pointerId });
  fireEvent(element, event);
}

function SidebarResizeHarness() {
  const resize = useSidebarResize();
  return (
    <div
      ref={resize.appRootRef}
      style={resize.rootStyle}
      data-testid="app-root"
    >
      <aside className="project-navigator" data-testid="navigator" />
      <div
        ref={resize.sidebarResizerRef}
        role="separator"
        aria-valuenow={resize.effectiveWidth}
        data-testid="resizer"
        onPointerDown={resize.startResize}
        onPointerMove={resize.moveResize}
        onPointerUp={resize.finishResize}
        onPointerCancel={resize.commitResize}
        onLostPointerCapture={resize.commitResize}
      />
    </div>
  );
}

describe("useSidebarResize", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("updates the live layout on each animation frame while dragging", () => {
    const animationFrames: FrameRequestCallback[] = [];
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      animationFrames.push(callback);
      return 1;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(
      () => undefined,
    );

    render(<SidebarResizeHarness />);
    const root = screen.getByTestId("app-root");
    const navigator = screen.getByTestId("navigator");
    const resizer = screen.getByTestId("resizer") as HTMLDivElement;
    vi.spyOn(navigator, "getBoundingClientRect").mockReturnValue({
      left: 0,
      top: 0,
      right: 326,
      bottom: 700,
      width: 326,
      height: 700,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });

    let capturedPointer: number | null = null;
    resizer.setPointerCapture = (pointerId) => {
      capturedPointer = pointerId;
    };
    resizer.hasPointerCapture = (pointerId) => capturedPointer === pointerId;
    resizer.releasePointerCapture = (pointerId) => {
      if (capturedPointer === pointerId) capturedPointer = null;
    };

    dispatchPointerEvent(resizer, "pointerdown", {
      pointerId: 7,
      clientX: 326,
    });
    dispatchPointerEvent(resizer, "pointermove", {
      pointerId: 7,
      clientX: 400,
    });
    expect(animationFrames).toHaveLength(1);
    animationFrames[0](0);

    expect(root.style.getPropertyValue("--sidebar-width")).toBe("400px");
    expect(resizer.style.transform).toBe("");
    expect(resizer).toHaveAttribute("aria-valuenow", "400");

    dispatchPointerEvent(resizer, "pointerup", {
      pointerId: 7,
      clientX: 400,
    });

    expect(root.style.getPropertyValue("--sidebar-width")).toBe("400px");
    expect(resizer.style.transform).toBe("");
    expect(resizer.style.willChange).toBe("");
    expect(window.localStorage.getItem("maxiong.sidebarWidth")).toBe("400");
  });
});
