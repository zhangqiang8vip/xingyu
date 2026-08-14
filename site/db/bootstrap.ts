import { env } from "cloudflare:workers";
import { DEFAULT_ABOUT_PAGE, DEFAULT_CONNECT_PAGE, DEFAULT_SITE_SETTINGS } from "../app/site-config";
import { createPostPublicId } from "./public-id";

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
  const schemaVersion = "10";

  try {
    const markers = await d1.prepare("SELECT key, value FROM app_meta WHERE key IN ('schema_version', 'app_environment')")
      .all<{ key:string; value:string }>();
    const values = new Map((markers.results ?? []).map((row) => [row.key, row.value]));
    if (values.get("schema_version") === schemaVersion) {
      if (values.get("app_environment") !== runtimeEnvironment) {
        throw new Error(`D1 environment mismatch: expected ${runtimeEnvironment}, found ${values.get("app_environment")}`);
      }
      return;
    }
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("D1 environment mismatch")) throw error;
    // A fresh database has no app_meta table yet and continues into initialization.
  }

  await d1.batch([
    d1.prepare(`CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      color TEXT NOT NULL DEFAULT '#0071e3',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    d1.prepare(`CREATE TABLE IF NOT EXISTS spaces (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      parent_id INTEGER,
      name TEXT NOT NULL,
      slug TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    d1.prepare(`CREATE TABLE IF NOT EXISTS posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      public_id TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      excerpt TEXT NOT NULL DEFAULT '',
      content TEXT NOT NULL DEFAULT '',
      category_id INTEGER NOT NULL,
      space_id INTEGER,
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
    d1.prepare(`CREATE TABLE IF NOT EXISTS post_slug_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      post_id INTEGER NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    d1.prepare(`CREATE TABLE IF NOT EXISTS mcp_activity (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      action TEXT NOT NULL,
      post_id INTEGER NOT NULL,
      public_id TEXT NOT NULL,
      title TEXT NOT NULL,
      before_status TEXT,
      after_status TEXT,
      changed_fields TEXT NOT NULL DEFAULT '[]',
      summary TEXT NOT NULL DEFAULT '',
      client_label TEXT NOT NULL DEFAULT 'remote-mcp',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    d1.prepare(`CREATE TABLE IF NOT EXISTS attachments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      public_id TEXT NOT NULL UNIQUE,
      post_id INTEGER,
      object_key TEXT NOT NULL UNIQUE,
      original_name TEXT NOT NULL,
      content_type TEXT NOT NULL,
      size INTEGER NOT NULL,
      sha256 TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    d1.prepare(`CREATE TABLE IF NOT EXISTS post_preview_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      post_id INTEGER NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      revoked_at TEXT,
      last_viewed_at TEXT,
      view_count INTEGER NOT NULL DEFAULT 0
    )`),
    d1.prepare("CREATE UNIQUE INDEX IF NOT EXISTS categories_slug_uidx ON categories(slug)"),
    d1.prepare("CREATE UNIQUE INDEX IF NOT EXISTS spaces_parent_slug_uidx ON spaces(parent_id, slug)"),
    d1.prepare("CREATE UNIQUE INDEX IF NOT EXISTS spaces_root_slug_uidx ON spaces(slug) WHERE parent_id IS NULL"),
    d1.prepare("CREATE INDEX IF NOT EXISTS spaces_parent_sort_idx ON spaces(parent_id, sort_order, id)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS spaces_updated_idx ON spaces(updated_at DESC, id DESC)"),
    d1.prepare("CREATE UNIQUE INDEX IF NOT EXISTS posts_slug_uidx ON posts(slug)"),
    d1.prepare("CREATE UNIQUE INDEX IF NOT EXISTS content_pages_slug_uidx ON content_pages(slug)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS posts_status_published_idx ON posts(status, published_at DESC)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS posts_archive_cursor_idx ON posts(status, published_at DESC, id DESC)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS posts_category_status_idx ON posts(category_id, status)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS posts_category_archive_cursor_idx ON posts(category_id, status, published_at DESC, id DESC)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS posts_updated_idx ON posts(updated_at DESC)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS posts_admin_cursor_idx ON posts(updated_at DESC, id DESC)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS post_views_date_idx ON post_views(viewed_on)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS post_slug_history_post_idx ON post_slug_history(post_id)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS mcp_activity_created_idx ON mcp_activity(created_at DESC, id DESC)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS mcp_activity_post_idx ON mcp_activity(post_id, id DESC)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS attachments_post_created_idx ON attachments(post_id, created_at DESC, id DESC)"),
    d1.prepare("CREATE UNIQUE INDEX IF NOT EXISTS post_preview_tokens_hash_uidx ON post_preview_tokens(token_hash)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS post_preview_tokens_post_idx ON post_preview_tokens(post_id, expires_at DESC, id DESC)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS post_preview_tokens_expiry_idx ON post_preview_tokens(expires_at)"),
    d1.prepare("CREATE TABLE IF NOT EXISTS app_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)"),
    d1.prepare(`CREATE TABLE IF NOT EXISTS admin_login_attempts (
      identifier TEXT PRIMARY KEY,
      attempts INTEGER NOT NULL DEFAULT 0,
      window_started INTEGER NOT NULL,
      blocked_until INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL
    )`),
    d1.prepare(`CREATE TABLE IF NOT EXISTS oauth_clients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id TEXT NOT NULL UNIQUE,
      client_name TEXT NOT NULL,
      client_type TEXT NOT NULL DEFAULT 'public',
      client_secret_hash TEXT,
      redirect_uris TEXT NOT NULL DEFAULT '[]',
      allowed_scopes TEXT NOT NULL,
      token_endpoint_auth_method TEXT NOT NULL DEFAULT 'none',
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    d1.prepare(`CREATE TABLE IF NOT EXISTS oauth_authorization_codes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code_hash TEXT NOT NULL UNIQUE,
      client_id TEXT NOT NULL,
      subject TEXT NOT NULL,
      redirect_uri TEXT NOT NULL,
      resource TEXT NOT NULL,
      scope TEXT NOT NULL,
      code_challenge TEXT NOT NULL,
      code_challenge_method TEXT NOT NULL DEFAULT 'S256',
      expires_at INTEGER NOT NULL,
      used_at INTEGER,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    d1.prepare(`CREATE TABLE IF NOT EXISTS oauth_access_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token_hash TEXT NOT NULL UNIQUE,
      client_id TEXT NOT NULL,
      subject TEXT NOT NULL,
      resource TEXT NOT NULL,
      scope TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      revoked_at INTEGER,
      last_used_at INTEGER,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    d1.prepare(`CREATE TABLE IF NOT EXISTS oauth_refresh_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token_hash TEXT NOT NULL UNIQUE,
      family_id TEXT NOT NULL,
      parent_token_id INTEGER,
      client_id TEXT NOT NULL,
      subject TEXT NOT NULL,
      resource TEXT NOT NULL,
      scope TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      absolute_expires_at INTEGER NOT NULL,
      used_at INTEGER,
      revoked_at INTEGER,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    d1.prepare(`CREATE TABLE IF NOT EXISTS oauth_consents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      subject TEXT NOT NULL,
      client_id TEXT NOT NULL,
      resource TEXT NOT NULL,
      granted_scopes TEXT NOT NULL,
      granted_at INTEGER NOT NULL,
      revoked_at INTEGER
    )`),
    d1.prepare(`CREATE TABLE IF NOT EXISTS oauth_rate_limits (
      identifier TEXT PRIMARY KEY,
      attempts INTEGER NOT NULL DEFAULT 0,
      window_started INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`),
    d1.prepare("CREATE INDEX IF NOT EXISTS oauth_authorization_codes_expiry_idx ON oauth_authorization_codes(expires_at)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS oauth_access_tokens_client_idx ON oauth_access_tokens(client_id, subject, expires_at)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS oauth_refresh_tokens_family_idx ON oauth_refresh_tokens(family_id)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS oauth_refresh_tokens_client_idx ON oauth_refresh_tokens(client_id, subject)"),
    d1.prepare("CREATE UNIQUE INDEX IF NOT EXISTS oauth_consents_subject_client_resource_uidx ON oauth_consents(subject, client_id, resource)"),
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

  const postColumns = await d1.prepare("PRAGMA table_info(posts)").all<{ name: string }>();
  if (!(postColumns.results ?? []).some((column) => column.name === "public_id")) {
    await d1.prepare("ALTER TABLE posts ADD COLUMN public_id TEXT").run();
  }
  if (!(postColumns.results ?? []).some((column) => column.name === "space_id")) {
    await d1.prepare("ALTER TABLE posts ADD COLUMN space_id INTEGER").run();
  }
  const postsWithoutPublicId = await d1.prepare("SELECT id FROM posts WHERE public_id IS NULL OR public_id = ''").all<{ id: number }>();
  if (postsWithoutPublicId.results?.length) {
    await d1.batch(postsWithoutPublicId.results.map((post) => d1.prepare("UPDATE posts SET public_id = ? WHERE id = ?").bind(createPostPublicId(), post.id)));
  }
  await d1.prepare("CREATE UNIQUE INDEX IF NOT EXISTS posts_public_id_uidx ON posts(public_id)").run();
  await d1.prepare("CREATE INDEX IF NOT EXISTS posts_space_updated_idx ON posts(space_id, updated_at DESC, id DESC)").run();
  await d1.prepare("CREATE INDEX IF NOT EXISTS posts_space_status_updated_idx ON posts(space_id, status, updated_at DESC, id DESC)").run();
  await d1.prepare("CREATE INDEX IF NOT EXISTS posts_space_published_idx ON posts(space_id, published_at DESC, id DESC)").run();
  await d1.prepare("CREATE UNIQUE INDEX IF NOT EXISTS post_slug_history_slug_uidx ON post_slug_history(slug)").run();

  const storedEnvironment = await d1.prepare("SELECT value FROM app_meta WHERE key = 'app_environment'")
    .first<{ value: string }>();
  if (storedEnvironment && storedEnvironment.value !== runtimeEnvironment) {
    throw new Error(`D1 environment mismatch: expected ${runtimeEnvironment}, found ${storedEnvironment.value}`);
  }
  await d1.prepare("INSERT OR IGNORE INTO app_meta (key, value) VALUES ('app_environment', ?)")
    .bind(runtimeEnvironment).run();

  const s = DEFAULT_SITE_SETTINGS;
  const p = DEFAULT_ABOUT_PAGE;
  const connect = DEFAULT_CONNECT_PAGE;
  await d1.batch([
    d1.prepare("INSERT OR IGNORE INTO categories (id, name, slug, color) VALUES (1, '随笔', 'notes', '#8E8E93')"),
    d1.prepare(`UPDATE categories
      SET name = '随笔', slug = 'notes', color = '#8E8E93'
      WHERE slug = 'uncategorized'
        AND NOT EXISTS (SELECT 1 FROM categories WHERE slug = 'notes')`),
    d1.prepare(`UPDATE posts
      SET category_id = (SELECT id FROM categories WHERE slug = 'notes')
      WHERE category_id IN (SELECT id FROM categories WHERE slug = 'uncategorized')
        AND EXISTS (SELECT 1 FROM categories WHERE slug = 'notes')`),
    d1.prepare(`DELETE FROM categories
      WHERE slug = 'uncategorized'
        AND EXISTS (SELECT 1 FROM categories WHERE slug = 'notes')`),
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
    d1.prepare("INSERT OR IGNORE INTO content_pages (slug, eyebrow, title, excerpt, content) VALUES (?, ?, ?, ?, ?)")
      .bind(connect.slug, connect.eyebrow, connect.title, connect.excerpt, connect.content),
    d1.prepare(`INSERT OR IGNORE INTO oauth_clients
      (client_id, client_name, client_type, client_secret_hash, redirect_uris, allowed_scopes, token_endpoint_auth_method, enabled)
      VALUES ('grok-xingyu', 'Grok · XINGYU', 'public', NULL, '[]', 'xingyu.read xingyu.draft xingyu.publish offline_access', 'none', 1)`),
  ]);

  const searchVersion = await d1.prepare("SELECT value FROM app_meta WHERE key = 'posts_fts_version'").first<{ value: string }>();
  if (searchVersion?.value !== "2") {
    await d1.prepare("INSERT INTO posts_fts(posts_fts) VALUES ('rebuild')").run();
    await d1.prepare("INSERT OR REPLACE INTO app_meta (key, value) VALUES ('posts_fts_version', '2')").run();
  }
  await d1.prepare("INSERT OR REPLACE INTO app_meta (key, value) VALUES ('schema_version', ?)").bind(schemaVersion).run();
}
