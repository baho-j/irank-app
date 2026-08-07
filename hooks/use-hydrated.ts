"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/**
 * False during server rendering and the first client render, true afterwards.
 *
 * For anything the server cannot know — connection state, what is stored on
 * the device, a browser permission — so it can be withheld until hydration
 * rather than rendered and then corrected. Unlike a `useState` and `useEffect`
 * pair this does not schedule a second render pass.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false
  );
}
