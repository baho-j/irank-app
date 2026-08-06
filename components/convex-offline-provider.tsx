"use client";

import { ConvexProvider, ConvexReactClient } from "convex/react";
import { ReactNode, useState, useEffect, useSyncExternalStore } from "react";
import { useConvexOfflineDetector } from "@/lib/pwa/offline-detector";
import { useOfflineSync } from "@/hooks/use-offline";
import { WifiOff, Clock } from "lucide-react";

interface ConvexOfflineProviderProps {
    children: ReactNode;
}

function OfflineBanner() {
    const { isOffline } = useConvexOfflineDetector();
    const { queueCount, sync } = useOfflineSync();

    useEffect(() => {
        if (!("serviceWorker" in navigator)) return;

        const onMessage = (event: MessageEvent) => {
            if (event.data?.type === "SYNC_OUTBOX") void sync();
        };

        navigator.serviceWorker.addEventListener("message", onMessage);

        return () => navigator.serviceWorker.removeEventListener("message", onMessage);
    }, [sync]);
    // The server cannot know the connection state, so the banner is withheld
    // until the client has hydrated rather than rendered and then corrected.
    const hydrated = useSyncExternalStore(
        () => () => {},
        () => true,
        () => false
    );

    if (!hydrated || !isOffline) return null;

    return (
      <div className="fixed top-0 left-0 right-0 z-50 bg-orange-500 text-white px-4 py-2 text-sm font-medium">
          <div className="flex items-center justify-center gap-2">
              <WifiOff className="h-4 w-4" />
              <span>You&#39;re offline</span>
              {queueCount > 0 && (
                <>
                    <Clock className="h-4 w-4 ml-2" />
                    <span>{queueCount} action{queueCount !== 1 ? 's' : ''} queued</span>
                </>
              )}
          </div>
      </div>
    );
}

export function ConvexOfflineProvider({ children }: ConvexOfflineProviderProps) {
    const [convexClient] = useState(() => {
        const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;

        if (!convexUrl) {
            throw new Error(
              "NEXT_PUBLIC_CONVEX_URL is not set. Copy .env.example to .env.local and set it to your Convex deployment URL."
            );
        }

        return new ConvexReactClient(convexUrl);
    });

    return (
      <ConvexProvider client={convexClient}>
          <OfflineBanner />
          {children}
      </ConvexProvider>
    );
}