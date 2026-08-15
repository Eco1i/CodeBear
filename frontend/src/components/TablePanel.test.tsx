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
  kind: "table" as const,
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
        loading={false}
        mode="table"
        query=""
        allNodes={false}
        onSearch={onSearch}
        onSelect={vi.fn()}
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
        loading={false}
        mode="table"
        query="user"
        allNodes={false}
        onSearch={vi.fn()}
        onSelect={onSelect}
        onRequestRange={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: /t_user/ }));
    expect(onSelect).toHaveBeenCalledWith(table);
  });
});
