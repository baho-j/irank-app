"use client"

import React, { useState, useEffect, useMemo } from "react"
import { useQuery, useMutation } from "convex/react"
import { api } from "@/convex/_generated/api"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Checkbox } from "@/components/ui/checkbox"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
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
import {
  Plus,
  Eye,
  Archive,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Calendar,
  MapPin,
  Users,
  Video,
  Trophy,
  Contact, Globe
} from "lucide-react";
import { useDebounce }from "@/hooks/use-debounce"
import { DataToolbar } from "@/components/shared/data-toolbar"
import { MultiSelectFilter } from "@/components/ui/multi-select-filter"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { Id } from "@/convex/_generated/dataModel"
import { CardLayoutWithToolbar } from "@/components/shared/card-layout-with-toolbar"
import { format } from "date-fns"
import { useRouter } from "next/navigation";
import { useOffline } from "@/hooks/use-offline";

interface TournamentListProps {
  userRole: "admin" | "school_admin" | "volunteer" | "student"
  token?: string | null
  selectedLeagueId?: Id<"leagues">
  className?: string
}

const TOURNAMENT_STATUS_OPTIONS = [
  { label: "Draft", value: "draft" },
  { label: "Published", value: "published" },
  { label: "In Progress", value: "inProgress" },
  { label: "Completed", value: "completed" },
  { label: "Cancelled", value: "cancelled" }
]

const TOURNAMENT_FORMAT_OPTIONS = [
  { label: "World Schools", value: "WorldSchools" },
  { label: "British Parliamentary", value: "BritishParliamentary" },
  { label: "Public Forum", value: "PublicForum" },
  { label: "Lincoln Douglas", value: "LincolnDouglas" },
  { label: "Oxford Style", value: "OxfordStyle" }
]

const TOURNAMENT_TYPE_OPTIONS = [
  { label: "Virtual", value: "virtual" },
  { label: "In-Person", value: "in-person" }
]

function TournamentCardSkeleton() {
  return (
    <div className="border border-[#E2E8F0] rounded-lg p-6 space-y-4">
      <div className="flex items-start gap-4">
        <Skeleton className="h-16 w-16 rounded-lg" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-5 w-3/4" />
          <div className="flex gap-2">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 w-20" />
          </div>
        </div>
        <Skeleton className="h-8 w-8" />
      </div>

      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Skeleton className="h-4 w-4" />
          <Skeleton className="h-4 w-32" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-4 w-4" />
          <Skeleton className="h-4 w-24" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-4 w-4" />
          <Skeleton className="h-4 w-20" />
        </div>
      </div>

      <div className="flex items-center justify-between pt-4 border-t">
        <Skeleton className="h-4 w-24" />
        <div className="flex gap-2">
          <Skeleton className="h-8 w-16" />
          <Skeleton className="h-8 w-20" />
        </div>
      </div>
    </div>
  )
}

function formatDateRange(startDate: number, endDate: number) {
  const start = new Date(startDate)
  const end = new Date(endDate)

  if (start.toDateString() === end.toDateString()) {
    return format(start, "MMM d, yyyy")
  } else {
    return `${format(start, "MMM d")} - ${format(end, "MMM d, yyyy")}`
  }
}

export function TournamentList({ userRole, token, selectedLeagueId, className }: TournamentListProps) {
  const [searchTerm, setSearchTerm] = useState("")
  const [statusFilter, setStatusFilter] = useState<string[]>([])
  const [formatFilter, setFormatFilter] = useState<string[]>([])
  const [typeFilter, setTypeFilter] = useState<string[]>([])
  const [selectedTournaments, setSelectedTournaments] = useState<Set<string>>(new Set())
  const [page, setPage] = useState(1)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [showArchiveDialog, setShowArchiveDialog] = useState(false)
  const [tournamentToDelete, setTournamentToDelete] = useState<string | null>(null)
  const [tournamentToArchive, setTournamentToArchive] = useState<string | null>(null)
  const [showBulkDialog, setShowBulkDialog] = useState(false)
  const [bulkAction, setBulkAction] = useState<string>("")

  const router = useRouter()

  const debouncedSearch = useDebounce(searchTerm, 300)

  const tournamentsData = useOffline(useQuery(
    api.functions.tournaments.getTournaments,
    {
      search: debouncedSearch,
      status: statusFilter.length === 1 ? statusFilter[0] as any : undefined,
      format: formatFilter.length === 1 ? formatFilter[0] as any : undefined,
      is_virtual: typeFilter.length === 1 ? typeFilter[0] === "virtual" : undefined,
      league_id: selectedLeagueId ?? undefined,
      page,
      limit: 12,
    }
  ), "tournament-list")

  const deleteTournament = useMutation(api.functions.admin.tournaments.deleteTournament)
  const archiveTournament = useMutation(api.functions.admin.tournaments.archiveTournament)
  const bulkUpdateTournaments = useMutation(api.functions.admin.tournaments.bulkUpdateTournaments)
  const getUrl = useMutation(api.files.getUrl)
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({})


  const getTournamentImage = async (storageId: Id<"_storage">, tournamentId: string) => {
    try {
      const url = await getUrl({ storageId })
      setImageUrls((prev) => ({ ...prev, [tournamentId]: url || "" }))
    } catch (err) {
      console.error("Failed to fetch image for tournament", tournamentId, err)
    }
  }


  const isAdmin = userRole === "admin"

  // Back to the first page when the filters change, without a second render
  // pass to correct an out-of-range page.
  const filterKey = JSON.stringify([debouncedSearch, statusFilter, formatFilter, typeFilter, selectedLeagueId])
  const [pagedFor, setPagedFor] = useState(filterKey)

  if (filterKey !== pagedFor) {
    setPagedFor(filterKey)
    setPage(1)
  }

  const allTournaments = tournamentsData?.tournaments

  const filteredTournaments = useMemo(() => {
    if (!allTournaments) return []

    return allTournaments.filter(tournament => {
      if (statusFilter.length > 0 && !statusFilter.includes(tournament.status)) {
        return false
      }

      if (formatFilter.length > 0 && !formatFilter.includes(tournament.format)) {
        return false
      }

      if (typeFilter.length > 0) {
        const isVirtual = typeFilter.includes("virtual")
        const isInPerson = typeFilter.includes("in-person")
        if (isVirtual && !tournament.is_virtual) return false
        if (isInPerson && tournament.is_virtual) return false
      }

      return true
    })
  }, [allTournaments, statusFilter, formatFilter, typeFilter])

  const handleSearchChange = (value: string) => {
    setSearchTerm(value)
  }

  const handleReset = () => {
    setSearchTerm("")
    setStatusFilter([])
    setFormatFilter([])
    setTypeFilter([])
    setPage(1)
  }

  const handleSelectTournament = (tournamentId: string, checked: boolean) => {
    const newSelected = new Set(selectedTournaments)
    if (checked) {
      newSelected.add(tournamentId)
    } else {
      newSelected.delete(tournamentId)
    }
    setSelectedTournaments(newSelected)
  }

  const handleSelectAll = (checked: boolean) => {
    if (checked && filteredTournaments) {
      setSelectedTournaments(new Set(filteredTournaments.map(t => t._id)))
    } else {
      setSelectedTournaments(new Set())
    }
  }

  const handleViewTournament = (slug: string) => {
    router.push(`tournaments/${slug}`)
  }

  const handleDeleteTournament = async () => {
    if (!tournamentToDelete || !token) return

    try {
      await deleteTournament({
        admin_token: token,
        tournament_id: tournamentToDelete as Id<"tournaments">,
      })
      toast.success("Tournament deleted successfully")
      setShowDeleteDialog(false)
      setTournamentToDelete(null)
    } catch (error: any) {
      toast.error(error.message?.split("Uncaught Error:")[1]?.split(/\.|Called by client/)[0]?.trim() || "Failed to delete tournament")
    }
  }

  const handleArchiveTournament = async () => {
    if (!tournamentToArchive || !token) return

    try {
      await archiveTournament({
        admin_token: token,
        tournament_id: tournamentToArchive as Id<"tournaments">,
      })
      toast.success("Tournament archived successfully")
      setShowArchiveDialog(false)
      setTournamentToArchive(null)
    } catch (error: any) {
      toast.error(error.message?.split("Uncaught Error:")[1]?.split(/\.|Called by client/)[0]?.trim() || "Failed to archive tournament")
    }
  }

  const handleBulkAction = async () => {
    if (selectedTournaments.size === 0 || !bulkAction || !token) return

    try {
      const result = await bulkUpdateTournaments({
        admin_token: token,
        tournament_ids: Array.from(selectedTournaments) as Id<"tournaments">[],
        action: bulkAction as any,
      })

      const successCount = result.results.filter(r => r.success).length
      const failureCount = result.results.filter(r => !r.success).length

      if (successCount > 0) {
        toast.success(`${successCount} tournaments updated successfully`)
      }
      if (failureCount > 0) {
        toast.error(`${failureCount} tournaments failed to update`)
      }

      setSelectedTournaments(new Set())
      setShowBulkDialog(false)
      setBulkAction("")
    } catch (error: any) {
      toast.error(error.message || "Failed to perform bulk action")
    }
  }

  const isLoading = tournamentsData === undefined
  const tournaments = filteredTournaments || []
  const totalCount = tournamentsData?.totalCount || 0
  const hasMore = tournamentsData?.hasMore || false

  const filters = [
    <MultiSelectFilter
      key="status"
      title="Status"
      options={TOURNAMENT_STATUS_OPTIONS}
      selected={statusFilter}
      onSelectionChange={setStatusFilter}
    />,
    <MultiSelectFilter
      key="format"
      title="Format"
      options={TOURNAMENT_FORMAT_OPTIONS}
      selected={formatFilter}
      onSelectionChange={setFormatFilter}
    />,
    <MultiSelectFilter
      key="type"
      title="Type"
      options={TOURNAMENT_TYPE_OPTIONS}
      selected={typeFilter}
      onSelectionChange={setTypeFilter}
    />
  ]

  const actions = isAdmin ? [
    <Button
      key="add"
      size="sm"
      className="h-8 hover:bg-white hover:text-foreground"
      onClick={() => router.push("tournaments/create")}
    >
      <Plus className="h-4 w-4" />
      <span className="hidden md:block">Add Tournament</span>
    </Button>
  ] : []

  const bulkActions = isAdmin ? [
    {
      label: "Publish Tournaments",
      icon: <Globe className="h-4 w-4" />,
      onClick: () => {
        setBulkAction("publish")
        setShowBulkDialog(true)
      }
    },
    {
      label: "Archive Tournaments",
      icon: <Archive className="h-4 w-4" />,
      onClick: () => {
        setBulkAction("archive")
        setShowBulkDialog(true)
      }
    },
    {
      label: "Delete Tournaments",
      icon: <Trash2 className="h-4 w-4" />,
      onClick: () => {
        setBulkAction("delete")
        setShowBulkDialog(true)
      },
      variant: "destructive" as const
    }
  ] : []

  const toolbar = (
    <DataToolbar
      searchTerm={searchTerm}
      onSearchChange={handleSearchChange}
      onReset={handleReset}
      filters={filters}
      actions={actions}
      isLoading={isLoading}
      selectedCount={selectedTournaments.size}
      bulkActions={bulkActions}
      searchPlaceholder="Search tournaments..."
    />
  )

  return (
    <CardLayoutWithToolbar
      toolbar={toolbar}
      className={className}
    >
      <div className="w-full bg-background">
        {isLoading ? (
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <TournamentCardSkeleton key={i} />
              ))}
            </div>
          </div>
        ) : (
          <>
            {tournaments.length === 0 ? (
              <div className="text-center py-12">
                <div className="flex flex-col items-center justify-center">
                  <Trophy className="h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className=" font-medium mb-2">No tournaments found</h3>
                  <p className="text-muted-foreground text-center text-sm max-w-sm">
                    {searchTerm || statusFilter.length > 0 || formatFilter.length > 0 || typeFilter.length > 0 || selectedLeagueId
                      ? "Try adjusting your search criteria or filters"
                      : "Get started by creating your first tournament"
                    }
                  </p>
                </div>
              </div>
            ) : (
              <>
                <div className="p-6">
                  {isAdmin && (
                    <div className="flex items-center gap-2 mb-6">
                      <Checkbox
                        checked={selectedTournaments.size === tournaments.length && tournaments.length > 0}
                        onCheckedChange={handleSelectAll}
                      />
                      <span className="text-sm text-muted-foreground">
                        Select all tournaments
                      </span>
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 4xl:grid-cols-3 gap-4">
                    {tournaments.map((tournament) => {
                      if (tournament.image && !imageUrls[tournament._id]) {
                        getTournamentImage(tournament.image, tournament._id)
                      }
                      return (
                      <div
                        key={tournament._id}
                        className={cn(
                          "border rounded-lg p-4 space-y-2 hover:shadow-md transition-shadow",
                          selectedTournaments.has(tournament._id) && "ring-1 ring-primary"
                        )}
                      >
                        <div className="flex items-start gap-2">
                          <Avatar className="h-16 w-16 rounded-lg">
                            {imageUrls[tournament._id] ? (
                              <AvatarImage src={imageUrls[tournament._id]} alt={tournament.name} />
                            ) : (
                              <AvatarFallback className="bg-primary text-white rounded-lg">
                                <Trophy className="h-6 w-6" />
                              </AvatarFallback>
                            )}
                          </Avatar>

                          <div className="flex-1 min-w-0 max-w-200">
                            <h3 className="font-semibold mb-2 line-clamp-2 truncate" title={tournament.name}>
                              {tournament.name}
                            </h3>
                            <div className="flex flex-wrap gap-2">
                              <Badge
                                variant="secondary"
                                className={`${
                                  tournament.status === "draft"
                                    ? "bg-yellow-100 text-yellow-800"
                                    : tournament.status === "published"
                                      ? "bg-green-100 text-green-800"
                                      : tournament.status === "inProgress"
                                        ? "bg-blue-100 text-blue-800"
                                        : tournament.status === "cancelled"
                                          ? "bg-red-100 text-red-800"
                                          : ""
                                }`}
                              >
                                {tournament.status}
                              </Badge>
                            </div>
                          </div>
                          {isAdmin && (
                            <Checkbox
                              checked={selectedTournaments.has(tournament._id)}
                              onCheckedChange={(checked) =>
                                handleSelectTournament(tournament._id, checked as boolean)
                              }
                              className="mt-1"
                            />
                          )}
                        </div>

                        <div className="grid grid-cols-1 custom:grid-cols-2 gap-2">
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Calendar className="h-4 w-4" />
                            <span>{formatDateRange(tournament.start_date, tournament.end_date)}</span>
                          </div>

                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            {tournament.is_virtual ? (
                              <>
                                <Video className="h-4 w-4" />
                                <span>Virtual Tournament</span>
                              </>
                            ) : (
                              <>
                                <MapPin className="h-4 w-4" />
                                <span className="truncate" title={tournament.location}>
                                  {tournament.location || "Location TBD"}
                                </span>
                              </>
                            )}
                          </div>

                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Users className="h-4 w-4" />
                            <span>
                              {tournament.teamCount || 0} teams • {tournament.schoolCount || 0} schools
                            </span>
                          </div>

                          {tournament.coordinator && (
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <Contact className="h-4 w-4" />
                              <span className="truncate" title={tournament.coordinator.name}>
                                {tournament.coordinator.name}
                              </span>
                            </div>
                          )}
                        </div>
                        <div className="flex items-center justify-between pt-2 border-t">
                          {isAdmin && (<>
                              {!tournament.hasTeams && (
                                <Button
                                  variant="ghost"
                                  onClick={() => {
                                    setTournamentToDelete(tournament._id)
                                    setShowDeleteDialog(true)
                                  }}
                                  className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                                >
                                  <Trash2 className="h-4 w-4 mr-2" />
                                  <span className="hide-at-1230">Delete</span>
                                </Button>
                              )}
                              <Button
                                variant="ghost"
                                onClick={() => {
                                  setTournamentToArchive(tournament._id)
                                  setShowArchiveDialog(true)
                                }}>
                                <Archive className="h-4 w-4" />
                                <span className="hide-at-1230">Archive</span>
                              </Button>
                            </>
                          )}
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleViewTournament(tournament.slug)}
                            >
                              <Eye className="h-4 w-4" />
                              View
                            </Button>
                          </div>
                        </div>
                      </div>
                      )})}
                  </div>
                </div>

                <div className="flex items-center justify-center gap-4 space-x-4 mt-6 p-4 border-t">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(Math.max(1, page - 1))}
                    disabled={page === 1 || isLoading}
                    className="h-8"
                  >
                    <ChevronLeft className="h-4 w-4 mr-1" />
                    Previous
                  </Button>

                  <span className="text-sm text-foreground">
                    {totalCount > 0 && (
                      <span className="text-muted-foreground">
                        {tournaments.length} of {totalCount} tournaments
                      </span>
                    )}
                  </span>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(page + 1)}
                    disabled={!hasMore || isLoading}
                    className="h-8"
                  >
                    Next
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
              </>
            )}
          </>
        )}
      </div>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Tournament</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this tournament? This action cannot be undone and will permanently remove the tournament and all associated data.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteTournament}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete Tournament
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showArchiveDialog} onOpenChange={setShowArchiveDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive Tournament</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to archive this tournament? Archived tournaments can be restored later but will be hidden from the main view.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleArchiveTournament}>
              Archive Tournament
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showBulkDialog} onOpenChange={setShowBulkDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Bulk Action</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to {bulkAction} {selectedTournaments.size} selected tournament{selectedTournaments.size > 1 ? 's' : ''}?
              {bulkAction === "publish" && " This will make the tournaments available for team registration."}
              {bulkAction === "delete" && " This action cannot be undone and will permanently remove all tournament data."}
              {bulkAction === "archive" && " Archived tournaments can be restored later but will be hidden from the main view."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkAction}
              className={bulkAction === "delete" ? "bg-red-600 hover:bg-red-700" : ""}
            >
              {bulkAction === "delete" && "Delete"}
              {bulkAction === "archive" && "Archive"}
              {bulkAction === "publish" && "Publish"}
              {!["delete", "archive", "publish"].includes(bulkAction) && bulkAction} Tournaments
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </CardLayoutWithToolbar>
  )
}