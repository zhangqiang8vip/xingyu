"use client";

import { useEffect, useState } from "react";

type TocItem = { id: string; title: string; level: 2 | 3 };

export default function PostTableOfContents({ articleKey }: { articleKey: string }) {
  const [items, setItems] = useState<TocItem[]>([]);
  const [activeId, setActiveId] = useState("");
  const [visible, setVisible] = useState(false);
  const [open, setOpen] = useState(false);
  const [contentVersion,setContentVersion]=useState(0);

  useEffect(()=>{
    const article=document.querySelector<HTMLElement>(".post-page .prose");
    if(!article)return;
    let timer=0;
    const observer=new MutationObserver(()=>{window.clearTimeout(timer);timer=window.setTimeout(()=>setContentVersion(value=>value+1),40)});
    observer.observe(article,{childList:true,subtree:true});
    return()=>{window.clearTimeout(timer);observer.disconnect()};
  },[articleKey]);

  useEffect(() => {
    let frame = 0;
    let detach = () => {};
    frame = window.requestAnimationFrame(() => {
      const article = document.querySelector<HTMLElement>(".post-page .prose");
      const endSection = document.querySelector<HTMLElement>(".post-page .post-end");
      if (!article) return;
      const headings = Array.from(article.querySelectorAll<HTMLElement>("h2, h3"));
      const nextItems = headings.map((heading, index) => {
        const id = `section-${index + 1}`;
        heading.id = id;
        return { id, title: heading.textContent?.trim() || `第 ${index + 1} 节`, level: heading.tagName === "H3" ? 3 : 2 } as TocItem;
      });
      setItems(nextItems);
      setActiveId(nextItems[0]?.id ?? "");

      const update = () => {
        frame = 0;
        const articleRect = article.getBoundingClientRect();
        const beforeReadingEnd = !endSection || endSection.getBoundingClientRect().top > window.innerHeight - 60;
        const embedded = window.matchMedia("(min-width: 1181px)").matches;
        const shouldShow = embedded
          ? articleRect.bottom > 120
          : articleRect.top < 190 && articleRect.bottom > 230 && beforeReadingEnd;
        setVisible(shouldShow);
        if (!shouldShow) setOpen(false);
        let current = headings[0]?.id ?? "";
        for (const heading of headings) {
          if (heading.getBoundingClientRect().top <= 165) current = heading.id;
          else break;
        }
        setActiveId(current);
      };
      const onScroll = () => { if (!frame) frame = window.requestAnimationFrame(update); };
      window.addEventListener("scroll", onScroll, { passive: true });
      window.addEventListener("resize", onScroll);
      frame = window.requestAnimationFrame(update);
      detach = () => {
        window.removeEventListener("scroll", onScroll);
        window.removeEventListener("resize", onScroll);
      };
    });
    return () => {
      detach();
      window.cancelAnimationFrame(frame);
    };
  }, [articleKey,contentVersion]);

  if (items.length < 2) return null;

  const jumpTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    window.history.replaceState(null, "", `#${id}`);
    setOpen(false);
  };

  return (
    <>
    <button className={`post-toc-toggle ${visible ? "visible" : ""} ${open ? "open" : ""}`} onClick={() => setOpen((value) => !value)} aria-label={open ? "收起文章目录" : "展开文章目录"} aria-expanded={open}><i /><span>{open ? "收起" : "目录"}</span></button>
    <aside className={`post-toc ${visible ? "visible" : ""} ${open ? "open" : ""}`} aria-label="文章目录">
      <header><span>本文目录</span><b>{String(items.length).padStart(2, "0")}</b></header>
      <nav>
        {items.map((item, index) => (
          <button key={item.id} className={`${activeId === item.id ? "active" : ""} level-${item.level}`} onClick={() => jumpTo(item.id)}>
            <i>{String(index + 1).padStart(2, "0")}</i><span>{item.title}</span>
          </button>
        ))}
      </nav>
      <footer><i /><span>点击标题快速抵达</span></footer>
    </aside>
    </>
  );
}
