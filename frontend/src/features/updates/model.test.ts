import { describe, expect, it } from "vitest";
import { formatPublishedAt, releaseNotesHtml, versionLabel } from "./model";

describe("updates model", () => {
  it("renders headings, lists, bold and code", () => {
    const html = releaseNotesHtml(
      "# 码熊 v1.2.0\n\n- 修复 **重要** 问题\n- 支持 `组合键`\n\n1. 第一步\n2. 第二步\n",
    );
    expect(html).toContain("<h1>码熊 v1.2.0</h1>");
    expect(html).toContain("<ul>");
    expect(html).toContain("<li>修复 <strong>重要</strong> 问题</li>");
    expect(html).toContain("<li>支持 <code>组合键</code></li>");
    expect(html).toContain("<ol>");
    expect(html).toContain("<li>第一步</li>");
  });

  it("renders code fences without escaping their content", () => {
    const html = releaseNotesHtml("```powershell\nGet-FileHash .\\a.zip\n```\n");
    expect(html).toContain("<pre><code>Get-FileHash .\\a.zip</code></pre>");
  });

  it("escapes raw html and blocks javascript links", () => {
    const html = releaseNotesHtml("小心 <script>alert(1)</script> 与 [点我](javascript:alert(1))");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain('href="javascript');
  });

  it("keeps safe https links", () => {
    const html = releaseNotesHtml("[更新记录](https://github.com/Eco1i/CodeBear/blob/main/CHANGELOG.md)");
    expect(html).toContain(
      '<a href="https://github.com/Eco1i/CodeBear/blob/main/CHANGELOG.md" target="_blank" rel="noreferrer">更新记录</a>',
    );
  });

  it("formats published date and version labels", () => {
    expect(formatPublishedAt("2026-08-15T00:00:00Z")).toBe("2026-08-15");
    expect(formatPublishedAt("not a date")).toBe("");
    expect(versionLabel("1.2.0")).toBe("v1.2.0");
    expect(versionLabel("v1.2.0")).toBe("v1.2.0");
  });
});
