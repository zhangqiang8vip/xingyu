"use client";

import { useEffect, useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type PreviewKind = "home" | "about" | "article";
type PreviewPayload = Record<string, string | number>;

/**
 * Keeps an admin preview on the real public route. The iframe renders the
 * production page and this bridge only overlays unsaved field values.
 */
export default function AdminPreviewBridge({ kind }: { kind: PreviewKind }) {
  const [payload, setPayload] = useState<PreviewPayload | null>(null);
  const [markdownTarget, setMarkdownTarget] = useState<Element | null>(null);

  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type !== "xingyu:admin-preview" || event.data?.kind !== kind) return;
      const nextPayload = event.data.payload ?? {};
      if ((kind === "about" || kind === "article") && typeof nextPayload.content === "string") {
        const target = document.querySelector("[data-preview-markdown='content']");
        if (target !== markdownTarget) {
          target?.replaceChildren();
          setMarkdownTarget(target);
        }
      }
      setPayload(nextPayload);
    };
    window.addEventListener("message", receive);
    window.parent.postMessage({ type: "xingyu:admin-preview-ready", kind }, window.location.origin);
    return () => window.removeEventListener("message", receive);
  }, [kind, markdownTarget]);

  useLayoutEffect(() => {
    if (!payload) return;
    Object.entries(payload).forEach(([field, value]) => {
      document.querySelectorAll<HTMLElement>(`[data-preview-field="${field}"]`).forEach((node) => {
        node.textContent = String(value ?? "");
      });
      document.querySelectorAll<HTMLImageElement>(`[data-preview-src="${field}"]`).forEach((node) => {
        node.src = String(value ?? "");
      });
    });

    if (kind === "home") {
      const title = document.getElementById("home-hero-title");
      const longest = Math.max(String(payload.heroLead ?? "").length, String(payload.heroTail ?? "").length);
      title?.classList.toggle("dense", longest > 15);
      title?.classList.toggle("compact", longest > 10 && longest <= 15);
    }

    if (kind === "article") {
      document.querySelectorAll<HTMLElement>("[data-preview-color='categoryColor']").forEach((node) => {
        node.style.color = String(payload.categoryColor ?? "#0071e3");
      });
    }
  }, [kind, payload]);

  if (!payload || typeof payload.content !== "string" || !markdownTarget) return null;
  return createPortal(<ReactMarkdown remarkPlugins={[remarkGfm]}>{payload.content}</ReactMarkdown>, markdownTarget);
}
