import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
  it("leaves empty display cells blank instead of rendering placeholder dashes", () => {
    const blankFieldDetail: TableDetail = {
      ...detail,
      fields: [{
        ...detail.fields[0],
        length: "",
        default_value: "",
        comment: "",
        is_primary_key: false,
      }],
    };
    const { container } = render(
      <FieldPanel
        detail={blankFieldDetail}
        loading={false}
        saving={false}
        highlightQuery=""
        onSave={vi.fn()}
        onDirtyChange={vi.fn()}
      />,
    );

    const row = container.querySelector(".field-grid-body .data-grid-row");
    expect(row).toBeInTheDocument();
    expect(row).not.toHaveTextContent("—");
    const cells = Array.from(row!.children);
    [1, 5, 7, 8, 9].forEach((index) => {
      expect(cells[index]).toBeEmptyDOMElement();
    });
  });

  it("extends the hovered row background through the scrollbar gutter", () => {
    const twoFieldDetail: TableDetail = {
      ...detail,
      field_count: 2,
      fields: [
        ...detail.fields,
        {
          ...detail.fields[0],
          id: "field-2",
          xml_id: "o12",
          ordinal: 2,
          code: "user_name",
          name: "用户名称",
          is_primary_key: false,
        },
      ],
    };
    const { container } = render(
      <FieldPanel
        detail={twoFieldDetail}
        loading={false}
        saving={false}
        highlightQuery=""
        onSave={vi.fn()}
        onDirtyChange={vi.fn()}
      />,
    );
    const grid = container.querySelector<HTMLElement>(".field-grid")!;
    const body = screen.getByTestId("field-scroll-body");
    const rows = body.querySelectorAll<HTMLElement>(".data-grid-row");
    const hoveredRow = rows[1];
    const gutterHighlight = container.querySelector<HTMLElement>(".field-grid-gutter-highlight")!;
    vi.spyOn(grid, "getBoundingClientRect").mockReturnValue({
      x: 100, y: 100, top: 100, right: 900, bottom: 500, left: 100,
      width: 800, height: 400, toJSON: () => ({}),
    });
    vi.spyOn(body, "getBoundingClientRect").mockReturnValue({
      x: 100, y: 133, top: 133, right: 900, bottom: 500, left: 100,
      width: 800, height: 367, toJSON: () => ({}),
    });
    vi.spyOn(hoveredRow, "getBoundingClientRect").mockReturnValue({
      x: 100, y: 169, top: 169, right: 890, bottom: 205, left: 100,
      width: 790, height: 36, toJSON: () => ({}),
    });
    hoveredRow.style.backgroundColor = "rgb(246, 250, 255)";

    fireEvent.pointerMove(hoveredRow, { clientX: 500, clientY: 180 });

    expect(gutterHighlight).not.toHaveAttribute("hidden");
    expect(gutterHighlight).toHaveStyle({
      top: "69px",
      height: "36px",
      backgroundColor: "rgb(246, 250, 255)",
    });

    fireEvent.pointerLeave(body);
    expect(gutterHighlight).toHaveAttribute("hidden");
  });

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

  it("adds a new field and removes an existing non-primary field before saving", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    const editableDetail: TableDetail = {
      ...detail,
      field_count: 2,
      fields: [
        ...detail.fields,
        {
          id: "field-2",
          table_id: "table-1",
          xml_id: "o12",
          ordinal: 2,
          name: "用户昵称",
          code: "nickname",
          data_type: "VARCHAR2",
          length: "100",
          nullable: true,
          default_value: "",
          comment: "展示名称",
          is_primary_key: false,
        },
      ],
    };
    render(
      <FieldPanel
        detail={editableDetail}
        loading={false}
        saving={false}
        highlightQuery=""
        onSave={onSave}
        onDirtyChange={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: /编辑字典/ }));
    await user.click(screen.getByRole("button", { name: "删除字段 nickname" }));
    await user.click(screen.getByRole("button", { name: /新增字段/ }));
    await user.type(screen.getByRole("textbox", { name: "第 2 行字段英文名" }), "status");
    await user.type(screen.getByRole("textbox", { name: "第 2 行字段描述" }), "用户状态");
    await user.type(screen.getByRole("textbox", { name: "第 2 行数据类型" }), "VARCHAR2");
    await user.type(screen.getByRole("textbox", { name: "第 2 行长度" }), "20");
    await user.click(screen.getByRole("button", { name: /保存修改/ }));

    expect(onSave).toHaveBeenCalledTimes(1);
    const savedFields = onSave.mock.calls[0][1] as TableDetail["fields"];
    expect(savedFields).toHaveLength(2);
    expect(savedFields.some((field) => field.id === "field-2")).toBe(false);
    expect(savedFields[1]).toMatchObject({
      is_new: true,
      ordinal: 2,
      name: "用户状态",
      code: "status",
      data_type: "VARCHAR2",
      length: "20",
      nullable: true,
      is_primary_key: false,
    });
  });
});
