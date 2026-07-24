import type { Root } from "mdast";
import { isValidElement, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import rehypeHighlight from "rehype-highlight";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import remarkDirective from "remark-directive";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { visit } from "unist-util-visit";
import MarkdownMermaid from "./MarkdownMermaid";
import MarkdownCodeCopyButton from "./MarkdownCodeCopyButton";

const calloutNames = new Set(["tip", "note", "warning", "quote"]);
const calloutLabels: Record<string, string> = { tip: "提示", note: "笔记", warning: "注意", quote: "摘录" };

function readNodeText(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(readNodeText).join("");
  if (isValidElement<{ children?: ReactNode }>(node)) return readNodeText(node.props.children);
  return "";
}

function codeLanguage(node: ReactNode): string {
  const first = Array.isArray(node) ? node.find(isValidElement) : node;
  if (!isValidElement<{ className?: string }>(first)) return "text";
  return /language-([\w+-]+)/.exec(first.props.className || "")?.[1]?.toLowerCase() || "text";
}

function languageLabel(language: string): string {
  const names: Record<string, string> = {
    ts: "TypeScript", tsx: "TSX", js: "JavaScript", jsx: "JSX", json: "JSON",
    sh: "Shell", shell: "Shell", bash: "Bash", zsh: "Zsh", ps1: "PowerShell", powershell: "PowerShell",
    py: "Python", python: "Python", html: "HTML", xml: "XML", css: "CSS", scss: "SCSS",
    sql: "SQL", yaml: "YAML", yml: "YAML", md: "Markdown", markdown: "Markdown",
    java: "Java", go: "Go", rust: "Rust", rs: "Rust", c: "C", cpp: "C++", csharp: "C#", cs: "C#",
    diff: "Diff", dockerfile: "Dockerfile", text: "Plain text",
  };
  return names[language] || language.toUpperCase();
}

function remarkXingyuDirectives() {
  return (tree: Root) => {
    visit(tree, "containerDirective", (node) => {
      if (node.name === "details") {
        node.data = { hName: "details", hProperties: { className: ["md-details"], dataSummary: (node as { label?: string }).label || "展开补充" } };
      } else if (calloutNames.has(node.name)) {
        node.data = {
          hName: "aside",
          hProperties: { className: ["md-callout", `md-callout-${node.name}`], dataTitle: (node as { label?: string }).label || calloutLabels[node.name] },
        };
      }
    });
  };
}

const markdownSchema = {
  ...defaultSchema,
  tagNames: [...(defaultSchema.tagNames || []), "aside", "details", "summary", "figure", "figcaption", "mark", "kbd", "sub", "sup", "video", "audio", "source"],
  attributes: {
    ...defaultSchema.attributes,
    "*": [...(defaultSchema.attributes?.["*"] || []), "className", "dataTitle", "dataSummary"],
    a: [...(defaultSchema.attributes?.a || []), "target", "rel"],
    img: [...(defaultSchema.attributes?.img || []), "width", "height", "loading"],
    video: ["src", "controls", "preload", "poster", "width", "height"],
    audio: ["src", "controls", "preload"],
    source: ["src", "type"],
  },
};

export default function MarkdownRenderer({ children }: { children: string }) {
  return <ReactMarkdown
    remarkPlugins={[remarkGfm, remarkMath, remarkDirective, remarkXingyuDirectives]}
    rehypePlugins={[
      rehypeRaw,
      [rehypeSanitize, markdownSchema],
      [rehypeHighlight, { detect: true, plainText: ["mermaid", "plaintext", "text", "txt"] }],
      rehypeKatex,
    ]}
    components={{
      pre({ children: preChildren, ...props }) {
        const source = readNodeText(preChildren).replace(/\n$/, "");
        const language = codeLanguage(preChildren);
        return <div className="md-code-block"><span className="md-code-language">{languageLabel(language)}</span><pre {...props}>{preChildren}</pre><MarkdownCodeCopyButton value={source} /></div>;
      },
      code({ className, children: codeChildren, ...props }) {
        const language = /language-(\S+)/.exec(className || "")?.[1];
        if (language === "mermaid") return <MarkdownMermaid chart={String(codeChildren).replace(/\n$/, "")} />;
        return <code className={className} {...props}>{codeChildren}</code>;
      },
      details({ children: detailChildren, ...props }) {
        const summary = String((props as Record<string, unknown>)["data-summary"] || (props as Record<string, unknown>).dataSummary || "展开补充");
        return <details {...props}><summary>{summary}</summary>{detailChildren}</details>;
      },
      aside({ children: asideChildren, ...props }) {
        const title = String((props as Record<string, unknown>)["data-title"] || (props as Record<string, unknown>).dataTitle || "说明");
        return <aside {...props}><strong>{title}</strong>{asideChildren}</aside>;
      },
    }}
  >{children}</ReactMarkdown>;
}
