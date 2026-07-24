"use client";

import { useEffect, useId, useState } from "react";

export default function MarkdownMermaid({ chart }: { chart: string }) {
  const id = useId().replace(/[:]/g, "");
  const [svg, setSvg] = useState("");
  const [error, setError] = useState("");
  const [themeVersion, setThemeVersion] = useState(0);

  useEffect(() => {
    const refresh = () => setThemeVersion((version) => version + 1);
    window.addEventListener("xingyu:theme-change", refresh);
    return () => window.removeEventListener("xingyu:theme-change", refresh);
  }, []);

  useEffect(() => {
    let active = true;
    setError("");
    setSvg("");
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
      const rendered = await mermaid.render(`xingyu-mermaid-${id}`, chart);
      if (active) setSvg(rendered.svg);
    }).catch(() => {
      if (active) setError("图表语法暂时无法渲染");
    });
    return () => { active = false; };
  }, [chart, id, themeVersion]);

  if (error) return <pre className="mermaid-fallback"><code>{chart}</code></pre>;
  if (!svg) return <div className="mermaid-loading" aria-label="正在绘制图表" />;
  return <div className="mermaid-diagram" dangerouslySetInnerHTML={{ __html: svg }} />;
}
