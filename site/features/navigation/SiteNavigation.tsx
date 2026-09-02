import Link from "next/link";
import type { ReactNode } from "react";
import DesktopIslandNav from "./nav/DesktopIslandNav";
import MobileIslandMenu from "./nav/MobileIslandMenu";
import type { NavCurrent } from "./nav/nav-destinations";

type Props = {
  brandName: string;
  children: ReactNode;
  current?: NavCurrent;
};

/** Shared island chrome. Desktop/tablet and phone are separate trees. */
export default function SiteNavigation({ brandName, children, current }: Props) {
  return <header className="site-nav">
    <nav>
      <Link className="brand" href="/" aria-label={`${brandName}首页`}>
        <span className="brand-word" data-preview-field="brandName">{brandName}</span>
        <span className="brand-orbit" aria-hidden="true"><i /></span>
      </Link>
      {children}
      <DesktopIslandNav current={current} />
      <MobileIslandMenu current={current} />
    </nav>
  </header>;
}
