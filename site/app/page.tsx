import Link from "next/link";
import { getCategories, getSiteSettings, listHomePosts } from "../db/queries";
import { estimateReadingMinutes, formatLongDate, type PageSearchParams } from "./content-utils";
import { copyrightText } from "./site-config";
import StableLink from "./StableLink";
import ModalPostLink from "./ModalPostLink";
import NavTitleChrome from "./NavTitleChrome";
import IslandSearch from "./IslandSearch";
import AdminPreviewBridge from "./AdminPreviewBridge";
import SiteNavigation from "./SiteNavigation";

export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: { searchParams: PageSearchParams }) {
  const search = await searchParams;
  const category = typeof search.category === "string" ? search.category : "all";
  const settings = await getSiteSettings();
  const heroLength = Math.max(Array.from(settings.heroLead).length, Array.from(settings.heroTail).length);
  const heroDensity = heroLength > 15 ? " dense" : heroLength > 10 ? " compact" : "";
  const [categories, rows] = await Promise.all([
    getCategories(),
    listHomePosts(category, settings.homePostLimit),
  ]);
  const [featured, ...rest] = rows;
  const selectedCategory = categories.find((item) => item.slug === category);
  const adminPreview = search.adminPreview === "home";

  return (
    <main>
      <SiteNavigation brandName={settings.brandName}>
        <NavTitleChrome targetId="home-hero-title" lead={settings.heroLead} tail={settings.heroTail} returnLabel="返回首页顶部" />
        <IslandSearch initialText={`${settings.heroLead}${settings.heroTail}`} />
      </SiteNavigation>

      <section className="hero">
        <div className="hero-glow" aria-hidden="true" />
        <div className="hero-inner">
          <p className="eyebrow" data-preview-field="tagline">{settings.tagline}</p>
          <h1 id="home-hero-title" className={`hero-pyramid-title${heroDensity}`}><span className="hero-title-line hero-title-lead" data-preview-field="heroLead">{settings.heroLead}</span><span className="hero-title-line hero-title-tail" data-preview-field="heroTail">{settings.heroTail}</span></h1>
          <p className="hero-copy" data-preview-field="description">{settings.description}</p>
          <a className="primary-button" href="#articles">开始阅读 <span>↓</span></a>
        </div>
      </section>

      <section className="article-section" id="articles">
        <div className="section-heading">
          <div><p>SELECTED WRITING</p><h2 data-preview-field="homeSectionTitle">{settings.homeSectionTitle}</h2></div>
          <form className="search" action="/archive" method="get">
            {category !== "all" && <input type="hidden" name="category" value={category} />}
            <input name="q" placeholder="搜索全部文章" aria-label="搜索全部文章" />
            <button type="submit">搜索</button>
          </form>
        </div>

        <div className="category-tabs home-category-tabs" aria-label="文章分类">
          <StableLink className={category === "all" ? "active" : ""} href="/">全部</StableLink>
          {selectedCategory && <StableLink className="active" href={`/?category=${selectedCategory.slug}`}><i style={{ background:selectedCategory.color }} />{selectedCategory.name}</StableLink>}
          <details className="archive-category-menu home-category-menu">
            <summary><span>分类</span><b>{categories.length}</b><i>⌄</i></summary>
            <div>
              <header><span>浏览分类</span><b>{categories.length} 个</b></header>
              <nav>{categories.map((item)=><StableLink key={item.id} className={category === item.slug ? "active" : ""} href={`/?category=${item.slug}`}><i style={{background:item.color}} /><span>{item.name}</span>{category === item.slug && <b>✓</b>}</StableLink>)}</nav>
            </div>
          </details>
        </div>

        {rows.length === 0 ? (
          <div className="empty-state"><b>没有找到文章</b><p>换一个关键词或分类试试看。</p></div>
        ) : (
          <div className="post-grid">
            {featured && (
              <ModalPostLink className="post-card featured" slug={featured.slug}>
                <div className="card-copy">
                  <span className="post-category" style={{ color: featured.categoryColor ?? undefined }}>{featured.categoryName}</span>
                  <h3>{featured.title}</h3><p>{featured.excerpt}</p>
                  <div className="post-meta"><time>{formatLongDate(featured.publishedAt, "未发布")}</time><span>·</span><span>{estimateReadingMinutes(featured.content)} 分钟阅读</span></div>
                </div>
                <div className="card-art warm"><span>01</span></div>
              </ModalPostLink>
            )}
            {rest.map((post, index) => (
              <ModalPostLink className={`post-card ${index % 3 === 1 ? "dark" : ""}`} slug={post.slug} key={post.id}>
                <div className="card-copy">
                  <span className="post-category" style={{ color: post.categoryColor ?? undefined }}>{post.categoryName}</span>
                  <h3>{post.title}</h3><p>{post.excerpt}</p>
                  <div className="post-meta"><time>{formatLongDate(post.publishedAt, "未发布")}</time><span>·</span><span>{post.viewCount.toLocaleString()} 阅读</span></div>
                </div>
                <span className="card-arrow">↗</span>
              </ModalPostLink>
            ))}
          </div>
        )}

        {rows.length > 0 && <div className="archive-cta"><span>首页只保留精选与最新文章</span><Link href={category === "all" ? "/archive" : `/archive?category=${category}`}>浏览全部文章 <b>→</b></Link></div>}
      </section>

      <section className="about-section" id="about">
        <div className="about-card">
          <div className="author-portrait"><img data-preview-src="avatarUrl" src={settings.avatarUrl} alt={`${settings.authorName}头像`} /><span><b data-preview-field="authorName">{settings.authorName}</b> · <b data-preview-field="brandLatin">{settings.brandLatin}</b></span></div>
          <div><p className="small-label">ABOUT <span data-preview-field="brandLatin">{settings.brandLatin}</span></p><h2 data-preview-field="homeAboutTitle">{settings.homeAboutTitle}</h2><p data-preview-field="homeAboutCopy">{settings.homeAboutCopy}</p><Link className="about-more" href="/about">更多关于<span data-preview-field="authorName">{settings.authorName}</span> <span>→</span></Link></div>
        </div>
      </section>

      <footer><b><span data-preview-field="brandName">{settings.brandName}</span>。</b><span data-preview-field="footerCopyright">{copyrightText(settings.brandName,settings.footerText)}</span><span data-preview-field="tagline">{settings.tagline}</span></footer>
      {adminPreview && <AdminPreviewBridge kind="home" />}
    </main>
  );
}
