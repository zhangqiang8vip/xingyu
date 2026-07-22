"use client";

import { useEffect, useState, type CSSProperties } from "react";

export default function PostReadingChrome({ title, category, color }: { title: string; category: string | null; color: string | null }) {
  const [reading, setReading] = useState({ arrival: 0, progress: 0 });

  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const hero = document.querySelector<HTMLElement>(".post-hero");
      const article = document.querySelector<HTMLElement>(".post-page .prose");
      const heroTitle = hero?.querySelector<HTMLElement>("h1");
      const nav = document.querySelector<HTMLElement>(".site-nav nav");
      if (!hero || !article || !heroTitle || !nav) return;
      const articleRect = article.getBoundingClientRect();
      const articleTop = window.scrollY + articleRect.top;
      const articleBottom = articleTop + articleRect.height;
      let articleStart = articleTop - 110;
      let articleEnd = articleBottom - window.innerHeight * 0.45;
      if (articleEnd <= articleStart) {
        articleStart = articleTop - window.innerHeight * 0.45;
        articleEnd = articleBottom - window.innerHeight * 0.45;
      }
      const progress = Math.min(1, Math.max(0, (window.scrollY - articleStart) / Math.max(1, articleEnd - articleStart)));
      const navBottom = nav.getBoundingClientRect().bottom;
      const arrivalStart = navBottom + 46;
      const arrivalEnd = navBottom - 10;
      const arrival = Math.min(1, Math.max(0, (arrivalStart - heroTitle.getBoundingClientRect().top) / (arrivalStart - arrivalEnd)));
      setReading((current) => Math.abs(current.arrival - arrival) < .004 && Math.abs(current.progress - progress) < .002 ? current : { arrival, progress });
    };
    const onScroll = () => { if (!frame) frame = window.requestAnimationFrame(update); };
    window.addEventListener("scroll", onScroll, { passive: true });
    frame = window.requestAnimationFrame(update);
    return () => { window.removeEventListener("scroll", onScroll); window.cancelAnimationFrame(frame); };
  }, []);

  return <>
    <button type="button" className={`post-reading-title ${reading.arrival > .02 ? "visible" : ""} ${reading.arrival > .9 ? "interactive" : ""}`} onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} aria-label="返回文章顶部" title="返回文章顶部" tabIndex={reading.arrival > .9 ? 0 : -1} style={{ opacity:reading.arrival, transform:`translate(-50%, calc(-50% + ${(1 - reading.arrival) * 10}px)) scale(${.965 + reading.arrival * .035})`, filter:`blur(${(1 - reading.arrival) * 2.5}px)` }}>
      <i style={{ background: color ?? undefined }} /><small>{category}</small><span>{title}</span><b>{Math.round(reading.progress * 100)}%</b>
    </button>
    <div className={`post-reading-progress ${reading.arrival > .02 ? "visible" : ""}`} style={{ "--reading-progress": reading.progress, opacity:reading.arrival } as CSSProperties} />
  </>;
}
