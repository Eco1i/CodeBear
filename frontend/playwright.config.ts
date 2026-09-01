/// <reference types="node" />

import { defineConfig, devices } from "@playwright/test";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const frontendRoot = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(frontendRoot, "..");
const bundledPython =
  process.platform === "win32"
    ? path.join(repositoryRoot, ".venv", "Scripts", "python.exe")
    : path.join(repositoryRoot, ".venv", "bin", "python");
const python = existsSync(bundledPython) ? bundledPython : "python";
const appData = path.join(
  repositoryRoot,
  "output",
  "playwright",
  `app-data-${process.pid}`,
);
const forcedDeviceScaleFactor = process.env.CODEBEAR_E2E_DEVICE_SCALE_FACTOR;

export default defineConfig({
  testDir: "./e2e",
  outputDir: path.join(repositoryRoot, "output", "playwright", "test-results"),
  timeout: 30_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://127.0.0.1:5173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: forcedDeviceScaleFactor
          ? {
              args: [`--force-device-scale-factor=${forcedDeviceScaleFactor}`],
            }
          : undefined,
      },
    },
    {
      name: "webkit",
      use: { ...devices["Desktop Safari"] },
    },
  ],
  webServer: [
    {
      command: `"${python}" -X utf8 -m uvicorn backend.app.main:app --app-dir "${repositoryRoot}" --host 127.0.0.1 --port 8000`,
      url: "http://127.0.0.1:8000/api/health",
      reuseExistingServer: false,
      env: { MAXIONG_APP_DATA_DIR: appData },
      timeout: 30_000,
    },
    {
      command: "npm run dev -- --port 5173",
      url: "http://127.0.0.1:5173",
      reuseExistingServer: false,
      timeout: 30_000,
    },
  ],
});
