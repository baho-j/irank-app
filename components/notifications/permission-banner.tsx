"use client"

import { useState, useEffect } from "react"
import { Bell, X, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useNotifications } from "@/hooks/use-notifications"
import { useHydrated } from "@/hooks/use-hydrated"

export function NotificationPermissionBanner() {
  const { isSupported, permission, requestPermission } = useNotifications()
  const [isDismissed, setIsDismissed] = useState(false)
  const [isRequesting, setIsRequesting] = useState(false)
  const [isVisible, setIsVisible] = useState(false)

  // The permission state is only known on the device, so the banner waits for
  // hydration rather than rendering and then correcting itself.
  const hydrated = useHydrated()

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(true)
    }, 500)
    return () => clearTimeout(timer)
  }, [])

  if (!hydrated) return null

  if (!isSupported || permission === "granted" || permission === "denied" || isDismissed) {
    return null
  }

  const handleRequestPermission = async () => {
    setIsRequesting(true)
    try {
      const granted = await requestPermission()
      if (granted) {
        setTimeout(() => {
          setIsVisible(false)
          setTimeout(() => setIsDismissed(true), 300)
        }, 1000)
      }
    } catch (error) {
      console.error("Failed to request permission:", error)
    } finally {
      setIsRequesting(false)
    }
  }

  const handleDismiss = () => {
    setIsVisible(false)
    setTimeout(() => setIsDismissed(true), 300)
  }

  return (
    <>
      <div
        className={cn(
          "fixed inset-0 bg-black/20 backdrop-blur-sm z-50 transition-opacity duration-300",
          isVisible ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
        onClick={handleDismiss}
      />

      <div
        className={cn(
          "fixed top-0 left-1/2 -translate-x-1/2 w-full max-w-md z-50 transition-all duration-300 ease-out",
          isVisible
            ? "translate-y-4 opacity-100"
            : "-translate-y-full opacity-0"
        )}
      >
        <div className="bg-background rounded-lg shadow-lg mx-4 p-6">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 dark:bg-blue-900 rounded-full">
                <Bell className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <h3 className="font-semibold text-blue-900 dark:text-blue-100">
                  Stay in the loop!
                </h3>
                <p className="text-sm text-muted-foreground">
                  Get notified about tournaments & results
                </p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDismiss}
              className="h-8 w-8 p-0 text-blue-600 hover:bg-blue-100 dark:text-blue-400 dark:hover:bg-blue-900"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div className="mb-4">
            <p className="text-sm text-blue-800 dark:text-blue-200 mb-3">
              Enable notifications to receive instant updates about:
            </p>
            <ul className="text-xs text-blue-700 dark:text-blue-300 space-y-1">
              <li className="flex items-center gap-2">
                • Tournament announcements
              </li>
              <li className="flex items-center gap-2">
                • Debate schedules & results
              </li>
              <li className="flex items-center gap-2">
                • Important system updates
              </li>
            </ul>
          </div>

          <div className="flex items-center gap-3">
            <Button
              onClick={handleRequestPermission}
              disabled={isRequesting}
              className="flex-1 bg-primary hover:bg-primary/80 text-white"
            >
              {isRequesting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Enabling...
                </>
              ) : (
                <>
                  <Check className="h-4 w-4 mr-2" />
                  Enable Notifications
                </>
              )}
            </Button>
            <Button
              variant="outline"
              onClick={handleDismiss}
              className="border-blue-200 text-blue-700 hover:bg-blue-50 dark:border-blue-700 dark:text-blue-300 dark:hover:bg-blue-900"
            >
              Maybe later
            </Button>
          </div>

          <p className="text-xs text-muted-foreground mt-3 text-center">
            You can change this anytime in your browser settings
          </p>
        </div>
      </div>
    </>
  )
}