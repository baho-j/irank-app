"use client"

import { useState, useEffect } from "react"
import { WifiOff, Clock, CheckCircle, Wifi, AlertTriangle, Zap } from "lucide-react"
import { useConvexOfflineDetector, useConvexConnectionStatus } from "@/lib/pwa/offline-detector"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"

export function AdvancedOfflineSheet() {
  const {
    isOffline,
    isOnline,
    lastOfflineAt,
    effectiveType,
    downlink,
    rtt,
    convexConnected,
  } = useConvexOfflineDetector()

  useConvexConnectionStatus()

  const [showSheet, setShowSheet] = useState(false)
  const [justWentOnline, setJustWentOnline] = useState(false)
  const [previousOfflineState, setPreviousOfflineState] = useState(isOffline)
  const [previousConvexState, setPreviousConvexState] = useState(convexConnected)

  // Transitions are detected while rendering, so the sheet appears on the same
  // paint as the change. Only the auto-hide timers remain in an effect.
  if (previousOfflineState !== isOffline) {
    setPreviousOfflineState(isOffline)
    setShowSheet(true)
    setJustWentOnline(!isOffline)
  }

  if (previousConvexState !== convexConnected && isOnline) {
    setPreviousConvexState(convexConnected)
    setShowSheet(true)
    setJustWentOnline(convexConnected && !isOffline)
  }

  // A "back online" message is transient; being offline stays on screen.
  useEffect(() => {
    if (!justWentOnline) return

    const timer = setTimeout(() => {
      setShowSheet(false)
      setJustWentOnline(false)
    }, 3000)

    return () => clearTimeout(timer)
  }, [justWentOnline])

  const getOfflineDuration = () => {
    if (!lastOfflineAt) return ""
    const now = new Date()
    const diffMs = now.getTime() - lastOfflineAt.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMins / 60)

    if (diffHours > 0) {
      return `for ${diffHours}h ${diffMins % 60}m`
    } else if (diffMins > 0) {
      return `for ${diffMins}m`
    } else {
      return "just now"
    }
  }

  const getConnectionQuality = () => {
    if (isOffline) return null

    if (effectiveType === '4g' || effectiveType === '5g') {
      return 'good'
    } else if (effectiveType === '3g') {
      return 'fair'
    } else if (effectiveType === '2g') {
      return 'slow'
    }

    // Fallback based on downlink speed
    if (downlink && downlink > 10) return 'good'
    if (downlink && downlink > 1.5) return 'fair'
    if (downlink && downlink > 0) return 'slow'

    return 'unknown'
  }

  const getSheetConfig = () => {
    if (justWentOnline) {
      const quality = getConnectionQuality()
      let qualityText = ''

      if (quality === 'good') qualityText = 'Fast connection'
      else if (quality === 'fair') qualityText = 'Good connection'
      else if (quality === 'slow') qualityText = 'Slow connection'

      return {
        icon: <CheckCircle className="h-6 w-6 text-green-500" />,
        title: "Back Online",
        description: `Connection restored${qualityText ? ` • ${qualityText}` : ''}`,
        variant: "success" as const,
      }
    } else if (isOffline) {
      // Check if we have offline capabilities (cached data)
      const hasOfflineData = typeof window !== 'undefined' &&
        localStorage.getItem("irank_auth_token") &&
        localStorage.getItem("irank_user_data")

      if (hasOfflineData) {
        return {
          icon: <Clock className="h-6 w-6 text-amber-500 animate-pulse" />,
          title: "Offline Mode",
          description: `Working offline ${getOfflineDuration()}`,
          details: "Limited features are available while offline. Some data may not be up to date.",
          variant: "warning" as const,
        }
      } else {
        return {
          icon: <WifiOff className="h-6 w-6 text-red-500 animate-bounce" />,
          title: "No Connection",
          description: `Offline ${getOfflineDuration()}`,
          details: "Please check your internet connection and try again.",
          variant: "error" as const,
        }
      }
    } else if (isOnline && !convexConnected) {
      return {
        icon: <Zap className="h-6 w-6 text-blue-500 animate-pulse" />,
        title: "Reconnecting",
        description: "App services temporarily unavailable",
        details: "We're trying to reconnect to our servers. Please wait a moment.",
        variant: "info" as const,
      }
    } else if (isOnline) {
      const quality = getConnectionQuality()

      if (quality === 'slow') {
        return {
          icon: <AlertTriangle className="h-6 w-6 text-yellow-500" />,
          title: "Slow Connection",
          description: "Limited connectivity detected",
          details: "Some features may be delayed due to poor network conditions.",
          variant: "warning" as const,
        }
      }
    }

    return null
  }

  const config = getSheetConfig()

  return (
    <Sheet open={showSheet} onOpenChange={setShowSheet}>
      <SheetContent side="top" className="w-full">
        {config && (
          <>
            <SheetHeader className="text-center">
              <div className="flex items-center justify-center mb-4">
                {config.icon}
              </div>
              <SheetTitle className="text-xl">{config.title}</SheetTitle>
              <SheetDescription className="text-base">
                {config.description}
              </SheetDescription>
            </SheetHeader>

            {config.details && (
              <div className="mt-4 p-3 bg-muted rounded-lg">
                <p className="text-sm text-muted-foreground">{config.details}</p>
              </div>
            )}

            
            {isOnline && !isOffline && (effectiveType || downlink || rtt) && (
              <div className="mt-6 space-y-3">
                <h4 className="text-sm font-medium">Connection Details</h4>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  {effectiveType && (
                    <div className="flex items-center space-x-2">
                      <Wifi className="h-4 w-4 text-muted-foreground" />
                      <span className="text-muted-foreground">Network:</span>
                      <span className="font-medium">{effectiveType.toUpperCase()}</span>
                    </div>
                  )}
                  {downlink && (
                    <div className="flex items-center space-x-2">
                      <span className="text-muted-foreground">Speed:</span>
                      <span className="font-medium">{downlink.toFixed(1)} Mbps</span>
                    </div>
                  )}
                  {rtt && (
                    <div className="flex items-center space-x-2">
                      <span className="text-muted-foreground">Latency:</span>
                      <span className="font-medium">{rtt}ms</span>
                    </div>
                  )}
                  <div className="flex items-center space-x-2">
                    <div className={`w-3 h-3 rounded-full ${convexConnected ? 'bg-green-500' : 'bg-red-500'}`} />
                    <span className="text-muted-foreground">App Status:</span>
                    <span className="font-medium">{convexConnected ? 'Connected' : 'Disconnected'}</span>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}