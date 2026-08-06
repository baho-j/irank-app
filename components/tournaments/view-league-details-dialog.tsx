"use client"

import React, { useState, useEffect, useCallback } from "react"
import { useMutation } from "convex/react"
import { api } from "@/convex/_generated/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
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
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { Edit, Calendar, Info, ChevronDown, ChevronUp, Globe, MapPin, Loader2 } from "lucide-react";
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { Id } from "@/convex/_generated/dataModel"
import { SimpleLocationMultiSelector } from "./league-location-multiselector"

interface League {
  _id: Id<"leagues">
  name: string
  type: "Local" | "International" | "Dreams Mode"
  description?: string
  geographic_scope?: Record<string, {
    provinces?: string[]
    districts?: string[]
    sectors?: string[]
    cells?: string[]
    villages?: string[]
  }>
  logo?: Id<"_storage">
  status: "active" | "inactive" | "banned"
  created_at: number
  _creationTime: number
}

interface SelectedLocations {
  countries: string[]
  provinces: string[]
  districts: string[]
  sectors: string[]
  cells: string[]
  villages: string[]
}

interface ViewLeagueDetailsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  league: League
  token?: string | null
  userRole: "admin" | "school_admin" | "volunteer" | "student"
}

function getTypeColor(type: string) {
  switch (type) {
    case "Local": return "bg-blue-50 text-blue-700 border-blue-200"
    case "International": return "bg-green-50 text-green-700 border-green-200"
    case "Dreams Mode": return "bg-purple-50 text-purple-700 border-purple-200"
    default: return "bg-gray-50 text-gray-700 border-gray-200"
  }
}

function getStatusColor(status: string) {
  switch (status) {
    case "active": return "bg-green-50 text-green-700 border-green-200"
    case "inactive": return "bg-amber-50 text-amber-700 border-amber-200"
    case "banned": return "bg-red-50 text-red-700 border-red-200"
    default: return "bg-gray-50 text-gray-700 border-gray-200"
  }
}

function getStatusIcon(status: string) {
  switch (status) {
    case "active": return "🟢"
    case "inactive": return "🟡"
    case "banned": return "🔴"
    default: return "⚪"
  }
}

function getTypeIcon(type: string) {
  switch (type) {
    case "Local": return "🏠"
    case "International": return "🌍"
    case "Dreams Mode": return "✨"
    default: return "📁"
  }
}

export function ViewLeagueDetailsDialog({
                                          open,
                                          onOpenChange,
                                          league,
                                          token,
                                          userRole
                                        }: ViewLeagueDetailsDialogProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [scopeExpanded, setScopeExpanded] = useState(false)

  const [formData, setFormData] = useState({
    name: league.name,
    type: league.type,
    description: league.description || "",
    status: league.status
  })

  const [geographicScope, setGeographicScope] = useState<Record<string, any>>(
    league.geographic_scope || {}
  )

  const [selectedLocations, setSelectedLocations] = useState<SelectedLocations>({
    countries: [],
    provinces: [],
    districts: [],
    sectors: [],
    cells: [],
    villages: []
  })

  const [errors, setErrors] = useState<Record<string, string>>({})

  const updateLeague = useMutation(api.functions.admin.leagues.updateLeague)

  const isAdmin = userRole === "admin"

  // Loaded when the dialog switches to a different league, not whenever the
  // league record updates: re-seeding on an update would discard edits the
  // user had not yet saved.
  const [loadedLeagueId, setLoadedLeagueId] = useState<string | null>(null)

  if (league._id !== loadedLeagueId) {
    setLoadedLeagueId(league._id)

    setFormData({
      name: league.name,
      type: league.type,
      description: league.description || "",
      status: league.status
    })
    setGeographicScope(league.geographic_scope || {})

    const locations: SelectedLocations = {
      countries: [],
      provinces: [],
      districts: [],
      sectors: [],
      cells: [],
      villages: []
    }

    if (league.geographic_scope) {
      Object.entries(league.geographic_scope).forEach(([countryCode, scope]: [string, any]) => {
        locations.countries.push(countryCode)

        if (scope.provinces) {
          scope.provinces.forEach((province: string) => {
            locations.provinces.push(`${countryCode}-${province}`)
          })
        }

        if (scope.districts) {
          scope.districts.forEach((district: string) => {
            locations.districts.push(`${countryCode}-${district}`)
          })
        }

        if (scope.sectors) {
          scope.sectors.forEach((sector: string) => {
            locations.sectors.push(`${countryCode}-${sector}`)
          })
        }

        if (scope.cells) {
          scope.cells.forEach((cell: string) => {
            locations.cells.push(`${countryCode}-${cell}`)
          })
        }

        if (scope.villages) {
          scope.villages.forEach((village: string) => {
            locations.villages.push(`${countryCode}-${village}`)
          })
        }
      })
    }

    setSelectedLocations(locations)
    setIsEditing(false)
    setErrors({})
  }

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }))
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: "" }))
    }
  }

  const handleTypeChange = (value: string) => {
    handleInputChange("type", value)

    if (value === "Local") {
      setSelectedLocations(prev => ({
        ...prev,
        countries: ["RW"]
      }))
    } else if (value === "Dreams Mode") {
      setSelectedLocations({
        countries: [],
        provinces: [],
        districts: [],
        sectors: [],
        cells: [],
        villages: []
      })
    }
  }

  const formatGeographicScope = useCallback(() => {
    if (formData.type === "Dreams Mode") return undefined;
    if (selectedLocations.countries.length === 0) return undefined;

    const scope: Record<string, any> = {};

    selectedLocations.countries.forEach((countryCode) => {
      const countryScope: any = {};

      const provinces = selectedLocations.provinces
        .filter((p) => p.startsWith(`${countryCode}-`))
        .map((p) => p.split('-').slice(1).join('-'));
      if (provinces.length > 0) countryScope.provinces = provinces;

      const districts = selectedLocations.districts
        .filter((d) => d.startsWith(`${countryCode}-`))
        .map((d) => d.split('-').slice(2).join('-'));
      if (districts.length > 0) countryScope.districts = districts;

      const sectors = selectedLocations.sectors
        .filter((s) => s.startsWith(`${countryCode}-`))
        .map((s) => s.split('-').slice(3).join('-'));
      if (sectors.length > 0) countryScope.sectors = sectors;

      const cells = selectedLocations.cells
        .filter((c) => c.startsWith(`${countryCode}-`))
        .map((c) => c.split('-').slice(4).join('-'));
      if (cells.length > 0) countryScope.cells = cells;

      const villages = selectedLocations.villages
        .filter((v) => v.startsWith(`${countryCode}-`))
        .map((v) => v.split('-').slice(5).join('-'));
      if (villages.length > 0) countryScope.villages = villages;

      if (Object.keys(countryScope).length > 0) {
        scope[countryCode] = countryScope;
      }
    });

    return Object.keys(scope).length > 0 ? scope : undefined;
  }, [selectedLocations, formData.type]);

  const validateForm = () => {
    const newErrors: Record<string, string> = {}

    if (!formData.name.trim()) {
      newErrors.name = "League name is required"
    }

    if (!formData.type) {
      newErrors.type = "League type is required"
    }

    if (formData.type === "International" && selectedLocations.countries.length === 0) {
      newErrors.geographic_scope = "International leagues must have at least one country selected"
    }

    if (formData.type === "Local" && selectedLocations.provinces.length === 0 && selectedLocations.districts.length === 0) {
      newErrors.geographic_scope = "Local leagues must have at least provinces or districts selected"
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSave = async () => {
    if (!validateForm() || !token) return

    setIsLoading(true)
    try {
      await updateLeague({
        admin_token: token,
        league_id: league._id,
        name: formData.name.trim(),
        type: formData.type as any,
        description: formData.description.trim() || undefined,
        geographic_scope: formatGeographicScope(),
        status: formData.status as any,
      })

      toast.success("League updated successfully")
      setIsEditing(false)
      onOpenChange(false)

    } catch (error: any) {
      toast.error((error.message?.split("Uncaught Error:")[1]?.split(".")[0]?.trim()) || "Failed to update league")
    } finally {
      setIsLoading(false)
    }
  }

  const handleCancel = () => {
    setFormData({
      name: league.name,
      type: league.type,
      description: league.description || "",
      status: league.status
    })
    setGeographicScope(league.geographic_scope || {})

    const locations: SelectedLocations = {
      countries: [],
      provinces: [],
      districts: [],
      sectors: [],
      cells: [],
      villages: []
    }

    if (league.geographic_scope) {
      Object.entries(league.geographic_scope).forEach(([countryCode, scope]: [string, any]) => {
        locations.countries.push(countryCode)

        if (scope.provinces) {
          scope.provinces.forEach((province: string) => {
            locations.provinces.push(`${countryCode}-${province}`)
          })
        }

        if (scope.districts) {
          scope.districts.forEach((district: string) => {
            locations.districts.push(`${countryCode}-${district}`)
          })
        }

        if (scope.sectors) {
          scope.sectors.forEach((sector: string) => {
            locations.sectors.push(`${countryCode}-${sector}`)
          })
        }

        if (scope.cells) {
          scope.cells.forEach((cell: string) => {
            locations.cells.push(`${countryCode}-${cell}`)
          })
        }

        if (scope.villages) {
          scope.villages.forEach((village: string) => {
            locations.villages.push(`${countryCode}-${village}`)
          })
        }
      })
    }

    setSelectedLocations(locations)
    setErrors({})
    setIsEditing(false)
  }

  const formatScopeDisplay = (countryCode: string, scope: any) => {
    const parts = [countryCode]
    if (scope.provinces?.length) parts.push(`Provinces: ${scope.provinces.join(", ")}`)
    if (scope.districts?.length) parts.push(`Districts: ${scope.districts.join(", ")}`)
    if (scope.sectors?.length) parts.push(`Sectors: ${scope.sectors.join(", ")}`)
    if (scope.cells?.length) parts.push(`Cells: ${scope.cells.join(", ")}`)
    if (scope.villages?.length) parts.push(`Villages: ${scope.villages.join(", ")}`)
    return parts
  }

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const getScopeCount = () => {
    const countries = Object.keys(geographicScope).length
    const totalRegions = Object.values(geographicScope).reduce((total, scope: any) => {
      return total +
        (scope.provinces?.length || 0) +
        (scope.districts?.length || 0) +
        (scope.sectors?.length || 0) +
        (scope.cells?.length || 0) +
        (scope.villages?.length || 0)
    }, 0)
    return { countries, totalRegions }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-w-[95vw] max-h-[95vh] overflow-y-auto p-0">
        <div className="bg-background border-b px-6 py-4">
          <DialogHeader>
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <DialogTitle className="flex items-center gap-2 text-lg">
                  {isEditing ? (
                    <Input
                      value={formData.name}
                      onChange={(e) => handleInputChange("name", e.target.value)}
                      className={cn("font-semibold max-w-96", errors.name && "border-destructive")}
                      placeholder="League name"
                    />
                  ) : (
                    <>
                      <span className="text-2xl">{getTypeIcon(league.type)}</span>
                      <span className="truncate">{league.name}</span>
                    </>
                  )}
                </DialogTitle>
                {errors.name && (
                  <p className="text-destructive text-sm mt-1">{errors.name}</p>
                )}
                <DialogDescription className="mt-1">
                  League details and configuration
                </DialogDescription>
              </div>
              {isAdmin && !isEditing && (
                <div className="pt-6">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsEditing(true)}
                  className="shrink-0"
                >
                  <Edit className="h-4 w-4 mr-2" />
                  Edit
                </Button>
                </div>
              )}
            </div>
          </DialogHeader>
        </div>

        <div className="px-6 pb-6 space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Globe className="h-4 w-4" />
                  Type & Status
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <Label className="text-xs text-muted-foreground">League Type</Label>
                  {isEditing ? (
                    <Select value={formData.type} onValueChange={handleTypeChange}>
                      <SelectTrigger className={cn("mt-1", errors.type && "border-destructive")}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Local">🏠 Local</SelectItem>
                        <SelectItem value="International">🌍 International</SelectItem>
                        <SelectItem value="Dreams Mode">✨ Dreams Mode</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <div className="mt-1">
                      <Badge variant="outline" className={cn("text-xs", getTypeColor(league.type))}>
                        {getTypeIcon(league.type)} {league.type}
                      </Badge>
                    </div>
                  )}
                  {errors.type && (
                    <p className="text-destructive text-xs mt-1">{errors.type}</p>
                  )}
                </div>

                <div>
                  <Label className="text-xs text-muted-foreground">Status</Label>
                  {isEditing ? (
                    <Select value={formData.status} onValueChange={(value) => handleInputChange("status", value)}>
                      <SelectTrigger className="mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">🟢 Active</SelectItem>
                        <SelectItem value="inactive">🟡 Inactive</SelectItem>
                        <SelectItem value="banned">🔴 Banned</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <div className="mt-1">
                      <Badge variant="outline" className={cn("text-xs", getStatusColor(league.status))}>
                        {getStatusIcon(league.status)} {league.status.charAt(0).toUpperCase() + league.status.slice(1)}
                      </Badge>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  Timeline
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <Label className="text-xs text-muted-foreground">Created</Label>
                  <p className="text-sm font-medium mt-1">
                    {formatDate(league._creationTime)}
                  </p>
                </div>

                {league.created_at !== league._creationTime && (
                  <div>
                    <Label className="text-xs text-muted-foreground">Last Updated</Label>
                    <p className="text-sm font-medium mt-1">
                      {formatDate(league.created_at)}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Info className="h-4 w-4" />
                Description
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isEditing ? (
                <Textarea
                  value={formData.description}
                  onChange={(e) => handleInputChange("description", e.target.value)}
                  placeholder="Enter league description..."
                  rows={3}
                  className="resize-none"
                />
              ) : (
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {league.description || "No description provided"}
                </p>
              )}
            </CardContent>
          </Card>

          {league.type !== "Dreams Mode" && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <MapPin className="h-4 w-4" />
                  Geographic Scope
                  {Object.keys(geographicScope).length > 0 && (
                    <Badge variant="secondary" className="ml-2 text-xs">
                      {getScopeCount().countries} {getScopeCount().countries === 1 ? 'country' : 'countries'}
                    </Badge>
                  )}
                </CardTitle>
                <CardDescription>
                  {league.type === "Local"
                    ? "The local area this league covers"
                    : "The countries and regions this league covers"
                  }
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {isEditing && (
                  <div className="space-y-4 p-4 bg-muted/50 rounded-lg">
                    <div className="space-y-3">
                      <Label className="text-sm font-medium">Geographic Restrictions</Label>
                      <SimpleLocationMultiSelector
                        selectedLocations={selectedLocations}
                        onLocationsChange={setSelectedLocations}
                        includeRwandaDetails={true}
                        leagueType={formData.type}
                      />
                    </div>
                  </div>
                )}

                {Object.keys(geographicScope).length > 0 ? (
                  <div className="space-y-3">
                    {Object.keys(geographicScope).length > 3 ? (
                      <Collapsible open={scopeExpanded} onOpenChange={setScopeExpanded}>
                        <div className="space-y-2">
                          {Object.entries(geographicScope).slice(0, 3).map(([countryCode, scope]) => (
                            <div key={countryCode} className="flex items-start justify-between p-3 bg-muted/30 rounded-lg">
                              <div className="space-y-1 flex-1 min-w-0">
                                <p className="font-medium text-sm">{countryCode}</p>
                                {formatScopeDisplay(countryCode, scope).slice(1).map((part, idx) => (
                                  <p key={idx} className="text-xs text-muted-foreground truncate">{part}</p>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>

                        <CollapsibleTrigger asChild>
                          <Button variant="ghost" size="sm" className="w-full">
                            {scopeExpanded ? (
                              <>
                                <ChevronUp className="h-4 w-4 mr-2" />
                                Show Less ({Object.keys(geographicScope).length - 3} more hidden)
                              </>
                            ) : (
                              <>
                                <ChevronDown className="h-4 w-4 mr-2" />
                                Show All ({Object.keys(geographicScope).length - 3} more)
                              </>
                            )}
                          </Button>
                        </CollapsibleTrigger>

                        <CollapsibleContent className="space-y-2">
                          {Object.entries(geographicScope).slice(3).map(([countryCode, scope]) => (
                            <div key={countryCode} className="flex items-start justify-between p-3 bg-muted/30 rounded-lg">
                              <div className="space-y-1 flex-1 min-w-0">
                                <p className="font-medium text-sm">{countryCode}</p>
                                {formatScopeDisplay(countryCode, scope).slice(1).map((part, idx) => (
                                  <p key={idx} className="text-xs text-muted-foreground truncate">{part}</p>
                                ))}
                              </div>
                            </div>
                          ))}
                        </CollapsibleContent>
                      </Collapsible>
                    ) : (
                      <div className="space-y-2">
                        {Object.entries(geographicScope).map(([countryCode, scope]) => (
                          <div key={countryCode} className="flex items-start justify-between p-3 bg-muted/30 rounded-lg">
                            <div className="space-y-1 flex-1 min-w-0">
                              <p className="font-medium text-sm">{countryCode}</p>
                              {formatScopeDisplay(countryCode, scope).slice(1).map((part, idx) => (
                                <p key={idx} className="text-xs text-muted-foreground truncate">{part}</p>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <MapPin className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">
                      No geographic restrictions defined
                    </p>
                  </div>
                )}

                {errors.geographic_scope && (
                  <p className="text-destructive text-sm">{errors.geographic_scope}</p>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        <div className="bg-background border-t px-6 py-4">
          <DialogFooter>
            {isEditing ? (
              <div className="flex flex-col-reverse sm:flex-row gap-2 w-full sm:justify-end">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleCancel}
                  disabled={isLoading}
                  className="flex-1 sm:flex-none"
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={handleSave}
                  disabled={isLoading}
                  className="flex-1 sm:flex-none"
                >
                  {isLoading ?
                    (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Saving...
                      </>
                    ): (
                      "Save Changes"
                    )}
                </Button>
              </div>
            ) : (
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                className="w-full sm:w-auto"
              >
                Close
              </Button>
            )}
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  )
}