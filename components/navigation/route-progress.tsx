"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

const COMPLETE_MS = 220;

/**
 * The thin loading line across the top during navigation, in the style GitHub
 * uses. App Router gives no navigation-start event, so the bar is driven by
 * link clicks and history changes, then completed when the new route renders.
 *
 * It eases towards but never reaches the end while loading, because the real
 * duration is unknown and a bar that stalls at 100% reads as broken.
 */
export function RouteProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);
  const timers = useRef<number[]>([]);

  const clearTimers = () => {
    timers.current.forEach((id) => window.clearTimeout(id));
    timers.current = [];
  };

  useEffect(() => {
    const start = () => {
      clearTimers();
      setVisible(true);
      setProgress(8);

      // Decelerating steps: fast at first, then crawling, so the bar always
      // appears to be doing something without ever claiming to be finished.
      [[80, 35], [220, 58], [500, 72], [900, 82], [1600, 88]].forEach(
        ([delay, value]) => {
          timers.current.push(
            window.setTimeout(() => setProgress(value), delay as number)
          );
        }
      );
    };

    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      const anchor = (event.target as HTMLElement)?.closest("a");

      if (!anchor?.href || anchor.target === "_blank") return;
      if (anchor.hasAttribute("download")) return;

      const target = new URL(anchor.href, window.location.href);

      if (target.origin !== window.location.origin) return;
      if (target.pathname === window.location.pathname && target.search === window.location.search) {
        return;
      }

      start();
    };

    document.addEventListener("click", onClick, { capture: true });
    window.addEventListener("popstate", start);

    return () => {
      document.removeEventListener("click", onClick, { capture: true });
      window.removeEventListener("popstate", start);
      clearTimers();
    };
  }, []);

  // The new route has rendered, so finish and fade out.
  useEffect(() => {
    clearTimers();
    setProgress(100);

    const hide = window.setTimeout(() => {
      setVisible(false);
      setProgress(0);
    }, COMPLETE_MS);

    timers.current.push(hide);

    return () => window.clearTimeout(hide);
  }, [pathname, searchParams]);

  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none fixed inset-x-0 top-0 z-[100] h-0.5",
        !visible && "opacity-0"
      )}
      style={{ transition: visible ? undefined : "opacity 200ms ease" }}
    >
      <div
        className="h-full bg-primary shadow-[0_0_8px_rgba(240,112,0,0.7)]"
        style={{
          width: `${progress}%`,
          transition: "width 200ms ease-out",
        }}
      />
    </div>
  );
}
