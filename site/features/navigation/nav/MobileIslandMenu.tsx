"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import NavTools from "./NavTools";
import { NAV_DESTINATIONS, type NavCurrent } from "./nav-destinations";

/** Phone: icon trigger + sheet. Not a compressed copy of the desktop island. */
export default function MobileIslandMenu({ current }: { current?: NavCurrent }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const sheetId = useId();

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeWithEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeWithEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeWithEscape);
    };
  }, [open]);

  return <div className={`nav-mobile${open ? " open" : ""}`} ref={rootRef}>
    <button
      className="nav-mobile-trigger"
      type="button"
      aria-label={open ? "关闭菜单" : "打开菜单"}
      aria-expanded={open}
      aria-controls={sheetId}
      onClick={() => setOpen((value) => !value)}
    >
      <span className="nav-mobile-burger" aria-hidden="true">☰</span>
    </button>
    {open ? <div className="nav-mobile-sheet" id={sheetId}>
      <div className="nav-mobile-links">
        {NAV_DESTINATIONS.map((item) => <Link
          key={item.id}
          className={current === item.id ? "nav-current" : undefined}
          aria-current={current === item.id ? "page" : undefined}
          href={item.href}
          onClick={() => setOpen(false)}
        >{item.label}{current === item.id ? <i /> : null}</Link>)}
      </div>
      <div className="nav-mobile-tools">
        <NavTools />
      </div>
    </div> : null}
  </div>;
}
