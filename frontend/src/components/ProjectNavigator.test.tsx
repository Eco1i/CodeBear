import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceNode } from "../types";
import { ProjectNavigator } from "./ProjectNavigator";

function makeTrees(): WorkspaceNode[] {
  return [
    {
      id: "project:p1",
      project_id: "p1",
      type: "project",
      name: "测试项目",
      relative_path: "",
      pdm_count: 2,
      children: [
        {
          id: "folder:p1:目标目录",
          project_id: "p1",
          type: "folder",
          name: "目标目录",
          relative_path: "目标目录",
          pdm_count: 1,
          children: [
            {
              id: "pdm:p1:target",
              project_id: "p1",
              pdm_id: "target-pdm",
              type: "pdm",
              name: "目标模型.pdm",
              relative_path: "目标目录/目标模型.pdm",
              table_count: 10,
            },
          ],
        },
        {
          id: "folder:p1:其他目录",
          project_id: "p1",
          type: "folder",
          name: "其他目录",
          relative_path: "其他目录",
          pdm_count: 1,
          children: [
            {
              id: "pdm:p1:other",
              project_id: "p1",
              pdm_id: "other-pdm",
              type: "pdm",
              name: "其他模型.pdm",
              relative_path: "其他目录/其他模型.pdm",
              table_count: 20,
            },
          ],
        },
      ],
    },
  ];
}

function folderSwitcher(name: string): HTMLElement {
  const treeNode = screen.getByText(name).closest(".ant-tree-treenode");
  const switcher = treeNode?.querySelector<HTMLElement>(".ant-tree-switcher");
  if (!switcher) throw new Error(`找不到 ${name} 的目录开关`);
  return switcher;
}

describe("ProjectNavigator", () => {
  beforeEach(() => {
    window.localStorage.clear();
    Object.defineProperty(Element.prototype, "scrollIntoView", {
      configurable: true,
      value: vi.fn(),
    });
  });

  it("does not replay an old locate request after the user collapses its folder", async () => {
    const user = userEvent.setup();
    const callbacks = {
      onLocate: vi.fn(),
      onSelect: vi.fn(),
      onCreateProject: vi.fn(),
      onImport: vi.fn(),
      onCreateFolder: vi.fn(),
      onRefresh: vi.fn(),
      onForceRefresh: vi.fn(),
      onRename: vi.fn(),
      onTrash: vi.fn(),
      onMove: vi.fn(),
      onOpenTrash: vi.fn(),
      onOpenSettings: vi.fn(),
    };
    const initialTrees = makeTrees();
    const commonProps = {
      settings: null,
      loading: false,
      locateNode: {
        projectId: "p1",
        pdmId: "target-pdm",
        relativePath: "目标目录/目标模型.pdm",
      },
      locateRevision: 1,
      ...callbacks,
    };
    const { rerender } = render(
      <ProjectNavigator {...commonProps} trees={initialTrees} selectedNode={null} />,
    );

    await waitFor(() => expect(folderSwitcher("目标目录")).toHaveClass("ant-tree-switcher_open"));
    await user.click(folderSwitcher("目标目录"));
    await waitFor(() => expect(folderSwitcher("目标目录")).toHaveClass("ant-tree-switcher_close"));

    const xirFolder = initialTrees[0].children?.[1] ?? null;
    await user.click(screen.getByText("其他目录"));
    expect(callbacks.onSelect).toHaveBeenCalledWith(xirFolder);
    rerender(
      <ProjectNavigator {...commonProps} trees={initialTrees} selectedNode={xirFolder} />,
    );
    await waitFor(() => expect(folderSwitcher("目标目录")).toHaveClass("ant-tree-switcher_close"));

    rerender(
      <ProjectNavigator {...commonProps} trees={makeTrees()} selectedNode={xirFolder} />,
    );
    await waitFor(() => expect(folderSwitcher("目标目录")).toHaveClass("ant-tree-switcher_close"));

    rerender(
      <ProjectNavigator
        {...commonProps}
        trees={makeTrees()}
        selectedNode={xirFolder}
        locateRevision={2}
      />,
    );
    await waitFor(() => expect(folderSwitcher("目标目录")).toHaveClass("ant-tree-switcher_open"));
  });
});
