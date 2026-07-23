import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { CSSProperties } from "react";
import { getNextPublishedPost, getPreviousPublishedPost, getSiteSettings, type getPostByPublicId } from "../../db/queries";
import SiteNavigation from "../SiteNavigation";
import IslandSearch from "../IslandSearch";
import AdminPreviewBridge from "../AdminPreviewBridge";
import ArticleEndMark from "../ArticleEndMark";
import ModalPostLink from "../ModalPostLink";
import { formatLongDate } from "../content-utils";
import PostReadingChrome from "./[slug]/PostReadingChrome";
import PostTableOfContents from "./[slug]/PostTableOfContents";
import PostSideNavigation from "./[slug]/PostSideNavigation";
import PostViewTracker from "./[slug]/PostViewTracker";

type PublicPost = NonNullable<Awaited<ReturnType<typeof getPostByPublicId>>>;

export default async function PostPageView({ post, adminPreview = false }: { post: PublicPost; adminPreview?: boolean }) {
  const [previousPost, nextPost, settings] = await Promise.all([
    post.id < 0 ? Promise.resolve(null) : getPreviousPublishedPost(post.publishedAt, post.id),
    post.id < 0 ? Promise.resolve(null) : getNextPublishedPost(post.publishedAt, post.id),
    getSiteSettings(),
  ]);
  return <main className="post-page">
    {!adminPreview && <PostViewTracker publicId={post.publicId} />}
    <SiteNavigation brandName={settings.brandName} current="archive"><PostReadingChrome title={post.title} category={post.categoryName} color={post.categoryColor} /><IslandSearch initialText={post.title} excludeSlug={post.slug} /></SiteNavigation>
    <header className="post-hero">
      <span className="post-category" data-preview-field="categoryName" data-preview-color="categoryColor" style={{ color:post.categoryColor ?? undefined }}>{post.categoryName}</span>
      <h1 data-preview-field="title">{post.title}</h1><p data-preview-field="excerpt">{post.excerpt}</p>
      <div className="post-byline"><img className="mini-avatar" data-preview-src="avatarUrl" src={settings.avatarUrl} alt={settings.authorName} /><b data-preview-field="authorName">{settings.authorName}</b><i />
        <time data-preview-field="publishedLabel">{formatLongDate(post.publishedAt)}</time><i /><span>{post.viewCount.toLocaleString()} 阅读</span>
      </div>
    </header>
    <PostSideNavigation previousPost={previousPost} nextPost={nextPost} />
    <div className="post-reading-layout">
      <article className="prose markdown-body" data-preview-markdown="content"><ReactMarkdown remarkPlugins={[remarkGfm]}>{post.content}</ReactMarkdown><ArticleEndMark /></article>
      <PostTableOfContents key={post.publicId} articleKey={post.publicId} />
    </div>
    <section className="post-end">
      <div className="post-end-heading"><small>KEEP READING</small><h2>继续阅读</h2><span>在相邻的文字之间，继续往前。</span></div>
      <div className="post-neighbors">
        {previousPost ? <ModalPostLink className="post-neighbor previous" publicId={previousPost.publicId} slug={previousPost.slug} style={{ "--neighbor-color":previousPost.categoryColor ?? "#0071e3" } as CSSProperties}>
          <div className="neighbor-direction"><i>←</i><span>上一篇</span></div><small><i />{previousPost.categoryName}</small><h3>{previousPost.title}</h3><p>{previousPost.excerpt}</p><footer><time>{formatLongDate(previousPost.publishedAt)}</time><b>阅读文章 ↗</b></footer>
        </ModalPostLink> : <div className="post-neighbor unavailable"><div className="neighbor-direction"><i>←</i><span>上一篇</span></div><h3>这里是最新一篇</h3><p>暂时没有更新的文章了。</p><footer><Link href="/archive">查看全部文章</Link></footer></div>}
        {nextPost ? <ModalPostLink className="post-neighbor next" publicId={nextPost.publicId} slug={nextPost.slug} style={{ "--neighbor-color":nextPost.categoryColor ?? "#0071e3" } as CSSProperties}>
          <div className="neighbor-direction"><span>下一篇</span><i>→</i></div><small><i />{nextPost.categoryName}</small><h3>{nextPost.title}</h3><p>{nextPost.excerpt}</p><footer><time>{formatLongDate(nextPost.publishedAt)}</time><b>阅读文章 ↗</b></footer>
        </ModalPostLink> : <div className="post-neighbor unavailable next"><div className="neighbor-direction"><span>下一篇</span><i>→</i></div><h3>已经读到时间起点</h3><p>可以回到文章页，从其他分类继续探索。</p><footer><Link href="/archive">查看全部文章</Link></footer></div>}
      </div>
    </section>
    {adminPreview && <AdminPreviewBridge kind="article" />}
  </main>;
}
