import type { Root } from "mdast";
import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import remarkDirective from "remark-directive";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { visit } from "unist-util-visit";
import MarkdownMermaid from "./MarkdownMermaid";

const calloutNames = new Set(["tip", "note", "warning", "quote"]);
const calloutLabels: Record<string, string> = { tip: "提示", note: "笔记", warning: "注意", quote: "摘录" };

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
    rehypePlugins={[rehypeRaw, [rehypeSanitize, markdownSchema], rehypeKatex]}
    components={{
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
