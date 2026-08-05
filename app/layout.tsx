import './globals.css'
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { Toaster } from '@/components/ui/sonner'
import { Suspense } from "react";
import { ConvexOfflineProvider } from "@/components/convex-offline-provider";
import { RouteProgress } from "@/components/navigation/route-progress";
import { ThemeProvider } from "@/components/theme-provider";
import { AuthProvider } from "@/hooks/use-auth";
import React from "react";
import { PWAProvider } from '@/components/pwa/pwa-provider';

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'iRankHub - iDebate Tournament Management Platform',
  description: 'Your Voice, Your Ideas, Your Impact – More Than Just Debates',
  icons: {
    icon: "/icons/favicon.ico",
  },
};


export default function RootLayout({
                                     children,
                                   }: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
    <body className={inter.className}>
    <ThemeProvider attribute="class" defaultTheme="light" forcedTheme="light">
      <Suspense fallback={null}>
        <RouteProgress />
      </Suspense>
      <ConvexOfflineProvider>
        <PWAProvider>
        <AuthProvider>
          <div className="min-h-screen">
            {children}
          </div>
          <Toaster richColors closeButton position="top-right" />
        </AuthProvider>
        </PWAProvider>
      </ConvexOfflineProvider>
    </ThemeProvider>
    </body>
    </html>
  );
}