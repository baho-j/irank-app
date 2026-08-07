"use client"

import React, { useState, useCallback, useEffect } from "react"
import { useMutation } from "convex/react"
import { api } from "@/convex/_generated/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
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
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { SimpleLocationMultiSelector } from "./league-location-multiselector"
import { Loader2 } from "lucide-react";

interface SelectedLocations {
  countries: string[]
  provinces: string[]
  districts: string[]
  sectors: string[]
  cells: string[]
  villages: string[]
}

interface AddLeagueDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  token?: string | null
}

const initialFormData = {
  name: "",
  type: "Local" as "Local" | "International" | "Dreams Mode",
  description: "",
  status: "active" as "active" | "inactive"
}

const initialSelectedLocations: SelectedLocations = {
  countries: [],
  provinces: [],
  districts: [],
  sectors: [],
  cells: [],
  villages: []
}

export function AddLeagueDialog({ open, onOpenChange, token }: AddLeagueDialogProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [formData, setFormData] = useState(initialFormData)
  const [selectedLocations, setSelectedLocations] = useState<SelectedLocations>(initialSelectedLocations)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const createLeague = useMutation(api.functions.admin.leagues.createLeague)

  const handleInputChange = useCallback((field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }))
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: "" }))
    }
  }, [errors])

  const handleLeagueTypeChange = useCallback((value: string) => {
    const newType = value as "Local" | "International" | "Dreams Mode"
    setFormData(prev => ({ ...prev, type: newType }))

    if (newType === "Dreams Mode") {
      setSelectedLocations(initialSelectedLocations)
    } else if (newType === "Local") {
      setSelectedLocations({
        countries: ["RW"],
        provinces: [],
        districts: [],
        sectors: [],
        cells: [],
        villages: []
      })
    } else {
      setSelectedLocations(initialSelectedLocations)
    }

    if (errors.type) {
      setErrors(prev => ({ ...prev, type: "" }))
    }
  }, [errors])

  const validateForm = useCallback(() => {
    const newErrors: Record<string, string> = {}

    if (!formData.name.trim()) {
      newErrors.name = "League name is required"
    }

    if (formData.name.trim().length > 70) {
      newErrors.name = "League name cannot exceed 70 characters"
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
  }, [formData, selectedLocations])

  const resetForm = useCallback(() => {
    setFormData(initialFormData)
    setSelectedLocations(initialSelectedLocations)
    setErrors({})
  }, [])

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

  const handleSubmit = useCallback(async () => {
    if (!validateForm() || !token) return

    setIsLoading(true)
    try {
      await createLeague({
        admin_token: token,
        name: formData.name.trim(),
        type: formData.type as any,
        description: formData.description.trim() || undefined,
        geographic_scope: formatGeographicScope(),
        status: formData.status,
      })

      toast.success("League created successfully")
      onOpenChange(false)
      resetForm()
    } catch (error: any) {
      toast.error(error.message?.split("Uncaught Error:")[1]?.split(/\.|Called by client/)[0]?.trim() || "Failed to create league")
    } finally {
      setIsLoading(false)
    }
  }, [validateForm, token, createLeague, formData, formatGeographicScope, onOpenChange, resetForm])

  // A local league is always Rwanda, applied when the type is chosen.
  const [typedFor, setTypedFor] = useState(formData.type)

  if (formData.type !== typedFor) {
    setTypedFor(formData.type)

    if (formData.type === "Local" && selectedLocations.countries.length === 0) {
      setSelectedLocations(prev => ({ ...prev, countries: ["RW"] }))
    }
  }

  const showGeographicScope = formData.type === "Local" || formData.type === "International"

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[95vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create New League</DialogTitle>
          <DialogDescription>
            Create a new league to organize tournaments and competitions.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">League Name *</Label>
              <Input
                id="name"
                placeholder="Enter league name"
                value={formData.name}
                onChange={(e) => handleInputChange("name", e.target.value)}
                className={cn(errors.name && "border-destructive")}
              />
              {errors.name && (
                <p className="text-destructive text-sm">{errors.name}</p>
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <div className="space-y-2">
                <Label htmlFor="type">League Type *</Label>
                <Select value={formData.type} onValueChange={handleLeagueTypeChange}>
                  <SelectTrigger className={cn(errors.type && "border-destructive")}>
                    <SelectValue placeholder="Select league type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Local">Local</SelectItem>
                    <SelectItem value="International">International</SelectItem>
                    <SelectItem value="Dreams Mode">Dreams Mode</SelectItem>
                  </SelectContent>
                </Select>
                {errors.type && (
                  <p className="text-destructive text-sm">{errors.type}</p>
                )}
                <p className="text-xs text-muted-foreground">
                  {formData.type === "Local" && "Local leagues are restricted to Rwanda only"}
                  {formData.type === "International" && "International leagues can span multiple countries"}
                  {formData.type === "Dreams Mode" && "Dreams Mode leagues have no geographic restrictions"}
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="status">Status</Label>
                <Select value={formData.status} onValueChange={(value) => handleInputChange("status", value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>


            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                placeholder="Enter league description"
                value={formData.description}
                onChange={(e) => handleInputChange("description", e.target.value)}
                rows={3}
              />
            </div>


          </div>

          {showGeographicScope && (
            <div className="space-y-4">
              <div>
                <Label className="text-base font-medium">Geographic Scope</Label>
                <p className="text-sm text-muted-foreground">
                  {formData.type === "Local"
                    ? "Define the local area within Rwanda this league covers"
                    : "Define the countries and regions this league covers"
                  }
                </p>
              </div>

              <SimpleLocationMultiSelector
                selectedLocations={selectedLocations}
                onLocationsChange={setSelectedLocations}
                includeRwandaDetails={true}
                leagueType={formData.type}
              />

              {errors.geographic_scope && (
                <p className="text-destructive text-sm">{errors.geographic_scope}</p>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating...
              </>
            ) : (
              "Create League"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}