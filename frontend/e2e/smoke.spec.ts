import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const fixture = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "sample.pdm");
const visualPrefix = process.env.CODEBEAR_VISUAL_PREFIX;
const visualOutput = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "output", "playwright");

async function captureVisual(page: import("@playwright/test").Page, name: string): Promise<void> {
  if (!visualPrefix) return;
  await page.screenshot({
    path: path.join(visualOutput, `${visualPrefix}-${name}.png`),
    animations: "disabled",
    fullPage: true,
  });
}

test.describe.serial("CodeBear workspace smoke tests", () => {
  test("defers AI requests until the assistant is opened", async ({ page }) => {
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
    await expect(page.getByRole("button", { name: "打开 雪球" })).toBeVisible();
    await expect(page.locator('.ai-launcher [data-accessory="red_cap"]')).toBeVisible();

    await page.reload();
    await expect(page.getByText("本机工作区已连接")).toBeVisible();
    await expect.poll(() => aiRequests.length).toBe(0);
    await expect(page.getByRole("button", { name: "打开 雪球" })).toBeVisible();
    await expect(page.locator('.ai-launcher [data-accessory="red_cap"]')).toBeVisible();

    await page.getByRole("button", { name: "打开 雪球" }).click();
    await expect(page.getByRole("button", { name: "AI 设置" })).toBeVisible();
    await expect.poll(() => aiRequests.length).toBeGreaterThan(0);
    await captureVisual(page, "ai");
    await page.getByRole("button", { name: "收起 AI 助手" }).click();
  });

  test("creates a project, imports and edits a PDM, generates DDL, and exports a backup", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("PDM 数据字典工作台")).toBeVisible();

    await page.getByRole("button", { name: "新建项目" }).click();
    await expect(page.getByRole("dialog", { name: "新建项目" })).toBeVisible();
    await page.getByPlaceholder("请输入名称").fill("端到端测试项目");
    await page.getByRole("button", { name: /确\s*定/ }).click();

    const projectNode = page.getByRole("treeitem").filter({ hasText: "端到端测试项目" });
    await expect(projectNode).toBeVisible();
    await projectNode.click({ button: "right" });
    const fileChooserPromise = page.waitForEvent("filechooser");
    await page.getByText("导入 PDM", { exact: true }).click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(fixture);

    await expect(page.getByText(/已导入 1 个 PDM/)).toBeVisible();
    await projectNode.locator(".ant-tree-switcher").click();
    const pdmNode = page.getByRole("treeitem").filter({ hasText: "sample.pdm" });
    await expect(pdmNode).toBeVisible();
    await pdmNode.click();

    const tableSearch = page.getByPlaceholder("输入表名、描述或注释");
    await tableSearch.fill("系统用户");
    await tableSearch.press("Enter");
    const tableRow = page.locator(".table-grid-body .data-grid-row").filter({ hasText: "t_user" });
    await expect(tableRow).toBeVisible();
    await tableRow.click();
    await expect(page.getByText("user_name", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "编辑字典" }).click();
    await page.getByRole("textbox", { name: "表名称" }).fill("账户用户表");
    await page.getByRole("textbox", { name: "表代码" }).fill("t_account_user");
    await page.getByRole("textbox", { name: "表描述" }).fill("端到端表描述");
    const fieldRow = page.locator(".field-grid-body .data-grid-row").filter({ has: page.locator('input[value="user_name"]') });
    await expect(fieldRow).toBeVisible();
    await fieldRow.locator("input").last().fill("端到端备注");
    await page.getByRole("button", { name: "保存修改" }).click();
    await expect(page.getByText("数据字典已写回项目 PDM，原文件备份已保留")).toBeVisible();
    await expect(page.locator(".table-heading strong")).toHaveText("账户用户表");
    await expect(page.locator(".table-heading code")).toHaveText("t_account_user");
    await captureVisual(page, "workspace");

    await page.getByRole("button", { name: "导出 SQL" }).click();
    const ddlDialog = page.getByRole("dialog").filter({ hasText: "导出建表脚本" });
    await expect(ddlDialog).toBeVisible();
    await ddlDialog.getByRole("button", { name: "生成脚本" }).click();
    await expect(ddlDialog.getByText(/生成完成 · 1 张表/)).toBeVisible();
    await expect(ddlDialog.locator(".cm-content")).toContainText("CREATE TABLE");
    await captureVisual(page, "ddl");
    await page.keyboard.press("Escape");
    await expect(ddlDialog).toBeHidden();

    await page.getByRole("button", { name: "备份迁移" }).click();
    const backupDialog = page.getByRole("dialog").filter({ hasText: "备份与迁移" });
    await expect(backupDialog).toBeVisible();
    await captureVisual(page, "backup");
    const downloadPromise = page.waitForEvent("download");
    await backupDialog.getByRole("button", { name: "导出 .cbbak 备份包" }).click();
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

    await page.route("**/api/backups/import", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1_200));
      await route.continue();
    });
    await backupDialog.getByRole("button", { name: "开始导入所选节点" }).click();

    const importProgress = backupDialog.getByRole("progressbar", { name: "备份导入进度" });
    await expect(importProgress).toBeVisible();
    await expect(importProgress).toContainText(/\d+%/);
    const refreshWasBlocked = await page.evaluate(() => (
      !window.dispatchEvent(new Event("beforeunload", { cancelable: true }))
    ));
    expect(refreshWasBlocked).toBe(true);
    const firstProgress = Number(await importProgress.getAttribute("aria-valuenow"));
    await page.waitForTimeout(450);
    const nextProgress = Number(await importProgress.getAttribute("aria-valuenow"));
    expect(nextProgress).toBeGreaterThan(firstProgress);
    await captureVisual(page, "backup-progress");

    await expect(backupDialog).toBeHidden();
    await expect(page.getByText(/已导入 1 个 PDM/)).toBeVisible();
    const refreshIsAllowed = await page.evaluate(() => (
      window.dispatchEvent(new Event("beforeunload", { cancelable: true }))
    ));
    expect(refreshIsAllowed).toBe(true);
  });
});
