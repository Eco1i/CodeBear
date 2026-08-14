import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HighlightedText } from "./HighlightedText";

describe("HighlightedText", () => {
  it("highlights matches without changing the displayed text", () => {
    const { container } = render(<HighlightedText text="用户 USER 用户" query="用户" />);

    expect(container).toHaveTextContent("用户 USER 用户");
    expect(container.querySelectorAll("mark")).toHaveLength(2);
  });

  it("treats regular-expression characters as plain text", () => {
    const { container } = render(<HighlightedText text="order_%_history" query="_%_" />);

    expect(container.querySelector("mark")).toHaveTextContent("_%_");
  });
});
