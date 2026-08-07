"use client"

import React, { useState, useEffect, useCallback } from "react"
import { useQuery, useMutation } from "convex/react"
import { api } from "@/convex/_generated/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Plus, Search, MoreVertical, Eye, Trash2, Building} from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { Id } from "@/convex/_generated/dataModel"
import { useDebounce } from "@/hooks/use-debounce"
import { AddLeagueDialog } from "./add-league-dialog"
import { ViewLeagueDetailsDialog } from "./view-league-details-dialog"
import { useOffline } from "@/hooks/use-offline";

interface League {
  _id: Id<"leagues">
  name: string
  type: "Local" | "International" | "Dreams Mode"
  description?: string
  geographic_scope?: any
  status: "active" | "inactive" | "banned"
  created_at: number
  _creationTime: number
  hasTournaments?: boolean
}

interface LeagueListProps {
  userRole: "admin" | "school_admin" | "volunteer" | "student"
  token?: string | null
  selectedLeagueId?: Id<"leagues">
  onLeagueSelect?: (leagueId: Id<"leagues"> | undefined) => void
  className?: string
  onViewDetails?: (league: League) => void
  onDeleteLeague?: (league: League) => void
}

function LeagueListSkeleton() {
  return (
    <div className="space-y-2">
      {[1, 2, 3].map((i) => (
        <div key={i} className="flex items-center gap-2 p-2 rounded-lg border border-[#E2E8F0] bg-background">
          <Skeleton className="h-12 w-12 rounded-full" />
          <div className="flex-1 space-y-2">
            <div className="flex items-center gap-2">
              <Skeleton className="h-4 w-14" />
              <Skeleton className="h-4 w-16" />
            </div>
            <Skeleton className="h-4 w-28" />
          </div>
          <Skeleton className="h-8 w-6" />
        </div>
      ))}
    </div>
  )
}

function getTypeIcon(type: string) {
  switch (type) {
    case "Local": return "🏠"
    case "International": return "🌍"
    case "Dreams Mode": return "✨"
    default: return "📁"
  }
}

export function LeagueList({ userRole, token, selectedLeagueId, onLeagueSelect, className, onDeleteLeague, onViewDetails }: LeagueListProps) {
  const [searchTerm, setSearchTerm] = useState("")
  const [leagues, setLeagues] = useState<League[]>([])
  const [hasMore, setHasMore] = useState(true)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [page, setPage] = useState(1)
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [showDetailsDialog, setShowDetailsDialog] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [selectedLeague, setSelectedLeague] = useState<League | null>(null)
  const [leagueToDelete, setLeagueToDelete] = useState<League | null>(null)

  const debouncedSearch = useDebounce(searchTerm, 300)

  const leaguesData = useOffline(useQuery(
    api.functions.leagues.getLeagues,
    {
      search: debouncedSearch,
      page,
      limit: 20,
    }
  ), "league-list")

  console.log('leaguesData:', leaguesData)
  console.log('leagues state:', leagues)
  console.log('debouncedSearch:', debouncedSearch)
  console.log('page:', page)

  const deleteLeague = useMutation(api.functions.admin.leagues.deleteLeague)

  useEffect(() => {
    if (leaguesData) {
      if (leaguesData.leagues) {
        if (page === 1) {
          setLeagues(leaguesData.leagues)
        } else {
          setLeagues(prev => [...prev, ...leaguesData.leagues])
        }
      } else {
        if (page === 1) {
          console.log('Setting empty leagues array')
          setLeagues([])
        }
      }
      setHasMore(leaguesData.hasMore)
      setIsLoadingMore(false)
    }
  }, [leaguesData, page])

  // A new search starts a new accumulated list, applied during render so the
  // stale results are never shown against the new term.
  const [searchedFor, setSearchedFor] = useState(debouncedSearch)

  if (debouncedSearch !== searchedFor) {
    setSearchedFor(debouncedSearch)
    setPage(1)
    setLeagues([])
    setHasMore(true)
  }

  const loadMore = useCallback(() => {
    if (hasMore && !isLoadingMore && leaguesData) {
      setIsLoadingMore(true)
      setPage(prev => prev + 1)
    }
  }, [hasMore, isLoadingMore, leaguesData])

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget
    if (scrollHeight - scrollTop <= clientHeight + 100) {
      loadMore()
    }
  }, [loadMore])

  const handleLeagueClick = (league: League) => {
    if (selectedLeagueId === league._id) {
      onLeagueSelect?.(undefined)
    } else {
      onLeagueSelect?.(league._id)
    }
  }

  const handleViewDetails = (league: League) => {
    onViewDetails?.(league) // Use the callback instead
  }

  const handleDeleteClick = (league: League) => {
    onDeleteLeague?.(league) // Use the callback instead
  }

  const handleDeleteConfirm = async () => {
    if (!leagueToDelete || !token) return

    try {
      await deleteLeague({
        admin_token: token,
        league_id: leagueToDelete._id,
      })
      toast.success("League deleted successfully")
      setShowDeleteDialog(false)
      setLeagueToDelete(null)
      setPage(1)
      setLeagues([])
    } catch (error: any) {
      toast.error(error.message?.split("Uncaught Error:")[1]?.split(/\.|Called by client/)[0]?.trim() || "Failed to delete league")
    }
  }

  const isLoading = leaguesData === undefined
  const isAdmin = userRole === "admin"

  return (
    <div className={cn("flex flex-col h-full", className)}>
      <div className="px-4 py-6 md:py-4 md:px-0">
        <div className="flex items-center gap-2 mb-2">
          <div className="relative md:ml-[1px] flex-1 bg-background">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search leagues..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          {isAdmin && (
            <Button
              size="sm"
              onClick={() => setShowAddDialog(true)}
              className="shrink-0"
            >
              <Plus className="h-4 w-4" />
            </Button>
          )}
        </div>

        {leagues.length > 0 && (
          <p className="text-xs text-muted-foreground md:ml-[1px]">
            {leagues.length} league{leagues.length !== 1 ? 's' : ''} found
          </p>
        )}
      </div>

      <ScrollArea className="flex-1" onScrollCapture={handleScroll}>
        <div className="">
          {isLoading ? (
            <LeagueListSkeleton />
          ) : leagues.length === 0 ? (
            <div className="text-center py-12">
              <Building className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className=" font-medium mb-2">No leagues found</h3>
              <p className="text-muted-foreground text-center text-sm max-w-sm mx-auto">
                {searchTerm
                  ? "Try adjusting your search criteria"
                  : "Get started by creating your first league"
                }
              </p>
            </div>
          ) : (
            <div className="space-y-2 px-4 md:px-0">
              {leagues.map((league) => {
                const isSelected = selectedLeagueId === league._id

                return (
                  <div
                    key={league._id}
                    className={cn(
                      "flex items-center justify-between py-2 px-3 md:px-3 md:py-3 rounded-md border border-[#E2E8F0] cursor-pointer transition-colors bg-background hover:bg-background/80",
                      isSelected && "bg-primary/10 border-primary"
                    )}
                    onClick={() => handleLeagueClick(league)}
                  >
                    <div className="flex-1 min-w-0 max-w-[180px]">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge
                          variant="default"
                          className={`${league.type === "Local"
                            ? "bg-blue-100 text-blue-800"
                            : league.type === "International"
                              ? "bg-green-100 text-green-800"
                              : league.type === "Dreams Mode"
                                ? "bg-purple-100 text-purple-800"
                                : "bg-gray-100 text-gray-800"
                          }`}

                        >
                          {getTypeIcon(league.type)} {league.type}
                        </Badge>
                        <Badge
                          variant="secondary"
                          className={`${league.status === "active"
                            ? "bg-green-100 text-green-800"
                            : league.status === "inactive"
                              ? "bg-orange-100 text-orange-800"
                              : league.status === "banned"
                                ? "bg-red-100 text-red-800"
                                : "bg-gray-100 text-gray-800"
                          }`}
                        >
                          {league.status}
                        </Badge>
                      </div>
                      <h3 className="font-medium text-sm truncate" title={league.name}>
                        {league.name}
                      </h3>
                      {league.description && (
                        <p className="text-xs text-muted-foreground truncate" title={league.description}>
                          {league.description}
                        </p>
                      )}
                    </div>

                    {isAdmin && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleViewDetails(league)}>
                            <Eye className="h-4 w-4 mr-2" />
                            View Details
                          </DropdownMenuItem>
                          {!league.hasTournaments && (
                            <DropdownMenuItem
                              onClick={() => handleDeleteClick(league)}
                              className="text-destructive"
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                )
              })}

              {isLoadingMore && (
                <div className="space-y-2 mt-4">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="flex items-center gap-3 p-3 rounded-lg border">
                      <Skeleton className="h-12 w-12 rounded-full" />
                      <div className="flex-1 space-y-2">
                        <div className="flex items-center gap-2">
                          <Skeleton className="h-4 w-16" />
                          <Skeleton className="h-4 w-20" />
                        </div>
                        <Skeleton className="h-4 w-32" />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </ScrollArea>

      {isAdmin && (
        <>
          <AddLeagueDialog
            open={showAddDialog}
            onOpenChange={setShowAddDialog}
            token={token}
          />

        </>
      )}
    </div>
  )
}