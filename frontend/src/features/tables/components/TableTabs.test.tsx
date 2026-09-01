import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { TableTab } from "../types";
import { TableTabs } from "./TableTabs";

const tabs: TableTab[] = Array.from({ length: 6 }, (_, index) => ({
  id: `table-${index}`,
  name: `数据表 ${index}`,
  code: `table_${index}`,
  project_id: "project-1",
  project_name: "测试项目",
  pdm_id: "pdm-1",
  relative_path: "sample.pdm",
}));

describe("TableTabs", () => {
  it("uses an ordinary vertical mouse wheel to scroll overflowing tabs horizontally", () => {
    const { container } = render(
      <TableTabs
        tabs={tabs}
        activeTableId={tabs[0].id}
        dirtyTableIds={new Set()}
        onSelect={vi.fn()}
        onClose={vi.fn()}
        onCloseOthers={vi.fn()}
        onCloseToLeft={vi.fn()}
        onCloseToRight={vi.fn()}
      />,
    );
    const strip = container.querySelector<HTMLDivElement>(".table-tabs-scroll");
    expect(strip).not.toBeNull();
    Object.defineProperties(strip!, {
      clientWidth: { configurable: true, value: 320 },
      scrollWidth: { configurable: true, value: 1044 },
    });

    fireEvent.wheel(strip!, { deltaX: 0, deltaY: 120, deltaMode: 0 });

    expect(strip!.scrollLeft).toBe(120);
  });
});
