"use client"

import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import { Calendar } from "@/components/ui/calendar"
import { format } from "date-fns"
import { CalendarIcon, Clock } from "lucide-react"
import * as React from "react"
import { type DateRange } from "react-day-picker"

interface DateTimeRange {
  from?: Date
  to?: Date
  fromTime?: string
  toTime?: string
}

interface DateRangePickerProps {
  className?: string
  dateRange?: DateRange | DateTimeRange
  onDateRangeChange?: (range: DateRange | DateTimeRange | undefined) => void
  disabled?: boolean
  placeholder?: string
  maxDate?: Date
  minDate?: Date
  error?: string
  showYearSwitcher?: boolean
  numberOfMonths?: number
  includeTime?: boolean
  timeFormat?: "12" | "24"
  defaultFromTime?: string
  defaultToTime?: string
}

export default function DateRangePicker({
                                          className,
                                          dateRange,
                                          onDateRangeChange,
                                          disabled,
                                          placeholder = "Pick a date range",
                                          maxDate,
                                          minDate,
                                          error,
                                          showYearSwitcher = true,
                                          numberOfMonths = 2,
                                          includeTime = false,
                                          timeFormat = "24",
                                          defaultFromTime = "09:00",
                                          defaultToTime = "17:00"
                                        }: DateRangePickerProps) {
  const [date, setDate] = React.useState<DateRange | undefined>(
    dateRange ? {
      from: dateRange.from,
      to: dateRange.to
    } : undefined
  )

  const [fromTime, setFromTime] = React.useState<string>(
    (dateRange as DateTimeRange)?.fromTime || defaultFromTime
  )

  const [toTime, setToTime] = React.useState<string>(
    (dateRange as DateTimeRange)?.toTime || defaultToTime
  )

  // Re-seeded when the caller supplies a different range, not on every render
  // of the same one, so a half-finished selection is not overwritten.
  const rangeKey = dateRange
    ? `${dateRange.from?.getTime() ?? ""}-${dateRange.to?.getTime() ?? ""}`
    : ""
  const [seededFor, setSeededFor] = React.useState(rangeKey)

  if (dateRange && rangeKey !== seededFor) {
    setSeededFor(rangeKey)
    setDate({ from: dateRange.from, to: dateRange.to })

    if (includeTime && 'fromTime' in dateRange) {
      setFromTime(dateRange.fromTime || defaultFromTime)
      setToTime(dateRange.toTime || defaultToTime)
    }
  }

  const handleDateChange = (newDate: DateRange | undefined) => {
    setDate(newDate)

    if (includeTime) {
      const dateTimeRange: DateTimeRange = {
        from: newDate?.from,
        to: newDate?.to,
        fromTime,
        toTime
      }
      onDateRangeChange?.(dateTimeRange)
    } else {
      onDateRangeChange?.(newDate)
    }
  }

  const handleTimeChange = (type: 'from' | 'to', time: string) => {
    if (type === 'from') {
      setFromTime(time)
    } else {
      setToTime(time)
    }

    if (includeTime && date) {
      const dateTimeRange: DateTimeRange = {
        from: date.from,
        to: date.to,
        fromTime: type === 'from' ? time : fromTime,
        toTime: type === 'to' ? time : toTime
      }
      onDateRangeChange?.(dateTimeRange)
    }
  }

  const formatDisplayDate = (date: Date, time?: string) => {
    const dateStr = format(date, "LLL dd, y")
    if (includeTime && time) {
      return `${dateStr} at ${time}`
    }
    return dateStr
  }

  const getDisplayText = () => {
    if (!date?.from) return placeholder

    if (date.to) {
      return (
        <>
          {formatDisplayDate(date.from, includeTime ? fromTime : undefined)} -{" "}
          {formatDisplayDate(date.to, includeTime ? toTime : undefined)}
        </>
      )
    }

    return formatDisplayDate(date.from, includeTime ? fromTime : undefined)
  }

  return (
    <div className={cn("grid gap-2", className)}>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            id="date"
            variant="outline"
            disabled={disabled}
            className={cn(
              "w-full justify-start text-left font-normal min-w-48",
              !date && "text-muted-foreground",
              error && "border-destructive"
            )}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            <span className="truncate">{getDisplayText()}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <div className="space-y-4 p-4">
            <Calendar
              autoFocus
              mode="range"
              defaultMonth={date?.from}
              selected={date}
              onSelect={handleDateChange}
              numberOfMonths={numberOfMonths}
              showYearSwitcher={showYearSwitcher}
              disabled={(date) => {
                const isAfterMax = maxDate ? date > maxDate : false
                const isBeforeMin = minDate ? date < minDate : date < new Date("1900-01-01")
                return isAfterMax || isBeforeMin
              }}
            />

            {includeTime && date?.from && (
              <div className="border-t pt-4 space-y-3">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Clock className="h-4 w-4" />
                  Time Settings
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="from-time" className="text-xs">
                      Start Time
                    </Label>
                    <Input
                      id="from-time"
                      type="time"
                      value={fromTime}
                      onChange={(e) => handleTimeChange('from', e.target.value)}
                      className="text-sm"
                    />
                  </div>

                  {date.to && (
                    <div className="space-y-2">
                      <Label htmlFor="to-time" className="text-xs">
                        End Time
                      </Label>
                      <Input
                        id="to-time"
                        type="time"
                        value={toTime}
                        onChange={(e) => handleTimeChange('to', e.target.value)}
                        className="text-sm"
                      />
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </PopoverContent>
      </Popover>
      {error && (
        <p className="text-destructive text-xs mt-1">{error}</p>
      )}
    </div>
  )
}