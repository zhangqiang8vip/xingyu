"use client";

import { useEffect, useId, useState } from "react";

export default function MarkdownMermaid({ chart }: { chart: string }) {
  const id = useId().replace(/[:]/g, "");
  const [svg, setSvg] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const mermaidModuleUrl = "https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs";
    void import(/* @vite-ignore */ mermaidModuleUrl).then(async ({ default: mermaid }) => {
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: "strict",
        theme: document.documentElement.dataset.theme === "dark" ? "dark" : "base",
        themeVariables: document.documentElement.dataset.theme === "dark"
          ? { background: "transparent", primaryColor: "#24242a", primaryTextColor: "#f3f3f6", lineColor: "#8e8e98" }
          : { background: "transparent", primaryColor: "#f3f5fa", primaryTextColor: "#1d1d20", lineColor: "#777b85" },
      });
      const rendered = await mermaid.render(`xingyu-mermaid-${id}`, chart);
      if (active) setSvg(rendered.svg);
    }).catch(() => {
      if (active) setError("图表语法暂时无法渲染");
    });
    return () => { active = false; };
  }, [chart, id]);

  if (error) return <pre className="mermaid-fallback"><code>{chart}</code></pre>;
  if (!svg) return <div className="mermaid-loading" aria-label="正在绘制图表" />;
  return <div className="mermaid-diagram" dangerouslySetInnerHTML={{ __html: svg }} />;
}
