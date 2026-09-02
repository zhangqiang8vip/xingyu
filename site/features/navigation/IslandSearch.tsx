"use client";

import { useCallback, useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { transitionTo } from "@/app/RouteTransition";
import { CONTENT_LIMITS } from "@/domain/site/config";
import { formatShortDate, isEditableTarget } from "@/app/content-utils";
import { postPath } from "@/app/post-path";

export type SearchPost = { id:number; publicId:string; title:string; slug:string; excerpt:string; publishedAt:string | null; viewCount:number; categoryName:string | null; categoryColor:string | null; status?:"draft"|"published";spaceId?:number|null;spacePath?:string|null };

export default function IslandSearch({ initialText, excludeSlug, onSelect, variant="navigation",scope="public" }: { initialText:string; excludeSlug?:string; onSelect?:(post:SearchPost)=>void; variant?:"navigation"|"reader";scope?:"public"|"admin" }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(initialText);
  const [rows, setRows] = useState<SearchPost[]>([]);
  const [selected, setSelected] = useState(0);
  const [hoveredSlug, setHoveredSlug] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const resultsId = `island-search-${useId().replace(/:/g, "")}`;

  const dismiss = useCallback(() => {
    setOpen(false);
    setQuery(initialText);
    setRows([]);
    setSelected(0);
    setHoveredSlug(null);
  }, [initialText]);

  const activate = useCallback(() => {
    setOpen(true);
    setQuery("");
    setRows([]);
    setSelected(0);
    setHoveredSlug(null);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => { if (!rootRef.current?.contains(event.target as Node)) dismiss(); };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [dismiss, open]);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      const readerModal = document.querySelector(".reader-modal");
      if (readerModal && !rootRef.current?.closest(".reader-modal")) return;
      const commandSearch = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k";
      const slashSearch = event.key === "/" && !isEditableTarget(event.target);
      if (!commandSearch && !slashSearch) return;
      event.preventDefault();
      if (open) {
        if (commandSearch) {
          dismiss();
        } else {
          inputRef.current?.focus();
          inputRef.current?.select();
        }
      } else {
        activate();
      }
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [activate, dismiss, open]);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const endpoint=scope==="admin"
          ?`/api/posts?scope=all&q=${encodeURIComponent(query.trim())}&category=all&status=all&pageSize=${CONTENT_LIMITS.searchResults}`
          :`/api/archive?q=${encodeURIComponent(query.trim())}&category=all&limit=${CONTENT_LIMITS.searchResults}`;
        const response = await fetch(endpoint, { signal:controller.signal });
        if (!response.ok) throw new Error("search failed");
        const data = await response.json() as { rows: SearchPost[] };
        setRows(excludeSlug ? data.rows.filter((row) => row.slug !== excludeSlug) : data.rows);
        setSelected(0); setHoveredSlug(null);
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) setRows([]);
      } finally { if (!controller.signal.aborted) setLoading(false); }
    }, 120);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [excludeSlug, open, query, scope]);

  useEffect(() => {
    const list = resultsRef.current;
    const active = list?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (!list || !active) return;
    const top = active.offsetTop;
    const bottom = top + active.offsetHeight;
    if (top < list.scrollTop + 34) list.scrollTo({ top:Math.max(0, top - 40), behavior:"smooth" });
    else if (bottom > list.scrollTop + list.clientHeight - 30) list.scrollTo({ top:bottom - list.clientHeight + 36, behavior:"smooth" });
  }, [selected]);

  const openPost = (post: SearchPost | undefined) => {
    if (!post) return;
    dismiss();
    if (onSelect) return onSelect(post);
    transitionTo(scope==="admin"?`/admin/reader/${encodeURIComponent(post.publicId)}`:postPath(post));
  };
  const hovered = rows.find((row) => row.slug === hoveredSlug);

  return <div ref={rootRef} className={`island-search ${variant === "reader" ? "reader-search" : ""} ${open ? "active" : ""}`}>
    {!open ? <button className="island-search-trigger" type="button" onClick={activate} aria-label="搜索全部文章，快捷键斜杠或 Control K" title="快速搜索（/ 或 Ctrl/⌘ K）"><i aria-hidden="true" /><span>搜索文章</span><kbd>⌘K</kbd></button> : <>
      <div className="island-search-field">
        <i aria-hidden="true" /><span>全部</span>
        <input ref={inputRef} value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => {
          if (event.key === "ArrowDown") { event.preventDefault(); setSelected((index) => Math.min(rows.length - 1, index + 1)); }
          else if (event.key === "ArrowUp") { event.preventDefault(); setSelected((index) => Math.max(0, index - 1)); }
          else if (event.key === "Enter") { event.preventDefault(); openPost(rows[selected]); }
          else if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); dismiss(); }
        }} role="combobox" aria-label="搜索全部文章" aria-expanded="true" aria-controls={resultsId} aria-activedescendant={rows[selected] ? `${resultsId}-result-${rows[selected].id}` : undefined} autoComplete="off" spellCheck={false} />
        <button className="island-search-cancel" type="button" onClick={dismiss} aria-label="取消搜索"><span>取消</span><kbd>ESC</kbd></button>
      </div>
      <div className="island-search-dropdown" onMouseLeave={() => setHoveredSlug(null)}>
        <div ref={resultsRef} className="island-search-results" id={resultsId} role="listbox">
          <header><span>{query.trim() ? "实时搜索" : "最近文章"}</span><b>{loading ? "检索中" : `${rows.length} 个结果`}</b></header>
          {loading && rows.length === 0 ? <div className="island-search-state"><i /><i /><i /></div> : rows.length === 0 ? <div className="island-search-empty"><b>没有找到相关内容</b><span>换一个关键词试试看</span></div> : rows.map((row, index) => <button id={`${resultsId}-result-${row.id}`} className={selected === index ? "selected" : ""} type="button" role="option" aria-selected={selected === index} key={row.id} onMouseEnter={() => { setSelected(index); setHoveredSlug(row.slug); }} onFocus={() => { setSelected(index); setHoveredSlug(row.slug); }} onClick={() => openPost(row)}>
            <i style={{ background:row.categoryColor ?? "#0071e3" }} /><span><small>{row.categoryName ?? "文章"}</small><b>{row.title}</b></span><em>↗</em>
          </button>)}
          <footer><span>↑↓ 选择</span><span>Enter 打开</span></footer>
        </div>
        {hovered && <button className="island-search-preview" type="button" onClick={() => openPost(hovered)} style={{ "--search-color":hovered.categoryColor ?? "#0071e3" } as CSSProperties}>
          <small><i />{hovered.categoryName ?? "文章预览"}</small><b>{hovered.title}</b><p>{hovered.excerpt}</p><footer><time>{formatShortDate(hovered.publishedAt)}</time><span>{hovered.viewCount.toLocaleString()} 阅读</span></footer><em>打开文章 ↗</em>
        </button>}
      </div>
    </>}
  </div>;
}
