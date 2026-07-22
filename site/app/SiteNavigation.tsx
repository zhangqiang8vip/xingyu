import Link from "next/link";
import type { ReactNode } from "react";
import MotionModeToggle from "./MotionModeToggle";
import ReadingModeToggle from "./ReadingModeToggle";
import ThemeToggle from "./ThemeToggle";

type Props = {
  brandName: string;
  children: ReactNode;
  aboutCurrent?: boolean;
};

/** Shared navigation keeps public pages structurally identical as controls evolve. */
export default function SiteNavigation({ brandName, children, aboutCurrent = false }: Props) {
  return <header className="site-nav">
    <nav>
      <Link className="brand" href="/"><span data-preview-field="brandName">{brandName}</span><span>。</span></Link>
      {children}
      <div className="nav-links">
        <div className="nav-primary">
          <Link href="/">首页</Link>
          <Link href="/archive">文章</Link>
          <Link className={aboutCurrent ? "nav-current" : undefined} href="/about">关于</Link>
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
