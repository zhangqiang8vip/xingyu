export const CONTENT_LIMITS = {
  homeDefault: 9,
  homeMaximum: 24,
  archiveBatch: 24,
  adminBatch: 20,
  searchResults: 12,
  apiMaximum: 50,
} as const;

export const DEFAULT_SITE_SETTINGS = {
  id: 1,
  brandName: "星屿",
  brandLatin: "XINGYU",
  authorName: "星屿",
  avatarUrl: "/images/xingyu-avatar.jpg",
  tagline: "设计 · 技术 · 生活",
  description: "记录那些值得慢下来思考的设计、技术与生活片段。",
  heroLead: "在喧嚣之外，",
  heroTail: "留一座思考的岛。",
  homeSectionTitle: "最近在写",
  homeAboutTitle: "你好，这里是星屿。",
  homeAboutCopy: "一座关于设计、技术与生活的数字岛屿。希望每篇文章，都能给你留下一点值得带走的东西。",
  footerText: "保持好奇，持续创造。",
  seoTitle: "星屿 · 思考与创造",
  seoDescription: "星屿个人博客，记录设计、技术与生活。",
  homePostLimit: CONTENT_LIMITS.homeDefault,
} as const;

export const DEFAULT_ABOUT_PAGE = {
  slug: "about",
  eyebrow: "ABOUT · PERSONAL NOTES",
  title: "关于星屿，也关于为什么写作。",
  excerpt: "这里不是一份履历，也不是一个需要不断更新的个人橱窗。它更像一座安静的数字岛屿，用来保存那些值得慢一点想、认真一点写的东西。",
  content: `## 写作，是把模糊的感受变成可以带走的东西。

很多想法在脑海里显得理所当然，直到尝试把它写下来，才会发现其中仍有空白。写作迫使我放慢速度，重新检查自己的判断。

我不追求每天制造内容。更希望每一篇文章，都来自一次真实的观察、一次具体的实践，或者一个值得继续追问的问题。

> 不急着成为声音最大的人。先成为一个观察得足够仔细的人。

保持好奇，持续创造，也为生活保留空白。`,
} as const;

export const DEFAULT_CONNECT_PAGE = {
  slug: "connect",
  eyebrow: "CONNECT · AI WRITING",
  title: "让 Codex，直接写进星屿。",
  excerpt: "通过一条受控的 MCP 写作通道，AI 可以读取、起草和修改内容；发布、撤回与线上页面更新仍由你确认。",
  content: `## 在 Codex 中连接星屿

星屿提供标准的 Streamable HTTP MCP 入口。它不是另一个编辑器，而是让 Codex 等 AI Agent 直接使用博客现有的文章、分类与独立页面数据。

\`\`\`text
https://zhangwansen.click/mcp
\`\`\`

先把写作令牌保存在本机环境变量中。令牌只属于你的设备，不要写进仓库或分享给其他人。

\`\`\`powershell
[Environment]::SetEnvironmentVariable(
  "XINGYU_BLOG_MCP_TOKEN",
  "你的写作令牌",
  "User"
)
\`\`\`

然后在 Codex 的 \`~/.codex/config.toml\` 中加入：

\`\`\`toml
[mcp_servers.xingyu_blog]
url = "https://zhangwansen.click/mcp"
bearer_token_env_var = "XINGYU_BLOG_MCP_TOKEN"
default_tools_approval_mode = "writes"

[mcp_servers.xingyu_blog.tools.list_categories]
approval_mode = "approve"

[mcp_servers.xingyu_blog.tools.search_posts]
approval_mode = "approve"

[mcp_servers.xingyu_blog.tools.get_post]
approval_mode = "approve"

[mcp_servers.xingyu_blog.tools.get_page]
approval_mode = "approve"

[mcp_servers.xingyu_blog.tools.create_draft]
approval_mode = "prompt"

[mcp_servers.xingyu_blog.tools.update_post]
approval_mode = "prompt"

[mcp_servers.xingyu_blog.tools.update_page]
approval_mode = "prompt"

[mcp_servers.xingyu_blog.tools.publish_post]
approval_mode = "prompt"

[mcp_servers.xingyu_blog.tools.unpublish_post]
approval_mode = "prompt"
\`\`\`

重启 Codex 后，先让它“列出星屿的文章分类”或“搜索标题包含某个关键词的文章”。只读操作可以直接完成；真正写入时，Codex 会展示将要修改的内容并等待确认。

## 推荐的写作流程

1. 先搜索，避免创建重复文章；
2. 新文章默认创建为草稿；
3. 修改前读取最新版本，使用稳定公开 ID 定位文章；
4. 确认标题、摘要、分类和正文预览；
5. 只有你明确要求上线时，才调用发布工具。

更新已发布文章、修改独立页面、发布和撤回都属于重要操作。每次写入都会返回变更字段、摘要、时间和记录编号；重复提交相同内容不会再次写入。

> AI 负责把内容送到正确的位置，是否公开仍然由你决定。

## 你可以直接这样说

- “搜索星屿里关于 Windows 环境的文章。”
- “把这份 Markdown 写成草稿，分类放到开发手记。”
- “读取这篇文章，重写开头，但先不要发布。”
- “更新接入页面的 Codex 配置，并告诉我改了哪些字段。”
- “确认无误，发布刚才的草稿。”

星屿会继续扩展更多 Agent 的接入说明，但它们共享同一套原则：令牌留在本机、读取默认开放、写入需要确认、公开动作单独授权。`,
} as const;

export function copyrightText(brandName: string, footerText: string) {
  return `© ${new Date().getFullYear()} ${brandName} · ${footerText}`;
}
