import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  AI_LAUNCHER_POSITION_STORAGE_KEY,
  AiLauncher,
} from "./AiLauncher";

function dispatchPointerEvent(
  element: Element,
  type:
    | "lostpointercapture"
    | "pointercancel"
    | "pointerdown"
    | "pointermove"
    | "pointerup",
  options: { pointerId: number; clientX: number; clientY: number; button?: number },
) {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    button: options.button ?? 0,
    clientX: options.clientX,
    clientY: options.clientY,
  });
  Object.defineProperties(event, {
    pointerId: { value: options.pointerId },
    isPrimary: { value: true },
  });
  fireEvent(element, event);
}

function storePosition(x: number, y: number) {
  window.localStorage.setItem(
    AI_LAUNCHER_POSITION_STORAGE_KEY,
    JSON.stringify({ x, y }),
  );
}

describe("AiLauncher", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("renders the persisted assistant appearance before the AI feature loads", () => {
    const onOpen = vi.fn();
    const { container } = render(
      <AiLauncher assistantName="雪球" assistantAccessory="red_cap" onOpen={onOpen} />,
    );

    expect(screen.getByRole("button", { name: "打开 雪球" })).toBeVisible();
    expect(screen.getByText("和雪球聊聊")).toBeInTheDocument();
    expect(container.querySelector("[data-accessory='red_cap']")).toBeVisible();
  });

  it("opens on click when the pointer movement stays below the drag threshold", () => {
    const onOpen = vi.fn();
    render(<AiLauncher onOpen={onOpen} />);
    const launcher = screen.getByRole("button", { name: "打开 小码" });
    vi.spyOn(launcher, "getBoundingClientRect").mockReturnValue({
      left: 948,
      top: 692,
      right: 1006,
      bottom: 750,
      width: 58,
      height: 58,
      x: 948,
      y: 692,
      toJSON: () => ({}),
    });

    dispatchPointerEvent(launcher, "pointerdown", {
      button: 0, pointerId: 1, clientX: 977, clientY: 721,
    });
    dispatchPointerEvent(launcher, "pointermove", {
      pointerId: 1, clientX: 980, clientY: 723,
    });
    dispatchPointerEvent(launcher, "pointerup", {
      pointerId: 1, clientX: 980, clientY: 723,
    });
    fireEvent.click(launcher);

    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(window.localStorage.getItem(AI_LAUNCHER_POSITION_STORAGE_KEY)).toBeNull();
  });

  it("drags freely inside the viewport, persists the position, and does not open", () => {
    const onOpen = vi.fn();
    render(<AiLauncher onOpen={onOpen} />);
    const launcher = screen.getByRole("button", { name: "打开 小码" });
    vi.spyOn(launcher, "getBoundingClientRect").mockReturnValue({
      left: 948,
      top: 692,
      right: 1006,
      bottom: 750,
      width: 58,
      height: 58,
      x: 948,
      y: 692,
      toJSON: () => ({}),
    });

    dispatchPointerEvent(launcher, "pointerdown", {
      button: 0, pointerId: 2, clientX: 977, clientY: 721,
    });
    dispatchPointerEvent(launcher, "pointermove", {
      pointerId: 2, clientX: 429, clientY: 229,
    });
    dispatchPointerEvent(launcher, "pointerup", {
      pointerId: 2, clientX: 429, clientY: 229,
    });
    fireEvent.click(launcher);

    expect(launcher).toHaveStyle({ left: "400px", top: "200px" });
    expect(launcher).not.toHaveClass("is-dragging");
    expect(onOpen).not.toHaveBeenCalled();
    expect(JSON.parse(
      window.localStorage.getItem(AI_LAUNCHER_POSITION_STORAGE_KEY) || "{}",
    )).toEqual({ x: 400, y: 200 });
  });

  it("restores the saved position and supports keyboard movement", () => {
    window.localStorage.setItem(
      AI_LAUNCHER_POSITION_STORAGE_KEY,
      JSON.stringify({ x: 120, y: 160 }),
    );
    render(<AiLauncher onOpen={vi.fn()} />);
    const launcher = screen.getByRole("button", { name: "打开 小码" });

    expect(launcher).toHaveStyle({ left: "120px", top: "160px" });
    expect(launcher).toHaveClass("is-hint-right");

    fireEvent.keyDown(launcher, { key: "ArrowRight", altKey: true });
    fireEvent.keyDown(launcher, { key: "ArrowUp", altKey: true, shiftKey: true });

    expect(launcher).toHaveStyle({ left: "136px", top: "112px" });
    expect(JSON.parse(
      window.localStorage.getItem(AI_LAUNCHER_POSITION_STORAGE_KEY) || "{}",
    )).toEqual({ x: 136, y: 112 });
  });

  it("clamps a saved position to the visible viewport", () => {
    window.localStorage.setItem(
      AI_LAUNCHER_POSITION_STORAGE_KEY,
      JSON.stringify({ x: 9999, y: 9999 }),
    );
    render(<AiLauncher onOpen={vi.fn()} />);
    const launcher = screen.getByRole("button", { name: "打开 小码" });
    const expected = {
      x: window.innerWidth - 58 - 12,
      y: window.innerHeight - 58 - 12,
    };

    expect(launcher).toHaveStyle({ left: `${expected.x}px`, top: `${expected.y}px` });
    expect(JSON.parse(
      window.localStorage.getItem(AI_LAUNCHER_POSITION_STORAGE_KEY) || "{}",
    )).toEqual(expected);
  });

  it("stays mounted but hidden while the assistant exit gate is closed", () => {
    const view = render(<AiLauncher visible={false} onOpen={vi.fn()} />);
    const launcher = screen.getByRole("button", { name: "打开 小码" });

    expect(launcher).toHaveClass("is-hidden");
    view.rerender(<AiLauncher visible onOpen={vi.fn()} />);
    expect(launcher).not.toHaveClass("is-hidden");
  });

  it("opens with either Ctrl+J or Command+J, but not both modifiers together", () => {
    const onOpen = vi.fn();
    render(<AiLauncher onOpen={onOpen} />);
    const launcher = screen.getByRole("button", { name: "打开 小码" });

    expect(launcher).toHaveAttribute(
      "aria-keyshortcuts",
      expect.stringContaining("Control+J Meta+J"),
    );

    fireEvent.keyDown(window, { key: "j", ctrlKey: true });
    fireEvent.keyDown(window, { key: "J", metaKey: true });
    fireEvent.keyDown(window, { key: "j", ctrlKey: true, metaKey: true });

    expect(onOpen).toHaveBeenCalledTimes(2);
  });

  it("keeps a saved position unchanged while the launcher is idle", () => {
    vi.useFakeTimers();
    try {
      storePosition(120, 214);
      render(<AiLauncher onOpen={vi.fn()} />);
      const launcher = screen.getByRole("button", { name: "打开 小码" });

      vi.advanceTimersByTime(20_000);

      expect(launcher).toHaveStyle({ left: "120px", top: "214px" });
      expect(launcher.className).not.toMatch(/is-dock/);
      expect(JSON.parse(
        window.localStorage.getItem(AI_LAUNCHER_POSITION_STORAGE_KEY) || "{}",
      )).toEqual({ x: 120, y: 214 });
    } finally {
      vi.clearAllTimers();
      vi.useRealTimers();
    }
  });

  it.each(["pointercancel", "lostpointercapture"] as const)(
    "finishes dragging cleanly on %s",
    (finishEvent) => {
      storePosition(120, 200);
      const onOpen = vi.fn();
      render(<AiLauncher onOpen={onOpen} />);
      const launcher = screen.getByRole("button", { name: "打开 小码" });
      vi.spyOn(launcher, "getBoundingClientRect").mockReturnValue({
        left: 120,
        top: 200,
        right: 178,
        bottom: 258,
        width: 58,
        height: 58,
        x: 120,
        y: 200,
        toJSON: () => ({}),
      });

      dispatchPointerEvent(launcher, "pointerdown", {
        pointerId: 9, clientX: 149, clientY: 229,
      });
      dispatchPointerEvent(launcher, "pointermove", {
        pointerId: 9, clientX: 249, clientY: 249,
      });
      dispatchPointerEvent(launcher, finishEvent, {
        pointerId: 9, clientX: 249, clientY: 249,
      });
      dispatchPointerEvent(launcher, "pointermove", {
        pointerId: 9, clientX: 349, clientY: 349,
      });
      fireEvent.click(launcher);

      expect(launcher).not.toHaveClass("is-dragging");
      expect(launcher).toHaveStyle({ left: "220px", top: "220px" });
      expect(onOpen).not.toHaveBeenCalled();
      expect(JSON.parse(
        window.localStorage.getItem(AI_LAUNCHER_POSITION_STORAGE_KEY) || "{}",
      )).toEqual({ x: 220, y: 220 });
    },
  );
});
