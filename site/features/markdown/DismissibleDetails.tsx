"use client";

import { useEffect } from "react";

const selector = "details[data-dismiss-outside][open]";

export default function DismissibleDetails() {
  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      document.querySelectorAll<HTMLDetailsElement>(selector).forEach((details) => {
        if (!details.contains(target)) details.open = false;
      });
    };
    const closeWithEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      document.querySelectorAll<HTMLDetailsElement>(selector).forEach((details) => {
        if (!details.open) return;
        details.open = false;
        details.querySelector<HTMLElement>("summary")?.focus({ preventScroll:true });
      });
    };
    document.addEventListener("pointerdown", closeOutside, true);
    document.addEventListener("keydown", closeWithEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside, true);
      document.removeEventListener("keydown", closeWithEscape);
    };
  }, []);

  return null;
}
