"use client";

import { useEffect, useMemo, useState } from "react";
import IslandSearch from "@/features/navigation/IslandSearch";
import StableLink from "../StableLink";

type Category = { id: number; name: string; slug: string; color: string };

export default function ArchiveNavCenter({ categories, category, query }: { categories: Category[]; category: string; query: string }) {
  const [docked, setDocked] = useState(false);
  const selected = useMemo(() => categories.find((item) => item.slug === category), [categories, category]);

  const href = (nextCategory: string) => {
    const params = new URLSearchParams();
    if (nextCategory !== "all") params.set("category", nextCategory);
    if (query) params.set("q", query);
    return `/archive${params.size ? `?${params}` : ""}`;
  };

  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const source = document.getElementById("archive-filter-source");
      if (!source) return;
      const next = source.getBoundingClientRect().top <= 86;
      setDocked(next);
      document.documentElement.classList.toggle("archive-filter-docked", next);
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(update); };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) cancelAnimationFrame(frame);
      document.documentElement.classList.remove("archive-filter-docked");
    };
  }, []);

  return <div className={`archive-nav-center${docked ? " docked" : ""}`}>
    <div className="archive-nav-filter" aria-hidden={!docked} inert={!docked}>
      <StableLink className="archive-nav-current" href={href("all")}>
        <i style={{ background:selected?.color ?? "#8e8e93" }} />
        <span>{selected?.name ?? "全部"}</span>
      </StableLink>
      <details className="archive-nav-menu" data-dismiss-outside>
        <summary aria-label="选择文章分类"><span>分类</span><b>{categories.length}</b><i>⌄</i></summary>
        <div>
          <header><span>浏览分类</span><b>{categories.length} 个</b></header>
          <div className="archive-nav-options">
            <StableLink className={category === "all" ? "active" : ""} href={href("all")}><i style={{ background:"#8e8e93" }} /><span>全部文章</span>{category === "all" && <b>✓</b>}</StableLink>
            {categories.map((item) => <StableLink key={item.id} className={category === item.slug ? "active" : ""} href={href(item.slug)}><i style={{ background:item.color }} /><span>{item.name}</span>{category === item.slug && <b>✓</b>}</StableLink>)}
          </div>
        </div>
      </details>
    </div>
    <IslandSearch initialText="全部文章" />
  </div>;
}
