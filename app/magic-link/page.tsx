"use client"

import { Suspense, useEffect, useState, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Loader2, CheckCircle, AlertCircle, Mail, ArrowRight } from "lucide-react";
import Link from "next/link"
import Image from "next/image"
import { motion } from "framer-motion"
import { useAuth } from "@/hooks/use-auth"
import AppLoader from "@/components/app-loader";

function MagicLinkForm() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const token = searchParams.get("token")

  // A missing token needs no request, so it is known before the first paint.
  const [verifying, setVerifying] = useState(!!token)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(
    token ? null : "Invalid or missing magic link token"
  )
  const [userInfo, setUserInfo] = useState<any>(null)

  const hasVerified = useRef(false)
  const verificationInProgress = useRef(false)

  const { verifyMagicLink } = useAuth()

  useEffect(() => {
    const verifyToken = async () => {
      if (!token || hasVerified.current || verificationInProgress.current) {
        if (!token) {
          setError("Invalid or missing magic link token")
          setVerifying(false)
        }
        return
      }

      verificationInProgress.current = true

      try {
        console.log("Verifying magic link token:", token)

        const result = await verifyMagicLink(token)
        console.log("Magic link verification result:", result)

        if (result.success && result.purpose === "login") {

          setUserInfo(result.user)
          hasVerified.current = true
          setSuccess(true)
          setVerifying(false)

          setTimeout(() => {
            const dashboardPath = result.user?.role === 'school_admin'
              ? '/school/dashboard'
              : `/${result.user?.role}/dashboard`
            router.push(dashboardPath)
          }, 1500)
        } else {
          console.error("Invalid magic link verification result:", result)
          setError("Invalid magic link")
          setVerifying(false)
        }
      } catch (error: any) {
        console.error("Magic link verification error:", error)

        if (error.message.includes("already been used")) {
          setError("This magic link has already been used. Please request a new one.")
        } else if (error.message.includes("expired")) {
          setError("This magic link has expired. Please request a new one.")
        } else {
          setError(error.message || "Invalid or expired magic link")
        }

        setVerifying(false)
      } finally {
        verificationInProgress.current = false
      }
    }

    if (token && !hasVerified.current && !verificationInProgress.current) {
      verifyToken()
    }
  }, [])

  if (verifying) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-bl from-orange-400 via-orange-50 to-orange-50">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3 }}
          className="w-full max-w-md"
        >
          <Card className="border-0 shadow-xl">
            <CardContent className="flex flex-col items-center justify-center py-16">
              <Image
                src="/images/logo.png"
                alt="iRankHub Logo"
                width={80}
                height={80}
                className="mx-auto mb-6"
              />
              <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
              <p className="text-lg font-medium mb-2">Verifying magic link...</p>
              <p className="text-sm text-muted-foreground text-center">
                Please wait while we verify your magic link and sign you in.
              </p>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    )
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-bl from-orange-400 via-orange-50 to-orange-50">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3 }}
          className="w-full max-w-md"
        >
          <Card className="border-0 shadow-xl">
            <CardHeader className="text-center pb-6">
              <Image
                src="/images/logo.png"
                alt="iRankHub Logo"
                width={80}
                height={80}
                className="mx-auto mb-4"
              />
              <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
                <CheckCircle className="h-8 w-8 text-green-600" />
              </div>
              <CardTitle className="text-xl">Welcome back!</CardTitle>
              <CardDescription className="text-base">
                {userInfo ? (
                  <>You&#39;ve been successfully signed in as <strong>{userInfo.name}</strong>. Redirecting you to your dashboard...</>
                ) : (
                  "Magic link verified successfully! Redirecting you to your dashboard..."
                )}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-center text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Taking you to your dashboard...
                </div>

                {userInfo && (
                  <Button
                    asChild
                    className="w-full"
                    variant="outline"
                  >
                    <Link href={userInfo.role === 'school_admin' ? '/school/dashboard' : `/${userInfo.role}/dashboard`}>
                      <ArrowRight className="mr-2 h-4 w-4" />
                      Go to Dashboard
                    </Link>
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-bl from-orange-400 via-orange-50 to-orange-50">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3 }}
        className="w-full max-w-md"
      >
        <Card className="border-0 shadow-xl">
          <CardHeader className="text-center pb-6">
            <Image
              src="/images/logo.png"
              alt="iRankHub Logo"
              width={80}
              height={80}
              className="mx-auto mb-4"
            />
            <div className="mx-auto w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-4">
              <AlertCircle className="h-8 w-8 text-red-600" />
            </div>
            <CardTitle className="text-xl">Invalid magic link</CardTitle>
            <CardDescription className="text-base">
              This magic link is invalid, has expired, or has already been used. Please request a new one to sign in.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>

            <div className="space-y-2">
              <Button asChild className="w-full">
                <Link href="/">
                  <Mail className="mr-2 h-4 w-4" />
                  Request new magic link
                </Link>
              </Button>

            </div>

            <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
              <p className="text-sm text-blue-700">
                <strong>Need help?</strong> Magic links are valid for 15 minutes after being sent.
                If you&#39;re having trouble, try requesting a fresh magic link from the sign-in page.
              </p>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  )
}

export default function MagicLinkPage() {
  return (
    <Suspense fallback={<AppLoader />}>
      <MagicLinkForm />
    </Suspense>
  )
}