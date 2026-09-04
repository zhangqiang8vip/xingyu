import Link from "next/link";
import NavTools from "./NavTools";
import { NAV_DESTINATIONS, type NavCurrent } from "./nav-destinations";

/** Desktop and tablet: destinations and tools stay inline on the island. */
export default function DesktopIslandNav({ current }: { current?: NavCurrent }) {
  return <div className="nav-links nav-desktop">
    <div className="nav-primary">
      {NAV_DESTINATIONS.map((item) => <Link
        key={item.id}
        className={current === item.id ? "nav-current" : undefined}
        aria-current={current === item.id ? "page" : undefined}
        href={item.href}
        prefetch={false}
      >{item.label}</Link>)}
    </div>
    <NavTools />
  </div>;
}
