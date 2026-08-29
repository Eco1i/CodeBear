import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TablePanel } from "./TablePanel";

const table = {
  id: "table-1",
  name: "用户表",
  code: "t_user",
  comment: "保存系统用户",
  field_count: 2,
  project_id: "project-1",
  project_name: "测试项目",
  pdm_id: "pdm-1",
  relative_path: "模型/sample.pdm",
  source_hash: "hash",
};

describe("TablePanel", () => {
  it("submits the selected search mode, query, and scope", async () => {
    const user = userEvent.setup();
    const onSearch = vi.fn();
    render(
      <TablePanel
        tables={[table]}
        total={1}
        datasetRevision={1}
        selectedTableId={null}
        selectedTableIds={new Set()}
        loading={false}
        deleting={false}
        mode="table"
        query=""
        allNodes={false}
        onSearch={onSearch}
        onSelect={vi.fn()}
        onToggleSelection={vi.fn()}
        onClearSelection={vi.fn()}
        onDelete={vi.fn()}
        onRequestRange={vi.fn()}
      />,
    );

    await user.click(screen.getByText("搜字段"));
    await user.type(screen.getByPlaceholderText("输入字段名、描述或备注"), "用户编号");
    await user.click(screen.getByRole("checkbox", { name: "所有节点" }));
    fireEvent.keyDown(screen.getByPlaceholderText("输入字段名、描述或备注"), { key: "Enter" });

    expect(onSearch).toHaveBeenCalledWith("field", "用户编号", true);
  });

  it("renders a virtualized table row and selects it", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <TablePanel
        tables={[table]}
        total={1}
        datasetRevision={1}
        selectedTableId={null}
        selectedTableIds={new Set()}
        loading={false}
        deleting={false}
        mode="table"
        query="user"
        allNodes={false}
        onSearch={vi.fn()}
        onSelect={onSelect}
        onToggleSelection={vi.fn()}
        onClearSelection={vi.fn()}
        onDelete={vi.fn()}
        onRequestRange={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: /^01.*t_user/ }));
    expect(onSelect).toHaveBeenCalledWith(table);
  });

  it("exposes search memory settings and marks promoted tables", async () => {
    const user = userEvent.setup();
    const onSmartRankingChange = vi.fn();
    const onClearSearchMemory = vi.fn();
    render(
      <TablePanel
        tables={[table]}
        total={1}
        datasetRevision={1}
        selectedTableId={null}
        selectedTableIds={new Set()}
        loading={false}
        deleting={false}
        mode="table"
        query="user"
        allNodes={false}
        onSearch={vi.fn()}
        onSelect={vi.fn()}
        onToggleSelection={vi.fn()}
        onClearSelection={vi.fn()}
        onDelete={vi.fn()}
        onRequestRange={vi.fn()}
        smartRankingEnabled
        hasSearchMemory
        preferredTableIds={new Set([table.id])}
        onSmartRankingChange={onSmartRankingChange}
        onClearSearchMemory={onClearSearchMemory}
      />,
    );

    expect(screen.getByText("最近打开")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "搜索设置" }));
    expect(screen.getByText("搜索偏好")).toBeInTheDocument();
    expect(screen.getByText("智能排序")).toBeInTheDocument();
    expect(screen.getByText("精确匹配优先，最近打开优先")).toBeInTheDocument();
    await user.click(screen.getByRole("switch", { name: "启用智能排序" }));
    expect(onSmartRankingChange).toHaveBeenCalledWith(false, expect.anything());
    await user.click(screen.getByRole("button", { name: /清除/ }));
    expect(screen.getByText("确认清除搜索记忆？")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /确\s*认/ }));
    expect(onClearSearchMemory).toHaveBeenCalledTimes(1);
  });

  it("selects tables and exposes the batch delete action", async () => {
    const user = userEvent.setup();
    const onToggleSelection = vi.fn();
    const onDelete = vi.fn();
    const commonProps = {
      tables: [table],
      total: 1,
      datasetRevision: 1,
      selectedTableId: null,
      loading: false,
      deleting: false,
      mode: "table" as const,
      query: "",
      allNodes: false,
      onSearch: vi.fn(),
      onSelect: vi.fn(),
      onToggleSelection,
      onClearSelection: vi.fn(),
      onDelete,
      onRequestRange: vi.fn(),
    };
    const view = render(<TablePanel {...commonProps} selectedTableIds={new Set()} />);

    await user.click(screen.getByRole("checkbox", { name: "选择数据表 t_user" }));
    expect(onToggleSelection).toHaveBeenCalledWith(table, true);

    view.rerender(<TablePanel {...commonProps} selectedTableIds={new Set([table.id])} />);
    await user.click(screen.getByRole("button", { name: /批量删除/ }));
    expect(onDelete).toHaveBeenCalledWith([table]);
  });
});
