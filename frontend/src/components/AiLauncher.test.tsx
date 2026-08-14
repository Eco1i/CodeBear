import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AiLauncher } from "./AiLauncher";

describe("AiLauncher", () => {
  it("renders the persisted assistant appearance before the AI feature loads", () => {
    const onOpen = vi.fn();
    const { container } = render(
      <AiLauncher assistantName="雪球" assistantAccessory="red_cap" onOpen={onOpen} />,
    );

    expect(screen.getByRole("button", { name: "打开 雪球" })).toBeVisible();
    expect(screen.getByText("和雪球聊聊")).toBeInTheDocument();
    expect(container.querySelector("[data-accessory='red_cap']")).toBeVisible();
  });
});
