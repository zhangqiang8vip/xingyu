import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("content, settings and view data are persisted in D1", async () => {
  const [schema, bootstrap, settingsRoute, pageRoute, viewRoute] = await Promise.all([
    source("db/schema.ts"), source("db/bootstrap.ts"), source("app/api/settings/route.ts"),
    source("app/api/pages/[slug]/route.ts"), source("app/api/views/[slug]/route.ts"),
  ]);
  assert.match(schema, /siteSettings = sqliteTable\("site_settings"/);
  assert.match(schema, /contentPages = sqliteTable\("content_pages"/);
  assert.match(schema, /postViews = sqliteTable\("post_views"/);
  assert.match(bootstrap, /CREATE TABLE IF NOT EXISTS site_settings/);
  assert.match(bootstrap, /CREATE TABLE IF NOT EXISTS content_pages/);
  assert.doesNotMatch(bootstrap, /archiveSeeds|seedContent|headingShowcaseContent/);
  assert.match(settingsRoute, /isAdminRequest/);
  assert.match(pageRoute, /isAdminRequest/);
  assert.match(viewRoute, /INSERT OR IGNORE INTO post_views/);
  assert.match(viewRoute, /view_count = view_count \+ 1/);
});

test("development and production content stay on isolated databases", async () => {
  const [viteConfig, bootstrap, packageJson] = await Promise.all([
    source("vite.config.ts"), source("db/bootstrap.ts"), source("package.json"),
  ]);
  assert.match(viteConfig, /APP_ENV: appEnvironment/);
  assert.match(viteConfig, /xingyu-development/);
  assert.match(viteConfig, /xingyu-production-preview/);
  assert.match(bootstrap, /app_environment/);
  assert.doesNotMatch(bootstrap, /INSERT(?:\s+OR\s+\w+)?\s+INTO\s+posts\s*\(/i);
  assert.match(packageJson, /dev:production/);
});

test("article routes use stable public ids and retain historical slugs", async () => {
  const [schema, bootstrap, createRoute, updateRoute, postWrite, legacyPage, stablePage, pathHelper] = await Promise.all([
    source("db/schema.ts"), source("db/bootstrap.ts"), source("app/api/posts/route.ts"),
    source("app/api/posts/[id]/route.ts"), source("db/post-write.ts"), source("app/posts/[slug]/page.tsx"),
    source("app/posts/[slug]/[canonicalSlug]/page.tsx"), source("app/post-path.ts"),
  ]);
  assert.match(schema, /publicId: text\("public_id"\)/);
  assert.match(schema, /postSlugHistory/);
  assert.match(bootstrap, /postsWithoutPublicId/);
  assert.match(createRoute, /createPostRecord/);
  assert.match(updateRoute, /updatePostRecord/);
  assert.match(postWrite, /createPostPublicId\(\)/);
  assert.match(postWrite, /insert\(postSlugHistory\)/);
  assert.match(legacyPage, /permanentRedirect\(postPath\(post\)\)/);
  assert.match(stablePage, /canonicalSlug !== post\.slug/);
  assert.match(pathHelper, /post\.publicId/);
});

test("public pages consume editable settings and shared presentation helpers", async () => {
  const [home, about, post, layout, admin, navigation, contentUtils] = await Promise.all([
    source("app/page.tsx"), source("app/about/page.tsx"), source("app/posts/PostPageView.tsx"),
    source("app/layout.tsx"), source("app/admin/AdminClient.tsx"), source("app/SiteNavigation.tsx"),
    source("app/content-utils.ts"),
  ]);
  assert.match(home, /getSiteSettings/);
  assert.match(home, /settings\.homePostLimit/);
  assert.match(home, /estimateReadingMinutes\(featured\.content\)/);
  assert.match(contentUtils, /const longDateFormatter = new Intl\.DateTimeFormat/);
  assert.match(contentUtils, /export function estimateReadingMinutes/);
  assert.match(home, /<SiteNavigation/);
  assert.match(about, /<SiteNavigation/);
  assert.match(post, /<SiteNavigation/);
  assert.match(navigation, /<ReadingModeToggle \/>/);
  assert.match(about, /getContentPage\("about"\)/);
  assert.match(about, /MarkdownRenderer/);
  assert.match(post, /PostViewTracker/);
  assert.match(layout, /generateMetadata/);
  assert.match(admin, /AdminPageEditor/);
  assert.match(admin, /AdminSettingsPanel/);
  assert.match(admin, /AdminCategoriesPanel/);
  assert.doesNotMatch(admin, /数据模式<\/span><b>海量|<b>∞<\/b>/);
});

test("published article edits preserve their publication date", async () => {
  const postWrite = await source("db/post-write.ts");
  assert.match(postWrite, /current\[0\]\.publishedAt/);
  assert.match(postWrite, /input\.publishedAt \?\? current\[0\]\.publishedAt \?\? new Date\(\)\.toISOString\(\)/);
});

test("remote MCP separates read approvals from important writes and records receipts", async () => {
  const [mcp, schema, bootstrap, activity] = await Promise.all([
    source("worker/blog-mcp.ts"), source("db/schema.ts"), source("db/bootstrap.ts"),
    source("db/mcp-activity.ts"),
  ]);
  assert.match(mcp, /server\.registerTool\("list_mcp_activity"/);
  assert.match(mcp, /server\.registerTool\("get_page"/);
  assert.match(mcp, /server\.registerTool\("update_page"/);
  assert.match(mcp, /change_summary: CHANGE_SUMMARY_SCHEMA/);
  assert.match(mcp, /destructiveHint: true, idempotentHint: true, openWorldHint: true/);
  assert.match(mcp, /activityReceipt\("publish_post"/);
  assert.match(mcp, /没有检测到内容变化，未执行写入/);
  assert.match(schema, /mcpActivity = sqliteTable\("mcp_activity"/);
  assert.match(bootstrap, /CREATE TABLE IF NOT EXISTS mcp_activity/);
  assert.match(activity, /recordMcpActivity/);
  assert.match(activity, /recordMcpPageActivity/);
  assert.match(activity, /listMcpActivity/);
});

test("editor assets and post parsing stay scoped to their owners", async () => {
  const [rootLayout, adminLayout, postRoute, postInput, categoriesRoute, editor, transitions] = await Promise.all([
    source("app/layout.tsx"), source("app/admin/layout.tsx"), source("app/api/posts/route.ts"),
    source("app/api/posts/post-input.ts"), source("app/api/categories/route.ts"),
    source("app/admin/VditorEditor.tsx"), source("app/RouteTransition.tsx"),
  ]);
  assert.doesNotMatch(rootLayout, /vditor\/index\.css/);
  assert.match(adminLayout, /\/vditor\/dist\/index\.css/);
  assert.doesNotMatch(adminLayout, /import "vditor\/dist/);
  assert.match(postRoute, /parsePostPayload/);
  assert.match(postInput, /export function slugify/);
  assert.match(categoriesRoute, /posts\/post-input/);
  assert.match(editor, /await import\("vditor"\)/);
  assert.match(transitions, /const HTMLFlipBook = lazy\(loadFlipBook\)/);
});

test("admin search cancels stale work and avoids refetching stable stats", async () => {
  const admin = await source("app/admin/AdminClient.tsx");
  assert.match(admin, /const controller = new AbortController\(\)/);
  assert.match(admin, /load\(controller\.signal\)/);
  assert.match(admin, /const loadStats = useCallback/);
  assert.match(admin, /Promise\.all\(\[load\(\), loadStats\(\)\]\)/);
});

test("admin previews unsaved content through the real public pages", async () => {
  const [admin, homeSettings, aboutEditor, studio, previewEntry, vditor, livePreview, bridge, postPage] = await Promise.all([
    source("app/admin/AdminClient.tsx"), source("app/admin/AdminSettingsPanel.tsx"),
    source("app/admin/AdminPageEditor.tsx"), source("app/admin/ArticleWritingStudio.tsx"),
    source("app/admin/article-preview/page.tsx"), source("app/admin/VditorEditor.tsx"), source("app/admin/AdminLivePreview.tsx"),
    source("app/AdminPreviewBridge.tsx"), source("app/posts/PostPageView.tsx"),
  ]);
  assert.ok(admin.indexOf("首页设置") < admin.indexOf("文章管理"));
  assert.ok(admin.indexOf("文章管理") < admin.indexOf("接入设置"));
  assert.ok(admin.indexOf("接入设置") < admin.indexOf("关于设置"));
  assert.match(homeSettings, /HomeLivePreview settings=\{form\}/);
  assert.match(aboutEditor, /ContentPageLivePreview page=\{form\}/);
  assert.match(admin, /setStudio\("reading"\)/);
  assert.match(admin, /ArticleFrontstage/);
  assert.match(admin, /useSplitScrollSync/);
  assert.match(admin, /articleEditorPreviewRef/);
  assert.match(admin, /previewMode="editor"/);
  assert.match(admin, /onClick=\{\(\) => preview\(post\)\}/);
  assert.match(admin, /setStudio\("split"\)/);
  assert.match(studio, /type Mode="code"\|"split"\|"reading"/);
  assert.match(studio, /writing-frontstage-frame/);
  assert.match(studio, /export function ArticleFrontstage/);
  assert.match(studio, /article-preview\?draft=/);
  assert.match(studio, /key=\{draft\.publicId \?\? draft\.id/);
  assert.match(studio, /onSourceScroll/);
  assert.match(studio, /onFrameScroll/);
  assert.match(studio, /autoFocus/);
  assert.match(vditor, /preventScroll:true/);
  assert.match(previewEntry, /id:-1/);
  assert.match(previewEntry, /正在预览草稿/);
  assert.doesNotMatch(previewEntry, /listHomePosts/);
  assert.match(livePreview, /src="\/\?adminPreview=home"/);
  assert.match(livePreview, /kind==="about"/);
  assert.match(livePreview, /kind:\s*"about"\|"connect"/);
  assert.match(bridge, /createPortal/);
  assert.match(bridge, /MarkdownRenderer/);
  assert.match(postPage, /AdminPreviewBridge kind="article"/);
  assert.match(vditor, /previewMode="both"/);
});

test("Markdown Plus is rendered through one safe, shared pipeline", async () => {
  const [renderer, mermaid, post, modal, bridge, packageJson] = await Promise.all([
    source("app/MarkdownRenderer.tsx"), source("app/MarkdownMermaid.tsx"),
    source("app/posts/PostPageView.tsx"), source("app/ModalPostLink.tsx"), source("app/AdminPreviewBridge.tsx"),
    source("package.json"),
  ]);
  assert.match(renderer, /remarkMath/);
  assert.match(renderer, /remarkDirective/);
  assert.match(renderer, /rehypeRaw/);
  assert.match(renderer, /rehypeSanitize/);
  assert.match(renderer, /rehypeKatex/);
  assert.match(renderer, /MarkdownMermaid/);
  assert.match(mermaid, /import\("mermaid"\)/);
  assert.doesNotMatch(mermaid, /cdn\.jsdelivr/);
  assert.match(post, /MarkdownRenderer/);
  assert.match(modal, /MarkdownRenderer/);
  assert.match(bridge, /MarkdownRenderer/);
  assert.match(packageJson, /"deploy:production": "npm run build && wrangler deploy --config wrangler\.production\.jsonc"/);
});

test("admin and markdown editor share the site theme palette", async () => {
  const [styles,editor,toggle]=await Promise.all([
    source("app/globals.css"),source("app/admin/VditorEditor.tsx"),source("app/ThemeToggle.tsx"),
  ]);
  assert.match(styles,/--admin-canvas:/);
  assert.match(styles,/--admin-panel:/);
  assert.match(styles,/\.vditor-host\.vditor\{/);
  assert.match(styles,/--panel-background-color:var\(--admin-panel\)/);
  assert.match(styles,/The admin navigation belongs to the active appearance/);
  assert.match(styles,/html\[data-theme="dark"\] \.admin-sidebar/);
  assert.match(editor,/vditor--dark/);
  assert.match(editor,/MutationObserver/);
  assert.match(editor,/vditorMermaidScript/);
  assert.match(editor,/wrappingWidth: 280/);
  assert.match(toggle,/xingyu:theme-change/);
});
