"use client";

import { useCallback, useSyncExternalStore } from "react";

type MotionMode = "flip" | "static";

export default function MotionModeToggle() {
  const getSnapshot = useCallback((): MotionMode => {
    const saved = localStorage.getItem("xingyu-motion-mode");
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    return saved === "flip" || saved === "static" ? saved : reduced ? "static" : "flip";
  }, []);
  const subscribe = useCallback((notify: () => void) => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    media.addEventListener("change", notify);
    window.addEventListener("storage", notify);
    window.addEventListener("xingyu:motion-change", notify);
    return () => { media.removeEventListener("change", notify); window.removeEventListener("storage", notify); window.removeEventListener("xingyu:motion-change", notify); };
  }, []);
  const mode = useSyncExternalStore(subscribe, getSnapshot, () => "flip");
  const select = () => {
    const next: MotionMode = mode === "flip" ? "static" : "flip";
    localStorage.setItem("xingyu-motion-mode", next);
    window.dispatchEvent(new CustomEvent("xingyu:motion-change", { detail:next }));
    navigator.vibrate?.(8);
  };
  const currentLabel = mode === "flip" ? "动效" : "静态";
  const nextLabel = mode === "flip" ? "静态切换" : "翻页动效";
  return <button className={`motion-mode-button ${mode}`} type="button" onClick={select} aria-label={`当前${currentLabel}，点击切换为${nextLabel}`} title={`切换为${nextLabel}`}>
    <i aria-hidden="true" /><span>{currentLabel}</span>
  </button>;
}
