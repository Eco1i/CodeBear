/// <reference types="node" />

import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const fixture = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "fixtures",
  "sample.pdm",
);
const visualPrefix = process.env.CODEBEAR_VISUAL_PREFIX;
const visualOutput = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "output",
  "playwright",
);

async function captureVisual(
  page: import("@playwright/test").Page,
  name: string,
): Promise<void> {
  if (!visualPrefix) return;
  await page.screenshot({
    path: path.join(visualOutput, `${visualPrefix}-${name}.png`),
    animations: "disabled",
    fullPage: true,
  });
}

test.describe
  .serial("CodeBear workspace smoke tests", () => {
    test("defers AI requests until the assistant is opened", async ({
      page,
    }) => {
      await page.setViewportSize({ width: 1392, height: 900 });

      const savedAppearance = await page.request.put("/api/ai/settings", {
        data: { assistant_name: "雪球", assistant_accessory: "red_cap" },
      });
      expect(savedAppearance.ok()).toBeTruthy();

      const aiRequests: string[] = [];
      page.on("request", (request) => {
        if (request.url().includes("/api/ai/")) aiRequests.push(request.url());
      });

      await page.goto("/");
      await expect(page.getByText("本机工作区已连接")).toBeVisible();
      await expect.poll(() => aiRequests.length).toBe(0);
      await expect(
        page.getByRole("button", { name: "打开 雪球" }),
      ).toBeVisible();
      await expect(
        page.locator('.ai-launcher [data-accessory="red_cap"]'),
      ).toBeVisible();

      await page.reload();
      await expect(page.getByText("本机工作区已连接")).toBeVisible();
      await expect.poll(() => aiRequests.length).toBe(0);
      await expect(
        page.getByRole("button", { name: "打开 雪球" }),
      ).toBeVisible();
      await expect(
        page.locator('.ai-launcher [data-accessory="red_cap"]'),
      ).toBeVisible();

      await page.getByRole("button", { name: "打开 雪球" }).click();
      await expect(page.getByRole("button", { name: "AI 设置" })).toBeVisible();
      await expect.poll(() => aiRequests.length).toBeGreaterThan(0);
      await page.getByRole("button", { name: "切换 AI 显示方式" }).click();
      await page.getByRole("menuitemradio", { name: /浮动/ }).click();
      await expect(page.locator(".ai-assistant")).toHaveClass(/is-floating/);
      await captureVisual(page, "ai");
      await page.getByRole("button", { name: "收起 AI 助手" }).click();
      const returningLauncher = page.locator(".ai-launcher");
      await expect(returningLauncher).toHaveCSS("visibility", "hidden");
      const firstVisibleFrame = await page.evaluate(async () => {
        const launcher = document.querySelector<HTMLElement>(".ai-launcher");
        const assistant = document.querySelector<HTMLElement>(".ai-assistant");
        if (!launcher || !assistant)
          throw new Error("AI assistant elements are missing");

        for (let frame = 0; frame < 60; frame += 1) {
          await new Promise<void>((resolve) =>
            requestAnimationFrame(() => resolve()),
          );
          const launcherStyle = getComputedStyle(launcher);
          if (launcherStyle.visibility === "hidden") continue;

          const launcherBox = launcher.getBoundingClientRect();
          const assistantBox = assistant.getBoundingClientRect();
          const hintStyle = getComputedStyle(
            launcher.querySelector<HTMLElement>(".ai-launcher-hint")!,
          );
          const overlaps = !(
            launcherBox.right <= assistantBox.left ||
            launcherBox.left >= assistantBox.right ||
            launcherBox.bottom <= assistantBox.top ||
            launcherBox.top >= assistantBox.bottom
          );
          return {
            assistantVisibility: getComputedStyle(assistant).visibility,
            assistantZIndex: Number(getComputedStyle(assistant).zIndex),
            floating: assistant.classList.contains("is-floating"),
            launcherBox: {
              x: launcherBox.x,
              y: launcherBox.y,
              width: launcherBox.width,
              height: launcherBox.height,
            },
            launcherZIndex: Number(launcherStyle.zIndex),
            launcherOpacity: Number(launcherStyle.opacity),
            launcherTransform: launcherStyle.transform,
            hintOpacity: Number(hintStyle.opacity),
            overlaps,
          };
        }
        throw new Error(
          "AI launcher did not return after the assistant closed",
        );
      });
      expect(firstVisibleFrame).toMatchObject({
        assistantVisibility: "hidden",
        floating: true,
        launcherOpacity: 1,
        launcherTransform: "matrix(1, 0, 0, 1, 0, 0)",
        hintOpacity: 0,
        overlaps: true,
      });
      expect(firstVisibleFrame.launcherZIndex).toBeGreaterThan(
        firstVisibleFrame.assistantZIndex,
      );
      const firstVisiblePixels = await page.screenshot({
        clip: firstVisibleFrame.launcherBox,
      });
      await page.waitForTimeout(180);
      const settledPixels = await page.screenshot({
        clip: firstVisibleFrame.launcherBox,
      });
      expect(firstVisiblePixels.equals(settledPixels)).toBe(true);
      await expect(
        page.getByRole("button", { name: "打开 雪球" }),
      ).toBeVisible();
    });

    test("keeps an idle AI launcher where the user left it", async ({
      page,
    }) => {
      const viewport = { width: 1_200, height: 800 };
      const storedPosition = { x: 900, y: 320 };
      const positionStorageKey = "maxiong.ai.launcher-position";
      await page.setViewportSize(viewport);
      await page.goto("/");
      await page.evaluate(
        ({ key, position }) => {
          window.localStorage.setItem(key, JSON.stringify(position));
        },
        { key: positionStorageKey, position: storedPosition },
      );

      await page.clock.install({ time: new Date("2026-08-26T00:00:00Z") });
      await page.clock.pauseAt(new Date("2026-08-26T00:00:01Z"));
      await page.reload();

      const launcher = page.locator(".ai-launcher");
      await expect(launcher).toBeVisible();
      await expect(launcher).toHaveCSS("left", `${storedPosition.x}px`);
      await expect(launcher).toHaveCSS("top", `${storedPosition.y}px`);
      await expect(launcher).not.toHaveClass(/is-docked-(?:left|right)/);

      await page.clock.fastForward(20_000);
      await expect(launcher).toHaveCSS("left", `${storedPosition.x}px`);
      await expect(launcher).toHaveCSS("top", `${storedPosition.y}px`);
      await expect(launcher).not.toHaveClass(/is-dock/);

      const persistedPosition = await page.evaluate((key) => {
        const value = window.localStorage.getItem(key);
        return value ? (JSON.parse(value) as { x: number; y: number }) : null;
      }, positionStorageKey);
      expect(persistedPosition).toEqual(storedPosition);

      await page.clock.resume();
      await launcher.click();
      await expect(page.getByRole("button", { name: "AI 设置" })).toBeVisible();
    });

    test("keeps pointer capture while dragging the AI launcher", async ({
      page,
    }) => {
      const viewport = { width: 1_200, height: 800 };
      const positionStorageKey = "maxiong.ai.launcher-position";
      await page.setViewportSize(viewport);
      await page.goto("/");
      await page.evaluate((key) => {
        window.localStorage.setItem(key, JSON.stringify({ x: 900, y: 320 }));
      }, positionStorageKey);

      await page.reload();

      const launcher = page.locator(".ai-launcher");
      await expect(launcher).toBeVisible();
      const launcherBox = await launcher.boundingBox();
      expect(launcherBox).not.toBeNull();
      await page.mouse.move(
        launcherBox!.x + launcherBox!.width / 2,
        launcherBox!.y + launcherBox!.height / 2,
      );
      await page.mouse.down();
      await page.mouse.move(600, 400, { steps: 6 });
      await page.mouse.up();

      await expect(launcher).not.toHaveClass(/is-dock/);
      await expect(page.locator(".ai-assistant")).toHaveCount(0);
      const draggedPosition = await page.evaluate((key) => {
        const value = window.localStorage.getItem(key);
        return value ? (JSON.parse(value) as { x: number; y: number }) : null;
      }, positionStorageKey);
      expect(draggedPosition).not.toBeNull();
      expect(draggedPosition!.x).toBeGreaterThan(500);
      expect(draggedPosition!.x).toBeLessThan(600);
      expect(draggedPosition!.y).toBeGreaterThan(350);
      expect(draggedPosition!.y).toBeLessThan(400);

      await page.waitForTimeout(3_100);
      await expect(launcher).toHaveCSS("left", `${draggedPosition!.x}px`);
      await expect(launcher).toHaveCSS("top", `${draggedPosition!.y}px`);
      await expect(launcher).not.toHaveClass(/is-dock/);

      await launcher.click();
      await expect(page.getByRole("button", { name: "AI 设置" })).toBeVisible();
    });

    test("creates a project, imports and edits a PDM, generates DDL, and exports a backup", async ({
      page,
      browserName,
    }) => {
      test.setTimeout(45_000);
      const projectName = `端到端测试项目-${browserName}`;
      await page.goto("/");
      await expect(page.getByText("PDM 数据字典工作台")).toBeVisible();

      await page.getByRole("button", { name: "新建项目" }).click();
      await expect(
        page.getByRole("dialog", { name: "新建项目" }),
      ).toBeVisible();
      await page.getByPlaceholder("请输入名称").fill(projectName);
      await page.getByRole("button", { name: /确\s*定/ }).click();

      const projectNode = page
        .getByRole("treeitem")
        .filter({ hasText: projectName });
      await expect(projectNode).toBeVisible();
      await projectNode.click({ button: "right" });
      const fileChooserPromise = page.waitForEvent("filechooser");
      await page.getByText("导入 PDM", { exact: true }).click();
      const fileChooser = await fileChooserPromise;
      await fileChooser.setFiles(fixture);

      await expect(page.getByText(/已导入 1 个 PDM/)).toBeVisible();
      await projectNode.locator(".ant-tree-switcher").click();
      const pdmNode = page
        .getByRole("treeitem")
        .filter({ hasText: "sample.pdm" });
      await expect(pdmNode).toBeVisible();
      await pdmNode.click();
      await expect(page.getByRole("tab", { name: "用户表" })).toHaveCount(0);

      const searchMemoryStorageKey = "codebear.search-memory.v1";
      await page.evaluate(
        (key) => localStorage.removeItem(key),
        searchMemoryStorageKey,
      );
      const tableSearch = page.getByPlaceholder("输入表名、描述或注释");
      await tableSearch.fill("系统用户");
      await tableSearch.press("Enter");
      const tableRow = page
        .locator(".table-grid-body .data-grid-row")
        .filter({ hasText: "t_user" });
      await expect(tableRow).toBeVisible();
      await expect(page.getByRole("tab", { name: "用户表" })).toHaveCount(0);
      expect(
        await page.evaluate(
          (key) => localStorage.getItem(key),
          searchMemoryStorageKey,
        ),
      ).toBeNull();
      const tableGridBox = await page.locator(".table-list-grid").boundingBox();
      const deleteAction = page.getByRole("button", {
        name: "删除数据表 t_user",
      });
      const deleteActionBox = await deleteAction.boundingBox();
      expect(tableGridBox).not.toBeNull();
      expect(deleteActionBox).not.toBeNull();
      expect(deleteActionBox!.x).toBeGreaterThanOrEqual(tableGridBox!.x);
      expect(deleteActionBox!.x + deleteActionBox!.width).toBeLessThanOrEqual(
        tableGridBox!.x + tableGridBox!.width + 1,
      );
      const separatorStyles = await page.evaluate(() => {
        const actionCell = document.querySelector<HTMLElement>(
          ".table-grid-body .table-action-cell",
        );
        const ordinaryCell = document.querySelector<HTMLElement>(
          ".table-grid-body .table-grid-core > span",
        );
        if (!actionCell || !ordinaryCell)
          throw new Error("Table separator cells are missing");
        const actionStyle = getComputedStyle(actionCell);
        const ordinaryStyle = getComputedStyle(ordinaryCell);
        return {
          actionColor: actionStyle.borderLeftColor,
          actionWidth: actionStyle.borderLeftWidth,
          actionShadow: actionStyle.boxShadow,
          ordinaryColor: ordinaryStyle.borderRightColor,
          ordinaryWidth: ordinaryStyle.borderRightWidth,
        };
      });
      expect(separatorStyles).toEqual({
        actionColor: separatorStyles.ordinaryColor,
        actionWidth: separatorStyles.ordinaryWidth,
        actionShadow: "none",
        ordinaryColor: separatorStyles.ordinaryColor,
        ordinaryWidth: separatorStyles.ordinaryWidth,
      });

      await deleteAction.click();
      const deleteDialog = page.locator(".table-delete-modal");
      await expect(deleteDialog).toBeVisible();
      await expect(
        deleteDialog.getByText("t_user", { exact: true }),
      ).toBeVisible();
      await expect(deleteDialog.getByText("原文件自动备份")).toBeVisible();
      await captureVisual(page, "delete-confirm");
      await deleteDialog.getByRole("button", { name: /取\s*消/ }).click();
      await expect(deleteDialog).toBeHidden();

      await tableRow.click();
      await expect(page.getByText("user_name", { exact: true })).toBeVisible();
      const searchMemory = await page.evaluate((key) => {
        const value = localStorage.getItem(key);
        return value ? JSON.parse(value) : [];
      }, searchMemoryStorageKey);
      expect(searchMemory).toHaveLength(1);

      await tableSearch.press("Enter");
      await expect(tableRow).toBeVisible();
      await expect(tableRow.locator(".recent-table-badge")).toBeVisible();

      const tableTab = page.getByRole("tab", { name: "用户表" });
      const tableTabClose = page.getByRole("button", { name: "关闭 用户表" });
      await expect(tableTab).toBeVisible();
      await tableTabClose.hover();
      const tabBounds = await tableTab.locator("xpath=..").boundingBox();
      const closeBounds = await tableTabClose.boundingBox();
      expect(tabBounds).not.toBeNull();
      expect(closeBounds).not.toBeNull();
      expect(closeBounds!.x).toBeGreaterThanOrEqual(tabBounds!.x);
      expect(closeBounds!.y).toBeGreaterThanOrEqual(tabBounds!.y);
      expect(closeBounds!.x + closeBounds!.width).toBeLessThanOrEqual(
        tabBounds!.x + tabBounds!.width,
      );
      expect(closeBounds!.y + closeBounds!.height).toBeLessThanOrEqual(
        tabBounds!.y + tabBounds!.height,
      );

      await tableTab.click({ button: "right" });
      await expect(
        page.getByRole("menuitem", { name: "关闭当前" }),
      ).toBeVisible();
      await expect(
        page.getByRole("menuitem", { name: "关闭左侧" }),
      ).toBeVisible();
      await expect(
        page.getByRole("menuitem", { name: "关闭右侧" }),
      ).toBeVisible();
      await expect(
        page.getByRole("menuitem", { name: "关闭其他" }),
      ).toBeVisible();
      await expect(page.getByText("打开最近访问")).toHaveCount(0);
      await expect(page.getByText(/已打开标签/)).toHaveCount(0);
      await page.keyboard.press("Escape");
      await captureVisual(page, "table-tabs");

      await page.reload();
      await expect(page.getByText("PDM 数据字典工作台")).toBeVisible();
      const restoredPdmNode = page
        .getByRole("treeitem")
        .filter({ hasText: "sample.pdm" });
      await expect(restoredPdmNode).toBeVisible();
      await restoredPdmNode.click();
      await expect(page.getByRole("tab", { name: "用户表" })).toBeVisible();
      await expect(page.getByText("user_name", { exact: true })).toBeVisible();
      await captureVisual(page, "table-tabs-refresh");

      await page.getByRole("button", { name: "编辑字典" }).click();
      await page.getByRole("textbox", { name: "表名称" }).fill("账户用户表");
      await page
        .getByRole("textbox", { name: "表代码" })
        .fill("t_account_user");
      await page.getByRole("textbox", { name: "表描述" }).fill("端到端表描述");
      const fieldRow = page
        .locator(".field-grid-body .data-grid-row")
        .filter({ has: page.locator('input[value="user_name"]') });
      await expect(fieldRow).toBeVisible();
      await fieldRow.locator("input").last().fill("端到端备注");
      await page.getByRole("button", { name: "保存修改" }).click();
      await expect(
        page.getByText("数据字典已写回项目 PDM，原文件备份已保留"),
      ).toBeVisible();
      await expect(page.locator(".table-heading strong")).toHaveText(
        "账户用户表",
      );
      await expect(page.locator(".table-heading code")).toHaveText(
        "t_account_user",
      );
      await captureVisual(page, "workspace");

      await page.getByRole("button", { name: "打开偏好设置" }).click();
      await page.getByText("暗夜", { exact: true }).click();
      await expect
        .poll(() => page.evaluate(() => document.documentElement.dataset.theme))
        .toBe("dark");

      const darkTableTab = page.locator(
        '.table-tabs .table-tab.is-active [role="tab"]',
      );
      const darkTableTabContainer = darkTableTab.locator("xpath=..");
      const darkTableTabClose =
        darkTableTabContainer.locator(".table-tab-close");
      await expect
        .poll(() =>
          darkTableTabContainer.evaluate((element) => {
            const tabStyle = getComputedStyle(element);
            const main = element.querySelector(".table-tab-main");
            const close = element.querySelector(".table-tab-close");
            return main && close
              ? [
                  tabStyle.backgroundColor,
                  getComputedStyle(main).backgroundColor,
                  getComputedStyle(close).backgroundColor,
                ]
              : null;
          }),
        )
        .toEqual(["rgb(34, 40, 46)", "rgb(34, 40, 46)", "rgb(34, 40, 46)"]);
      const darkTabChrome = await darkTableTabContainer.evaluate((element) => {
        const tabStyle = getComputedStyle(element);
        const main = element.querySelector(".table-tab-main");
        const close = element.querySelector(".table-tab-close");
        const closeStyle = close ? getComputedStyle(close) : null;
        const afterStyle = getComputedStyle(element, "::after");
        return {
          tabBackground: tabStyle.backgroundColor,
          mainBackground: main ? getComputedStyle(main).backgroundColor : null,
          tabBorderTop: tabStyle.borderTopColor,
          tabAfter: afterStyle.backgroundColor,
          closeBackground: closeStyle?.backgroundColor,
          closeBorder: closeStyle?.border,
          closeBoxShadow: closeStyle?.boxShadow,
        };
      });
      expect(darkTabChrome).toEqual({
        tabBackground: "rgb(34, 40, 46)",
        mainBackground: "rgb(34, 40, 46)",
        tabBorderTop: "rgba(0, 0, 0, 0)",
        tabAfter: "rgba(0, 0, 0, 0)",
        closeBackground: "rgb(34, 40, 46)",
        closeBorder: "0px none rgba(0, 0, 0, 0)",
        closeBoxShadow: "none",
      });
      await darkTableTabClose.hover();
      await expect(darkTableTabClose).toHaveCSS(
        "background-color",
        "rgb(34, 40, 46)",
      );
      await captureVisual(page, "dark-table-tab-close");

      await page.getByRole("button", { name: "搜索设置" }).click();
      const darkClearSearchMemory = page.locator(".table-search-clear-button");
      await expect(darkClearSearchMemory).toBeVisible();
      await expect(darkClearSearchMemory).toHaveCSS(
        "color",
        "rgb(184, 192, 202)",
      );
      await expect(darkClearSearchMemory).toHaveCSS(
        "border-color",
        "rgb(44, 51, 59)",
      );
      await expect(darkClearSearchMemory).toHaveCSS(
        "background-color",
        "rgba(0, 0, 0, 0)",
      );
      await captureVisual(page, "dark-search-memory-clear");
      await page.keyboard.press("Escape");

      const darkDeleteAction = page
        .locator(
          '.table-grid-body .table-action-cell button[aria-label^="删除数据表"]',
        )
        .first();
      await darkDeleteAction.click();
      const darkDeleteDialog = page.locator(".table-delete-modal");
      await expect(darkDeleteDialog).toBeVisible();
      const backupNote = darkDeleteDialog.locator(".table-delete-backup-note");
      await expect(backupNote).toHaveCSS("background-color", "rgb(32, 37, 43)");
      await expect(backupNote.locator("strong")).toHaveCSS(
        "color",
        "rgb(241, 243, 245)",
      );
      await expect(backupNote.locator("small")).toHaveCSS(
        "color",
        "rgb(241, 243, 245)",
      );
      await expect(
        darkDeleteDialog.locator(".table-delete-target code"),
      ).toHaveCSS("color", "rgb(241, 243, 245)");
      await darkDeleteDialog.getByRole("button", { name: /取\s*消/ }).click();
      await expect(darkDeleteDialog).toBeHidden();

      await page.getByRole("button", { name: "导出 SQL" }).click();
      const ddlDialog = page
        .getByRole("dialog")
        .filter({ hasText: "导出建表脚本" });
      await expect(ddlDialog).toBeVisible();
      const ddlClose = ddlDialog.locator(".ant-modal-close");
      await ddlClose.hover();
      await expect(ddlClose).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
      const ddlTarget = ddlDialog.locator(".ddl-title-flow > span.is-target");
      await expect(ddlTarget).toHaveCSS("background-color", "rgb(32, 37, 43)");
      await expect(ddlTarget).toHaveCSS("border-color", "rgb(44, 51, 59)");
      await expect(ddlTarget).toHaveCSS("color", "rgb(184, 192, 202)");
      await ddlDialog.getByRole("combobox", { name: "目标数据库" }).click();
      await expect(page.locator(".ddl-database-option b").first()).toHaveCSS(
        "color",
        "rgb(241, 243, 245)",
      );
      await expect(page.locator(".ddl-database-logo").first()).toHaveCSS(
        "background-color",
        "rgba(0, 0, 0, 0)",
      );
      await page.keyboard.press("Escape");
      await ddlDialog.getByRole("button", { name: "生成脚本" }).click();
      await expect(ddlDialog.getByText(/生成完成 · 1 张表/)).toBeVisible();
      await expect(ddlDialog.locator(".cm-content")).toContainText(
        "CREATE TABLE",
      );
      await captureVisual(page, "ddl");
      await ddlClose.click();
      await expect(ddlDialog).toBeHidden();

      await page.locator(".ai-launcher").click();
      const aiClose = page.locator(".ai-assistant-close");
      await expect(aiClose).toBeVisible();
      await aiClose.hover();
      await expect(aiClose).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
      await aiClose.click();

      await page.getByRole("button", { name: "备份迁移" }).click();
      const backupDialog = page
        .getByRole("dialog")
        .filter({ hasText: "备份与迁移" });
      await expect(backupDialog).toBeVisible();
      await captureVisual(page, "backup");
      const downloadPromise = page.waitForEvent("download");
      await backupDialog
        .getByRole("button", { name: "导出 .cbbak 备份包" })
        .click();
      const download = await downloadPromise;
      expect(download.suggestedFilename()).toMatch(/\.cbbak$/);
      const backupPath = await download.path();
      expect(backupPath).not.toBeNull();

      await backupDialog.getByRole("tab", { name: "导入 / 迁移" }).click();
      const backupChooserPromise = page.waitForEvent("filechooser");
      await backupDialog.getByRole("button", { name: "选择 .cbbak" }).click();
      const backupChooser = await backupChooserPromise;
      await backupChooser.setFiles({
        name: download.suggestedFilename(),
        mimeType: "application/octet-stream",
        buffer: await readFile(backupPath!),
      });
      await expect(backupDialog.getByText("确认迁移内容")).toBeVisible();
      const dictionaryReceipt = backupDialog.locator(
        ".backup-dictionary-receipt",
      );
      if (await dictionaryReceipt.count()) {
        await expect(dictionaryReceipt.locator("b")).toHaveCSS(
          "color",
          "rgb(241, 243, 245)",
        );
      }

      await page.route("**/api/backups/import", async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 1_200));
        await route.continue();
      });
      await backupDialog
        .getByRole("button", { name: "开始导入所选节点" })
        .click();

      const importProgress = backupDialog.getByRole("progressbar", {
        name: "备份导入进度",
      });
      await expect(importProgress).toBeVisible();
      await expect(importProgress).toContainText(/\d+%/);
      await expect(importProgress).toHaveCSS(
        "background-color",
        "rgb(20, 23, 27)",
      );
      await expect(importProgress).toHaveCSS("box-shadow", "none");
      const refreshWasBlocked = await page.evaluate(
        () =>
          !window.dispatchEvent(
            new Event("beforeunload", { cancelable: true }),
          ),
      );
      expect(refreshWasBlocked).toBe(true);
      const firstProgress = Number(
        await importProgress.getAttribute("aria-valuenow"),
      );
      await page.waitForTimeout(450);
      const nextProgress = Number(
        await importProgress.getAttribute("aria-valuenow"),
      );
      expect(nextProgress).toBeGreaterThan(firstProgress);
      await captureVisual(page, "backup-progress");

      await expect(backupDialog).toBeHidden();
      await expect(page.getByText(/已导入 1 个 PDM/)).toBeVisible();
      const refreshIsAllowed = await page.evaluate(() =>
        window.dispatchEvent(new Event("beforeunload", { cancelable: true })),
      );
      expect(refreshIsAllowed).toBe(true);
    });

    test("keeps the sidebar layout in sync while resizing", async ({
      page,
    }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto("/");

      const root = page.locator(".app-root");
      const navigator = page.locator(".project-navigator");
      const resizer = page.locator(".sidebar-resizer");
      const box = await resizer.boundingBox();
      expect(box).not.toBeNull();
      await page.mouse.move(box!.x + box!.width / 2, box!.y + 120);
      await page.mouse.down();
      await page.mouse.move(box!.x + box!.width / 2 + 80, box!.y + 120);

      await expect
        .poll(() =>
          resizer.evaluate((element) => ({
            transform: (element as HTMLElement).style.transform,
            width: element.getAttribute("aria-valuenow"),
            liveWidth: (
              element.closest(".app-root") as HTMLElement
            ).style.getPropertyValue("--sidebar-width"),
          })),
        )
        .toEqual({ transform: "", width: "409", liveWidth: "409px" });
      expect(
        await navigator.evaluate(
          (element) => element.getBoundingClientRect().width,
        ),
      ).toBe(409);
      expect(
        await root.evaluate((element) =>
          (element as HTMLElement).style.getPropertyValue("--sidebar-width"),
        ),
      ).toBe("409px");

      await page.mouse.up();
      await expect
        .poll(() =>
          resizer.evaluate(
            (element) => (element as HTMLElement).style.transform,
          ),
        )
        .toBe("");
      await expect
        .poll(() =>
          navigator.evaluate(
            (element) => element.getBoundingClientRect().width,
          ),
        )
        .toBe(409);
      await expect(root).toHaveCSS("--sidebar-width", "409px");
    });

    test("keeps an inactive dark table-tab close hover uniform", async ({
      page,
    }) => {
      await page.addInitScript(() => {
        const codes = [
          "INF_ISSUER_CREDIT",
          "CFG_CASH_ACC_INFO",
          "CFG_SEC_COEFF_DEFAULT",
        ];
        const tabs = codes.map((code, index) => ({
          id: `hover-demo-${index}`,
          name: code,
          code,
          project_id: "project",
          project_name: "Project",
          pdm_id: "pdm",
          relative_path: "sample.pdm",
        }));
        window.localStorage.setItem(
          "codebear.open-table-tabs.v1",
          JSON.stringify({ tabs, activeTableId: tabs[2].id }),
        );
        window.localStorage.setItem("codebear.theme-mode.v1", "dark");
      });
      await page.goto("/");

      const tabStrip = page.locator(".table-tabs-scroll");
      await tabStrip.evaluate((element) => {
        element.style.maxWidth = "260px";
        element.scrollLeft = 0;
      });
      await expect
        .poll(() =>
          tabStrip.evaluate(
            (element) => element.scrollWidth > element.clientWidth,
          ),
        )
        .toBe(true);
      await tabStrip.hover({ position: { x: 100, y: 15 } });
      await page.mouse.wheel(0, 120);
      await expect
        .poll(() => tabStrip.evaluate((element) => element.scrollLeft))
        .toBeGreaterThan(0);
      await captureVisual(page, "dark-table-tab-wheel-scroll");

      const inactiveTab = page
        .locator(".table-tabs .table-tab:not(.is-active)")
        .nth(1);
      const inactiveMain = inactiveTab.locator(".table-tab-main");
      const inactiveClose = inactiveTab.locator(".table-tab-close");
      const expectedChrome = {
        tabsBackground: "rgb(20, 23, 27)",
        tabBackground: "rgb(20, 23, 27)",
        mainBackground: "rgb(20, 23, 27)",
        closeBackground: "rgb(20, 23, 27)",
        closeBorderWidth: "0px",
        closeBoxShadow: "none",
        closeOutlineStyle: "none",
        closeTransitionDuration: "0s",
      };
      const readChrome = () =>
        inactiveTab.evaluate((element) => {
          const tabs = element.closest(".table-tabs");
          const main = element.querySelector(".table-tab-main");
          const close = element.querySelector(".table-tab-close");
          if (!tabs || !main || !close) return null;
          const closeStyle = getComputedStyle(close);
          return {
            tabsBackground: getComputedStyle(tabs).backgroundColor,
            tabBackground: getComputedStyle(element).backgroundColor,
            mainBackground: getComputedStyle(main).backgroundColor,
            closeBackground: closeStyle.backgroundColor,
            closeBorderWidth: closeStyle.borderTopWidth,
            closeBoxShadow: closeStyle.boxShadow,
            closeOutlineStyle: closeStyle.outlineStyle,
            closeTransitionDuration: closeStyle.transitionDuration,
          };
        });

      await expect(inactiveTab).toBeVisible();
      await expect(inactiveClose).not.toHaveClass(/ant-btn/);
      await inactiveMain.hover();
      await expect.poll(readChrome).toEqual(expectedChrome);
      await captureVisual(page, "dark-table-tab-main-hover");

      await inactiveClose.hover();
      await expect.poll(readChrome).toEqual(expectedChrome);
      await captureVisual(page, "dark-table-tab-close-hover");

      const activeClose = page.locator(
        ".table-tabs .table-tab.is-active .table-tab-close",
      );
      const activeCloseBox = await activeClose.boundingBox();
      expect(activeCloseBox).not.toBeNull();
      await page.mouse.move(
        activeCloseBox!.x + activeCloseBox!.width / 2,
        activeCloseBox!.y + activeCloseBox!.height / 2,
      );
      await page.mouse.down();
      await expect
        .poll(() =>
          activeClose.evaluate((element) => {
            const style = getComputedStyle(element);
            return {
              background: style.backgroundColor,
              border: style.borderTopWidth,
              boxShadow: style.boxShadow,
              outline: style.outlineStyle,
              transitionDuration: style.transitionDuration,
            };
          }),
        )
        .toEqual({
          background: "rgb(34, 40, 46)",
          border: "0px",
          boxShadow: "none",
          outline: "none",
          transitionDuration: "0s",
        });
      await captureVisual(page, "dark-table-tab-close-pressed");
      await page.mouse.move(1, 1);
      await page.mouse.up();
    });
  });
