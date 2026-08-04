"use client"

import React, { useState, useMemo, useCallback } from "react"
import { useQuery } from "convex/react"
import { api } from "@/convex/_generated/api"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Progress } from "@/components/ui/progress"
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent
} from "@/components/ui/chart"
import {
  Line,
  LineChart,
  CartesianGrid,
  XAxis,
  YAxis,
} from "recharts"
import DateRangePicker from "@/components/date-range-picker"
import { useAuth } from "@/hooks/use-auth"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import {
  TrendingUp,
  TrendingDown,
  Trophy,
  Download,
  Target,
  Star,
  AlertTriangle,
  ChevronDown,
  Camera,
  FileText,
  FileSpreadsheet,
  Shield,
  Brain,
  Eye,
  Lightbulb,
  BookOpen,
  Gavel,
  Timer,
  MessageSquare,
  ThumbsUp,
  GraduationCap,
} from "lucide-react";
import { downloadExcel } from '@/lib/export/excel'
import html2canvas from 'html2canvas'
import jsPDF from 'jspdf'
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger, DropdownMenuItem } from "@/components/ui/dropdown-menu"

interface DateTimeRange {
  from?: Date
  to?: Date
}

function StatCard({
                    title,
                    value,
                    subtitle,
                    trend,
                    icon: Icon,
                    loading = false,
                    className
                  }: {
  title: string
  value: string | number
  subtitle: string
  trend?: number | null
  icon: React.ElementType
  loading?: boolean
  className?: string
}) {
  if (loading) {
    return (
      <Card className={className}>
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-8 w-16" />
              <Skeleton className="h-3 w-32" />
            </div>
            <Skeleton className="h-12 w-12 rounded-lg" />
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className={className}>
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <div className="flex items-center gap-2">
              <p className="text-2xl font-bold">{value}</p>
              {trend !== undefined && trend !== null && (
                <Badge variant={trend >= 0 ? "default" : "destructive"} className="gap-1">
                  {trend >= 0 ? (
                    <TrendingUp className="h-3 w-3" />
                  ) : (
                    <TrendingDown className="h-3 w-3" />
                  )}
                  {Math.abs(trend).toFixed(1)}%
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          </div>
          <div className="p-3 bg-primary/10 rounded-lg">
            <Icon className="h-6 w-6 text-primary" />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function ChartSkeleton({ height = "h-[300px]" }: { height?: string }) {
  return (
    <div className={cn("w-full", height)}>
      <Skeleton className="h-full w-full" />
    </div>
  )
}

function ChartCard({
                     title,
                     description,
                     children,
                     loading = false,
                     className,
                     chartId,
                     onCopyImage
                   }: {
  title: string
  description?: string
  children: React.ReactNode
  loading?: boolean
  className?: string
  chartId?: string
  onCopyImage?: (chartId: string) => void
}) {
  return (
    <Card className={className}>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-lg">{title}</CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </div>
        {chartId && onCopyImage && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <ChevronDown className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onCopyImage(chartId)}>
                <Camera className="h-4 w-4 mr-2" />
                Copy as Image
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </CardHeader>
      <CardContent id={chartId}>
        {loading ? <ChartSkeleton /> : children}
      </CardContent>
    </Card>
  )
}

function InsightCard({ insight, loading }: { insight?: any; loading: boolean }) {
  if (loading) {
    return (
      <Card>
        <CardContent className="p-4">
          <div className="flex gap-3">
            <Skeleton className="h-10 w-10 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-3 w-16" />
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (!insight) return null

  const getInsightIcon = (type: string) => {
    switch (type) {
      case "achievement":
        return Trophy
      case "improvement":
        return TrendingUp
      case "concern":
        return AlertTriangle
      case "opportunity":
        return Lightbulb
      default:
        return Eye
    }
  }

  const getInsightColor = (type: string) => {
    switch (type) {
      case "achievement":
        return "text-green-600 bg-green-600/10"
      case "improvement":
        return "text-blue-600 bg-blue-600/10"
      case "concern":
        return "text-red-600 bg-red-600/10"
      case "opportunity":
        return "text-orange-600 bg-orange-600/10"
      default:
        return "text-gray-600 bg-gray-600/10"
    }
  }

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "high":
        return "border-red-200 bg-red-50"
      case "medium":
        return "border-orange-200 bg-orange-50"
      case "low":
        return "border-blue-200 bg-blue-50"
      default:
        return "border-gray-200 bg-gray-50"
    }
  }

  const Icon = getInsightIcon(insight.type)
  const colorClass = getInsightColor(insight.type)
  const priorityClass = getPriorityColor(insight.priority)

  return (
    <Card className={cn("border-l-4", priorityClass)}>
      <CardContent className="p-4">
        <div className="flex gap-3">
          <div className={cn("p-2 rounded-full", colorClass)}>
            <Icon className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <h4 className="font-semibold text-sm">{insight.title}</h4>
              <Badge variant="outline" className="text-xs">
                {insight.confidence}% confidence
              </Badge>
              <Badge variant={insight.priority === "high" ? "destructive" : insight.priority === "medium" ? "default" : "secondary"} className="text-xs capitalize">
                {insight.priority}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground mb-3">{insight.description}</p>
            {insight.actionable_suggestions?.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">Recommendations:</p>
                <ul className="text-xs text-muted-foreground space-y-1">
                  {insight.actionable_suggestions.slice(0, 3).map((suggestion: string, index: number) => (
                    <li key={index} className="flex items-start gap-1">
                      <span className="text-primary">•</span>
                      {suggestion}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export default function VolunteerAnalyticsPage() {
  const { token, user } = useAuth()
  const [dateRange, setDateRange] = useState<DateTimeRange | undefined>({
    from: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000),
    to: new Date(),
  })

  const judgingData = useQuery(
    api.functions.volunteers.analytics.getVolunteerJudgingAnalytics,
    token && user?.role === "volunteer" ? {
      token,
      date_range: dateRange ? {
        start: dateRange.from?.getTime() || Date.now() - (365 * 24 * 60 * 60 * 1000),
        end: dateRange.to?.getTime() || Date.now(),
      } : undefined,
      compare_to_previous_period: true,
    } : "skip"
  )

  const judgingTrendsConfig = useMemo(() => ({
    debates_judged: { label: "Debates Judged", color: "hsl(var(--chart-1))" },
    avg_quality_rating: { label: "Quality Rating", color: "hsl(var(--chart-2))" },
    avg_response_time: { label: "Response Time (hrs)", color: "hsl(var(--chart-3))" },
  } as ChartConfig), [])

  const handleCopyChartImage = useCallback(async (chartId: string) => {
    try {
      const element = document.getElementById(chartId)
      if (!element) {
        toast.error("Chart not found")
        return
      }

      const canvas = await html2canvas(element, {
        backgroundColor: 'white',
        scale: 2,
        logging: false,
        useCORS: true,
      })

      canvas.toBlob(async (blob) => {
        if (blob) {
          await navigator.clipboard.write([
            new ClipboardItem({ 'image/png': blob })
          ])
          toast.success("Chart copied to clipboard as image!")
        }
      }, 'image/png')
    } catch (error) {
      console.error('Error copying chart:', error)
      toast.error("Failed to copy chart image")
    }
  }, [])

  const exportToExcel = useCallback(async () => {
    if (!judgingData) {
      toast.error("No data available for export")
      return
    }

    try {
      const timestamp = new Date().toISOString().split('T')[0]

      await downloadExcel([
        {
          name: "Judging Trends",
          rows: judgingData.judging_trends ?? [],
        },
        {
          name: "Tournament Contributions",
          rows: (judgingData.tournament_contributions ?? []).map(tc => ({
            tournament_name: tc.tournament_name,
            role: tc.role,
            debates_judged: tc.debates_judged,
            contribution_score: tc.contribution_score,
            organizer_rating: tc.organizer_rating,
          })),
        },
        {
          name: "Format Expertise",
          rows: judgingData.format_expertise ?? [],
        },
      ], `volunteer-analytics-${timestamp}.xlsx`)

      toast.success("Excel file downloaded successfully!")
    } catch (error) {
      console.error('Error exporting to Excel:', error)
      toast.error("Failed to export Excel file")
    }
  }, [judgingData])

  const exportToPDF = useCallback(async () => {
    if (!judgingData) {
      toast.error("No data available for export")
      return
    }

    try {
      const pdf = new jsPDF('p', 'mm', 'a4')
      const pageWidth = pdf.internal.pageSize.getWidth()
      const pageHeight = pdf.internal.pageSize.getHeight()
      const margin = 20
      let yPosition = margin

      pdf.setFontSize(24)
      pdf.setFont('helvetica', 'bold')
      pdf.text('Volunteer Analytics Report', pageWidth / 2, yPosition, { align: 'center' })

      yPosition += 15
      pdf.setFontSize(12)
      pdf.setFont('helvetica', 'normal')
      const reportPeriod = `${dateRange?.from?.toLocaleDateString()} - ${dateRange?.to?.toLocaleDateString()}`
      pdf.text(`Report Period: ${reportPeriod}`, pageWidth / 2, yPosition, { align: 'center' })

      yPosition += 10
      pdf.text(`Generated: ${new Date().toLocaleString()}`, pageWidth / 2, yPosition, { align: 'center' })
      yPosition += 20

      const chartElements = Array.from(document.querySelectorAll('[id$="-chart"]'))

      for (let i = 0; i < chartElements.length; i++) {
        const element = chartElements[i] as HTMLElement
        if (yPosition > pageHeight - 100) {
          pdf.addPage()
          yPosition = margin
        }

        try {
          const canvas = await html2canvas(element, {
            backgroundColor: 'white',
            scale: 1,
            logging: false,
          })

          const imgData = canvas.toDataURL('image/png')
          const imgWidth = pageWidth - (margin * 2)
          const imgHeight = (canvas.height * imgWidth) / canvas.width

          if (yPosition + imgHeight > pageHeight - margin) {
            pdf.addPage()
            yPosition = margin
          }

          pdf.addImage(imgData, 'PNG', margin, yPosition, imgWidth, imgHeight)
          yPosition += imgHeight + 10
        } catch (error) {
          console.error('Error adding chart to PDF:', error)
        }
      }

      const timestamp = new Date().toISOString().split('T')[0]
      const filename = `volunteer-analytics-${timestamp}.pdf`

      pdf.save(filename)
      toast.success("PDF report downloaded successfully!")
    } catch (error) {
      console.error('Error exporting to PDF:', error)
      toast.error("Failed to export PDF report")
    }
  }, [dateRange])

  const exportToCSV = useCallback(() => {
    if (!judgingData) {
      toast.error("No data available for export")
      return
    }

    try {
      let csvContent = "data:text/csv;charset=utf-8,"

      if (judgingData.judging_trends) {
        csvContent += "Judging Trends\n"
        csvContent += "Period,Debates Judged,Quality Rating,Response Time,Tournaments,Feedback Provided\n"
        judgingData.judging_trends.forEach((trend: any) => {
          csvContent += `${trend.period},${trend.debates_judged},${trend.avg_quality_rating},${trend.avg_response_time},${trend.tournaments_participated},${trend.feedback_provided}\n`
        })
        csvContent += "\n"
      }

      if (judgingData.tournament_contributions) {
        csvContent += "Tournament Contributions\n"
        csvContent += "Tournament,Role,Debates Judged,Contribution Score,Organizer Rating\n"
        judgingData.tournament_contributions.forEach((tc: any) => {
          csvContent += `${tc.tournament_name},${tc.role},${tc.debates_judged},${tc.contribution_score},${tc.organizer_rating}\n`
        })
        csvContent += "\n"
      }

      const encodedUri = encodeURI(csvContent)
      const link = document.createElement("a")
      link.setAttribute("href", encodedUri)
      link.setAttribute("download", `volunteer-analytics-${new Date().toISOString().split('T')[0]}.csv`)
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)

      toast.success("CSV file downloaded successfully!")
    } catch (error) {
      console.error('Error exporting to CSV:', error)
      toast.error("Failed to export CSV file")
    }
  }, [judgingData])

  if (!token || !user || user.role !== "volunteer") {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Shield className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h1 className="text-xl font-semibold mb-2">Access Denied</h1>
          <p className="text-muted-foreground">Only volunteers can access this analytics dashboard.</p>
        </div>
      </div>
    )
  }

  const isLoading = judgingData === undefined

  return (
    <div className="space-y-6">
      <p className="text-muted-foreground">
        Track your judging excellence and community impact as a volunteer
      </p>

      <Card>
        <div className="flex bg-brown rounded-t-md flex-col lg:flex-row lg:items-center lg:justify-between gap-4 p-6">
          <div>
            <DateRangePicker
              dateRange={dateRange}
              onDateRangeChange={setDateRange}
              placeholder="Select date range"
              className="bg-background rounded-md"
            />
          </div>

          <div className="flex items-center gap-3">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="default" size="sm" className="gap-2 hover:bg-background hover:text-black">
                  <Download className="h-4 w-4" />
                  Export
                  <ChevronDown className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="text-xs">
                <DropdownMenuItem onClick={exportToCSV}>
                  <FileText className="h-4 w-4" />
                  Export as CSV
                </DropdownMenuItem>
                <DropdownMenuItem onClick={exportToExcel}>
                  <FileSpreadsheet className="h-4 w-4" />
                  Export as Excel
                </DropdownMenuItem>
                <DropdownMenuItem onClick={exportToPDF}>
                  <FileText className="h-4 w-4" />
                  Export as PDF
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <div className="p-6 space-y-6">
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              title="Debates Judged"
              value={judgingData?.judging_performance?.total_debates_judged || 0}
              subtitle="Total judging assignments"
              icon={Gavel}
              loading={isLoading}
            />
            <StatCard
              title="Quality Rating"
              value={judgingData?.judging_performance?.avg_judging_quality?.toFixed(1) || "0.0"}
              subtitle="Average out of 5.0"
              icon={Star}
              loading={isLoading}
            />
            <StatCard
              title="Consistency Score"
              value={`${judgingData?.judging_performance?.consistency_score?.toFixed(1) || 0}%`}
              subtitle="Scoring consistency"
              icon={Target}
              loading={isLoading}
            />
            <StatCard
              title="Response Time"
              value={`${judgingData?.judging_performance?.response_time_avg?.toFixed(1) || 0}h`}
              subtitle="Average ballot submission"
              icon={Timer}
              loading={isLoading}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <ChartCard
              title="Judging Performance Trends"
              description="Your judging metrics over time"
              loading={isLoading}
              className="lg:col-span-2"
              chartId="judging-trends-chart"
              onCopyImage={handleCopyChartImage}
            >
              {judgingData?.judging_trends && (
                <ChartContainer config={judgingTrendsConfig} className="min-h-[300px] w-full">
                  <LineChart data={judgingData.judging_trends}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="period" />
                    <YAxis />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <ChartLegend content={<ChartLegendContent />} />
                    <Line
                      type="monotone"
                      dataKey="debates_judged"
                      stroke="var(--color-debates_judged)"
                      strokeWidth={3}
                      dot={{ fill: "var(--color-debates_judged)", strokeWidth: 2, r: 4 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="avg_quality_rating"
                      stroke="var(--color-avg_quality_rating)"
                      strokeWidth={2}
                      dot={{ fill: "var(--color-avg_quality_rating)", strokeWidth: 2, r: 3 }}
                    />
                  </LineChart>
                </ChartContainer>
              )}
            </ChartCard>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Experience Level</CardTitle>
                <CardDescription>Your judging expertise classification</CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="space-y-4">
                    <Skeleton className="h-8 w-32" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-3/4" />
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="text-center">
                      <div className="text-3xl font-bold text-primary capitalize">
                        {judgingData?.judging_performance?.experience_level || "Novice"}
                      </div>
                      <p className="text-sm text-muted-foreground">Current Level</p>
                    </div>

                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Tournaments</span>
                        <span className="font-semibold">
                          {judgingData?.judging_performance?.total_tournaments || 0}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Feedback Quality</span>
                        <span className="font-semibold">
                          {judgingData?.judging_performance?.feedback_quality_score?.toFixed(0) || 0}%
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Bias Incidents</span>
                        <span className="font-semibold">
                          {judgingData?.judging_performance?.bias_detection_incidents || 0}
                        </span>
                      </div>
                    </div>

                    <div className="pt-2 border-t">
                      <div className="flex items-center gap-2">
                        <GraduationCap className="h-4 w-4 text-blue-600" />
                        <span className="text-sm font-medium">
                          Quality Percentile: {judgingData?.comparative_analysis?.quality_percentile || 0}%
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Tournament Contributions</CardTitle>
                <CardDescription>Your impact across tournaments</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {isLoading ? (
                    Array.from({ length: 3 }).map((_, i) => (
                      <div key={i} className="flex items-center gap-4 p-3 border rounded">
                        <Skeleton className="h-4 w-32" />
                        <Skeleton className="h-4 w-24" />
                        <Skeleton className="h-4 w-16" />
                      </div>
                    ))
                  ) : judgingData?.tournament_contributions?.length ? (
                    judgingData.tournament_contributions.slice(0, 5).map((tournament) => (
                      <div key={tournament.tournament_id} className="flex items-center justify-between p-3 border rounded hover:bg-muted/50">
                        <div className="flex-1">
                          <h4 className="font-semibold text-sm">{tournament.tournament_name}</h4>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Badge variant="secondary" className="capitalize text-xs">
                              {tournament.role.replace('_', ' ')}
                            </Badge>
                            <span>{tournament.debates_judged} debates</span>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-semibold">
                            {tournament.contribution_score}/100
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Rating: {tournament.organizer_rating}/5
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-6 text-muted-foreground">
                      <Trophy className="h-8 w-8 mx-auto mb-2" />
                      <p>No tournament contributions yet</p>
                      <p className="text-xs">Start judging to see your impact</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Format Expertise</CardTitle>
                <CardDescription>Your specialization across debate formats</CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="space-y-3">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-4 w-1/2" />
                  </div>
                ) : judgingData?.format_expertise?.length ? (
                  <div className="space-y-4">
                    {judgingData.format_expertise.slice(0, 4).map((format, index) => (
                      <div key={index} className="space-y-2">
                        <div className="flex justify-between items-center">
                          <h4 className="font-semibold text-sm">{format.format}</h4>
                          <Badge variant="outline" className="text-xs">
                            {format.debates_judged} debates
                          </Badge>
                        </div>
                        <div className="space-y-1">
                          <div className="flex justify-between text-xs">
                            <span className="text-muted-foreground">Proficiency</span>
                            <span>{format.proficiency_level}%</span>
                          </div>
                          <Progress value={format.proficiency_level} className="h-2" />
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">Specialization Score</span>
                          <span className="font-medium">{format.specialization_score}/100</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-6 text-muted-foreground">
                    <BookOpen className="h-8 w-8 mx-auto mb-2" />
                    <p>No format expertise yet</p>
                    <p className="text-xs">Judge different formats to build expertise</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Feedback Analysis</CardTitle>
              <CardDescription>Your feedback giving and receiving patterns</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-3">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-3 w-full" />
                    <Skeleton className="h-3 w-3/4" />
                  </div>
                  <div className="space-y-3">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-3 w-full" />
                    <Skeleton className="h-3 w-3/4" />
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <h4 className="font-semibold text-sm text-green-600 mb-3 flex items-center gap-2">
                      <MessageSquare className="h-4 w-4" />
                      Feedback Quality Metrics
                    </h4>
                    {judgingData?.feedback_analysis?.feedback_received?.length > 0 ? (
                      <div className="space-y-3">
                        {judgingData.feedback_analysis.feedback_received.map((category, index) => (
                          <div key={index} className="flex justify-between items-center">
                            <span className="text-sm capitalize">{category.rating_category}</span>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium">
                                {category.avg_score}/5
                              </span>
                              {category.improvement_trend !== 0 && (
                                <Badge variant={category.improvement_trend > 0 ? "default" : "secondary"} className="text-xs">
                                  {category.improvement_trend > 0 ? "+" : ""}{category.improvement_trend.toFixed(1)}%
                                </Badge>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">No feedback received yet</p>
                    )}
                  </div>

                  <div>
                    <h4 className="font-semibold text-sm text-blue-600 mb-3 flex items-center gap-2">
                      <ThumbsUp className="h-4 w-4" />
                      Common Feedback Themes
                    </h4>
                    {judgingData?.feedback_analysis?.common_feedback_themes?.length > 0 ? (
                      <div className="space-y-2">
                        {judgingData.feedback_analysis.common_feedback_themes.slice(0, 6).map((theme, index) => (
                          <div key={index} className="flex justify-between items-center">
                            <span className="text-sm capitalize">{theme.theme}</span>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-muted-foreground">
                                {theme.frequency}x
                              </span>
                              <Badge
                                variant={theme.sentiment === "positive" ? "default" : theme.sentiment === "negative" ? "destructive" : "secondary"}
                                className="text-xs"
                              >
                                {theme.sentiment}
                              </Badge>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">No feedback themes identified</p>
                    )}
                  </div>
                </div>
              )}

              
              {judgingData?.feedback_analysis?.feedback_given && (
                <div className="mt-6 border-t pt-6">
                  <h4 className="font-semibold text-sm text-purple-600 mb-3 flex items-center gap-2">
                    <MessageSquare className="h-4 w-4" />
                    Feedback Given to Students
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {judgingData.feedback_analysis.feedback_given.slice(0, 6).map((tournament, index) => (
                      <div key={index} className="p-3 border rounded-lg">
                        <h5 className="font-medium text-sm mb-2">{tournament.tournament_name}</h5>
                        <div className="space-y-1 text-xs">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Debates:</span>
                            <span>{tournament.debate_count}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Avg Length:</span>
                            <span>{tournament.avg_feedback_length} chars</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Constructive:</span>
                            <span>{tournament.constructive_rating}%</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Helpfulness:</span>
                            <span>{tournament.helpfulness_score}/100</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Performance Comparison</CardTitle>
                <CardDescription>How you rank among other volunteers</CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="space-y-4">
                    <Skeleton className="h-8 w-24" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-3/4" />
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4 text-center">
                      <div>
                        <div className="text-2xl font-bold text-primary">
                          #{judgingData?.comparative_analysis?.peer_ranking || "N/A"}
                        </div>
                        <p className="text-xs text-muted-foreground">Overall Rank</p>
                      </div>
                      <div>
                        <div className="text-2xl font-bold text-primary">
                          {judgingData?.comparative_analysis?.experience_percentile || 0}%
                        </div>
                        <p className="text-xs text-muted-foreground">Experience Percentile</p>
                      </div>
                    </div>

                    {judgingData?.comparative_analysis?.peer_comparison && (
                      <div className="space-y-3">
                        <h4 className="font-semibold text-sm mb-2">Peer Comparison</h4>
                        {judgingData.comparative_analysis.peer_comparison.map((metric, index) => (
                          <div key={index} className="flex justify-between items-center p-2 border rounded">
                            <span className="text-sm">{metric.metric}</span>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium">{metric.your_value}</span>
                              <span className="text-xs text-muted-foreground">vs {metric.peer_average}</span>
                              <Badge variant="outline" className="text-xs">
                                {metric.percentile}%
                              </Badge>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">AI Insights & Recommendations</CardTitle>
                <CardDescription>Personalized suggestions for improvement</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {isLoading ? (
                    Array.from({ length: 2 }).map((_, i) => (
                      <InsightCard key={i} loading={true} />
                    ))
                  ) : (
                    judgingData?.insights?.slice(0, 3)?.map((insight, index) => (
                      <InsightCard key={index} insight={insight} loading={false} />
                    )) || (
                      <div className="text-center py-6 text-muted-foreground">
                        <Brain className="h-8 w-8 mx-auto mb-2" />
                        <p>No insights available yet</p>
                        <p className="text-xs">Complete more judging assignments to get insights</p>
                      </div>
                    )
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          
          {judgingData?.comparative_analysis?.improvement_areas && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Improvement Areas</CardTitle>
                <CardDescription>Specific areas to focus on for growth</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {judgingData.comparative_analysis.improvement_areas.map((area, index) => (
                    <div key={index} className="p-4 border rounded-lg">
                      <h4 className="font-semibold text-sm mb-2">{area.area}</h4>
                      <div className="space-y-2">
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">Current</span>
                          <span>{area.current_score}/100</span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">Target</span>
                          <span>{area.target_score}/100</span>
                        </div>
                        <Progress value={area.current_score} className="h-2" />
                      </div>
                      {area.improvement_suggestions.length > 0 && (
                        <div className="mt-3">
                          <p className="text-xs font-medium mb-1">Suggestions:</p>
                          <ul className="text-xs text-muted-foreground space-y-1">
                            {area.improvement_suggestions.slice(0, 2).map((suggestion, suggestionIndex) => (
                              <li key={suggestionIndex} className="flex items-start gap-1">
                                <span className="text-primary">•</span>
                                {suggestion}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </Card>
    </div>
  )
}