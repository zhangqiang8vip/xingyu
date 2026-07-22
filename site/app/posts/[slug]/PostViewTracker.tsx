"use client";

import { useEffect } from "react";

export default function PostViewTracker({ slug }: { slug: string }) {
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const storageKey = "xingyu-reader-id";
      let visitor = localStorage.getItem(storageKey);
      if (!visitor) {
        visitor = crypto.randomUUID();
        localStorage.setItem(storageKey, visitor);
      }
      void fetch(`/api/views/${encodeURIComponent(slug)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visitor }),
        keepalive: true,
      });
    }, 1800);
    return () => window.clearTimeout(timer);
  }, [slug]);
  return null;
}
