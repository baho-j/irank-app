"use client"

import React, { useState, useEffect} from "react"
import { useRouter } from "next/navigation"
import { useQuery, useMutation } from "convex/react"
import { api } from "@/convex/_generated/api"
import { useAuth } from "@/hooks/use-auth"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
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
import DateRangePicker from "@/components/date-range-picker"
import { FileUpload } from "@/components/file-upload"
import { VolunteerSchoolSelector } from "@/components/school-selector"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { TOURNAMENT_FORMATS, isSupportedFormat, WORLD_SCHOOLS_TEAM_SIZE } from "@/lib/tournament-formats"
import { format } from "date-fns"
import {
  ChevronDown,
  Upload,
  Save,
  Eye,
  X,
  Search,
  Check,
  Edit,
  Plus,
  Copy, Loader2
} from "lucide-react";
import { Id } from "@/convex/_generated/dataModel"
import { type DateRange } from "react-day-picker"
import Image from "next/image"
import { useDebounce } from "@/hooks/use-debounce";

interface DateTimeRange {
  from?: Date
  to?: Date
  fromTime?: string
  toTime?: string
}

interface FormData {
  name: string
  dateRange: DateTimeRange | undefined
  location: string
  isVirtual: boolean
  leagueId: string
  coordinatorId: Id<"users">
  format: string
  teamSize: number
  prelimRounds: number
  eliminationRounds: number
  judgesPerDebate: number
  fee: string
  feeCurrency: "RWF" | "USD"
  speakingTimes: Record<string, number>
  motions: Record<string, {
    motion: string
    round: number
    releaseTime: number
  }>
  image?: Id<"_storage">
}

const DEFAULT_SPEAKING_TIMES = {
  WorldSchools: { speaker1: 5, speaker2: 5, speaker3: 5 },
  BritishParliamentary: { speaker1: 7, speaker2: 8, speaker3: 8 },
  PublicForum: { speaker1: 4, speaker2: 4, speaker3: 3 },
  LincolnDouglas: { speaker1: 6, speaker2: 3, speaker3: 6 },
  OxfordStyle: { speaker1: 6, speaker2: 8, speaker3: 8 }
}

export default function CreateTournamentPage() {
  const router = useRouter()
  const { user, token } = useAuth()
  const [loading, setLoading] = useState(false)
  const [showImageDialog, setShowImageDialog] = useState(false)
  const [showMotionsDialog, setShowMotionsDialog] = useState(false)
  const [uploadedImages, setUploadedImages] = useState<Id<"_storage">[]>([])
  const [leagueSearch, setLeagueSearch] = useState("")
  const [showLeaguePopover, setShowLeaguePopover] = useState(false)
  const [coordinatorSearch, setCoordinatorSearch] = useState("")
  const debouncedCoordinatorSearch = useDebounce(coordinatorSearch, 300)
  const [showCoordinatorPopover, setShowCoordinatorPopover] = useState(false)
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [motionInput, setMotionInput] = useState("")

  const [formData, setFormData] = useState<FormData>({
    name: "",
    dateRange: {
      from: undefined,
      to: undefined,
      fromTime: "09:00",
      toTime: "17:00"
    },
    location: "",
    isVirtual: false,
    leagueId: "",
    coordinatorId: user?.id as Id<"users">,
    format: "WorldSchools",
    teamSize: 3,
    prelimRounds: 3,
    eliminationRounds: 3,
    judgesPerDebate: 1,
    fee: "",
    feeCurrency: "RWF",
    speakingTimes: DEFAULT_SPEAKING_TIMES.WorldSchools,
    motions: {}
  })

  const [errors, setErrors] = useState<Record<string, string>>({})

  const isAdmin = user?.role === "admin"
  const hasToken = !!token

  const leaguesData = useQuery(api.functions.leagues.getLeagues, {
    search: leagueSearch,
    limit: 20
  })

  const coordinatorsData = useQuery(
    api.functions.admin.tournaments.getCoordinators,
    isAdmin && hasToken ? {
      admin_token: token as string,
      search: debouncedCoordinatorSearch || undefined,
      limit: 50
    } : "skip"
  )



  const createTournament = useMutation(api.functions.admin.tournaments.createTournament)
  const deleteFile = useMutation(api.files.deleteFile)
  const getUrl = useMutation(api.files.getUrl)

  const leagues = leaguesData?.leagues || []
  const selectedLeague = leagues.find(l => l._id === formData.leagueId)

  const coordinators = coordinatorsData || []
  const selectedCoordinator = coordinators.find(c => c._id === formData.coordinatorId)

  useEffect(() => {
    const newMotions: Record<string, any> = {}
    const now = Date.now()

    for (let i = 1; i <= formData.prelimRounds; i++) {
      const key = `preliminary_${i}`
      const isLastPrelimRound = i === formData.prelimRounds
      if (!formData.motions[key]) {
        newMotions[key] = {
          motion: "",
          round: i,
          releaseTime: isLastPrelimRound ? 0 : now
        }
      } else {
        newMotions[key] = formData.motions[key]
      }
    }

    for (let i = 1; i <= formData.eliminationRounds; i++) {
      const key = `elimination_${i}`
      if (!formData.motions[key]) {
        newMotions[key] = {
          motion: "",
          round: i,
          releaseTime: now
        }
      } else {
        newMotions[key] = formData.motions[key]
      }
    }

    setFormData(prev => ({ ...prev, motions: newMotions }))
  }, [formData.prelimRounds, formData.eliminationRounds])

  useEffect(() => {
    const defaultTimes = DEFAULT_SPEAKING_TIMES[formData.format as keyof typeof DEFAULT_SPEAKING_TIMES]
    if (defaultTimes) {
      const newSpeakingTimes: Record<string, number> = {}
      for (let i = 1; i <= formData.teamSize; i++) {
        newSpeakingTimes[`speaker${i}`] = defaultTimes[`speaker${i}` as keyof typeof defaultTimes] || 8
      }
      setFormData(prev => ({ ...prev, speakingTimes: newSpeakingTimes }))
    }
  }, [formData.format, formData.teamSize])

  useEffect(() => {
    if (formData.image) {
      getUrl({ storageId: formData.image }).then(setImageUrl).catch(console.error)
    } else {
      setImageUrl(null)
    }
  }, [formData.image, getUrl])

  const handleInputChange = (field: keyof FormData, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }))
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: "" }))
    }
  }

  const handleDateRangeChange = (range: DateRange | DateTimeRange | undefined) => {
    setFormData(prev => ({ ...prev, dateRange: range }))
    if (errors.dateRange) {
      setErrors(prev => ({ ...prev, dateRange: "" }))
    }
  }

  const handleSpeakingTimeChange = (speaker: string, minutes: number) => {
    setFormData(prev => ({
      ...prev,
      speakingTimes: {
        ...prev.speakingTimes,
        [speaker]: minutes
      }
    }))
  }

  const handleImageUpload = (storageId: Id<"_storage">) => {
    setUploadedImages(prev => [...prev, storageId])
    setFormData(prev => ({ ...prev, image: storageId }))
    setShowImageDialog(false)
  }

  const handleRemoveImage = async () => {
    if (formData.image) {
      try {
        await deleteFile({ storageId: formData.image })
        setUploadedImages(prev => prev.filter(id => id !== formData.image))
      } catch (error) {
       console.error("Error deleting image:", error)
        toast.error("Failed to delete image. Try again later")
      }
    }
    setFormData(prev => ({ ...prev, image: undefined }))
    setImageUrl(null)
  }

  const handleMotionsFromText = () => {
    if (!motionInput.trim()) return

    const lines = motionInput.split('\n').filter(line => line.trim())
    const newMotions = { ...formData.motions }
    const now = Date.now()

    let currentIndex = 0

    for (let i = 1; i <= formData.prelimRounds && currentIndex < lines.length; i++) {
      const key = `preliminary_${i}`
      const motion = lines[currentIndex].replace(/^[-•*]\s*/, '').trim()
      newMotions[key] = {
        ...newMotions[key],
        motion,
        releaseTime: i === 3 ? 0 : now
      }
      currentIndex++
    }

    for (let i = 1; i <= formData.eliminationRounds && currentIndex < lines.length; i++) {
      const key = `elimination_${i}`
      const motion = lines[currentIndex].replace(/^[-•*]\s*/, '').trim()
      newMotions[key] = {
        ...newMotions[key],
        motion,
        releaseTime: now
      }
      currentIndex++
    }

    setFormData(prev => ({ ...prev, motions: newMotions }))
    setMotionInput("")
    setShowMotionsDialog(false)
    toast.success("Motions updated successfully")
  }

  const handleMotionChange = (key: string, value: string) => {
    setFormData(prev => ({
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

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {}

    if (!formData.name.trim()) {
      newErrors.name = "Tournament name is required"
    }

    if (!formData.dateRange?.from) {
      newErrors.dateRange = "Start date is required"
    }

    if (!formData.dateRange?.to) {
      newErrors.dateRange = "End date is required"
    }

    if (formData.dateRange?.from && formData.dateRange?.to && formData.dateRange.from > formData.dateRange.to) {
      newErrors.dateRange = "End date must be after start date"
    }

    if (!formData.isVirtual && !formData.location.trim()) {
      newErrors.location = "Location is required for in-person tournaments"
    }

    if (!formData.leagueId) {
      newErrors.leagueId = "League selection is required"
    }

    if (formData.teamSize < 1 || formData.teamSize > 5) {
      newErrors.teamSize = "Team size must be between 1 and 5"
    }

    if (!isSupportedFormat(formData.format)) {
      newErrors.format = "Only World Schools tournaments are supported at the moment"
    }

    if (formData.format === "WorldSchools" && formData.teamSize !== WORLD_SCHOOLS_TEAM_SIZE) {
      newErrors.teamSize = `World Schools requires exactly ${WORLD_SCHOOLS_TEAM_SIZE} speakers per team`
    }

    if (formData.prelimRounds < 1 ) {
      newErrors.prelimRounds = "At least 1 preliminary round is required"
    }

    if (formData.eliminationRounds < 1) {
      newErrors.eliminationRounds = "At least 1 elimination round is required"
    }

    if (formData.judgesPerDebate < 1) {
      newErrors.judgesPerDebate = "At least 1 judge per debate is required"
    }

    if (!formData.fee || isNaN(parseInt(formData.fee)) || parseInt(formData.fee) <= 0) {
      newErrors.fee = "Fee must be a valid number"
    }


    if (!formData.isVirtual && formData.location === undefined) {
      newErrors.location = "Location is required for in-person tournaments"
    }


    Object.entries(formData.motions).forEach(([key, motion]) => {
      if (!motion.motion.trim()) {
        newErrors[`motion_${key}`] = "Motion is required"
      }
    })

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSave = async (status: "draft" | "published") => {
    if (!validateForm()) {
      toast.error("Please fix the errors before saving")
      return
    }

    if (!token) {
      toast.error("You must be logged in to create a tournament")
      return
    }

    setLoading(true)

    try {
      const startDateTime = formData.dateRange?.from && formData.dateRange?.fromTime ?
        new Date(`${format(formData.dateRange.from, "yyyy-MM-dd")}T${formData.dateRange.fromTime}`).getTime() : 0

      const endDateTime = formData.dateRange?.to && formData.dateRange?.toTime ?
        new Date(`${format(formData.dateRange.to, "yyyy-MM-dd")}T${formData.dateRange.toTime}`).getTime() : 0

      const tournamentData = {
        admin_token: token,
        name: formData.name.trim(),
        start_date: startDateTime,
        end_date: endDateTime,
        location: formData.isVirtual ? undefined : formData.location.trim(),
        is_virtual: formData.isVirtual,
        league_id: formData.leagueId ? formData.leagueId as Id<"leagues"> : undefined,
        coordinator_id: formData.coordinatorId ? formData.coordinatorId as Id<"users"> : undefined,
        format: formData.format as any,
        team_size: formData.teamSize,
        prelim_rounds: formData.prelimRounds,
        elimination_rounds: formData.eliminationRounds,
        judges_per_debate: formData.judgesPerDebate,
        fee: formData.fee ? parseInt(formData.fee) : undefined,
        fee_currency: formData.fee ? formData.feeCurrency : undefined,
        speaking_times: formData.speakingTimes,
        motions: formData.motions,
        image: formData.image,
        status: status as any
      }

      const result = await createTournament(tournamentData)

      toast.success(`Tournament ${status === "draft" ? "saved as draft" : "published"} successfully`)
      router.push(`/admin/tournaments/${result.slug}#overview`)

    } catch (error: any) {
      console.error("Error creating tournament:", error)
      toast.error(error.message || "Failed to create tournament")
    } finally {
      setLoading(false)
    }
  }

  const handleCancel = async () => {
    for (const imageId of uploadedImages) {
      try {
        await deleteFile({ storageId: imageId })
      } catch (error) {
        console.error("Error deleting uploaded image:", error)
      }
    }

    router.push("/admin/tournaments")
  }

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const getMotionsCount = () => {
    return Object.values(formData.motions).filter(motion => motion.motion.trim()).length
  }

  const getTotalMotionsNeeded = () => {
    return formData.prelimRounds + formData.eliminationRounds
  }

  return (
    <div className="space-y-6">
        <div>
          <p className="text-muted-foreground">Set up a new debate tournament</p>
        </div>
      {imageUrl && (
        <div className="relative mb-8 h-48 rounded-lg overflow-hidden bg-gradient-to-r from-blue-500 to-purple-600">
          <Image
            src={imageUrl}
            alt="Tournament banner"
            fill
            className="object-cover"
          />
          <div className="absolute inset-0 bg-black/40" />
          <div className="absolute top-4 right-4">
            <Button
              variant="secondary"
              size="sm"
              onClick={handleRemoveImage}
              className="bg-primary hover:bg-white"
            >
              <X className="h-4 w-4 text-white hover:text-black" />
            </Button>
          </div>
          <div className="absolute bottom-4 left-4 text-white">
            <h2 className="text-xl font-bold">{formData.name || "Tournament Name"}</h2>
          </div>
        </div>
      )}
      <Card className=" overflow-hidden  p-2">



      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Tournament Information</CardTitle>
              <CardDescription>
                Basic details about your tournament
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Tournament Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => handleInputChange("name", e.target.value)}
                  placeholder="Enter tournament name"
                  className={cn(errors.name && "border-destructive")}
                />
                {errors.name && (
                  <p className="text-destructive text-sm">{errors.name}</p>
                )}
              </div>


              <div className="space-y-2">
                <Label>Tournament Image</Label>
                {!formData.image ? (
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
                    <Button variant="ghost" size="sm" onClick={handleRemoveImage}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label>League *</Label>
                <Popover open={showLeaguePopover} onOpenChange={setShowLeaguePopover}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={showLeaguePopover}
                      className={cn(
                        "w-full justify-between",
                        !formData.leagueId && "text-muted-foreground",
                        errors.leagueId && "border-destructive"
                      )}
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
                              handleInputChange("leagueId", league._id)
                              setShowLeaguePopover(false)
                            }}
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4",
                                formData.leagueId === league._id ? "opacity-100" : "opacity-0"
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
                {errors.leagueId && (
                  <p className="text-destructive text-sm">{errors.leagueId}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label>Tournament Coordinator</Label>
                <Popover open={showCoordinatorPopover} onOpenChange={setShowCoordinatorPopover}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={showCoordinatorPopover}
                      className={cn(
                        "w-full justify-between",
                        !formData.coordinatorId && "text-muted-foreground"
                      )}
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
                              handleInputChange("coordinatorId", coordinator._id)
                              setShowCoordinatorPopover(false)
                            }}
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4",
                                formData.coordinatorId === coordinator._id ? "opacity-100" : "opacity-0"
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
                              <div className="text-sm text-muted-foreground capitalize">
                                {coordinator.role} • {coordinator.email}
                              </div>
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Tournament Configuration</CardTitle>
              <CardDescription>
                Format and tournament structure settings
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="format">Format</Label>
                  <Select
                    value={formData.format}
                    onValueChange={(value) => handleInputChange("format", value)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TOURNAMENT_FORMATS.map((format) => (
                        <SelectItem
                          key={format.value}
                          value={format.value}
                          disabled={!format.supported}
                        >
                          <span className="flex items-center gap-2">
                            {format.label}
                            {!format.supported && (
                              <Badge variant="secondary" className="text-[10px]">
                                Coming soon
                              </Badge>
                            )}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="teamSize">Team Size</Label>
                  <Select
                    value={formData.teamSize.toString()}
                    onValueChange={(value) => handleInputChange("teamSize", parseInt(value))}
                  >
                    <SelectTrigger className={cn(errors.teamSize && "border-destructive")}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[1, 2, 3, 4, 5].map((size) => (
                        <SelectItem
                          key={size}
                          value={size.toString()}
                          disabled={formData.format === "WorldSchools" && size !== WORLD_SCHOOLS_TEAM_SIZE}
                        >
                          {size} speaker{size > 1 ? "s" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.teamSize && (
                    <p className="text-destructive text-sm">{errors.teamSize}</p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="prelimRounds">Prelim Rounds</Label>
                  <Input
                    id="prelimRounds"
                    type="number"
                    min="1"
                    max="10"
                    value={formData.prelimRounds}
                    onChange={(e) => handleInputChange("prelimRounds", parseInt(e.target.value) || 1)}
                  />
                  {errors.prelimRounds && (
                    <p className="text-destructive text-sm">{errors.prelimRounds}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="eliminationRounds">Elim Rounds</Label>
                  <Input
                    id="eliminationRounds"
                    type="number"
                    min="1"
                    max="10"
                    value={formData.eliminationRounds}
                    onChange={(e) => handleInputChange("eliminationRounds", parseInt(e.target.value) || 1)}
                  />
                  {errors.eliminationRounds && (
                    <p className="text-destructive text-sm">{errors.eliminationRounds}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="judgesPerDebate">Judges</Label>
                  <Input
                    id="judgesPerDebate"
                    type="number"
                    min="1"
                    max="7"
                    value={formData.judgesPerDebate}
                    onChange={(e) => handleInputChange("judgesPerDebate", parseInt(e.target.value) || 1)}
                  />
                  {errors.judgesPerDebate && (
                    <p className="text-destructive text-sm">{errors.judgesPerDebate}</p>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="fee">Entry Fee</Label>
                <div className="flex gap-2">
                  <div>
                  <Input
                    id="fee"
                    type="number"
                    min="0"
                    value={formData.fee}
                    onChange={(e) => handleInputChange("fee", e.target.value)}
                    placeholder="Enter amount"
                    className="flex-1 h-8"
                  />
                  {errors.fee && (
                    <p className="text-destructive text-sm">{errors.fee}</p>
                  )}
                </div>
                  <Select
                    value={formData.feeCurrency}
                    onValueChange={(value) => handleInputChange("feeCurrency", value)}
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
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Schedule & Location</CardTitle>
              <CardDescription>
                When and where the tournament takes place
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Tournament Dates & Times *</Label>
                <DateRangePicker
                  dateRange={formData.dateRange}
                  onDateRangeChange={handleDateRangeChange}
                  placeholder="Select tournament date range"
                  minDate={today}
                  includeTime={true}
                  defaultFromTime="09:00"
                  defaultToTime="17:00"
                  error={errors.dateRange}
                  className="w-full"
                />
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="isVirtual"
                  checked={formData.isVirtual}
                  onCheckedChange={(checked) => handleInputChange("isVirtual", checked)}
                />
                <Label htmlFor="isVirtual" className="text-sm">
                  Virtual tournament
                </Label>
              </div>

              {!formData.isVirtual && (
                <div className="space-y-2">
                  <Label htmlFor="location">Location *</Label>
                  <VolunteerSchoolSelector
                    value={formData.location}
                    onValueChange={(value) => handleInputChange("location", value)}
                    placeholder="Enter tournament location..."
                    className={cn(errors.location && "border-destructive")}
                  />
                  {errors.location && (
                    <p className="text-destructive text-sm">{errors.location}</p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Speaking Times</CardTitle>
                <CardDescription>
                  Time limits for each speaker (minutes)
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-4">
                  {Array.from({ length: formData.teamSize }, (_, i) => i + 1).map((speakerNum) => (
                    <div key={speakerNum} className="space-y-2">
                      <Label htmlFor={`speaker${speakerNum}`} className="text-sm">
                        Speaker {speakerNum}
                      </Label>
                      <Input
                        id={`speaker${speakerNum}`}
                        type="number"
                        min="1"
                        max="15"
                        value={formData.speakingTimes[`speaker${speakerNum}`] || 8}
                        onChange={(e) =>
                          handleSpeakingTimeChange(`speaker${speakerNum}`, parseInt(e.target.value) || 5)
                        }
                      />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Debate Motions</CardTitle>
                <CardDescription>
                  {getMotionsCount()} of {getTotalMotionsNeeded()} motions configured
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Dialog open={showMotionsDialog} onOpenChange={setShowMotionsDialog}>
                  <DialogTrigger asChild>
                    <Button variant="outline" className="w-full">
                      <Edit className="h-4 w-4 mr-2" />
                      Configure Motions
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle>Configure Tournament Motions</DialogTitle>
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
                          placeholder="Paste motions here, one per line:
• Motion for preliminary round 1
• Motion for preliminary round 2
• Motion for preliminary round 3 (impromptu)
• Motion for elimination round 1
..."
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

                      <div className="border-t pt-6">
                        <Label className="text-base font-medium">Individual Motions</Label>
                        <div className="space-y-4 mt-4">
                          <div className="space-y-3">
                            <h4 className="font-medium text-sm text-muted-foreground">Preliminary Rounds</h4>
                            {Array.from({ length: formData.prelimRounds }, (_, i) => i + 1).map((round) => {
                              const key = `preliminary_${round}`
                              const isImpromptu = round === formData.prelimRounds
                              return (
                                <div key={key} className="space-y-2">
                                  <Label htmlFor={key} className="text-sm">
                                    Round {round} {isImpromptu && "(Impromptu)"}
                                  </Label>
                                  <Input
                                    id={key}
                                    value={formData.motions[key]?.motion || ""}
                                    onChange={(e) => handleMotionChange(key, e.target.value)}
                                    placeholder={`Enter motion for preliminary round ${round}...`}
                                    className={cn(errors[`motion_${key}`] && "border-destructive")}
                                  />
                                  {errors[`motion_${key}`] && (
                                    <p className="text-destructive text-xs">{errors[`motion_${key}`]}</p>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                          <div className="space-y-3">
                            <h4 className="font-medium text-sm text-muted-foreground">Elimination Rounds</h4>
                            {Array.from({ length: formData.eliminationRounds }, (_, i) => i + 1).map((round) => {
                              const key = `elimination_${round}`
                              return (
                                <div key={key} className="space-y-2">
                                  <Label htmlFor={key} className="text-sm">
                                    Elimination Round {round}
                                  </Label>
                                  <Input
                                    id={key}
                                    value={formData.motions[key]?.motion || ""}
                                    onChange={(e) => handleMotionChange(key, e.target.value)}
                                    placeholder={`Enter motion for elimination round ${round}...`}
                                    className={cn(errors[`motion_${key}`] && "border-destructive")}
                                  />
                                  {errors[`motion_${key}`] && (
                                    <p className="text-destructive text-xs">{errors[`motion_${key}`]}</p>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        </div>
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
                <div className="mt-4 space-y-2">
                  {Object.entries(formData.motions)
                    .filter(([_, motion]) => motion.motion.trim())
                    .slice(0, 3)
                    .map(([key, motion]) => {
                      const isElimination = key.startsWith('elimination')
                      const roundNum = key.split('_')[1]
                      const roundType = isElimination ? 'Elimination' : 'Preliminary'

                      return (
                        <div key={key} className="text-xs p-2 bg-muted rounded">
                          <span className="font-medium">{roundType} {roundNum}:</span>{" "}
                          <span className="text-muted-foreground">
                            {motion.motion.length > 60
                              ? `${motion.motion.substring(0, 60)}...`
                              : motion.motion}
                          </span>
                        </div>
                      )
                    })}

                  {getMotionsCount() > 3 && (
                    <div className="text-xs text-muted-foreground text-center py-1">
                      +{getMotionsCount() - 3} more motions configured
                    </div>
                  )}

                  {getMotionsCount() === 0 && (
                    <div className="text-xs text-muted-foreground text-center py-4">
                      No motions configured yet
                    </div>
                  )}


                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
      <div className="flex flex-col sm:flex-row gap-3 justify-end ">
        <Button
          variant="outline"
          onClick={handleCancel}
          disabled={loading}
          className="w-full sm:w-auto"
        >
          Cancel
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button disabled={loading} className="w-full sm:w-auto">
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  Save as Draft
                  <ChevronDown className="h-4 w-4 ml-2" />
                </>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => handleSave("draft")}>
              <Save className="h-4 w-4 mr-2" />
              Save as Draft
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleSave("published")}>
              <Eye className="h-4 w-4 mr-2" />
              Save & Publish
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      </Card>
    </div>
  )
}