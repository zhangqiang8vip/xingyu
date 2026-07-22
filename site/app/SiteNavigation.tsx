import Link from "next/link";
import type { ReactNode } from "react";
import MotionModeToggle from "./MotionModeToggle";
import ReadingModeToggle from "./ReadingModeToggle";
import ThemeToggle from "./ThemeToggle";

type Props = {
  brandName: string;
  children: ReactNode;
  current?: "home" | "archive" | "about";
};

/** Shared navigation keeps public pages structurally identical as controls evolve. */
export default function SiteNavigation({ brandName, children, current }: Props) {
  return <header className="site-nav">
    <nav>
      <Link className="brand" href="/" aria-label={`${brandName}首页`}>
        <span className="brand-word" data-preview-field="brandName">{brandName}</span>
        <span className="brand-orbit" aria-hidden="true"><i /></span>
      </Link>
      {children}
      <div className="nav-links">
        <div className="nav-primary">
          <Link className={current === "home" ? "nav-current" : undefined} aria-current={current === "home" ? "page" : undefined} href="/">首页</Link>
          <Link className={current === "archive" ? "nav-current" : undefined} aria-current={current === "archive" ? "page" : undefined} href="/archive">文章</Link>
          <Link className={current === "about" ? "nav-current" : undefined} aria-current={current === "about" ? "page" : undefined} href="/about">关于</Link>
        </div>
        <div className="nav-tools">
          <ReadingModeToggle />
          <MotionModeToggle />
          <ThemeToggle />
        </div>
      </div>
    </nav>
  </header>;
}
