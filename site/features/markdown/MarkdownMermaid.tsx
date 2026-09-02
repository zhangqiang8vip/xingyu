"use client";

import { useEffect, useId, useState } from "react";

export default function MarkdownMermaid({ chart }: { chart: string }) {
  const id = useId().replace(/[:]/g, "");
  const [rendered, setRendered] = useState({ key: "", svg: "", error: false });
  const [themeVersion, setThemeVersion] = useState(0);
  const renderKey = `${chart}\u0000${themeVersion}`;

  useEffect(() => {
    const refresh = () => setThemeVersion((version) => version + 1);
    window.addEventListener("xingyu:theme-change", refresh);
    return () => window.removeEventListener("xingyu:theme-change", refresh);
  }, []);

  useEffect(() => {
    let active = true;
    void import("mermaid").then(async ({ default: mermaid }) => {
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: "strict",
        fontFamily: '"PingFang SC", "Microsoft YaHei UI", "Microsoft YaHei", system-ui, sans-serif',
        fontSize: 15,
        htmlLabels: false,
        flowchart: {
          useMaxWidth: false,
          wrappingWidth: 280,
          nodeSpacing: 34,
          rankSpacing: 42,
          padding: 18,
        },
        theme: document.documentElement.dataset.theme === "dark" ? "dark" : "base",
        themeVariables: document.documentElement.dataset.theme === "dark"
          ? { background: "transparent", primaryColor: "#26262c", primaryBorderColor: "#51515b", primaryTextColor: "#f3f3f6", lineColor: "#81818d", edgeLabelBackground: "#1d1d21" }
          : { background: "transparent", primaryColor: "#f5f7fb", primaryBorderColor: "#c9ced8", primaryTextColor: "#1d1d20", lineColor: "#737986", edgeLabelBackground: "#ffffff" },
      });
      const result = await mermaid.render(`xingyu-mermaid-${id}`, chart);
      if (active) setRendered({ key: renderKey, svg: result.svg, error: false });
    }).catch(() => {
      if (active) setRendered({ key: renderKey, svg: "", error: true });
    });
    return () => { active = false; };
  }, [chart, id, renderKey, themeVersion]);

  if (rendered.key !== renderKey) return <div className="mermaid-loading" aria-label="正在绘制图表" />;
  if (rendered.error) return <pre className="mermaid-fallback"><code>{chart}</code></pre>;
  return <div className="mermaid-diagram" dangerouslySetInnerHTML={{ __html: rendered.svg }} />;
}
