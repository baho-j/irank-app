"use client"

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Download, X, Smartphone } from 'lucide-react'
import { usePWA } from '@/lib/pwa/pwa-utils'
import { motion, AnimatePresence } from 'framer-motion'

const DISMISSAL_KEY = 'install-prompt-dismissed'

function getDismissalCount(): number {
  try {
    const data = localStorage.getItem('install-prompt-dismissed')
    if (data) {
      const parsed = JSON.parse(data)
      return parsed.count || 0
    }
  } catch (error) {
    console.error('Error reading dismissal data:', error)
  }
  return 0
}

function shouldShowPrompt(): boolean {
  try {
    const data = localStorage.getItem('install-prompt-dismissed')
    if (!data) return true

    const parsed = JSON.parse(data)
    const dismissalTime = parsed.timestamp
    const dismissalCount = parsed.count || 0

    if (dismissalCount >= 3) {
      return false
    }

    const delays = [
      24 * 60 * 60 * 1000,
      7 * 24 * 60 * 60 * 1000,
      30 * 24 * 60 * 60 * 1000
    ]

    const delayIndex = Math.min(dismissalCount - 1, delays.length - 1)
    const requiredDelay = delays[delayIndex] || delays[delays.length - 1]

    return Date.now() - dismissalTime > requiredDelay
  } catch (error) {
    console.error('Error checking dismissal:', error)
    return true
  }
}

/** Records a dismissal so the prompt backs off rather than nagging. */
function recordDismissal(): void {
  localStorage.setItem(
    DISMISSAL_KEY,
    JSON.stringify({ timestamp: Date.now(), count: getDismissalCount() + 1 })
  )
}

export function InstallPrompt() {
  const { isInstalled, canInstall, promptInstall } = usePWA()
  const [showPrompt, setShowPrompt] = useState(false)
  // Read on the first render: an effect would flash the prompt at someone who
  // has already dismissed it three times.
  const [dismissed, setDismissed] = useState(
    () => typeof window !== "undefined" && !shouldShowPrompt()
  )

  useEffect(() => {

    if (canInstall && !isInstalled && !dismissed) {
      const timer = setTimeout(() => {
        setShowPrompt(true)
      }, 30000)

      return () => clearTimeout(timer)
    }
  }, [canInstall, isInstalled, dismissed])

  const handleInstall = async () => {
    const success = await promptInstall()
    if (success) {
      setShowPrompt(false)
    }
  }

  const handleDismiss = () => {
    setDismissed(true)
    setShowPrompt(false)
    recordDismissal()
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 50 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 50 }}
        className="fixed bottom-4 right-4 z-50 max-w-sm"
      >
        <Card className="border-2 border-primary/20 shadow-lg bg-background/95 backdrop-blur">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Download className="h-5 w-5 text-primary" />
                <CardTitle className="text-base">Install iRankHub</CardTitle>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDismiss}
                className="h-6 w-6 p-0"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <CardDescription className="text-sm">
              Get the full app experience with offline access and push notifications.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="flex items-center space-x-2 mb-3 text-sm text-muted-foreground">
              <Smartphone className="h-4 w-4" />
              <span>Works on mobile and desktop</span>
            </div>
            <div className="flex space-x-2">
              <Button onClick={handleInstall} size="sm" className="flex-1">
                <Download className="h-4 w-4 mr-2" />
                Install
              </Button>
              <Button variant="outline" size="sm" onClick={handleDismiss}>
                Later
              </Button>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </AnimatePresence>
  )
}