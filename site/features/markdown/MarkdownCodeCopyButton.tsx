"use client";

import { useState } from "react";

export default function MarkdownCodeCopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  return <button className="md-code-copy" type="button" onClick={copyCode} aria-label="复制代码">
    <span aria-hidden="true">{copied ? "✓" : "⧉"}</span>{copied ? "已复制" : "复制"}
  </button>;
}
