"use client";

import { useEffect, useState } from "react";

export default function NavTitleChrome({ targetId, lead, tail, returnLabel }: { targetId: string; lead: string; tail: string; returnLabel: string }) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const title = document.getElementById(targetId);
      const nav = document.querySelector<HTMLElement>(".site-nav nav");
      if (!title || !nav) return;
      const titleTop = title.getBoundingClientRect().top;
      const navBottom = nav.getBoundingClientRect().bottom;
      const start = navBottom + 36;
      const end = navBottom - 22;
      const next = Math.min(1, Math.max(0, (start - titleTop) / (start - end)));
      setProgress((current) => Math.abs(current - next) < .006 ? current : next);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    frame = requestAnimationFrame(update);
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      cancelAnimationFrame(frame);
    };
  }, [targetId]);

  return <button
    className={`home-nav-title ${progress > .02 ? "visible" : ""} ${progress > .92 ? "active" : ""}`}
    type="button"
    onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
    tabIndex={progress > .92 ? 0 : -1}
    aria-label={returnLabel}
    title={returnLabel}
    style={{ opacity:progress, transform:`translate(-50%, calc(-50% + ${(1 - progress) * 11}px)) scale(${.96 + progress * .04})`, filter:`blur(${(1 - progress) * 2.5}px)` }}
  >
    <span>{lead}</span><b>{tail}</b><i>↑</i>
  </button>;
}
