"use client";

import { forwardRef, lazy, Suspense, useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";

type Variant = "page" | "glass" | "dissolve" | "lift";
type Phase = "idle" | "leaving" | "entering";
type Direction = "left" | "right";
type NavigationDetail = { href:string; direction?:Direction };
type FlipState = { href:string; targetPath:string; direction:Direction; currentHtml:string; targetHtml:string; scrollY:number; navigating:boolean };
type PageFlipHandle = { pageFlip?: () => { flipNext?: (corner?: string) => void }; getPageFlip?: () => { flipNext?: (corner?: string) => void } };
const variants: Variant[] = ["page", "glass", "dissolve", "lift"];
const loadFlipBook = () => import("react-pageflip");
const HTMLFlipBook = lazy(loadFlipBook);

export function transitionTo(href: string, direction?: Direction) {
  const event = new CustomEvent<NavigationDetail>("xingyu:navigate", { detail:{ href, direction }, cancelable:true });
  if (window.dispatchEvent(event)) window.location.assign(href);
}

export default function RouteTransition({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [phase, setPhase] = useState<Phase>("idle");
  const [variant, setVariant] = useState<Variant>("page");
  const [flip, setFlip] = useState<FlipState | null>(null);
  const active = useRef(false);

  useEffect(() => {
    // Warm the optional animation after first paint without delaying page content.
    const preload = () => { if (localStorage.getItem("xingyu-motion-mode") !== "static") void loadFlipBook(); };
    const idleWindow = window as Window & { requestIdleCallback?: (callback: () => void) => number; cancelIdleCallback?: (id: number) => void };
    if (idleWindow.requestIdleCallback) {
      const id = idleWindow.requestIdleCallback(preload);
      return () => idleWindow.cancelIdleCallback?.(id);
    }
    const id = window.setTimeout(preload, 400);
    return () => window.clearTimeout(id);
  }, []);
  const pending = useRef(false);
  const previousVariant = useRef<Variant>("page");
  const cache = useRef(new Map<string, Promise<string | null>>());
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadSnapshot = useCallback((href: string) => {
    const url = new URL(href, window.location.href);
    const key = url.pathname + url.search;
    const cached = cache.current.get(key);
    if (cached) return cached;
    const request = fetch(key, { headers:{ Accept:"text/html" }, credentials:"same-origin" })
      .then(async (response) => response.ok ? extractSnapshot(await response.text()) : null)
      .catch(() => null);
    cache.current.set(key, request);
    return request;
  }, []);

  useEffect(() => {
    const preload = () => {
      document.querySelectorAll<HTMLAnchorElement>('a[data-route-direction][href]').forEach((anchor) => { void loadSnapshot(anchor.href); });
    };
    const timer = setTimeout(preload, 180);
    return () => clearTimeout(timer);
  }, [loadSnapshot, pathname]);

  useEffect(() => {
    const chooseVariant = () => {
      const choices = variants.filter((item) => item !== previousVariant.current);
      const next = choices[Math.floor(Math.random() * choices.length)] ?? "glass";
      previousVariant.current = next;
      return next;
    };
    const navigate = async (href: string, direction?: Direction) => {
      if (active.current) return;
      const target = new URL(href, window.location.href);
      const current = new URL(window.location.href);
      if (target.origin !== current.origin) { window.location.assign(target.href); return; }
      if (target.pathname === current.pathname && target.search === current.search) {
        if (target.hash) document.querySelector(target.hash)?.scrollIntoView({ behavior:"smooth" });
        return;
      }
      if (!motionEnabled()) {
        router.push(target.pathname + target.search + target.hash);
        return;
      }
      if (direction) {
        active.current = true;
        pending.current = true;
        const currentRoot = document.querySelector<HTMLElement>(".route-transition-content");
        const currentHtml = currentRoot?.innerHTML ?? "";
        const targetHtml = await loadSnapshot(target.href);
        if (!currentHtml || !targetHtml) {
          active.current = false;
          pending.current = false;
          router.push(target.pathname + target.search + target.hash);
          return;
        }
        setFlip({ href:target.pathname + target.search + target.hash, targetPath:target.pathname, direction, currentHtml, targetHtml, scrollY:window.scrollY, navigating:false });
        return;
      }
      active.current = true;
      pending.current = true;
      setVariant(chooseVariant());
      setPhase("leaving");
      leaveTimer.current = setTimeout(() => router.push(target.pathname + target.search + target.hash), 16);
      settleTimer.current = setTimeout(() => { active.current = false; pending.current = false; setPhase("idle"); }, 1200);
    };
    const handleCustomNavigation = (event: Event) => {
      const customEvent = event as CustomEvent<NavigationDetail>;
      customEvent.preventDefault();
      void navigate(customEvent.detail.href, customEvent.detail.direction);
    };
    const handleClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element | null)?.closest<HTMLAnchorElement>("a[href]");
      if (!anchor || anchor.target || anchor.hasAttribute("download") || anchor.dataset.routeTransition === "none") return;
      const target = new URL(anchor.href, window.location.href);
      if (target.origin !== window.location.origin || target.pathname.startsWith("/admin") || (target.pathname === window.location.pathname && target.search === window.location.search && target.hash)) return;
      event.preventDefault();
      const direction = anchor.dataset.routeDirection === "left" || anchor.closest(".previous") ? "left" : anchor.dataset.routeDirection === "right" || anchor.closest(".next") ? "right" : undefined;
      void navigate(target.href, direction);
    };
    window.addEventListener("xingyu:navigate", handleCustomNavigation);
    document.addEventListener("click", handleClick);
    return () => {
      window.removeEventListener("xingyu:navigate", handleCustomNavigation);
      document.removeEventListener("click", handleClick);
      if (leaveTimer.current) clearTimeout(leaveTimer.current);
      if (settleTimer.current) clearTimeout(settleTimer.current);
    };
  }, [loadSnapshot, router]);

  useEffect(() => {
    if (flip) {
      if (flip.navigating && pathname === flip.targetPath) {
        const timer = setTimeout(() => { setFlip(null); active.current = false; pending.current = false; }, 80);
        return () => clearTimeout(timer);
      }
      return;
    }
    if (!pending.current) {
      if (!motionEnabled()) return;
      const choices = variants.filter((item) => item !== previousVariant.current);
      const next = choices[Math.floor(Math.random() * choices.length)] ?? "dissolve";
      previousVariant.current = next;
      setVariant(next);
    }
    setPhase("entering");
    const timer = setTimeout(() => { active.current = false; pending.current = false; setPhase("idle"); }, 360);
    return () => clearTimeout(timer);
  }, [flip, pathname]);

  const finishFlip = () => {
    if (!flip || flip.navigating) return;
    setFlip((current) => current ? { ...current, navigating:true } : current);
    router.push(flip.href);
  };

  return <div className={`route-transition route-${variant} route-${phase}`}>
    <div className="route-transition-content">{children}</div>
    <div className="route-transition-veil" aria-hidden="true"><i /><b /></div>
    {flip && <PageFlipOverlay key={`${flip.href}-${flip.direction}`} state={flip} onComplete={finishFlip} />}
  </div>;
}

const SnapshotPage = forwardRef<HTMLDivElement, { html:string; scrollY:number; current:boolean; mirrored:boolean }>(function SnapshotPage({ html, scrollY, current, mirrored }, ref) {
  return <div ref={ref} className={`pageflip-snapshot-page ${current ? "current" : "target"}`}>
    <div className="pageflip-snapshot-document" style={{ "--snapshot-scroll":`${scrollY}px`, transform:`translate3d(0,-${scrollY}px,0) ${mirrored ? "scaleX(-1)" : ""}` } as CSSProperties} dangerouslySetInnerHTML={{ __html:html }} />
  </div>;
});

function PageFlipOverlay({ state, onComplete }: { state:FlipState; onComplete:() => void }) {
  const bookRef = useRef<PageFlipHandle | null>(null);
  const started = useRef(false);
  useEffect(() => {
    const bodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const fallback = setTimeout(onComplete, 980);
    return () => { clearTimeout(fallback); document.body.style.overflow = bodyOverflow; };
  }, [onComplete]);
  const start = () => {
    if (started.current) return;
    started.current = true;
    setTimeout(() => {
      const book = bookRef.current?.pageFlip?.() ?? bookRef.current?.getPageFlip?.();
      book?.flipNext?.("bottom");
      setTimeout(onComplete, 820);
      navigator.vibrate?.(12);
    }, 70);
  };
  const mirrored = state.direction === "right";
  const pages = [
    <SnapshotPage key="current" html={state.currentHtml} scrollY={state.scrollY} current mirrored={mirrored} />,
    <SnapshotPage key="target" html={state.targetHtml} scrollY={0} current={false} mirrored={mirrored} />,
  ];
  return <div className={`pageflip-transition-overlay direction-${state.direction}`} aria-hidden="true">
    <div className="pageflip-transition-stage"><Suspense fallback={null}><HTMLFlipBook
      ref={bookRef}
      className="pageflip-transition-book"
      style={{}}
      width={window.innerWidth}
      height={window.innerHeight}
      minWidth={window.innerWidth}
      maxWidth={window.innerWidth}
      minHeight={window.innerHeight}
      maxHeight={window.innerHeight}
      size="fixed"
      startPage={0}
      drawShadow
      flippingTime={760}
      usePortrait
      startZIndex={0}
      autoSize={false}
      maxShadowOpacity={0.32}
      showCover={false}
      mobileScrollSupport={false}
      clickEventForward={false}
      useMouseEvents={false}
      swipeDistance={30}
      showPageCorners={false}
      disableFlipByClick
      onInit={start}
    >{pages}</HTMLFlipBook></Suspense></div>
  </div>;
}

function extractSnapshot(html: string) {
  const parsed = new DOMParser().parseFromString(html, "text/html");
  parsed.querySelectorAll("script, .reader-modal").forEach((node) => node.remove());
  syncPersistedControls(parsed);
  const root = parsed.querySelector(".route-transition-content");
  return root?.innerHTML ?? parsed.querySelector("main")?.outerHTML ?? null;
}

function syncPersistedControls(parsed: Document) {
  const readingMode = localStorage.getItem("xingyu-reading-mode") === "page" ? "page" : "modal";
  parsed.querySelectorAll<HTMLElement>(".reading-mode-button").forEach((button) => {
    const icon = button.querySelector("i");
    const label = button.querySelector("span");
    if (icon) icon.textContent = readingMode === "page" ? "↗" : "▣";
    if (label) label.textContent = readingMode === "page" ? "跳转" : "弹窗";
  });

  const savedMotion = localStorage.getItem("xingyu-motion-mode");
  const motionMode = savedMotion === "static" || savedMotion === "flip"
    ? savedMotion
    : window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "static" : "flip";
  parsed.querySelectorAll<HTMLElement>(".motion-mode-button").forEach((button) => {
    button.classList.remove("flip", "static");
    button.classList.add(motionMode);
    const label = button.querySelector("span");
    if (label) label.textContent = motionMode === "flip" ? "动效" : "静态";
  });
}

function motionEnabled() {
  const saved = localStorage.getItem("xingyu-motion-mode");
  if (saved === "flip") return true;
  if (saved === "static") return false;
  return !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
