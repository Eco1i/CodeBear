import { fireEvent, render, screen } from "@testing-library/react";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAssistantExitGate } from "./useAssistantExitGate";

function Harness({ open }: { open: boolean }) {
  const { launcherVisible, onAssistantTransitionEnd } = useAssistantExitGate(open);
  return (
    <>
      <span data-testid="launcher-state">{launcherVisible ? "visible" : "hidden"}</span>
      <aside data-testid="assistant" onTransitionEnd={onAssistantTransitionEnd} />
    </>
  );
}

describe("useAssistantExitGate", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("reveals only after the assistant visibility transition has finished", () => {
    const view = render(<Harness open={false} />);
    expect(screen.getByTestId("launcher-state")).toHaveTextContent("visible");

    view.rerender(<Harness open />);
    expect(screen.getByTestId("launcher-state")).toHaveTextContent("hidden");

    view.rerender(<Harness open={false} />);
    fireEvent.transitionEnd(screen.getByTestId("assistant"), { propertyName: "transform" });
    expect(screen.getByTestId("launcher-state")).toHaveTextContent("hidden");

    fireEvent.transitionEnd(screen.getByTestId("assistant"), { propertyName: "visibility" });
    expect(screen.getByTestId("launcher-state")).toHaveTextContent("hidden");
    act(() => vi.advanceTimersToNextFrame());
    expect(screen.getByTestId("launcher-state")).toHaveTextContent("visible");
  });

  it("uses a delayed fallback when the browser does not emit transitionend", () => {
    const view = render(<Harness open />);
    view.rerender(<Harness open={false} />);

    act(() => vi.advanceTimersByTime(399));
    expect(screen.getByTestId("launcher-state")).toHaveTextContent("hidden");
    act(() => {
      vi.advanceTimersByTime(1);
      vi.advanceTimersToNextFrame();
    });
    expect(screen.getByTestId("launcher-state")).toHaveTextContent("visible");
  });
});
