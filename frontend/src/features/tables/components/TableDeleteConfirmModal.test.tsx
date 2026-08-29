import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { TableDeletePreview } from "../types";
import { TableDeleteConfirmModal } from "./TableDeleteConfirmModal";

const preview: TableDeletePreview = {
  table_count: 1,
  field_count: 8,
  pdm_count: 1,
  relation_count: 2,
  binding_count: 3,
  tables: [{
    id: "table-1",
    name: "证券系数配置表",
    code: "CFG_SEC_COEFF",
    field_count: 8,
    pdm_id: "pdm-1",
    relative_path: "IBOR2.2/资产簿记.pdm",
    project_name: "E-簿记系统",
  }],
};

describe("TableDeleteConfirmModal", () => {
  it("presents the delete target, impact, and backup protection", () => {
    render(
      <TableDeleteConfirmModal
        open
        preview={preview}
        confirming={false}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    expect(screen.getByRole("dialog", { name: "删除数据表" })).toBeInTheDocument();
    expect(screen.getByText("CFG_SEC_COEFF")).toBeInTheDocument();
    expect(screen.getByText("证券系数配置表 · IBOR2.2/资产簿记.pdm")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "删除影响范围" })).toHaveTextContent("8字段2表关系3字典绑定1PDM");
    expect(screen.getByText("原文件自动备份")).toBeInTheDocument();
  });

  it("keeps cancel and confirm as explicit commands", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    render(
      <TableDeleteConfirmModal
        open
        preview={preview}
        confirming={false}
        onCancel={onCancel}
        onConfirm={onConfirm}
      />,
    );

    await user.click(screen.getByRole("button", { name: /取\s*消/ }));
    await user.click(screen.getByRole("button", { name: "确认删除" }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
