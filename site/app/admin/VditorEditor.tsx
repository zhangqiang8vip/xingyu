"use client";

import { useEffect, useRef } from "react";
import type Vditor from "vditor";

const slashHints = [
  { html: "<b>H1</b><span>一级标题</span>", value: "# 一级标题" },
  { html: "<b>H2</b><span>二级标题</span>", value: "## 二级标题" },
  { html: "<b>H3</b><span>三级标题</span>", value: "### 三级标题" },
  { html: "<b>❞</b><span>引用</span>", value: "> 输入引用内容" },
  { html: "<b>☷</b><span>无序列表</span>", value: "- 列表项目" },
  { html: "<b>1.</b><span>有序列表</span>", value: "1. 列表项目" },
  { html: "<b>▦</b><span>表格</span>", value: "| 项目 | 内容 |\n| --- | --- |\n| 示例 | 文本 |" },
  { html: "<b>&lt;/&gt;</b><span>代码块</span>", value: "```\n在这里输入代码\n```" },
  { html: "<b>↗</b><span>链接</span>", value: "[链接文字](https://)" },
  { html: "<b>▧</b><span>图片</span>", value: "![图片说明](图片地址)" },
];

export default function VditorEditor({ value, onChange, previewMode="both" }: { value: string; onChange: (value: string) => void; previewMode?:"both"|"editor" }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<Vditor | null>(null);
  const changeRef = useRef(onChange);
  // Vditor owns its document after mounting; prop changes arrive through its input callback.
  const initialValueRef = useRef(value);

  useEffect(() => { changeRef.current = onChange; }, [onChange]);

  useEffect(() => {
    let disposed = false;
    let ready = false;
    let instance: Vditor | null = null;
    const host = hostRef.current;
    const syncEditorTheme = () => host?.classList.toggle("vditor--dark", document.documentElement.dataset.theme === "dark");
    const configureVditorMermaid = (event: Event) => {
      const script = event.target;
      if (!(script instanceof HTMLScriptElement) || script.id !== "vditorMermaidScript") return;
      const runtime = (window as Window & { mermaid?: { initialize?: (config: Record<string, unknown>) => void; __xingyuConfigured?: boolean } }).mermaid;
      if (!runtime?.initialize || runtime.__xingyuConfigured) return;
      const initialize = runtime.initialize.bind(runtime);
      runtime.initialize = (config) => initialize({
        ...config,
        fontFamily: '"PingFang SC", "Microsoft YaHei UI", "Microsoft YaHei", system-ui, sans-serif',
        altFontFamily: '"PingFang SC", "Microsoft YaHei", sans-serif',
        htmlLabels: false,
        flowchart: { ...(config.flowchart as Record<string, unknown> ?? {}), htmlLabels: false, useMaxWidth: false, wrappingWidth: 280, nodeSpacing: 34, rankSpacing: 42, padding: 18 },
      });
      runtime.__xingyuConfigured = true;
    };
    // Vditor loads Mermaid itself. Intercept the script's capture-phase load event
    // so its renderer receives the same Chinese-safe settings as the public reader.
    document.addEventListener("load", configureVditorMermaid, true);
    const themeObserver = new MutationObserver(syncEditorTheme);
    themeObserver.observe(document.documentElement, { attributes:true, attributeFilter:["data-theme"] });
    syncEditorTheme();
    const keepHintSelectionVisible = (event: KeyboardEvent) => {
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
      window.requestAnimationFrame(() => {
        host?.querySelector<HTMLElement>(".vditor-hint--current")?.scrollIntoView({ block: "nearest" });
      });
    };
    host?.addEventListener("keydown", keepHintSelectionVisible, true);
    const timer = window.setTimeout(async () => {
      if (disposed || !hostRef.current) return;
      // Keep the editor runtime out of the initial admin bundle until an editor is visible.
      const { default: VditorRuntime } = await import("vditor");
      if (disposed || !hostRef.current) return;
      const nextEditor = new VditorRuntime(hostRef.current, {
        cdn: "/vditor",
        value: initialValueRef.current,
        mode: "sv",
        lang: "zh_CN",
        height: 560,
        minHeight: 420,
        placeholder: "用 Markdown 开始写作…\n\n输入 / 插入标题、引用、表格等内容；复制图片后直接按 Ctrl+V。",
        cache: { enable: false },
        toolbar: [],
        toolbarConfig: { hide: true },
        counter: { enable: true, type: "text" },
        preview: {
          mode: previewMode,
          delay: 80,
          markdown: { sanitize: true },
        },
        hint: {
          delay: 0,
          extend: [{
            key: "/",
            hint: (keyword) => {
              const normalized = keyword.trim().toLowerCase();
              return slashHints.filter((item) => !normalized || item.html.toLowerCase().includes(normalized));
            },
          }],
        },
        upload: {
          url: "/api/media",
          fieldName: "file",
          multiple: false,
          accept: "image/jpeg,image/png,image/webp,image/gif,image/avif",
          max: 10 * 1024 * 1024,
          filename: (name) => name,
          format: (files, responseText) => {
            const response = JSON.parse(responseText) as { url?: string; error?: string };
            if (!response.url) return JSON.stringify({ code: 1, msg: response.error ?? "图片上传失败", data: null });
            return JSON.stringify({ code: 0, msg: "", data: { errFiles: [], succMap: { [files[0].name]: response.url } } });
          },
        },
        input: (nextValue) => changeRef.current(nextValue),
        after: () => {
          ready = true;
          syncEditorTheme();
          if (disposed && (nextEditor as Vditor & { vditor?: { element?: HTMLElement } }).vditor?.element) nextEditor.destroy();
        },
      });
      instance = nextEditor;
      editorRef.current = nextEditor;
    }, 50);

    return () => {
      disposed = true;
      window.clearTimeout(timer);
      themeObserver.disconnect();
      document.removeEventListener("load", configureVditorMermaid, true);
      host?.removeEventListener("keydown", keepHintSelectionVisible, true);
      if (instance && ready && (instance as Vditor & { vditor?: { element?: HTMLElement } }).vditor?.element) instance.destroy();
      if (editorRef.current === instance) editorRef.current = null;
    };
  }, [previewMode]);

  return <div className="vditor-host" ref={hostRef} />;
}
