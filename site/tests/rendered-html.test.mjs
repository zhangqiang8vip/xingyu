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
  assert.match(about, /ReactMarkdown/);
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
  const [admin, homeSettings, aboutEditor, studio, vditor, livePreview, bridge, postPage] = await Promise.all([
    source("app/admin/AdminClient.tsx"), source("app/admin/AdminSettingsPanel.tsx"),
    source("app/admin/AdminPageEditor.tsx"), source("app/admin/ArticleWritingStudio.tsx"),
    source("app/admin/VditorEditor.tsx"), source("app/admin/AdminLivePreview.tsx"),
    source("app/AdminPreviewBridge.tsx"), source("app/posts/PostPageView.tsx"),
  ]);
  assert.ok(admin.indexOf("首页设置") < admin.indexOf("文章管理"));
  assert.ok(admin.indexOf("文章管理") < admin.indexOf("关于设置"));
  assert.match(homeSettings, /HomeLivePreview settings=\{form\}/);
  assert.match(aboutEditor, /AboutLivePreview page=\{form\}/);
  assert.match(admin, /setStudio\("reading"\)/);
  assert.match(admin, /setStudio\("split"\)/);
  assert.match(studio, /type Mode="code"\|"split"\|"reading"/);
  assert.match(studio, /writing-frontstage-frame/);
  assert.match(studio, /adminPreview=article/);
  assert.match(studio, /admin\/article-preview/);
  assert.match(livePreview, /src="\/\?adminPreview=home"/);
  assert.match(livePreview, /src="\/about\?adminPreview=about"/);
  assert.match(bridge, /createPortal/);
  assert.match(bridge, /ReactMarkdown/);
  assert.match(postPage, /AdminPreviewBridge kind="article"/);
  assert.match(vditor, /previewMode="both"/);
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
  assert.match(toggle,/xingyu:theme-change/);
});
