"use client";

import { useCallback, useSyncExternalStore } from "react";

type ThemeMode = "light" | "system" | "dark";

function applyTheme(mode: ThemeMode) {
  const dark = mode === "system" ? window.matchMedia("(prefers-color-scheme: dark)").matches : mode === "dark";
  document.documentElement.dataset.themeMode = mode;
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  document.documentElement.style.colorScheme = dark ? "dark" : "light";
}

export default function ThemeToggle() {
  const getSnapshot = useCallback((): ThemeMode => {
    const saved = localStorage.getItem("xingyu-theme-mode");
    const legacy = localStorage.getItem("xingyu-theme");
    return saved === "light" || saved === "dark" || saved === "system" ? saved : legacy === "light" || legacy === "dark" ? legacy : "system";
  }, []);
  const subscribe = useCallback((notify: () => void) => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const sync = () => {
      const next = getSnapshot();
      applyTheme(next);
      notify();
    };
    media.addEventListener("change", sync);
    window.addEventListener("storage", sync);
    window.addEventListener("xingyu:theme-change", sync);
    return () => { media.removeEventListener("change", sync); window.removeEventListener("storage", sync); window.removeEventListener("xingyu:theme-change", sync); };
  }, [getSnapshot]);
  const mode = useSyncExternalStore(subscribe, getSnapshot, () => "system");

  const choose = (next: ThemeMode) => {
    applyTheme(next);
    localStorage.setItem("xingyu-theme-mode", next);
    localStorage.removeItem("xingyu-theme");
    window.dispatchEvent(new CustomEvent("xingyu:theme-change", { detail:next }));
  };

  const options: Array<{ value: ThemeMode; icon: string; label: string }> = [
    { value: "system", icon: "◐", label: "跟随系统" },
    { value: "light", icon: "☀", label: "明亮模式" },
    { value: "dark", icon: "☾", label: "深色模式" },
  ];
  const currentIndex = options.findIndex((option) => option.value === mode);
  const current = options[currentIndex];
  const next = options[(currentIndex + 1) % options.length];

  return <button className="theme-button" type="button" onClick={() => choose(next.value)} aria-label={`当前${current.label}，点击切换为${next.label}`} title={`当前：${current.label} · 点击切换`}><span aria-hidden="true">{current.icon}</span></button>;
}
