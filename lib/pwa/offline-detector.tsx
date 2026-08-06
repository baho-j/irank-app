"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useConvex } from "convex/react";

export interface ConvexOfflineState {
  isOffline: boolean;
  isOnline: boolean;
  lastOnlineAt: Date | null;
  lastOfflineAt: Date | null;
  connectionType: string | null;
  effectiveType: string | null;
  downlink: number | null;
  rtt: number | null;
  convexConnected: boolean;
  lastConvexDisconnect: Date | null;
  lastConvexConnect: Date | null;
}

export interface ConvexOfflineDetectorOptions {
  pollInterval?: number;
  onOnline?: () => void;
  onOffline?: () => void;
  onConnectionChange?: (state: ConvexOfflineState) => void;
}

/**
 * How often the Convex client's connection state is read. The client reports
 * its own socket status, so this is a cheap local read rather than a request.
 */
const DEFAULT_POLL_INTERVAL = 2000;

interface NetworkInformation {
  type?: string;
  effectiveType?: string;
  downlink?: number;
  rtt?: number;
  addEventListener?: (type: string, listener: () => void) => void;
  removeEventListener?: (type: string, listener: () => void) => void;
}

function networkInformation(): NetworkInformation | null {
  if (typeof navigator === "undefined") return null;

  return (
    (navigator as Navigator & { connection?: NetworkInformation }).connection ?? null
  );
}

function initialState(): ConvexOfflineState {
  const connection = networkInformation();
  const online = typeof navigator === "undefined" ? true : navigator.onLine;

  return {
    isOffline: !online,
    isOnline: online,
    lastOnlineAt: online ? new Date() : null,
    lastOfflineAt: online ? null : new Date(),
    connectionType: connection?.type ?? null,
    effectiveType: connection?.effectiveType ?? null,
    downlink: connection?.downlink ?? null,
    rtt: connection?.rtt ?? null,
    convexConnected: online,
    lastConvexDisconnect: null,
    lastConvexConnect: null,
  };
}

/**
 * Connectivity as the app actually experiences it.
 *
 * `navigator.onLine` only says a network interface exists, so it reports
 * online on a wifi network with no route out. The authoritative signal is
 * whether the Convex client holds its socket, which it reports itself — no
 * third-party host is contacted, which matters on the metered and intermittent
 * connections this runs on.
 */
export function useConvexOfflineDetector(options?: ConvexOfflineDetectorOptions) {
  const convex = useConvex();
  const [state, setState] = useState<ConvexOfflineState>(initialState);

  const callbacks = useRef(options);

  useEffect(() => {
    callbacks.current = options;
  }, [options]);

  const apply = useCallback((next: Partial<ConvexOfflineState>) => {
    setState((current) => {
      const merged = { ...current, ...next };

      if (
        merged.isOffline === current.isOffline &&
        merged.convexConnected === current.convexConnected &&
        merged.effectiveType === current.effectiveType &&
        merged.downlink === current.downlink &&
        merged.rtt === current.rtt
      ) {
        return current;
      }

      if (merged.isOffline !== current.isOffline) {
        if (merged.isOffline) callbacks.current?.onOffline?.();
        else callbacks.current?.onOnline?.();
      }

      callbacks.current?.onConnectionChange?.(merged);

      return merged;
    });
  }, []);

  const read = useCallback(() => {
    const browserOnline = typeof navigator === "undefined" ? true : navigator.onLine;

    let convexConnected = browserOnline;

    try {
      const connectionState = convex.connectionState();

      // The socket takes a moment to open on a fresh page load. Reporting
      // offline during that window flashes the banner on every navigation, so
      // the client is given the benefit of the doubt until it has connected
      // once; after that a dropped socket means what it says.
      convexConnected = connectionState.hasEverConnected
        ? connectionState.isWebSocketConnected
        : true;
    } catch {
      // An older client without connectionState falls back to the browser.
    }

    const offline = !browserOnline || !convexConnected;
    const connection = networkInformation();
    const now = new Date();

    apply({
      isOffline: offline,
      isOnline: !offline,
      convexConnected,
      lastOnlineAt: offline ? undefined : now,
      lastOfflineAt: offline ? now : undefined,
      lastConvexConnect: convexConnected ? now : undefined,
      lastConvexDisconnect: convexConnected ? undefined : now,
      connectionType: connection?.type ?? null,
      effectiveType: connection?.effectiveType ?? null,
      downlink: connection?.downlink ?? null,
      rtt: connection?.rtt ?? null,
    });

    return !offline;
  }, [apply, convex]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    read();

    const connection = networkInformation();

    window.addEventListener("online", read);
    window.addEventListener("offline", read);
    connection?.addEventListener?.("change", read);

    // The client reports its own socket changes, so this only falls back to
    // polling on a client old enough to lack the subscription.
    let unsubscribe: (() => void) | undefined;
    let interval: number | undefined;

    try {
      unsubscribe = convex.subscribeToConnectionState(() => read());
    } catch {
      interval = window.setInterval(read, options?.pollInterval ?? DEFAULT_POLL_INTERVAL);
    }

    return () => {
      unsubscribe?.();
      if (interval !== undefined) window.clearInterval(interval);
      window.removeEventListener("online", read);
      window.removeEventListener("offline", read);
      connection?.removeEventListener?.("change", read);
    };
  }, [read, convex, options?.pollInterval]);

  return {
    ...state,
    forceCheck: useCallback(async () => read(), [read]),
    updateConvexStatus: useCallback(
      (connected: boolean) => apply({ convexConnected: connected }),
      [apply]
    ),
  };
}

/**
 * Kept so callers that opted into connection tracking keep working. The state
 * now comes from the Convex client itself, so nothing needs to be patched.
 */
export function useConvexConnectionStatus() {
  const { updateConvexStatus } = useConvexOfflineDetector();

  return { updateConvexStatus };
}

export function useIsOffline(): boolean {
  return useConvexOfflineDetector().isOffline;
}

export function useIsOnline(): boolean {
  return useConvexOfflineDetector().isOnline;
}

export function useConnectionQuality(): {
  quality: "good" | "poor" | "offline" | "unknown";
  effectiveType: string | null;
  downlink: number | null;
  rtt: number | null;
  convexConnected: boolean;
} {
  const { isOffline, effectiveType, downlink, rtt, convexConnected } =
    useConvexOfflineDetector();

  const shared = { effectiveType, downlink, rtt, convexConnected };

  if (isOffline) return { quality: "offline", ...shared };

  if (effectiveType === "4g" || effectiveType === "5g") {
    return { quality: "good", ...shared };
  }

  if (effectiveType === "3g" || effectiveType === "2g") {
    return { quality: "poor", ...shared };
  }

  return { quality: "unknown", ...shared };
}
