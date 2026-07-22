"use client";

import { useCallback, useSyncExternalStore } from "react";

type ReadingMode = "page" | "modal";

export default function ReadingModeToggle() {
  const getSnapshot = useCallback((): ReadingMode => {
    const saved = localStorage.getItem("xingyu-reading-mode");
    return saved === "page" || saved === "modal" ? saved : "modal";
  }, []);
  const subscribe = useCallback((notify: () => void) => {
    window.addEventListener("storage", notify);
    window.addEventListener("xingyu:reading-change", notify);
    return () => { window.removeEventListener("storage", notify); window.removeEventListener("xingyu:reading-change", notify); };
  }, []);
  const mode = useSyncExternalStore(subscribe, getSnapshot, () => "modal");

  const choose = (next: ReadingMode) => {
    localStorage.setItem("xingyu-reading-mode", next);
    window.dispatchEvent(new CustomEvent("xingyu:reading-change", { detail:next }));
  };

  const next = mode === "modal" ? "page" : "modal";
  const currentLabel = mode === "modal" ? "弹窗" : "跳转";
  const nextLabel = next === "modal" ? "弹窗阅读" : "跳转页面阅读";

  return <button className="reading-mode-button" type="button" onClick={() => choose(next)} aria-label={`当前${currentLabel}阅读，点击切换为${nextLabel}`} title={`切换为${nextLabel}`}>
    <i aria-hidden="true">{mode === "modal" ? "▣" : "↗"}</i><span>{currentLabel}</span>
  </button>;
}
