export const PUBLIC_CACHE_SCHEMA_STATEMENTS=[
  `CREATE TABLE IF NOT EXISTS public_cache_state (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    revision INTEGER NOT NULL DEFAULT 1,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  "INSERT OR IGNORE INTO public_cache_state (id, revision) VALUES (1, 1)",
  `CREATE TRIGGER IF NOT EXISTS public_cache_posts_insert AFTER INSERT ON posts
    WHEN new.status='published' AND new.space_id IS NULL BEGIN
    UPDATE public_cache_state SET revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE id=1;
  END`,
  `CREATE TRIGGER IF NOT EXISTS public_cache_posts_delete AFTER DELETE ON posts
    WHEN old.status='published' AND old.space_id IS NULL BEGIN
    UPDATE public_cache_state SET revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE id=1;
  END`,
  `CREATE TRIGGER IF NOT EXISTS public_cache_posts_update AFTER UPDATE OF title,slug,excerpt,content,category_id,space_id,status,featured,published_at ON posts
    WHEN (old.status='published' AND old.space_id IS NULL) OR (new.status='published' AND new.space_id IS NULL) BEGIN
    UPDATE public_cache_state SET revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE id=1;
  END`,
  `CREATE TRIGGER IF NOT EXISTS public_cache_categories_insert AFTER INSERT ON categories BEGIN
    UPDATE public_cache_state SET revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE id=1;
  END`,
  `CREATE TRIGGER IF NOT EXISTS public_cache_categories_update AFTER UPDATE ON categories BEGIN
    UPDATE public_cache_state SET revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE id=1;
  END`,
  `CREATE TRIGGER IF NOT EXISTS public_cache_categories_delete AFTER DELETE ON categories BEGIN
    UPDATE public_cache_state SET revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE id=1;
  END`,
  `CREATE TRIGGER IF NOT EXISTS public_cache_settings_update AFTER UPDATE ON site_settings BEGIN
    UPDATE public_cache_state SET revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE id=1;
  END`,
  `CREATE TRIGGER IF NOT EXISTS public_cache_pages_insert AFTER INSERT ON content_pages BEGIN
    UPDATE public_cache_state SET revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE id=1;
  END`,
  `CREATE TRIGGER IF NOT EXISTS public_cache_pages_update AFTER UPDATE ON content_pages BEGIN
    UPDATE public_cache_state SET revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE id=1;
  END`,
  `CREATE TRIGGER IF NOT EXISTS public_cache_pages_delete AFTER DELETE ON content_pages BEGIN
    UPDATE public_cache_state SET revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE id=1;
  END`,
] as const;
