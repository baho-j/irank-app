"use client"

import React, { useState, useEffect, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Check, ChevronsUpDown, X } from "lucide-react"
import { cn } from "@/lib/utils"

import { Country, State, City } from 'country-state-city'
import { Provinces, Districts, Sectors, Cells, Villages } from 'rwanda'

interface LocationOption {
  value: string
  label: string
}

interface SelectedLocations {
  countries: string[]
  provinces: string[]
  districts: string[]
  sectors: string[]
  cells: string[]
  villages: string[]
}

interface SimpleLocationMultiSelectorProps {
  selectedLocations: SelectedLocations
  onLocationsChange: (locations: SelectedLocations) => void
  includeRwandaDetails?: boolean
  className?: string
  leagueType?: "Local" | "International" | "Dreams Mode"
}

interface MultiSelectFieldProps {
  label: string
  placeholder: string
  options: LocationOption[]
  selected: string[]
  onSelectionChange: (selected: string[]) => void
  disabled?: boolean
  loading?: boolean
}

function MultiSelectField({
                            label,
                            placeholder,
                            options,
                            selected,
                            onSelectionChange,
                            disabled = false,
                            loading = false
                          }: MultiSelectFieldProps) {
  const [open, setOpen] = useState(false)
  const [searchValue, setSearchValue] = useState("")

  const filteredOptions = useMemo(() => {
    if (!searchValue) return options
    return options.filter(option =>
      option.label.toLowerCase().includes(searchValue.toLowerCase())
    )
  }, [options, searchValue])

  const selectedOptions = useMemo(() => {
    return selected
      .map(value => options.find(option => option.value === value))
      .filter(Boolean) as LocationOption[]
  }, [selected, options])

  const handleSelect = (value: string) => {
    if (selected.includes(value)) {
      onSelectionChange(selected.filter(s => s !== value))
    } else {
      onSelectionChange([...selected, value])
    }
  }

  const handleRemove = (value: string) => {
    onSelectionChange(selected.filter(s => s !== value))
  }

  const clearAll = () => {
    onSelectionChange([])
  }

  if (loading) {
    return (
      <div className="space-y-2">
        <Label>{label}</Label>
        <div className="h-10 bg-muted animate-pulse rounded-md" />
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <Label>{label}</Label>

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled || options.length === 0}
            className="w-full justify-between min-h-[40px] h-auto py-2"
          >
            <div className="flex flex-wrap gap-1 flex-1">
              {selectedOptions.length > 0 ? (
                selectedOptions.map((option) => (
                  <Badge
                    key={option.value}
                    variant="secondary"
                    className="text-xs"
                  >
                    {option.label}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-3 w-3 p-0 ml-1 hover:bg-transparent"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleRemove(option.value)
                      }}
                    >
                      <X className="h-2 w-2" />
                    </Button>
                  </Badge>
                ))
              ) : (
                <span className="text-muted-foreground">
                  {disabled ? "Select parent level first" : placeholder}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {selectedOptions.length > 0 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-4 w-4 p-0 text-muted-foreground hover:text-foreground"
                  onClick={(e) => {
                    e.stopPropagation()
                    clearAll()
                  }}
                >
                  <X className="h-3 w-3" />
                </Button>
              )}
              <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
            </div>
          </Button>
        </PopoverTrigger>

        <PopoverContent className="w-full p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput
              placeholder={`Search ${label.toLowerCase()}...`}
              value={searchValue}
              onValueChange={setSearchValue}
            />
            <CommandEmpty>No {label.toLowerCase()} found.</CommandEmpty>
            <CommandList className="max-h-[200px]">
              <CommandGroup>
                {filteredOptions.map((option) => {
                  const isSelected = selected.includes(option.value)
                  return (
                    <CommandItem
                      key={option.value}
                      value={option.value}
                      onSelect={() => handleSelect(option.value)}
                      className="cursor-pointer"
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4",
                          isSelected ? "opacity-100" : "opacity-0"
                        )}
                      />
                      <span className="truncate">{option.label}</span>
                    </CommandItem>
                  )
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {selectedOptions.length > 0 && (
        <div className="text-xs text-muted-foreground">
          {selectedOptions.length} selected
        </div>
      )}
    </div>
  )
}

export function SimpleLocationMultiSelector({
                                              selectedLocations,
                                              onLocationsChange,
                                              includeRwandaDetails = true,
                                              className,
                                              leagueType
                                            }: SimpleLocationMultiSelectorProps) {
  // Every list below the country is a pure function of what is selected above
  // it, so it is derived rather than copied into state by an effect. Only the
  // pruning of now-invalid selections is a real side effect, and that is one
  // effect at the end rather than one per level.
  const countries = useMemo<LocationOption[]>(() => {
    if (leagueType === "Local") {
      const rwanda = Country.getCountryByCode("RW")
      return rwanda ? [{ value: "RW", label: rwanda.name }] : []
    }

    return Country.getAllCountries()
      .map(country => ({ value: country.isoCode, label: country.name }))
      .sort((a, b) => a.label.localeCompare(b.label))
  }, [leagueType])

  const unique = (options: LocationOption[]) =>
    options
      .filter((item, index, self) => index === self.findIndex(t => t.value === item.value))
      .sort((a, b) => a.label.localeCompare(b.label))

  const provinces = useMemo<LocationOption[]>(() => {
    const data: LocationOption[] = []

    for (const countryCode of selectedLocations.countries) {
      if (countryCode === "RW" && includeRwandaDetails) {
        data.push(...Provinces().map(name => ({ value: `${countryCode}-${name}`, label: name })))
      } else {
        data.push(...State.getStatesOfCountry(countryCode).map(state => ({
          value: `${countryCode}-${state.isoCode}`,
          label: state.name,
        })))
      }
    }

    return unique(data)
  }, [selectedLocations.countries, includeRwandaDetails])

  const districts = useMemo<LocationOption[]>(() => {
    const data: LocationOption[] = []

    for (const provinceValue of selectedLocations.provinces) {
      const [countryCode, ...provinceParts] = provinceValue.split('-')
      const province = provinceParts.join('-')

      if (countryCode === "RW" && includeRwandaDetails) {
        data.push(...Districts(province).map(name => ({
          value: `${provinceValue}-${name}`,
          label: name,
        })))
      } else {
        data.push(...City.getCitiesOfState(countryCode, province).map(city => ({
          value: `${provinceValue}-${city.name}`,
          label: city.name,
        })))
      }
    }

    return unique(data)
  }, [selectedLocations.provinces, includeRwandaDetails])

  const sectors = useMemo<LocationOption[]>(() => {
    if (!includeRwandaDetails) return []

    const data: LocationOption[] = []

    for (const districtValue of selectedLocations.districts) {
      const parts = districtValue.split('-')

      if (parts[0] === "RW" && parts.length >= 3) {
        data.push(...Sectors(parts[1], parts[2]).map(name => ({
          value: `${districtValue}-${name}`,
          label: name,
        })))
      }
    }

    return unique(data)
  }, [selectedLocations.districts, includeRwandaDetails])

  const cells = useMemo<LocationOption[]>(() => {
    if (!includeRwandaDetails) return []

    const data: LocationOption[] = []

    for (const sectorValue of selectedLocations.sectors) {
      const parts = sectorValue.split('-')

      if (parts[0] === "RW" && parts.length >= 4) {
        data.push(...Cells(parts[1], parts[2], parts[3]).map(name => ({
          value: `${sectorValue}-${name}`,
          label: name,
        })))
      }
    }

    return unique(data)
  }, [selectedLocations.sectors, includeRwandaDetails])

  const villages = useMemo<LocationOption[]>(() => {
    if (!includeRwandaDetails) return []

    const data: LocationOption[] = []

    for (const cellValue of selectedLocations.cells) {
      const parts = cellValue.split('-')

      if (parts[0] === "RW" && parts.length >= 5) {
        data.push(...Villages(parts[1], parts[2], parts[3], parts[4]).map(name => ({
          value: `${cellValue}-${name}`,
          label: name,
        })))
      }
    }

    return unique(data)
  }, [selectedLocations.cells, includeRwandaDetails])

  // A local league is always Rwanda, so it is selected on the caller's behalf.
  useEffect(() => {
    if (leagueType === "Local" && selectedLocations.countries.length === 0) {
      onLocationsChange({ ...selectedLocations, countries: ["RW"] })
    }
  }, [leagueType, selectedLocations, onLocationsChange])

  // Drops selections that the levels above no longer permit, and clears every
  // level beneath the first one that changed.
  useEffect(() => {
    const levels = [
      { key: "provinces", options: provinces },
      { key: "districts", options: districts },
      { key: "sectors", options: sectors },
      { key: "cells", options: cells },
      { key: "villages", options: villages },
    ] as const

    for (let index = 0; index < levels.length; index += 1) {
      const { key, options } = levels[index]
      const valid = new Set(options.map(option => option.value))
      const selected = selectedLocations[key]
      const kept = selected.filter(value => valid.has(value))

      if (kept.length === selected.length) continue

      const cleared = Object.fromEntries(
        levels.slice(index + 1).map(level => [level.key, [] as string[]])
      )

      onLocationsChange({ ...selectedLocations, [key]: kept, ...cleared })
      return
    }
  }, [provinces, districts, sectors, cells, villages, selectedLocations, onLocationsChange])


  const isRwandaSelected = selectedLocations.countries.includes("RW")

  return (
    <div className={cn("space-y-4", className)}>
      <div className="grid grid-cols-1 gap-4">
        <MultiSelectField
          label="Countries *"
          placeholder="Select countries"
          options={countries}
          selected={selectedLocations.countries}
          onSelectionChange={(countries) => onLocationsChange({
            countries,
            provinces: [],
            districts: [],
            sectors: [],
            cells: [],
            villages: []
          })}
          disabled={leagueType === "Local"}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <MultiSelectField
          label={isRwandaSelected ? "Provinces" : "States/Provinces"}
          placeholder={`Select ${isRwandaSelected ? "provinces" : "states/provinces"}`}
          options={provinces}
          selected={selectedLocations.provinces}
          onSelectionChange={(provinces) => onLocationsChange({
            ...selectedLocations,
            provinces,
            districts: [],
            sectors: [],
            cells: [],
            villages: []
          })}
          disabled={selectedLocations.countries.length === 0}
        />

        <MultiSelectField
          label={isRwandaSelected ? "Districts" : "Cities"}
          placeholder={`Select ${isRwandaSelected ? "districts" : "cities"}`}
          options={districts}
          selected={selectedLocations.districts}
          onSelectionChange={(districts) => onLocationsChange({
            ...selectedLocations,
            districts,
            sectors: [],
            cells: [],
            villages: []
          })}
          disabled={selectedLocations.provinces.length === 0}
        />
      </div>

      {isRwandaSelected && includeRwandaDetails && (
        <>
          <div className="grid grid-cols-2 gap-4">
            <MultiSelectField
              label="Sectors (Optional)"
              placeholder="Select sectors"
              options={sectors}
              selected={selectedLocations.sectors}
              onSelectionChange={(sectors) => onLocationsChange({
                ...selectedLocations,
                sectors,
                cells: [],
                villages: []
              })}
              disabled={selectedLocations.districts.length === 0}
            />

            <MultiSelectField
              label="Cells (Optional)"
              placeholder="Select cells"
              options={cells}
              selected={selectedLocations.cells}
              onSelectionChange={(cells) => onLocationsChange({
                ...selectedLocations,
                cells,
                villages: []
              })}
              disabled={selectedLocations.sectors.length === 0}
            />
          </div>

          <MultiSelectField
            label="Villages (Optional)"
            placeholder="Select villages"
            options={villages}
            selected={selectedLocations.villages}
            onSelectionChange={(villages) => onLocationsChange({
              ...selectedLocations,
              villages
            })}
            disabled={selectedLocations.cells.length === 0}
          />
        </>
      )}
    </div>
  )
}