"use client"

import React, { useState, useEffect } from "react"
import { useParams, useRouter } from "next/navigation";
import { useQuery } from "convex/react"
import { api } from "@/convex/_generated/api"
import { useAuth } from "@/hooks/use-auth"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import {
  FileText,
  Mail,
  Users,
  GitBranch,
  Trophy,
  SquareLibrary,
  AlertTriangle,
  Home,
  Wallet,
} from "lucide-react";
import { TournamentOverview } from "@/components/tournaments/tournament-overview"
import { TournamentInvitations } from "@/components/tournaments/tournament-invitations";
import { TournamentTeams } from "@/components/tournaments/tournament-teams";
import TournamentPairings from "@/components/tournaments/tournament-pairing";
import TournamentRankings from "@/components/tournaments/tournament-ranking";
import TournamentBallots from "@/components/tournaments/tournament-ballot";
import TournamentFinance from "@/components/tournaments/tournament-finance";
import { useLocationHash } from "@/hooks/use-location-hash";

const navigationItems = [
  {
    id: "overview",
    label: "Tournament Info",
    icon: FileText,
  },
  {
    id: "invitations",
    label: "Invitations",
    icon: Mail,
  },
  {
    id: "teams",
    label: "Teams",
    icon: Users,
  },
  {
    id: "pairings",
    label: "Pairings",
    icon: GitBranch,
  },
  {
    id: "ballots",
    label: "Ballots",
    icon: SquareLibrary,
  },
  {
    id: "ranking",
    label: "Ranking",
    icon: Trophy,
  },
  {
    id: "finance",
    label: "Finance",
    icon: Wallet,
  }
]

function TournamentSkeleton() {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-96" />
      </div>
      <div className="flex gap-2">
        <Skeleton className="h-6 w-16" />
        <Skeleton className="h-6 w-20" />
        <Skeleton className="h-6 w-18" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
        <Skeleton className="h-64" />
        <Skeleton className="h-64" />
      </div>
    </div>
  )
}

function TournamentError({
                           error,
                           onGoHome
                         }: {
  error: string;
  onGoHome: () => void;
}) {
  return (
    <div className="flex items-center justify-center min-h-[400px] px-4 md:px-0">
      <Card className="w-full max-w-md">
        <CardContent className="p-8 text-center">
          <AlertTriangle className="h-8 w-8 text-orange-500 mx-auto mb-4" />
          <h2 className="text-lg font-semibold mb-2">Tournament Not Available</h2>
          <p className="text-muted-foreground mb-6 text-xs">
            {error}
          </p>
          <div className="flex gap-3 justify-center">
            <Button onClick={onGoHome} className="gap-2">
              <Home className="h-4 w-4" />
              Go Home
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function TournamentSidebar({
                             activeSection,
                             onSectionChange,
                             className,
                             disabled = false
                           }: {
  activeSection: string
  onSectionChange: (section: string) => void
  className?: string
  disabled?: boolean
}) {
  return (
    <div className={cn("bg-transparent", className)}>
      <nav>
        <ul className="space-y-1">
          {navigationItems.map((item) => {
            const Icon = item.icon
            const isActive = activeSection === item.id

            return (
              <li key={item.id}>
                <button
                  onClick={() => !disabled && onSectionChange(item.id)}
                  disabled={disabled}
                  className={cn(
                    "w-full flex items-center gap-3 p-2 text-sm rounded-md transition-colors",
                    disabled
                      ? "opacity-50 cursor-not-allowed"
                      : "hover:bg-input hover:text-accent-foreground",
                    isActive && !disabled && "bg-input text-primary font-medium"
                  )}
                >
                  <Icon className={cn(
                    "h-4 w-4 shrink-0",
                    isActive && !disabled ? "text-primary" : "text-muted-foreground"
                  )} />
                  <span className="truncate">{item.label}</span>
                </button>
              </li>
            )
          })}
        </ul>
      </nav>
    </div>
  )
}

function MobileNavigation({
                            activeSection,
                            onSectionChange,
                            disabled = false
                          }: {
  activeSection: string
  onSectionChange: (section: string) => void
  disabled?: boolean
}) {
  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 bg-background border-t z-50">
      <div className="flex overflow-x-auto">
        {navigationItems.map((item) => {
          const Icon = item.icon
          const isActive = activeSection === item.id

          return (
            <button
              key={item.id}
              onClick={() => !disabled && onSectionChange(item.id)}
              disabled={disabled}
              className={cn(
                "flex-1 min-w-0 flex flex-col items-center gap-1 py-2 px-1",
                "text-xs transition-colors",
                disabled
                  ? "opacity-50 cursor-not-allowed"
                  : isActive
                    ? "text-primary font-medium"
                    : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="truncate text-[10px]">{item.label.split(" ")[0]}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default function TournamentPage() {
  const { user, token } = useAuth()
  const router = useRouter()

  // The section lives in the URL fragment, so back and forward move between
  // sections and a shared link opens on the right one.
  const [hash, setHash] = useLocationHash()
  const activeSection = navigationItems.some(item => item.id === hash) ? hash : "overview"

  const { id } = useParams();
  const paramSlug = Array.isArray(id) ? id[0] : id;
  const [slug, setSlug] = useState(paramSlug);

  const tournamentResponse = useQuery(
    api.functions.tournaments.getTournamentBySlug,
    slug ? { slug } : "skip"
  );

  const handleSectionChange = (section: string) => {

    if (tournamentResponse?.success) {
      setHash(section)
    }
  }

  const handleGoHome = () => {
    router.push('/admin/tournaments')
  }

  if (!tournamentResponse) {
    return (
      <div className="min-h-[500px]">
        <div className="flex min-h-[500px] gap-6">
          <div className="hidden md:block w-42 shrink-0 mt-6">
            <div className="h-full">
              <TournamentSidebar
                activeSection={activeSection}
                onSectionChange={() => {}}
                className="h-full"
                disabled={true}
              />
            </div>
          </div>
          <div className="flex-1 min-w-0 mt-6 bg-background border border-[#E2E8F0] rounded-md">
            <div className="py-6 px-6 lg:pb-6">
              <TournamentSkeleton />
            </div>
          </div>
        </div>
        <MobileNavigation
          activeSection={activeSection}
          onSectionChange={() => {}}
          disabled={true}
        />
      </div>
    )
  }

  if (!tournamentResponse.success) {
    return (
      <div className="min-h-[500px] ">
        <div className="flex min-h-[500px] gap-6">
          <div className="hidden md:block w-42 shrink-0 mt-6">
            <div className="h-full">
              <TournamentSidebar
                activeSection={activeSection}
                onSectionChange={() => {}}
                className="h-full"
                disabled={true}
              />
            </div>
          </div>
          <div className="flex-1 min-w-0 bg-background mt-6 rounded-md border border-[#E2E8F0]">
            <div className="py-6 lg:pb-6">
              <TournamentError
                error={tournamentResponse.error || "Unknown error occurred"}
                onGoHome={handleGoHome}
              />
            </div>
          </div>
        </div>
        <MobileNavigation
          activeSection={activeSection}
          onSectionChange={() => {}}
          disabled={true}
        />
      </div>
    )
  }

  if (!user || !token) {
    return (
      <div className="min-h-screen bg-background">
        <div className="flex items-center justify-center min-h-[400px]">
          <Card className="w-full max-w-md">
            <CardContent className="p-8 text-center">
              <AlertTriangle className="h-12 w-12 text-orange-500 mx-auto mb-4" />
              <h2 className="text-xl font-semibold mb-2">Authentication Required</h2>
              <p className="text-muted-foreground mb-6 text-sm">
                Please sign in to view tournament details.
              </p>
              <Button onClick={() => router.push('/')} className="gap-2">
                Sign In
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  const tournament = tournamentResponse.data
  const userRole = user.role as "admin" | "school_admin" | "volunteer" | "student"

  const renderSection = () => {
    switch (activeSection) {
      case "overview":
        return (
          <TournamentOverview
            tournament={tournament}
            userRole={userRole}
            token={token}
            onSlugChange={(newSlug) => {
              setSlug(newSlug);
              router.replace(`/admin/tournaments/${newSlug}${window.location.hash}`);
            }}
          />
        )
      case "invitations":
        return (
          <TournamentInvitations
            tournament={tournament}
            userRole={userRole}
            token={token}
            userId={user?.id}
            schoolId={user?.school?.id}
          />
        )
      case "teams":
        return (
          <TournamentTeams
            tournament={tournament}
            userRole={userRole}
            token={token}
            userId={user?.id}
            schoolId={user?.school?.id}
          />
        )
      case "pairings":
        return (
          <TournamentPairings
            tournament={tournament}
            userRole={userRole}
            token={token}
            userId={user?.id}
            schoolId={user?.school?.id}
          />
        )
      case "ballots":
        return (
          <TournamentBallots
            tournament={tournament}
            userRole={userRole}
            token={token}
            userId={user.id}
          />
        )
      case "finance":
        return (
          <TournamentFinance
            tournamentId={tournament._id}
            token={token}
            role={userRole}
          />
        )
      case "ranking":
        return (
          <TournamentRankings
            tournament={tournament}
            userRole={userRole}
            token={token}
            userId={user?.id}
            schoolId={user?.school?.id}
          />
        )
      default:
        return (
          <TournamentOverview
            tournament={tournament}
            userRole={userRole}
            token={token}
            onSlugChange={(newSlug) => {
              setSlug(newSlug);
              router.replace(`/admin/tournaments/${newSlug}${window.location.hash}`);
            }}
          />
        )
    }
  }

  return (
    <div>
      <div className="flex min-h-screen gap-6">
        <div className="hidden md:block w-42 shrink-0 mt-6">
          <div className="h-full">
            <TournamentSidebar
              activeSection={activeSection}
              onSectionChange={handleSectionChange}
              className="h-full"
            />
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <div className="py-6 lg:pb-6">
            {renderSection()}
          </div>
        </div>
      </div>

      <MobileNavigation
        activeSection={activeSection}
        onSectionChange={handleSectionChange}
      />
    </div>
  )
}