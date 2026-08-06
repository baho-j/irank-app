"use client"

import React, { useState, useEffect } from "react"
import { useQuery, useMutation } from "convex/react"
import { api } from "@/convex/_generated/api"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { format } from "date-fns"
import { toast } from "sonner"
import {
  Calendar,
  MapPin,
  Video,
  Users,
  Trophy,
  Clock,
  DollarSign,
  Gavel,
  Contact,
  Edit,
  Save,
  X,
  Search,
  Check,
  Upload,
  Plus,
  Copy,
  ChevronDown,
  Globe, PauseCircle, PlayCircle
} from "lucide-react";
import Image from "next/image"
import DateRangePicker from "@/components/date-range-picker"
import { FileUpload } from "@/components/file-upload"
import { VolunteerSchoolSelector } from "@/components/school-selector"
import { Id } from "@/convex/_generated/dataModel"
import { type DateRange } from "react-day-picker"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@/components/ui/alert-dialog";
import { useDebounce } from "@/hooks/use-debounce"

interface TournamentOverviewProps {
  tournament: any
  userRole: "admin" | "school_admin" | "volunteer" | "student"
  token?: string | null
  onSlugChange?: (newSlug: string) => void;
}

interface DateTimeRange {
  from?: Date
  to?: Date
  fromTime?: string
  toTime?: string
}

const FORMATS = [
  { value: "WorldSchools", label: "World Schools" },
  { value: "BritishParliamentary", label: "British Parliamentary" },
  { value: "PublicForum", label: "Public Forum" },
  { value: "LincolnDouglas", label: "Lincoln Douglas" },
  { value: "OxfordStyle", label: "Oxford Style" }
]

function formatDateRange(startDate: number, endDate: number) {
  const start = new Date(startDate)
  const end = new Date(endDate)

  if (start.toDateString() === end.toDateString()) {
    return `${format(start, "MMMM d, yyyy")} from ${format(start, "HH:mm")} to ${format(end, "HH:mm")}`
  } else {
    return `${format(start, "MMMM d, yyyy 'at' HH:mm")} - ${format(end, "MMMM d, yyyy 'at' HH:mm")}`
  }
}

export function TournamentOverview({ tournament, userRole, token, onSlugChange }: TournamentOverviewProps) {
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [editingCard, setEditingCard] = useState<string | null>(null)

  const isAdmin = userRole === "admin"
  const hasToken = Boolean(token)

  const [basicEditForm, setBasicEditForm] = useState({
    name: "",
    coordinator_id: "",
    league_id: "",
    image: undefined as Id<"_storage"> | undefined
  })
  const [showImageDialog, setShowImageDialog] = useState(false)
  const [showRemoveImageDialog, setShowRemoveImageDialog] = useState(false)
  const [leagueSearch, setLeagueSearch] = useState("")
  const [showLeaguePopover, setShowLeaguePopover] = useState(false)
  const [coordinatorSearch, setCoordinatorSearch] = useState("")
  const debouncedCoordinatorSearch = useDebounce(coordinatorSearch, 300)
  const [showCoordinatorPopover, setShowCoordinatorPopover] = useState(false)
  const [showStatusDialog, setShowStatusDialog] = useState(false)
  const [pendingStatusChange, setPendingStatusChange] = useState<{
    action: string
    newStatus: string
  } | null>(null)

  const [structureEditForm, setStructureEditForm] = useState({
    format: "",
    team_size: 3,
    prelim_rounds: 3,
    elimination_rounds: 3,
    judges_per_debate: 1,
    fee: "",
    fee_currency: "RWF" as "RWF" | "USD"
  })

  const [scheduleEditForm, setScheduleEditForm] = useState({
    dateRange: undefined as DateTimeRange | undefined,
    location: "",
    is_virtual: false
  })

  const [speakingEditForm, setSpeakingEditForm] = useState({
    speaking_times: {} as Record<string, number>
  })

  const [motionsEditForm, setMotionsEditForm] = useState({
    motions: {} as Record<string, { motion: string; round: number; releaseTime: number }>
  })
  const [showMotionsDialog, setShowMotionsDialog] = useState(false)
  const [motionInput, setMotionInput] = useState("")

  const getUrl = useMutation(api.files.getUrl)
  const deleteFile = useMutation(api.files.deleteFile)

  const updateTournament = useMutation(api.functions.admin.tournaments.updateTournament);

  const rounds = useQuery(
    api.functions.admin.tournaments.getTournamentRounds,
    tournament?._id ? { tournament_id: tournament._id } : "skip"
  )

  const leaguesData = useQuery(
    api.functions.leagues.getLeagues,
    isAdmin && leagueSearch !== undefined ? {
      search: leagueSearch,
      limit: 20
    } : "skip"
  )

  const coordinatorsData = useQuery(
    api.functions.admin.tournaments.getCoordinators,
    isAdmin && hasToken ? {
      admin_token: token as string,
      search: debouncedCoordinatorSearch || undefined,
      limit: 50
    } : "skip"
  )

  const leagues = leaguesData?.leagues || []
  const coordinators = coordinatorsData || []

  useEffect(() => {
    if (tournament.image) {
      getUrl({ storageId: tournament.image }).then(setImageUrl).catch(console.error)
    }
  }, [tournament.image, getUrl])

  if (!rounds) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-48 w-full rounded-lg" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      </div>
    )
  }

  const prelimRounds = rounds.filter(round => round.type === "preliminary")
  const elimRounds = rounds.filter(round => round.type === "elimination" || round.type === "final")

  const hasInProgressOrCompletedRounds = isAdmin ? rounds.some(round => round.status === "completed" || round.status === "inProgress") : false
  const hasInProgressOrCompletedPrelims = isAdmin ? prelimRounds.some(round => round.status === "completed" || round.status === "inProgress") : false
  const hasInProgressOrCompletedElims = isAdmin ? elimRounds.some(round => round.status === "completed" || round.status === "inProgress") : false
  const isPublished = tournament.status === "published"

  const canEditBasicInfo = isAdmin
  const canEditStructure = isAdmin && !hasInProgressOrCompletedRounds
  const canEditSpeakingTimes = isAdmin && !hasInProgressOrCompletedRounds
  const canEditMotions = isAdmin

  const initializeBasicEditForm = () => {
    if (!isAdmin) return
    setBasicEditForm({
      name: tournament.name,
      coordinator_id: tournament.coordinator?._id || "",
      league_id: tournament.league?._id || "",
      image: tournament.image
    })
  }

  const initializeStructureEditForm = () => {
    if (!isAdmin) return
    setStructureEditForm({
      format: tournament.format,
      team_size: tournament.team_size,
      prelim_rounds: tournament.prelim_rounds,
      elimination_rounds: tournament.elimination_rounds,
      judges_per_debate: tournament.judges_per_debate,
      fee: tournament.fee?.toString() || "",
      fee_currency: tournament.fee_currency || "RWF"
    })
  }

  const initializeScheduleEditForm = () => {
    if (!isAdmin) return
    setScheduleEditForm({
      dateRange: {
        from: new Date(tournament.start_date),
        to: new Date(tournament.end_date),
        fromTime: format(new Date(tournament.start_date), "HH:mm"),
        toTime: format(new Date(tournament.end_date), "HH:mm")
      },
      location: tournament.location || "",
      is_virtual: tournament.is_virtual
    })
  }

  const initializeSpeakingEditForm = () => {
    if (!isAdmin) return
    setSpeakingEditForm({
      speaking_times: { ...tournament.speaking_times }
    })
  }

  const initializeMotionsEditForm = () => {
    if (!isAdmin) return
    const motionsObj: Record<string, { motion: string; round: number; releaseTime: number }> = {}
    rounds.forEach(round => {
      const key = `${round.type}_${round.round_number}`
      motionsObj[key] = {
        motion: round.motion,
        round: round.round_number,
        releaseTime: round.motion_released_at || Date.now()
      }
    })
    setMotionsEditForm({ motions: motionsObj })
  }

  const handleStatusChange = async () => {
    if (!isAdmin || !updateTournament || !pendingStatusChange || !token) return

    try {
      await updateTournament({
        admin_token: token,
        tournament_id: tournament._id,
        name: tournament.name,
        start_date: tournament.start_date,
        end_date: tournament.end_date,
        location: tournament.location,
        is_virtual: tournament.is_virtual,
        league_id: tournament.league_id,
        coordinator_id: tournament.coordinator_id,
        format: tournament.format as any,
        team_size: tournament.team_size,
        prelim_rounds: tournament.prelim_rounds,
        elimination_rounds: tournament.elimination_rounds,
        judges_per_debate: tournament.judges_per_debate,
        fee: tournament.fee,
        fee_currency: tournament.fee_currency,
        speaking_times: tournament.speaking_times,
        motions: {},
        image: tournament.image,
        status: pendingStatusChange.newStatus as any
      })

      toast.success(`Tournament ${pendingStatusChange.action}ed successfully`)
      setShowStatusDialog(false)
      setPendingStatusChange(null)
    } catch (error: any) {
      console.error("Error updating tournament status:", error)
      toast.error(error.message || `Failed to ${pendingStatusChange.action} tournament`)
    }
  }

  const handleSaveBasicInfo = async () => {
    if (!isAdmin || !updateTournament || !token) {
      toast.error("Authentication required")
      return
    }

    try {
      const result = await updateTournament({
        admin_token: token,
        tournament_id: tournament._id,
        name: basicEditForm.name,
        start_date: tournament.start_date,
        end_date: tournament.end_date,
        location: tournament.location,
        is_virtual: tournament.is_virtual,
        league_id: (!isPublished && basicEditForm.league_id) ? basicEditForm.league_id as Id<"leagues"> : tournament.league_id,
        coordinator_id: basicEditForm.coordinator_id ? basicEditForm.coordinator_id as Id<"users"> : undefined,
        format: tournament.format as any,
        team_size: tournament.team_size,
        prelim_rounds: tournament.prelim_rounds,
        elimination_rounds: tournament.elimination_rounds,
        judges_per_debate: tournament.judges_per_debate,
        fee: tournament.fee,
        fee_currency: tournament.fee_currency,
        speaking_times: tournament.speaking_times,
        motions: {},
        image: basicEditForm.image,
        status: tournament.status as any
      })
      if (result.slug && basicEditForm.name !== tournament.name) {
        onSlugChange?.(result.slug);
      }

      toast.success("Tournament information updated successfully")
      setEditingCard(null)

    } catch (error: any) {
      console.error("Error updating tournament:", error)
      toast.error(error.message || "Failed to update tournament")
    }
  }

  const handleSaveStructure = async () => {
    if (!isAdmin || !updateTournament || !token) {
      toast.error("Authentication required")
      return
    }

    try {
      let updatedSpeakingTimes = { ...tournament.speaking_times }

      if (!hasInProgressOrCompletedRounds && structureEditForm.team_size !== tournament.team_size) {
        const newTeamSize = structureEditForm.team_size
        const currentTeamSize = tournament.team_size

        if (newTeamSize > currentTeamSize) {
          const lastSpeakerTime = updatedSpeakingTimes[`speaker${currentTeamSize}`] || 8
          for (let i = currentTeamSize + 1; i <= newTeamSize; i++) {
            updatedSpeakingTimes[`speaker${i}`] = lastSpeakerTime
          }
        } else if (newTeamSize < currentTeamSize) {
          for (let i = newTeamSize + 1; i <= currentTeamSize; i++) {
            delete updatedSpeakingTimes[`speaker${i}`]
          }
        }
      }

      await updateTournament({
        admin_token: token,
        tournament_id: tournament._id,
        name: tournament.name,
        description: tournament.description,
        start_date: tournament.start_date,
        end_date: tournament.end_date,
        location: tournament.location,
        is_virtual: tournament.is_virtual,
        league_id: tournament.league_id,
        coordinator_id: tournament.coordinator_id,
        format: (!isPublished && !hasInProgressOrCompletedRounds) ? structureEditForm.format as any : tournament.format as any,
        team_size: !hasInProgressOrCompletedRounds ? structureEditForm.team_size : tournament.team_size,
        prelim_rounds: !hasInProgressOrCompletedPrelims ? structureEditForm.prelim_rounds : tournament.prelim_rounds,
        elimination_rounds: !hasInProgressOrCompletedElims ? structureEditForm.elimination_rounds : tournament.elimination_rounds,
        judges_per_debate: !hasInProgressOrCompletedRounds ? structureEditForm.judges_per_debate : tournament.judges_per_debate,
        fee: !hasInProgressOrCompletedRounds ? (structureEditForm.fee ? parseInt(structureEditForm.fee) : undefined) : tournament.fee,
        fee_currency: !hasInProgressOrCompletedRounds ? structureEditForm.fee_currency : tournament.fee_currency,
        speaking_times: updatedSpeakingTimes,
        motions: {},
        image: tournament.image,
        status: tournament.status as any
      })

      toast.success("Tournament structure updated successfully")
      setEditingCard(null)
    } catch (error: any) {
      console.error("Error updating tournament:", error)
      toast.error(error.message || "Failed to update tournament")
    }
  }

  const handleSaveSchedule = async () => {
    if (!isAdmin || !updateTournament || !token) {
      toast.error("Authentication required")
      return
    }

    try {
      const startDateTime = scheduleEditForm.dateRange?.from && scheduleEditForm.dateRange?.fromTime ?
        new Date(`${format(scheduleEditForm.dateRange.from, "yyyy-MM-dd")}T${scheduleEditForm.dateRange.fromTime}`).getTime() : tournament.start_date

      const endDateTime = scheduleEditForm.dateRange?.to && scheduleEditForm.dateRange?.toTime ?
        new Date(`${format(scheduleEditForm.dateRange.to, "yyyy-MM-dd")}T${scheduleEditForm.dateRange.toTime}`).getTime() : tournament.end_date

      await updateTournament({
        admin_token: token,
        tournament_id: tournament._id,
        name: tournament.name,
        description: tournament.description,
        start_date: startDateTime,
        end_date: endDateTime,
        location: scheduleEditForm.is_virtual ? undefined : scheduleEditForm.location,
        is_virtual: scheduleEditForm.is_virtual,
        league_id: tournament.league_id,
        coordinator_id: tournament.coordinator_id,
        format: tournament.format as any,
        team_size: tournament.team_size,
        prelim_rounds: tournament.prelim_rounds,
        elimination_rounds: tournament.elimination_rounds,
        judges_per_debate: tournament.judges_per_debate,
        fee: tournament.fee,
        fee_currency: tournament.fee_currency,
        speaking_times: tournament.speaking_times,
        motions: {},
        image: tournament.image,
        status: tournament.status as any
      })

      toast.success("Tournament schedule updated successfully")
      setEditingCard(null)
    } catch (error: any) {
      console.error("Error updating tournament:", error)
      toast.error(error.message || "Failed to update tournament")
    }
  }

  const handleSaveSpeakingTimes = async () => {
    if (!isAdmin || !updateTournament || !token) {
      toast.error("Authentication required")
      return
    }

    try {
      await updateTournament({
        admin_token: token,
        tournament_id: tournament._id,
        name: tournament.name,
        description: tournament.description,
        start_date: tournament.start_date,
        end_date: tournament.end_date,
        location: tournament.location,
        is_virtual: tournament.is_virtual,
        league_id: tournament.league_id,
        coordinator_id: tournament.coordinator_id,
        format: tournament.format as any,
        team_size: tournament.team_size,
        prelim_rounds: tournament.prelim_rounds,
        elimination_rounds: tournament.elimination_rounds,
        judges_per_debate: tournament.judges_per_debate,
        fee: tournament.fee,
        fee_currency: tournament.fee_currency,
        speaking_times: speakingEditForm.speaking_times,
        motions: {},
        image: tournament.image,
        status: tournament.status as any
      })

      toast.success("Speaking times updated successfully")
      setEditingCard(null)
    } catch (error: any) {
      console.error("Error updating tournament:", error)
      toast.error(error.message || "Failed to update tournament")
    }
  }

  const handleSaveMotions = async () => {
    if (!isAdmin || !updateTournament || !token) {
      toast.error("Authentication required")
      return
    }

    try {
      await updateTournament({
        admin_token: token,
        tournament_id: tournament._id,
        name: tournament.name,
        description: tournament.description,
        start_date: tournament.start_date,
        end_date: tournament.end_date,
        location: tournament.location,
        is_virtual: tournament.is_virtual,
        league_id: tournament.league_id,
        coordinator_id: tournament.coordinator_id,
        format: tournament.format as any,
        team_size: tournament.team_size,
        prelim_rounds: tournament.prelim_rounds,
        elimination_rounds: tournament.elimination_rounds,
        judges_per_debate: tournament.judges_per_debate,
        fee: tournament.fee,
        fee_currency: tournament.fee_currency,
        speaking_times: tournament.speaking_times,
        motions: motionsEditForm.motions,
        image: tournament.image,
        status: tournament.status as any
      })

      toast.success("Motions updated successfully")
      setEditingCard(null)
    } catch (error: any) {
      console.error("Error updating tournament:", error)
      toast.error(error.message || "Failed to update tournament")
    }
  }

  const handleImageUpload = (storageId: Id<"_storage">) => {
    if (!isAdmin) return
    setBasicEditForm(prev => ({ ...prev, image: storageId }))
    setShowImageDialog(false)
  }

  const handleRemoveImage = async () => {
    if (!isAdmin) return
    if (basicEditForm.image) {
      try {
        await deleteFile({ storageId: basicEditForm.image })
        toast.success("Image deleted successfully")
      } catch (error) {
        console.error("Error deleting image:", error)
        toast.error("Failed to delete image")
        return
      }
    }
    setBasicEditForm(prev => ({ ...prev, image: undefined }))
    setImageUrl(null)
    setShowRemoveImageDialog(false)
  }

  const handleDateRangeChange = (range: DateRange | DateTimeRange | undefined) => {
    if (!isAdmin) return
    setScheduleEditForm(prev => ({ ...prev, dateRange: range }))
  }

  const handleSpeakingTimeChange = (speaker: string, minutes: number) => {
    if (!isAdmin) return
    setSpeakingEditForm(prev => ({
      ...prev,
      speaking_times: {
        ...prev.speaking_times,
        [speaker]: minutes
      }
    }))
  }

  const handleMotionChange = (key: string, value: string) => {
    if (!isAdmin) return
    setMotionsEditForm(prev => ({
      ...prev,
      motions: {
        ...prev.motions,
        [key]: {
          ...prev.motions[key],
          motion: value
        }
      }
    }))
  }

  const handleMotionsFromText = () => {
    if (!isAdmin || !motionInput.trim()) return

    const lines = motionInput.split('\n').filter(line => line.trim())
    const newMotions = { ...motionsEditForm.motions }
    const now = Date.now()

    let currentIndex = 0

    for (let i = 1; i <= tournament.prelim_rounds && currentIndex < lines.length; i++) {
      const key = `preliminary_${i}`
      const motion = lines[currentIndex].replace(/^[-•*]\s*/, '').trim()
      newMotions[key] = {
        ...newMotions[key],
        motion,
        releaseTime: i === tournament.prelim_rounds ? 0 : now
      }
      currentIndex++
    }

    for (let i = 1; i <= tournament.elimination_rounds && currentIndex < lines.length; i++) {
      const key = `elimination_${i}`
      const motion = lines[currentIndex].replace(/^[-•*]\s*/, '').trim()
      newMotions[key] = {
        ...newMotions[key],
        motion,
        releaseTime: now
      }
      currentIndex++
    }

    setMotionsEditForm(prev => ({ ...prev, motions: newMotions }))
    setMotionInput("")
    setShowMotionsDialog(false)
    toast.success("Motions updated successfully")
  }

  const canEditRoundMotion = (roundType: string, roundNumber: number) => {
    if (!isAdmin) return false
    const round = rounds.find(r => r.type === roundType && r.round_number === roundNumber)
    return round && round.status === "pending"
  }

  const selectedLeague = leagues.find(l => l._id === basicEditForm.league_id)
  const selectedCoordinator = coordinators.find(c => c._id === basicEditForm.coordinator_id)

  return (
    <div className="space-y-2">
      {imageUrl && (
        <div className="relative h-48 lg:h-64 rounded-lg overflow-hidden bg-gradient-to-r from-blue-500 to-purple-600">
          <Image
            src={imageUrl}
            alt={tournament.name}
            fill
            sizes="(max-width: 768px) 100vw, 75vw"
            className="object-cover"
          />
          <div className="absolute inset-0 bg-black/50" />
          <div className="absolute bottom-4 left-4 text-white">
            <h2 className="text-xl lg:text-2xl font-bold">{tournament.name}</h2>
            {tournament.description && (
              <p className="text-sm lg:text-base opacity-90 mt-1 max-w-2xl">
                {tournament.description}
              </p>
            )}
          </div>
        </div>
      )}

      <Card className="p-4 space-y-2">
        <div className="grid grid-cols-1 custom:grid-cols-2 gap-2">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Tournament Information</CardTitle>
                <CardDescription>Basic details about the tournament</CardDescription>
              </div>
              <div className="flex gap-2">
                {isAdmin && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm">
                        Status
                        <ChevronDown className="h-4 w-4 ml-2" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {tournament.status === "draft" && (
                        <DropdownMenuItem
                          onClick={() => {
                            setPendingStatusChange({ action: "publish", newStatus: "published" })
                            setShowStatusDialog(true)
                          }}
                        >
                          <Globe className="h-4 w-4 mr-2" />
                          Publish Tournament
                        </DropdownMenuItem>
                      )}
                      {(tournament.status === "published" || tournament.status === "inProgress") && (
                        <DropdownMenuItem
                          onClick={() => {
                            setPendingStatusChange({ action: "cancel", newStatus: "cancelled" })
                            setShowStatusDialog(true)
                          }}
                        >
                          <PauseCircle className="h-4 w-4 mr-2" />
                          Cancel Tournament
                        </DropdownMenuItem>
                      )}
                      {tournament.status === "cancelled" && (
                        <DropdownMenuItem
                          onClick={() => {
                            setPendingStatusChange({ action: "reactivate", newStatus: "draft" })
                            setShowStatusDialog(true)
                          }}
                        >
                          <PlayCircle className="h-4 w-4 mr-2" />
                          Reactivate Tournament
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}

                
                {canEditBasicInfo && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (editingCard === 'basic') {
                        setEditingCard(null)
                      } else {
                        initializeBasicEditForm()
                        setEditingCard('basic')
                      }
                    }}
                  >
                    {editingCard === 'basic' ? <X className="h-4 w-4" /> : <Edit className="h-4 w-4" />}
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              
              {editingCard === 'basic' && isAdmin ? (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="edit-name">Tournament Name</Label>
                    <Input
                      id="edit-name"
                      value={basicEditForm.name}
                      onChange={(e) => setBasicEditForm(prev => ({ ...prev, name: e.target.value }))}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Tournament Image</Label>
                    {!basicEditForm.image ? (
                      <Dialog open={showImageDialog} onOpenChange={setShowImageDialog}>
                        <DialogTrigger asChild>
                          <Button variant="outline" className="w-full">
                            <Upload className="h-4 w-4 mr-2" />
                            Upload Tournament Image
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Upload Tournament Image</DialogTitle>
                            <DialogDescription>
                              Upload an image to represent your tournament
                            </DialogDescription>
                          </DialogHeader>
                          <FileUpload
                            onUpload={handleImageUpload}
                            accept={["image/jpeg", "image/jpg", "image/png"]}
                            maxSizeInMB={5}
                            label="Tournament Image"
                            description="Upload a high-quality image (JPEG, PNG) up to 5MB"
                          />
                        </DialogContent>
                      </Dialog>
                    ) : (
                      <div className="flex items-center gap-2 p-3 border rounded-lg">
                        <div className="flex-1">
                          <p className="text-sm font-medium">Image uploaded</p>
                          <p className="text-xs text-muted-foreground">Tournament banner ready</p>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setShowRemoveImageDialog(true)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </div>

                  {!isPublished && (
                    <div className="space-y-2">
                      <Label>League</Label>
                      <Popover open={showLeaguePopover} onOpenChange={setShowLeaguePopover}>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            role="combobox"
                            className="w-full justify-between"
                          >
                            {selectedLeague ? selectedLeague.name : "Select league..."}
                            <Search className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-full p-0">
                          <Command>
                            <CommandInput
                              placeholder="Search leagues..."
                              value={leagueSearch}
                              onValueChange={setLeagueSearch}
                            />
                            <CommandEmpty>No leagues found.</CommandEmpty>
                            <CommandGroup className="max-h-64 overflow-auto">
                              {leagues.map((league) => (
                                <CommandItem
                                  key={league._id}
                                  value={league._id}
                                  onSelect={() => {
                                    setBasicEditForm(prev => ({ ...prev, league_id: league._id }))
                                    setShowLeaguePopover(false)
                                  }}
                                >
                                  <Check
                                    className={cn(
                                      "mr-2 h-4 w-4",
                                      basicEditForm.league_id === league._id ? "opacity-100" : "opacity-0"
                                    )}
                                  />
                                  <div>
                                    <div className="font-medium">{league.name}</div>
                                    <div className="text-sm text-muted-foreground">{league.type}</div>
                                  </div>
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </Command>
                        </PopoverContent>
                      </Popover>
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label>Tournament Coordinator</Label>
                    <Popover open={showCoordinatorPopover} onOpenChange={setShowCoordinatorPopover}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          role="combobox"
                          className="w-full justify-between"
                        >
                          {selectedCoordinator
                            ? `${selectedCoordinator.name} (${selectedCoordinator.role})`
                            : "Select coordinator..."}
                          <Search className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-full p-0">
                        <Command>
                          <CommandInput
                            placeholder="Search coordinators..."
                            value={coordinatorSearch}
                            onValueChange={setCoordinatorSearch}
                          />
                          <CommandEmpty>
                            {debouncedCoordinatorSearch ? "No coordinators found." : "Type to search coordinators..."}
                          </CommandEmpty>
                          <CommandGroup className="max-h-64 overflow-auto">
                            {coordinators.map((coordinator) => (
                              <CommandItem
                                key={coordinator._id}
                                value={coordinator._id}
                                onSelect={() => {
                                  setBasicEditForm(prev => ({ ...prev, coordinator_id: coordinator._id }))
                                  setShowCoordinatorPopover(false)
                                }}
                              >
                                <Check
                                  className={cn(
                                    "mr-2 h-4 w-4",
                                    basicEditForm.coordinator_id === coordinator._id ? "opacity-100" : "opacity-0"
                                  )}
                                />
                                <div>
                                  <div className="font-medium flex items-center gap-2">
                                    {coordinator.name}
                                    {coordinator.role === "admin" && (
                                      <Badge variant="default" className="text-xs">
                                        Admin
                                      </Badge>
                                    )}
                                  </div>
                                  <div className="text-sm text-muted-foreground">
                                    {coordinator.email}
                                    {coordinator.school_name && (
                                      <span> • {coordinator.school_name}</span>
                                    )}
                                  </div>
                                </div>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={handleSaveBasicInfo}
                      className="flex-1"
                    >
                      <Save className="h-4 w-4 mr-2" />
                      Save Changes
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setEditingCard(null)}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (

                <div className="space-y-3">
                  <div className="grid grid-cols-1 custom:grid-cols-2 gap-2">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-primary/10 rounded-lg">
                        <Trophy className="h-4 w-4 text-primary" />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium">Format</p>
                        <p className="text-xs text-muted-foreground">{tournament.format}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-primary/10 rounded-lg">
                        <Users className="h-4 w-4 text-primary" />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium">Participation</p>
                        <p className="text-xs text-muted-foreground">
                          {tournament.teamCount || 0} teams • {tournament.schoolCount || 0} schools
                        </p>
                      </div>
                    </div>

                    {tournament.coordinator && (
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-primary/10 rounded-lg">
                          <Contact className="h-4 w-4 text-primary" />
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-medium">Coordinator</p>
                          <p className="text-xs text-muted-foreground">
                            {tournament.coordinator.name}
                          </p>
                        </div>
                      </div>
                    )}

                    {tournament.fee && (
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-primary/10 rounded-lg">
                          <DollarSign className="h-4 w-4 text-primary" />
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-medium">Entry Fee</p>
                          <p className="text-xs text-muted-foreground">
                            {tournament.fee_currency} {tournament.fee?.toLocaleString()}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="pt-4 border-t">
                    <div className="flex items-center gap-2">
                      
                      {isAdmin && (
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
                      )}

                      {tournament.league && (
                        <Badge variant="outline" className="text-xs">
                          {tournament.league.name}
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Tournament Structure</CardTitle>
                <CardDescription>Format and configuration details</CardDescription>
              </div>
              
              {canEditStructure && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (editingCard === 'structure') {
                      setEditingCard(null)
                    } else {
                      initializeStructureEditForm()
                      setEditingCard('structure')
                    }
                  }}
                >
                  {editingCard === 'structure' ? <X className="h-4 w-4" /> : <Edit className="h-4 w-4" />}
                </Button>
              )}
            </CardHeader>
            <CardContent className="space-y-4">
              
              {editingCard === 'structure' && isAdmin ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="edit-format">Format</Label>
                      <Select
                        value={structureEditForm.format}
                        onValueChange={(value) => setStructureEditForm(prev => ({ ...prev, format: value }))}
                        disabled={isPublished || hasInProgressOrCompletedRounds}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {FORMATS.map((format) => (
                            <SelectItem key={format.value} value={format.value}>
                              {format.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="edit-team-size">Team Size</Label>
                      <Select
                        value={structureEditForm.team_size.toString()}
                        onValueChange={(value) => setStructureEditForm(prev => ({ ...prev, team_size: parseInt(value) }))}
                        disabled={hasInProgressOrCompletedRounds}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {[1, 2, 3, 4, 5].map((size) => (
                            <SelectItem
                              key={size}
                              value={size.toString()}
                              disabled={structureEditForm.format === "WorldSchools" && size > 3}
                            >
                              {size} speaker{size > 1 ? "s" : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="edit-prelim-rounds">Prelim Rounds</Label>
                      <Input
                        id="edit-prelim-rounds"
                        type="number"
                        min="1"
                        max="10"
                        value={structureEditForm.prelim_rounds}
                        onChange={(e) => setStructureEditForm(prev => ({ ...prev, prelim_rounds: parseInt(e.target.value) || 1 }))}
                        disabled={hasInProgressOrCompletedPrelims}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="edit-elim-rounds">Elim Rounds</Label>
                      <Input
                        id="edit-elim-rounds"
                        type="number"
                        min="1"
                        max="10"
                        value={structureEditForm.elimination_rounds}
                        onChange={(e) => setStructureEditForm(prev => ({ ...prev, elimination_rounds: parseInt(e.target.value) || 1 }))}
                        disabled={hasInProgressOrCompletedElims}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="edit-judges">Judges</Label>
                      <Input
                        id="edit-judges"
                        type="number"
                        min="1"
                        max="7"
                        value={structureEditForm.judges_per_debate}
                        onChange={(e) => setStructureEditForm(prev => ({ ...prev, judges_per_debate: parseInt(e.target.value) || 1 }))}
                        disabled={hasInProgressOrCompletedRounds}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="edit-fee">Entry Fee</Label>
                    <div className="flex gap-2">
                      <Input
                        id="edit-fee"
                        type="number"
                        min="0"
                        value={structureEditForm.fee}
                        onChange={(e) => setStructureEditForm(prev => ({ ...prev, fee: e.target.value }))}
                        placeholder="Enter amount"
                        className="flex-1"
                        disabled={hasInProgressOrCompletedRounds}
                      />
                      <Select
                        value={structureEditForm.fee_currency}
                        onValueChange={(value: "RWF" | "USD") => setStructureEditForm(prev => ({ ...prev, fee_currency: value }))}
                        disabled={hasInProgressOrCompletedRounds}
                      >
                        <SelectTrigger className="w-24">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="RWF">RWF</SelectItem>
                          <SelectItem value="USD">USD</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={handleSaveStructure}
                      className="flex-1"
                    >
                      <Save className="h-4 w-4 mr-2" />
                      Save Changes
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setEditingCard(null)}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Team Size</Label>
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-muted-foreground" />
                      <span className="text-xs">{tournament.team_size} speakers</span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Judges per Debate</Label>
                    <div className="flex items-center gap-2">
                      <Gavel className="h-4 w-4 text-muted-foreground" />
                      <span className="text-xs">{tournament.judges_per_debate} judges</span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Preliminary Rounds</Label>
                    <div className="flex items-center gap-2">
                      <Trophy className="h-4 w-4 text-muted-foreground" />
                      <span className="text-xs">{tournament.prelim_rounds} rounds</span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Elimination Rounds</Label>
                    <div className="flex items-center gap-2">
                      <Trophy className="h-4 w-4 text-muted-foreground" />
                      <span className="text-xs">{tournament.elimination_rounds} rounds</span>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 custom:grid-cols-2 gap-2">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Schedule & Location</CardTitle>
                <CardDescription>When and where the tournament takes place</CardDescription>
              </div>
              
              {canEditStructure && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (editingCard === 'schedule') {
                      setEditingCard(null)
                    } else {
                      initializeScheduleEditForm()
                      setEditingCard('schedule')
                    }
                  }}
                >
                  {editingCard === 'schedule' ? <X className="h-4 w-4" /> : <Edit className="h-4 w-4" />}
                </Button>
              )}
            </CardHeader>
            <CardContent className="space-y-4">
              
              {editingCard === 'schedule' && isAdmin ? (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Tournament Dates & Times</Label>
                    <DateRangePicker
                      dateRange={scheduleEditForm.dateRange}
                      onDateRangeChange={handleDateRangeChange}
                      placeholder="Select tournament date range"
                      minDate={new Date()}
                      includeTime={true}
                      defaultFromTime="09:00"
                      defaultToTime="17:00"
                      className="w-full"
                    />
                  </div>

                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="edit-isVirtual"
                      checked={scheduleEditForm.is_virtual}
                      onCheckedChange={(checked) => setScheduleEditForm(prev => ({ ...prev, is_virtual: checked as boolean }))}
                    />
                    <Label htmlFor="edit-isVirtual" className="text-sm">
                      Virtual tournament
                    </Label>
                  </div>

                  {!scheduleEditForm.is_virtual && (
                    <div className="space-y-2">
                      <Label htmlFor="edit-location">Location</Label>
                      <VolunteerSchoolSelector
                        value={scheduleEditForm.location}
                        onValueChange={(value) => setScheduleEditForm(prev => ({ ...prev, location: value }))}
                        placeholder="Enter tournament location..."
                      />
                    </div>
                  )}

                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={handleSaveSchedule}
                      className="flex-1"
                    >
                      <Save className="h-4 w-4 mr-2" />
                      Save Changes
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setEditingCard(null)}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (

                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-primary/10 rounded-lg">
                      <Calendar className="h-4 w-4 text-primary" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium">Schedule</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDateRange(tournament.start_date, tournament.end_date)}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-primary/10 rounded-lg">
                      {tournament.is_virtual ? (
                        <Video className="h-4 w-4 text-primary" />
                      ) : (
                        <MapPin className="h-4 w-4 text-primary" />
                      )}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium">
                        {tournament.is_virtual ? "Virtual Tournament" : "Location"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {tournament.is_virtual
                          ? "Online via video conferencing"
                          : tournament.location || "Location TBD"
                        }
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Speaking Times</CardTitle>
                <CardDescription>Time limits for each speaker (minutes)</CardDescription>
              </div>
              
              {canEditSpeakingTimes && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (editingCard === 'speaking') {
                      setEditingCard(null)
                    } else {
                      initializeSpeakingEditForm()
                      setEditingCard('speaking')
                    }
                  }}
                >
                  {editingCard === 'speaking' ? <X className="h-4 w-4" /> : <Edit className="h-4 w-4" />}
                </Button>
              )}
            </CardHeader>
            <CardContent>
              
              {editingCard === 'speaking' && isAdmin ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {Array.from({ length: tournament.team_size }, (_, i) => i + 1).map((speakerNum) => (
                      <div key={speakerNum} className="space-y-2">
                        <Label htmlFor={`edit-speaker${speakerNum}`} className="text-sm">
                          Speaker {speakerNum}
                        </Label>
                        <Input
                          id={`edit-speaker${speakerNum}`}
                          type="number"
                          min="1"
                          max="15"
                          value={speakingEditForm.speaking_times[`speaker${speakerNum}`] || 8}
                          onChange={(e) =>
                            handleSpeakingTimeChange(`speaker${speakerNum}`, parseInt(e.target.value) || 5)
                          }
                        />
                      </div>
                    ))}
                  </div>

                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={handleSaveSpeakingTimes}
                      className="flex-1"
                    >
                      <Save className="h-4 w-4 mr-2" />
                      Save Changes
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setEditingCard(null)}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {Object.entries(tournament.speaking_times as Record<string, number> || {}).map(([speaker, time]) => (
                    <div key={speaker} className="flex items-center gap-2 p-2 bg-muted rounded">
                      <Clock className="h-3 w-3 text-muted-foreground" />
                      <span className="text-xs">
                        {speaker.replace('speaker', 'Speaker ')}: {time} min
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        
        {rounds && rounds.length > 0 && (
          <div className="grid grid-cols-1 custom:grid-cols-2 gap-2">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Preliminary Rounds</CardTitle>
                  <CardDescription>
                    {prelimRounds.length} preliminary rounds
                  </CardDescription>
                </div>
                
                {canEditMotions && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (editingCard === 'motions-prelim') {
                        setEditingCard(null)
                      } else {
                        initializeMotionsEditForm()
                        setEditingCard('motions-prelim')
                      }
                    }}
                  >
                    {editingCard === 'motions-prelim' ? <X className="h-4 w-4" /> : <Edit className="h-4 w-4" />}
                  </Button>
                )}
              </CardHeader>
              <CardContent>
                
                {editingCard === 'motions-prelim' && isAdmin ? (
                  <div className="space-y-4">
                    <Dialog open={showMotionsDialog} onOpenChange={setShowMotionsDialog}>
                      <DialogTrigger asChild>
                        <Button variant="outline" className="w-full">
                          <Edit className="h-4 w-4 mr-2" />
                          Bulk Edit Motions
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                        <DialogHeader>
                          <DialogTitle>Bulk Edit Tournament Motions</DialogTitle>
                          <DialogDescription>
                            Set debate motions for all rounds. You can paste a list or enter them individually.
                          </DialogDescription>
                        </DialogHeader>

                        <div className="space-y-6">
                          <div className="space-y-3">
                            <div className="flex items-center gap-2">
                              <Label>Bulk Import</Label>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  const exampleText = `• Motion for preliminary round 1
• Motion for preliminary round 2  
• Motion for preliminary round 3 (impromptu)
• Motion for elimination round 1
• Motion for elimination round 2
• Motion for elimination round 3`
                                  navigator.clipboard.writeText(exampleText)
                                  toast.success("Example copied to clipboard")
                                }}
                              >
                                <Copy className="h-4 w-4 mr-1" />
                                Copy Example
                              </Button>
                            </div>
                            <Textarea
                              value={motionInput}
                              onChange={(e) => setMotionInput(e.target.value)}
                              placeholder="Paste motions here, one per line..."
                              rows={6}
                              className="font-mono text-sm"
                            />
                            <Button
                              onClick={handleMotionsFromText}
                              disabled={!motionInput.trim()}
                              className="w-full"
                            >
                              <Plus className="h-4 w-4 mr-2" />
                              Import Motions
                            </Button>
                          </div>
                        </div>

                        <DialogFooter>
                          <Button
                            variant="outline"
                            onClick={() => setShowMotionsDialog(false)}
                          >
                            Close
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>

                    <div className="space-y-3">
                      {prelimRounds.map((round) => {
                        const key = `${round.type}_${round.round_number}`
                        const canEdit = canEditRoundMotion(round.type, round.round_number)
                        const isImpromptu = round.is_impromptu

                        return (
                          <div key={round._id} className="space-y-2">
                            <div className="flex items-center gap-2">
                              <Label htmlFor={key} className="text-sm">
                                Round {round.round_number}
                              </Label>
                              {isImpromptu && (
                                <Badge variant="secondary" className="text-xs">
                                  Impromptu
                                </Badge>
                              )}
                              {!canEdit && (
                                <Badge variant="outline" className="text-xs">
                                  Locked
                                </Badge>
                              )}
                            </div>
                            <Input
                              id={key}
                              value={motionsEditForm.motions[key]?.motion || round.motion}
                              onChange={(e) => handleMotionChange(key, e.target.value)}
                              placeholder={`Enter motion for preliminary round ${round.round_number}...`}
                              disabled={!canEdit}
                            />
                          </div>
                        )
                      })}
                    </div>

                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={handleSaveMotions}
                        className="flex-1"
                      >
                        <Save className="h-4 w-4 mr-2" />
                        Save Changes
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setEditingCard(null)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (

                  <div className="space-y-3">
                    {prelimRounds.map((round) => {
                      const isImpromptu = round.is_impromptu
                      const shouldHideMotion = isImpromptu && !isAdmin

                      return (
                        <div key={round._id} className="p-3 border rounded-lg">
                          <div className="flex items-center gap-2 mb-2">
                            <Badge variant="outline" className="text-xs">
                              Round {round.round_number}
                            </Badge>
                            {isImpromptu && (
                              <Badge variant="secondary" className="text-xs">
                                Impromptu
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {shouldHideMotion ? "XXXXXXX (Motion hidden until round)" : (round.motion || "Motion not set")}
                          </p>
                          <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                            <Clock className="h-3 w-3" />
                            <span>
                              {format(new Date(round.start_time), "MMM d, HH:mm")} -
                              {format(new Date(round.end_time), "HH:mm")}
                            </span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Elimination Rounds</CardTitle>
                  <CardDescription>
                    {elimRounds.length} elimination rounds
                  </CardDescription>
                </div>
                
                {canEditMotions && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (editingCard === 'motions-elim') {
                        setEditingCard(null)
                      } else {
                        initializeMotionsEditForm()
                        setEditingCard('motions-elim')
                      }
                    }}
                  >
                    {editingCard === 'motions-elim' ? <X className="h-4 w-4" /> : <Edit className="h-4 w-4" />}
                  </Button>
                )}
              </CardHeader>
              <CardContent>
                
                {editingCard === 'motions-elim' && isAdmin ? (
                  <div className="space-y-4">
                    <div className="space-y-3">
                      {elimRounds.map((round) => {
                        const key = `${round.type}_${round.round_number}`
                        const canEdit = canEditRoundMotion(round.type, round.round_number)

                        return (
                          <div key={round._id} className="space-y-2">
                            <div className="flex items-center gap-2">
                              <Label htmlFor={key} className="text-sm">
                                {round.type === "final" ? "Final" : `Round ${round.round_number}`}
                              </Label>
                              {!canEdit && (
                                <Badge variant="outline" className="text-xs">
                                  Locked
                                </Badge>
                              )}
                            </div>
                            <Input
                              id={key}
                              value={motionsEditForm.motions[key]?.motion || round.motion}
                              onChange={(e) => handleMotionChange(key, e.target.value)}
                              placeholder={`Enter motion for elimination round ${round.round_number}...`}
                              disabled={!canEdit}
                            />
                          </div>
                        )
                      })}
                    </div>

                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={handleSaveMotions}
                        className="flex-1"
                      >
                        <Save className="h-4 w-4 mr-2" />
                        Save Changes
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setEditingCard(null)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (

                  <div className="space-y-3">
                    {elimRounds.map((round) => (
                      <div key={round._id} className="p-3 border rounded-lg">
                        <div className="flex items-center gap-2 mb-2">
                          <Badge variant="outline" className="text-xs">
                            {round.type === "final" ? "Final" : `Round ${round.round_number}`}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {round.motion || "Motion not set"}
                        </p>
                        <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          <span>
                            {format(new Date(round.start_time), "MMM d, HH:mm")} -
                            {format(new Date(round.end_time), "HH:mm")}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </Card>

      
      {isAdmin && (
        <AlertDialog open={showStatusDialog} onOpenChange={setShowStatusDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {pendingStatusChange?.action === "publish" && "Publish Tournament"}
                {pendingStatusChange?.action === "cancel" && "Cancel Tournament"}
                {pendingStatusChange?.action === "reactivate" && "Reactivate Tournament"}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {pendingStatusChange?.action === "publish" &&
                  "Are you sure you want to publish this tournament? Once published, teams can register and some settings will be locked."
                }
                {pendingStatusChange?.action === "cancel" &&
                  "Are you sure you want to cancel this tournament? This will prevent new registrations and may affect existing teams."
                }
                {pendingStatusChange?.action === "reactivate" &&
                  "Are you sure you want to reactivate this tournament? This will change its status back to draft."
                }
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleStatusChange}>
                {pendingStatusChange?.action === "publish" && "Publish"}
                {pendingStatusChange?.action === "cancel" && "Cancel Tournament"}
                {pendingStatusChange?.action === "reactivate" && "Reactivate"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {isAdmin && (
        <AlertDialog open={showRemoveImageDialog} onOpenChange={setShowRemoveImageDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remove Tournament Image</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to remove this tournament image? This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleRemoveImage} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                Remove Image
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  )
}