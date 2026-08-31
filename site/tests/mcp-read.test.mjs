import assert from "node:assert/strict";
import test from "node:test";
import { extractMarkdownOutline, postReadHint, searchPostCard } from "../worker/mcp/post-read.ts";

const sample = {
  publicId: "01TEST",
  title: "Git 常用命令",
  slug: "git-common-commands",
  excerpt: "先搞懂工作区再记命令。",
  status: "published",
  categoryName: "开发手记",
  featured: false,
  publishedAt: "2026-08-14T00:00:00.000Z",
  updatedAt: "2026-08-14T00:00:00.000Z",
  spaceId: null,
  spacePath: null,
};

test("search cards stay slim unless summary is requested", () => {
  const minimal = searchPostCard(sample, "https://zhangwansen.click", "minimal");
  assert.equal(minimal.public_id, "01TEST");
  assert.equal(minimal.title, "Git 常用命令");
  assert.equal(minimal.excerpt, undefined);
  assert.equal(minimal.updated_at, undefined);
  const summary = searchPostCard(sample, "https://zhangwansen.click", "summary");
  assert.equal(summary.excerpt, sample.excerpt);
  assert.equal(summary.updated_at, sample.updatedAt);
});

test("markdown outline skips fenced code and keeps heading levels", () => {
  const outline = extractMarkdownOutline([
    "# 标题",
    "",
    "```md",
    "## 代码里的标题",
    "```",
    "## 第二节",
    "### 细节",
    "正文",
  ].join("\n"));
  assert.deepEqual(outline, [
    { level: 1, text: "标题" },
    { level: 2, text: "第二节" },
    { level: 3, text: "细节" },
  ]);
});

test("non-content views remind the client to fetch the full article later", () => {
  assert.match(postReadHint("outline"), /view=content/);
  assert.equal(postReadHint("content"), null);
});
