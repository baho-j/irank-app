"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Undo2 } from "lucide-react"
import Image from "next/image"
import { Inter } from "next/font/google"
import { cn } from "@/lib/utils"
import { useAuth } from "@/hooks/use-auth"
import AppLoader from "@/components/app-loader";
import { useHydrated } from "@/hooks/use-hydrated"

const inter = Inter({ subsets: ['latin'] })

export default function NotFound() {
  const router = useRouter()
  const { user, isAuthenticated, isLoading } = useAuth()
  // Auth state resolves on the device, so the page waits for hydration.
  const hydrated = useHydrated()

  const handleNavigateBack = () => {
    if (isAuthenticated && user) {
      let dashboardPath: string

      switch (user.role) {
        case "admin":
          dashboardPath = "/admin/dashboard"
          break
        case "school_admin":
          dashboardPath = "/school/dashboard"
          break
        case "volunteer":
          dashboardPath = "/volunteer/dashboard"
          break
        case "student":
          dashboardPath = "/student/dashboard"
          break
        default:
          dashboardPath = "/"
      }

      router.push(dashboardPath)
    } else {
      router.push("/")
    }
  }

  if (!hydrated || isLoading) {
    return (
        <AppLoader />
    )
  }

  return (
    <div className="bg-background min-h-screen grid place-content-center">
      <h1 className={cn("text-lg sm:text-2xl md:text-4xl text-center font-bold mb-2 text-foreground", inter.className)}>
        Oops!
      </h1>
      <h2 className={cn("text-base sm:text-xl md:text-3xl mb-8 text-center font-semibold text-foreground", inter.className)}>
        Welcome to 70&apos;s
      </h2>

      <div className="w-[600px] h-[400px] relative">
        <div className="w-full h-full z-0 relative">
          <Image
            src="/images/dots-and-stars.png"
            alt="Background pattern"
            fill
            className="w-full h-full object-cover"
          />
        </div>
        <div className="absolute h-full inset-1 grid place-content-center">
          <div className="w-80 h-80 relative">
            <Image
              src="/images/peeps.png"
              alt="70's themed people"
              fill
              className="object-contain"
            />
          </div>
        </div>
      </div>

      <div className="mx-auto mt-4 flex items-center">
        <Button
          onClick={handleNavigateBack}
          className="flex items-center justify-center"
        >
          <Undo2 size={20} className="mr-2" />
          {isAuthenticated && user ? (
            `Back to ${user.role === 'school_admin' ? 'School' : user.role.charAt(0).toUpperCase() + user.role.slice(1)} Dashboard`
          ) : (
            "Back to Home"
          )}
        </Button>
      </div>

      {process.env.NODE_ENV === 'development' && isAuthenticated && user && (
        <div className="mt-4 text-center text-sm text-muted-foreground">
          Logged in as: {user.name} ({user.role})
        </div>
      )}
    </div>
  )
}