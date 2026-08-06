"use client";

import { useCallback, useSyncExternalStore } from "react";

function subscribe(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  window.addEventListener("popstate", onChange);

  return () => {
    window.removeEventListener("hashchange", onChange);
    window.removeEventListener("popstate", onChange);
  };
}

const read = () => window.location.hash.replace("#", "");

/**
 * The current URL fragment, and a setter that writes it without a navigation.
 *
 * The fragment is browser state, so it is read directly rather than copied
 * into React state on mount. That also means back and forward move the page
 * between sections, which a one-off read on mount could not do.
 */
export function useLocationHash(): [string, (value: string) => void] {
  const hash = useSyncExternalStore(subscribe, read, () => "");

  const setHash = useCallback((value: string) => {
    const url = new URL(window.location.href);
    url.hash = value;
    window.history.replaceState({}, "", url.toString());
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  }, []);

  return [hash, setHash];
}
