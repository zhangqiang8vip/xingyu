"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";

type Metrics = { top: number; height: number; maxScroll: number; value: number; visible: boolean };

export default function ScrollIndicator() {
  const [metrics, setMetrics] = useState<Metrics>({ top: 0, height: 32, maxScroll: 0, value: 0, visible: false });
  const [active, setActive] = useState(false);
  const [dragging, setDragging] = useState(false);
  const frame = useRef(0);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const drag = useRef({ y: 0, scroll: 0, travel: 1, maxScroll: 0 });

  useEffect(() => {
    const update = () => {
      frame.current = 0;
      const viewport = window.innerHeight;
      const page = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight);
      const maxScroll = Math.max(0, page - viewport);
      const track = Math.max(1, viewport - 16);
      const height = Math.min(track, Math.max(32, track * viewport / Math.max(page, 1)));
      const travel = Math.max(1, track - height);
      const value = maxScroll ? Math.min(1, Math.max(0, window.scrollY / maxScroll)) : 0;
      setMetrics({ top: value * travel, height, maxScroll, value, visible: maxScroll > 4 });
    };
    const schedule = () => { if (!frame.current) frame.current = requestAnimationFrame(update); };
    const markScrolling = () => {
      schedule();
      setActive(true);
      if (idleTimer.current) clearTimeout(idleTimer.current);
      idleTimer.current = setTimeout(() => setActive(false), 760);
    };
    const observer = new ResizeObserver(schedule);
    observer.observe(document.documentElement);
    window.addEventListener("scroll", markScrolling, { passive: true });
    window.addEventListener("resize", schedule);
    frame.current = requestAnimationFrame(update);
    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", markScrolling);
      window.removeEventListener("resize", schedule);
      if (idleTimer.current) clearTimeout(idleTimer.current);
      cancelAnimationFrame(frame.current);
    };
  }, []);

  const startDrag = (event: PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const track = Math.max(1, window.innerHeight - 16);
    drag.current = { y: event.clientY, scroll: window.scrollY, travel: Math.max(1, track - metrics.height), maxScroll: metrics.maxScroll };
    setDragging(true);
    setActive(true);
  };

  const moveDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    const delta = event.clientY - drag.current.y;
    window.scrollTo(0, drag.current.scroll + delta * drag.current.maxScroll / drag.current.travel);
  };

  const endDrag = () => {
    setDragging(false);
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => setActive(false), 520);
  };

  const useKeyboard = (event: KeyboardEvent<HTMLDivElement>) => {
    const steps: Record<string, number> = { ArrowUp: -48, ArrowDown: 48, PageUp: -window.innerHeight * .82, PageDown: window.innerHeight * .82 };
    if (event.key === "Home") { event.preventDefault(); window.scrollTo({ top: 0, behavior: "smooth" }); return; }
    if (event.key === "End") { event.preventDefault(); window.scrollTo({ top: metrics.maxScroll, behavior: "smooth" }); return; }
    if (steps[event.key] === undefined) return;
    event.preventDefault();
    window.scrollBy({ top: steps[event.key], behavior: "smooth" });
  };

  if (!metrics.visible) return null;
  return <div className={`apple-scroll-indicator ${active || dragging ? "active" : ""} ${dragging ? "dragging" : ""}`} aria-hidden="false">
    <div className="apple-scroll-thumb" role="scrollbar" aria-label="页面滚动条" aria-controls="page-content" aria-orientation="vertical" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(metrics.value * 100)} tabIndex={0} style={{ height:metrics.height, transform:`translateY(${metrics.top}px)` }} onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag} onKeyDown={useKeyboard} />
  </div>;
}
