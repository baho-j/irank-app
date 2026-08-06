import * as React from "react"

const MOBILE_BREAKPOINT = 768

function subscribe(onChange: () => void) {
  const query = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)

  query.addEventListener("change", onChange)

  return () => query.removeEventListener("change", onChange)
}

const read = () => window.innerWidth < MOBILE_BREAKPOINT

/**
 * Viewport width is browser state, so it is read from the media query rather
 * than copied into React state on mount. The server has no viewport, so it
 * renders the desktop layout and the client corrects on hydration.
 */
export function useIsMobile() {
  return React.useSyncExternalStore(subscribe, read, () => false)
}
