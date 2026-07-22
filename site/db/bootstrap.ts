import { env } from "cloudflare:workers";
import { DEFAULT_ABOUT_PAGE, DEFAULT_SITE_SETTINGS } from "../app/site-config";

let ready: Promise<void> | null = null;

export function ensureDatabase() {
  // Reuse schema initialization inside a worker, but allow recovery after a transient D1 failure.
  ready ??= initialize().catch((error) => {
    ready = null;
    throw error;
  });
  return ready;
}

async function initialize() {
  const d1 = env.DB;
  if (!d1) throw new Error("D1 binding DB is unavailable");
  const runtimeEnvironment = env.APP_ENV === "development" ? "development" : "production";

  await d1.batch([
    d1.prepare(`CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      color TEXT NOT NULL DEFAULT '#0071e3',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    d1.prepare(`CREATE TABLE IF NOT EXISTS posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      excerpt TEXT NOT NULL DEFAULT '',
      content TEXT NOT NULL DEFAULT '',
      category_id INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      featured INTEGER NOT NULL DEFAULT 0,
      view_count INTEGER NOT NULL DEFAULT 0,
      published_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    d1.prepare(`CREATE TABLE IF NOT EXISTS site_settings (
      id INTEGER PRIMARY KEY,
      brand_name TEXT NOT NULL DEFAULT '星屿',
      brand_latin TEXT NOT NULL DEFAULT 'XINGYU',
      author_name TEXT NOT NULL DEFAULT '星屿',
      avatar_url TEXT NOT NULL DEFAULT '/images/xingyu-avatar.jpg',
      tagline TEXT NOT NULL DEFAULT '设计 · 技术 · 生活',
      description TEXT NOT NULL DEFAULT '',
      hero_lead TEXT NOT NULL DEFAULT '',
      hero_tail TEXT NOT NULL DEFAULT '',
      home_section_title TEXT NOT NULL DEFAULT '最近在写',
      home_about_title TEXT NOT NULL DEFAULT '',
      home_about_copy TEXT NOT NULL DEFAULT '',
      footer_text TEXT NOT NULL DEFAULT '',
      seo_title TEXT NOT NULL DEFAULT '',
      seo_description TEXT NOT NULL DEFAULT '',
      home_post_limit INTEGER NOT NULL DEFAULT 9,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    d1.prepare(`CREATE TABLE IF NOT EXISTS content_pages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL UNIQUE,
      eyebrow TEXT NOT NULL DEFAULT '',
      title TEXT NOT NULL,
      excerpt TEXT NOT NULL DEFAULT '',
      content TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    d1.prepare(`CREATE TABLE IF NOT EXISTS post_views (
      post_id INTEGER NOT NULL,
      visitor_hash TEXT NOT NULL,
      viewed_on TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (post_id, visitor_hash, viewed_on)
    )`),
    d1.prepare("CREATE UNIQUE INDEX IF NOT EXISTS categories_slug_uidx ON categories(slug)"),
    d1.prepare("CREATE UNIQUE INDEX IF NOT EXISTS posts_slug_uidx ON posts(slug)"),
    d1.prepare("CREATE UNIQUE INDEX IF NOT EXISTS content_pages_slug_uidx ON content_pages(slug)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS posts_status_published_idx ON posts(status, published_at DESC)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS posts_archive_cursor_idx ON posts(status, published_at DESC, id DESC)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS posts_category_status_idx ON posts(category_id, status)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS posts_category_archive_cursor_idx ON posts(category_id, status, published_at DESC, id DESC)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS posts_updated_idx ON posts(updated_at DESC)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS posts_admin_cursor_idx ON posts(updated_at DESC, id DESC)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS post_views_date_idx ON post_views(viewed_on)"),
    d1.prepare("CREATE TABLE IF NOT EXISTS app_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)"),
    d1.prepare("CREATE VIRTUAL TABLE IF NOT EXISTS posts_fts USING fts5(title, excerpt, content, content='posts', content_rowid='id', tokenize='trigram')"),
    d1.prepare(`CREATE TRIGGER IF NOT EXISTS posts_fts_insert AFTER INSERT ON posts BEGIN
      INSERT INTO posts_fts(rowid, title, excerpt, content) VALUES (new.id, new.title, new.excerpt, new.content);
    END`),
    d1.prepare(`CREATE TRIGGER IF NOT EXISTS posts_fts_delete AFTER DELETE ON posts BEGIN
      INSERT INTO posts_fts(posts_fts, rowid, title, excerpt, content) VALUES ('delete', old.id, old.title, old.excerpt, old.content);
    END`),
    d1.prepare(`CREATE TRIGGER IF NOT EXISTS posts_fts_update AFTER UPDATE OF title, excerpt, content ON posts BEGIN
      INSERT INTO posts_fts(posts_fts, rowid, title, excerpt, content) VALUES ('delete', old.id, old.title, old.excerpt, old.content);
      INSERT INTO posts_fts(rowid, title, excerpt, content) VALUES (new.id, new.title, new.excerpt, new.content);
    END`),
  ]);

  const storedEnvironment = await d1.prepare("SELECT value FROM app_meta WHERE key = 'app_environment'")
    .first<{ value: string }>();
  if (storedEnvironment && storedEnvironment.value !== runtimeEnvironment) {
    throw new Error(`D1 environment mismatch: expected ${runtimeEnvironment}, found ${storedEnvironment.value}`);
  }
  await d1.prepare("INSERT OR IGNORE INTO app_meta (key, value) VALUES ('app_environment', ?)")
    .bind(runtimeEnvironment).run();

  const s = DEFAULT_SITE_SETTINGS;
  const p = DEFAULT_ABOUT_PAGE;
  await d1.batch([
    d1.prepare("INSERT OR IGNORE INTO categories (id, name, slug, color) VALUES (1, '未分类', 'uncategorized', '#0071e3')"),
    d1.prepare(`INSERT OR IGNORE INTO site_settings
      (id, brand_name, brand_latin, author_name, avatar_url, tagline, description, hero_lead, hero_tail,
       home_section_title, home_about_title, home_about_copy, footer_text, seo_title, seo_description, home_post_limit)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
        s.id, s.brandName, s.brandLatin, s.authorName, s.avatarUrl, s.tagline, s.description,
        s.heroLead, s.heroTail, s.homeSectionTitle, s.homeAboutTitle, s.homeAboutCopy,
        s.footerText, s.seoTitle, s.seoDescription, s.homePostLimit,
      ),
    d1.prepare("INSERT OR IGNORE INTO content_pages (slug, eyebrow, title, excerpt, content) VALUES (?, ?, ?, ?, ?)")
      .bind(p.slug, p.eyebrow, p.title, p.excerpt, p.content),
  ]);

  const searchVersion = await d1.prepare("SELECT value FROM app_meta WHERE key = 'posts_fts_version'").first<{ value: string }>();
  if (searchVersion?.value !== "2") {
    await d1.prepare("INSERT INTO posts_fts(posts_fts) VALUES ('rebuild')").run();
    await d1.prepare("INSERT OR REPLACE INTO app_meta (key, value) VALUES ('posts_fts_version', '2')").run();
  }
}
