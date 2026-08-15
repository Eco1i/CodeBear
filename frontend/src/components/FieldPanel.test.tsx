import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { TableDetail } from "../types";
import { FieldPanel } from "./FieldPanel";

const detail: TableDetail = {
  id: "table-1",
  xml_id: "o10",
  ordinal: 1,
  name: "用户表",
  code: "t_user",
  comment: "保存系统用户",
  field_count: 1,
  project_id: "project-1",
  project_name: "测试项目",
  pdm_id: "pdm-1",
  relative_path: "sample.pdm",
  source_hash: "hash",
  pd_version: "16.5",
  target_db: "ORACLE",
  fields: [
    {
      id: "field-1",
      table_id: "table-1",
      xml_id: "o11",
      ordinal: 1,
      name: "用户编号",
      code: "user_id",
      data_type: "NUMBER",
      length: "20",
      nullable: false,
      default_value: "",
      comment: "全局唯一编号",
      is_primary_key: true,
    },
  ],
};

describe("FieldPanel", () => {
  it("edits table metadata together with its fields", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    const onDirtyChange = vi.fn();
    render(
      <FieldPanel
        detail={detail}
        loading={false}
        saving={false}
        highlightQuery=""
        onSave={onSave}
        onDirtyChange={onDirtyChange}
      />,
    );

    await user.click(screen.getByRole("button", { name: /编辑字典/ }));
    await user.clear(screen.getByRole("textbox", { name: "表名称" }));
    await user.type(screen.getByRole("textbox", { name: "表名称" }), "账户用户表");
    await user.clear(screen.getByRole("textbox", { name: "表代码" }));
    await user.type(screen.getByRole("textbox", { name: "表代码" }), "t_account_user");
    await user.clear(screen.getByRole("textbox", { name: "表描述" }));
    await user.type(screen.getByRole("textbox", { name: "表描述" }), "保存账户用户");
    await waitFor(() => expect(onDirtyChange).toHaveBeenLastCalledWith(true));
    await user.click(screen.getByRole("button", { name: /保存修改/ }));

    expect(onSave).toHaveBeenCalledWith(
      {
        name: "账户用户表",
        code: "t_account_user",
        comment: "保存账户用户",
      },
      detail.fields,
    );
  });
});
