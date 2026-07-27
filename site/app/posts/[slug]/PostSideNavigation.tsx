"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { formatLongDate, isEditableTarget } from "../../content-utils";
import ModalPostLink from "../../ModalPostLink";
import { postPath } from "../../post-path";

type NeighborPost = {
  publicId: string;
  slug: string;
  title: string;
  excerpt: string;
  publishedAt: string | null;
  categoryName: string | null;
  categoryColor: string | null;
};

type Direction = "previous" | "next";

export default function PostSideNavigation({ previousPost, nextPost, readerScope="public" }: { previousPost: NeighborPost | null; nextPost: NeighborPost | null;readerScope?:"public"|"admin" }) {
  const router = useRouter();
  const [visible, setVisible] = useState(false);
  const [preview, setPreview] = useState<Direction | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const keyFeedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressed = useRef(false);
  const rootRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (previousPost) router.prefetch(readerScope==="admin"?`/admin/reader/${previousPost.publicId}`:postPath(previousPost));
    if (nextPost) router.prefetch(readerScope==="admin"?`/admin/reader/${nextPost.publicId}`:postPath(nextPost));
  }, [nextPost, previousPost, readerScope, router]);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const title = document.querySelector<HTMLElement>(".post-hero h1");
      const nav = document.querySelector<HTMLElement>(".site-nav nav");
      const endSection = document.querySelector<HTMLElement>(".post-page .post-end");
      if (!title || !nav) return;
      const beforeContinuation = !endSection || endSection.getBoundingClientRect().top > window.innerHeight - 96;
      const nextVisible = title.getBoundingClientRect().top < nav.getBoundingClientRect().bottom + 56 && beforeContinuation;
      setVisible(nextVisible);
      if (!nextVisible) setPreview(null);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    const closeOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setPreview(null);
    };
    const handleKeyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setPreview(null);
        return;
      }
      if (event.defaultPrevented || event.repeat || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || isEditableTarget(event.target)) return;
      const destination = event.key === "ArrowLeft" ? previousPost : event.key === "ArrowRight" ? nextPost : null;
      if (!destination) return;
      event.preventDefault();
      document.documentElement.dataset.keyTurn = event.key === "ArrowLeft" ? "left" : "right";
      if (keyFeedbackTimer.current) clearTimeout(keyFeedbackTimer.current);
      keyFeedbackTimer.current = setTimeout(() => { delete document.documentElement.dataset.keyTurn; }, 180);
      navigator.vibrate?.(12);
      rootRef.current?.querySelector<HTMLAnchorElement>(`.post-side-item.${event.key === "ArrowLeft" ? "previous" : "next"} .post-side-trigger`)?.click();
    };
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    document.addEventListener("pointerdown", closeOutside);
    window.addEventListener("keydown", handleKeyboard);
    frame = requestAnimationFrame(update);
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      document.removeEventListener("pointerdown", closeOutside);
      window.removeEventListener("keydown", handleKeyboard);
      if (longPressTimer.current) clearTimeout(longPressTimer.current);
      if (keyFeedbackTimer.current) clearTimeout(keyFeedbackTimer.current);
      delete document.documentElement.dataset.keyTurn;
      cancelAnimationFrame(frame);
    };
  }, [nextPost, previousPost]);

  const beginLongPress = (event: ReactPointerEvent, direction: Direction) => {
    if (event.pointerType === "mouse") return;
    event.currentTarget.setPointerCapture(event.pointerId);
    longPressed.current = false;
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
    longPressTimer.current = setTimeout(() => {
      longPressed.current = true;
      setPreview(direction);
      navigator.vibrate?.(12);
    }, 460);
  };

  const cancelLongPress = () => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
    longPressTimer.current = null;
  };

  const stopLongPressNavigation = (event: React.MouseEvent) => {
    if (!longPressed.current) return;
    event.preventDefault();
    event.stopPropagation();
    longPressed.current = false;
  };

  return <aside ref={rootRef} className={`post-side-navigation ${visible ? "visible" : ""}`} aria-label="上一篇和下一篇">
    {previousPost && <SideItem direction="previous" post={previousPost} readerScope={readerScope} preview={preview} setPreview={setPreview} beginLongPress={beginLongPress} cancelLongPress={cancelLongPress} stopLongPressNavigation={stopLongPressNavigation} />}
    {nextPost && <SideItem direction="next" post={nextPost} readerScope={readerScope} preview={preview} setPreview={setPreview} beginLongPress={beginLongPress} cancelLongPress={cancelLongPress} stopLongPressNavigation={stopLongPressNavigation} />}
  </aside>;
}

function SideItem({ direction, post, readerScope, preview, setPreview, beginLongPress, cancelLongPress, stopLongPressNavigation }: {
  direction: Direction;
  post: NeighborPost;
  readerScope:"public"|"admin";
  preview: Direction | null;
  setPreview: (direction: Direction | null) => void;
  beginLongPress: (event: ReactPointerEvent, direction: Direction) => void;
  cancelLongPress: () => void;
  stopLongPressNavigation: (event: React.MouseEvent) => void;
}) {
  const previous = direction === "previous";
  const open = preview === direction;
  return <div className={`post-side-item ${direction} ${open ? "previewing" : ""}`} onMouseEnter={() => setPreview(direction)} onMouseLeave={() => setPreview(null)} onFocus={() => setPreview(direction)} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setPreview(null); }}>
    <ModalPostLink className="post-side-trigger" readerScope={readerScope} publicId={post.publicId} slug={post.slug} data-route-direction={previous ? "left" : "right"} onPointerDown={(event) => beginLongPress(event, direction)} onPointerUp={cancelLongPress} onPointerCancel={cancelLongPress} onPointerLeave={(event) => { if (event.pointerType !== "mouse") cancelLongPress(); }} onContextMenu={(event) => event.preventDefault()} onClick={stopLongPressNavigation} aria-label={`${previous ? "上一篇" : "下一篇"}：${post.title}`} aria-expanded={open}>
      <i>{previous ? "←" : "→"}</i><span>{previous ? "上一篇" : "下一篇"}</span>
    </ModalPostLink>
    {open && <div className="post-side-preview" style={{ "--preview-color": post.categoryColor ?? "#0071e3" } as React.CSSProperties}>
      <button type="button" onClick={() => setPreview(null)} aria-label="关闭预览">×</button>
      <ModalPostLink readerScope={readerScope} publicId={post.publicId} slug={post.slug}>
        <small><i />{post.categoryName}</small>
        <b>{post.title}</b>
        <p>{post.excerpt}</p>
        <footer><time>{formatLongDate(post.publishedAt)}</time><span>打开文章 ↗</span></footer>
      </ModalPostLink>
    </div>}
  </div>;
}
