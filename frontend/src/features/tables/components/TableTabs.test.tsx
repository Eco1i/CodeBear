import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TableTabs } from "./TableTabs";
import type { TableTab } from "../types";

const tabs: TableTab[] = [
  {
    id: "table-1",
    name: "订单表",
    code: "t_order",
    project_id: "project-1",
    project_name: "测试项目",
    pdm_id: "pdm-1",
    relative_path: "sample.pdm",
  },
  {
    id: "table-2",
    name: "订单明细",
    code: "t_order_item",
    project_id: "project-1",
    project_name: "测试项目",
    pdm_id: "pdm-1",
    relative_path: "sample.pdm",
  },
];

describe("TableTabs", () => {
  it("renders active and dirty states without changing the surrounding layout", () => {
    render(
      <TableTabs
        tabs={tabs}
        activeTableId="table-1"
        dirtyTableIds={new Set(["table-2"])}
        onSelect={vi.fn()}
        onClose={vi.fn()}
        onCloseOthers={vi.fn()}
        onCloseToLeft={vi.fn()}
        onCloseToRight={vi.fn()}
      />,
    );

    expect(screen.getByRole("tab", { name: "订单表" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: /订单明细.*未保存修改/ })).toHaveAttribute("aria-selected", "false");
    expect(screen.getByLabelText("关闭 订单表")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "打开最近访问" })).not.toBeInTheDocument();
  });

  it("activates a tab and reports close actions", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const onClose = vi.fn();
    render(
      <TableTabs
        tabs={tabs}
        activeTableId="table-1"
        dirtyTableIds={new Set()}
        onSelect={onSelect}
        onClose={onClose}
        onCloseOthers={vi.fn()}
        onCloseToLeft={vi.fn()}
        onCloseToRight={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("tab", { name: "订单明细" }));
    await user.click(screen.getByLabelText("关闭 订单表"));

    expect(onSelect).toHaveBeenCalledWith("table-2");
    expect(onClose).toHaveBeenCalledWith("table-1");
  });

});
