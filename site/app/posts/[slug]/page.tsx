import Link from "next/link";
import { notFound } from "next/navigation";
import { getNextPublishedPost, getPostBySlug, getPreviousPublishedPost, getSiteSettings } from "../../../db/queries";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import PostReadingChrome from "./PostReadingChrome";
import PostTableOfContents from "./PostTableOfContents";
import PostSideNavigation from "./PostSideNavigation";
import IslandSearch from "../../IslandSearch";
import type { CSSProperties } from "react";
import PostViewTracker from "./PostViewTracker";
import AdminPreviewBridge from "../../AdminPreviewBridge";
import { formatLongDate, type PageSearchParams } from "../../content-utils";
import SiteNavigation from "../../SiteNavigation";

export const dynamic = "force-dynamic";

export default async function PostPage({ params,searchParams }: { params: Promise<{ slug: string }>;searchParams:PageSearchParams }) {
  const { slug } = await params;
  const search=await searchParams;
  const adminPreview=search.adminPreview==="article";
  const storedPost = await getPostBySlug(slug);
  if (!storedPost&&!adminPreview) notFound();
  const post=storedPost??{id:-1,title:"未命名文章",slug:"preview",excerpt:"文章摘要会显示在这里。",content:"从后台开始写作，正文会在这里实时呈现。",categoryName:"未分类",categoryColor:"#0071e3",publishedAt:null,viewCount:0};
  const [previousPost, nextPost, settings] = await Promise.all([
    post.id<0?Promise.resolve(null):getPreviousPublishedPost(post.publishedAt, post.id),
    post.id<0?Promise.resolve(null):getNextPublishedPost(post.publishedAt, post.id),
    getSiteSettings(),
  ]);
  return (
    <main className="post-page">
      {!adminPreview&&<PostViewTracker slug={post.slug} />}
      <SiteNavigation brandName={settings.brandName}><PostReadingChrome title={post.title} category={post.categoryName} color={post.categoryColor} /><IslandSearch initialText={post.title} excludeSlug={post.slug} /></SiteNavigation>
      <header className="post-hero">
        <span className="post-category" data-preview-field="categoryName" data-preview-color="categoryColor" style={{ color: post.categoryColor ?? undefined }}>{post.categoryName}</span>
        <h1 data-preview-field="title">{post.title}</h1><p data-preview-field="excerpt">{post.excerpt}</p>
        <div className="post-byline"><img className="mini-avatar" data-preview-src="avatarUrl" src={settings.avatarUrl} alt={settings.authorName} /><b data-preview-field="authorName">{settings.authorName}</b><i />
          <time data-preview-field="publishedLabel">{formatLongDate(post.publishedAt)}</time><i /><span>{post.viewCount.toLocaleString()} 阅读</span>
        </div>
      </header>
      <PostSideNavigation previousPost={previousPost} nextPost={nextPost} />
      <div className="post-reading-layout">
        <article className="prose markdown-body" data-preview-markdown="content">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{post.content}</ReactMarkdown>
          <div className="end-mark">···</div>
        </article>
        <PostTableOfContents key={post.slug} articleKey={post.slug} />
      </div>
      <section className="post-end">
        <div className="post-end-heading"><small>KEEP READING</small><h2>继续阅读</h2><span>在相邻的文字之间，继续往前。</span></div>
        <div className="post-neighbors">
          {previousPost ? <Link className="post-neighbor previous" href={`/posts/${previousPost.slug}`} style={{ "--neighbor-color": previousPost.categoryColor ?? "#0071e3" } as CSSProperties}>
            <div className="neighbor-direction"><i>←</i><span>上一篇</span></div><small><i />{previousPost.categoryName}</small><h3>{previousPost.title}</h3><p>{previousPost.excerpt}</p><footer><time>{formatLongDate(previousPost.publishedAt)}</time><b>阅读文章 ↗</b></footer>
          </Link> : <div className="post-neighbor unavailable"><div className="neighbor-direction"><i>←</i><span>上一篇</span></div><h3>这里是最新一篇</h3><p>暂时没有更新的文章了。</p><footer><Link href="/archive">查看全部文章</Link></footer></div>}
          {nextPost ? <Link className="post-neighbor next" href={`/posts/${nextPost.slug}`} style={{ "--neighbor-color": nextPost.categoryColor ?? "#0071e3" } as CSSProperties}>
            <div className="neighbor-direction"><span>下一篇</span><i>→</i></div><small><i />{nextPost.categoryName}</small><h3>{nextPost.title}</h3><p>{nextPost.excerpt}</p><footer><time>{formatLongDate(nextPost.publishedAt)}</time><b>阅读文章 ↗</b></footer>
          </Link> : <div className="post-neighbor unavailable next"><div className="neighbor-direction"><span>下一篇</span><i>→</i></div><h3>已经读到时间起点</h3><p>可以回到文章页，从其他分类继续探索。</p><footer><Link href="/archive">查看全部文章</Link></footer></div>}
        </div>
      </section>
      {adminPreview&&<AdminPreviewBridge kind="article" />}
    </main>
  );
}
