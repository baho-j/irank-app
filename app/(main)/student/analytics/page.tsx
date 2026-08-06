"use client"

import React, { useState, useMemo, useCallback } from "react"
import { useQuery } from "convex/react"
import { api } from "@/convex/_generated/api"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent
} from "@/components/ui/chart"
import {
  Bar,
  BarChart,
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
  Users,
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
  Zap,
  Brain,
  Eye,
  Lightbulb,
  Crown,
  Medal,
  UserCheck,
  School,
  Heart,
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

const insightIcon = (type: string, className: string) => {
  switch (type) {
    case "achievement":
      return <Trophy className={className} />
    case "improvement":
      return <TrendingUp className={className} />
    case "concern":
      return <AlertTriangle className={className} />
    case "opportunity":
      return <Lightbulb className={className} />
    default:
      return <Eye className={className} />
  }
}

const insightColor = (type: string) => {
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

  const icon = insightIcon(insight.type, "h-5 w-5")
  const colorClass = insightColor(insight.type)
  const priorityClass = getPriorityColor(insight.priority)

  return (
    <Card className={cn("border-l-4", priorityClass)}>
      <CardContent className="p-4">
        <div className="flex gap-3">
          <div className={cn("p-2 rounded-full", colorClass)}>
            {icon}
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

function PartnerCard({ partner, loading }: { partner?: any; loading: boolean }) {
  if (loading) {
    return (
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <Skeleton className="h-10 w-10 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-3 w-16" />
            </div>
            <Skeleton className="h-6 w-12" />
          </div>
        </CardContent>
      </Card>
    )
  }

  if (!partner) return null

  const getChemistryColor = (score: number) => {
    if (score >= 80) return "text-green-600 bg-green-600/10"
    if (score >= 60) return "text-blue-600 bg-blue-600/10"
    if (score >= 40) return "text-orange-600 bg-orange-600/10"
    return "text-red-600 bg-red-600/10"
  }

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <Avatar>
            <AvatarFallback>
              {partner.partner_name.split(' ').map((n: string) => n[0]).join('').toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h4 className="font-semibold text-sm truncate">{partner.partner_name}</h4>
              <Badge variant="outline" className={cn("gap-1", getChemistryColor(partner.chemistry_score))}>
                <Heart className="h-3 w-3" />
                {partner.chemistry_score}%
              </Badge>
            </div>
            <div className="flex items-center gap-4 mt-1">
              <span className="text-xs text-muted-foreground">
                Tournaments: {partner.tournaments_together}
              </span>
              <span className="text-xs text-muted-foreground">
                Win Rate: {partner.win_rate_together}%
              </span>
            </div>
            {partner.best_performance && (
              <div className="mt-2">
                <p className="text-xs font-medium">
                  Best Together: #{partner.best_performance.team_rank} in {partner.best_performance.tournament_name}
                </p>
                <p className="text-xs text-muted-foreground">
                  Combined Points: {partner.best_performance.combined_speaker_points}
                </p>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export default function StudentAnalyticsPage() {
  const { token, user } = useAuth()
  const [dateRange, setDateRange] = useState<DateTimeRange | undefined>(() => ({
    from: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000),
    to: new Date(),
  }))

  // Resolved once per change of range: computing it inline made a new
  // object each render, which resubscribed every analytics query.
  const dateWindow = useMemo(() => {
    const start = dateRange?.from?.getTime()
    const end = dateRange?.to?.getTime()

    // Both ends come from the picker, which always supplies a full range.
    return start !== undefined && end !== undefined ? { start, end } : undefined
  }, [dateRange])

  const performanceData = useQuery(
    api.functions.student.analytics.getStudentPerformanceAnalytics,
    token && user?.role === "student" ? {
      token,
      date_range: dateWindow,
      compare_to_previous_period: true,
    } : "skip"
  )

  const performanceTrendsConfig = useMemo(() => ({
    speaker_rank: { label: "Speaker Rank", color: "hsl(var(--chart-1))" },
    team_rank: { label: "Team Rank", color: "hsl(var(--chart-2))" },
    avg_score: { label: "Avg Score", color: "hsl(var(--chart-3))" },
  } as ChartConfig), [])

  const regionalPerformance = performanceData?.tournament_analysis?.regional_performance ?? [];
  const bestFormats = performanceData?.tournament_analysis?.best_formats ?? [];


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
    if (!performanceData) {
      toast.error("No data available for export")
      return
    }

    try {
      const timestamp = new Date().toISOString().split('T')[0]

      await downloadExcel([
        {
          name: "Performance Trends",
          rows: (performanceData.performance_trends ?? []).map(trend => ({
            tournament_name: trend.tournament_name,
            date: new Date(trend.date).toLocaleDateString(),
            speaker_rank: trend.speaker_rank,
            speaker_points: trend.speaker_points,
            team_rank: trend.team_rank,
            avg_score: trend.avg_score,
          })),
        },
        {
          name: "Partner Analysis",
          rows: (performanceData.partner_analysis ?? []).map(partner => ({
            partner_name: partner.partner_name,
            tournaments_together: partner.tournaments_together,
            win_rate_together: partner.win_rate_together,
            chemistry_score: partner.chemistry_score,
          })),
        },
        {
          name: "Tournament Analysis",
          rows: performanceData.tournament_analysis?.best_formats ?? [],
        },
      ], `student-analytics-${timestamp}.xlsx`)

      toast.success("Excel file downloaded successfully!")
    } catch (error) {
      console.error('Error exporting to Excel:', error)
      toast.error("Failed to export Excel file")
    }
  }, [performanceData])

  const exportToPDF = useCallback(async () => {
    if (!performanceData) {
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
      pdf.text('Student Analytics Report', pageWidth / 2, yPosition, { align: 'center' })

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
      const filename = `student-analytics-${timestamp}.pdf`

      pdf.save(filename)
      toast.success("PDF report downloaded successfully!")
    } catch (error) {
      console.error('Error exporting to PDF:', error)
      toast.error("Failed to export PDF report")
    }
  }, [dateRange])

  const exportToCSV = useCallback(() => {
    if (!performanceData) {
      toast.error("No data available for export")
      return
    }

    try {
      let csvContent = "data:text/csv;charset=utf-8,"

      if (performanceData.performance_trends) {
        csvContent += "Performance Trends\n"
        csvContent += "Tournament,Date,Speaker Rank,Speaker Points,Team Rank,Avg Score\n"
        performanceData.performance_trends.forEach((trend: any) => {
          csvContent += `${trend.tournament_name},${new Date(trend.date).toLocaleDateString()},${trend.speaker_rank},${trend.speaker_points},${trend.team_rank},${trend.avg_score}\n`
        })
        csvContent += "\n"
      }

      if (performanceData.partner_analysis) {
        csvContent += "Partner Analysis\n"
        csvContent += "Partner,Tournaments Together,Win Rate,Chemistry Score\n"
        performanceData.partner_analysis.forEach((partner: any) => {
          csvContent += `${partner.partner_name},${partner.tournaments_together},${partner.win_rate_together},${partner.chemistry_score}\n`
        })
        csvContent += "\n"
      }

      const encodedUri = encodeURI(csvContent)
      const link = document.createElement("a")
      link.setAttribute("href", encodedUri)
      link.setAttribute("download", `student-analytics-${new Date().toISOString().split('T')[0]}.csv`)
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)

      toast.success("CSV file downloaded successfully!")
    } catch (error) {
      console.error('Error exporting to CSV:', error)
      toast.error("Failed to export CSV file")
    }
  }, [performanceData])

  if (!token || !user || user.role !== "student") {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Shield className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h1 className="text-xl font-semibold mb-2">Access Denied</h1>
          <p className="text-muted-foreground">Only students can access this analytics dashboard.</p>
        </div>
      </div>
    )
  }

  const isLoading = performanceData === undefined

  return (
    <div className="space-y-6">
      <p className="text-muted-foreground">
        Track your debate journey with personalized insights and performance analytics
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

        <div className="p-3 sm:p-6 space-y-6">
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              title="Current Rank"
              value={performanceData?.personal_performance?.current_rank ? `#${performanceData.personal_performance.current_rank}` : "N/A"}
              subtitle="Latest tournament ranking"
              icon={Trophy}
              loading={isLoading}
            />
            <StatCard
              title="Best Rank"
              value={performanceData?.personal_performance?.best_rank ? `#${performanceData.personal_performance.best_rank}` : "N/A"}
              subtitle="Personal best achievement"
              icon={Crown}
              loading={isLoading}
            />
            <StatCard
              title="Avg Speaker Score"
              value={performanceData?.personal_performance?.avg_speaker_score?.toFixed(1) || "0.0"}
              subtitle="Average across tournaments"
              icon={Star}
              loading={isLoading}
            />
            <StatCard
              title="Win Rate"
              value={`${performanceData?.personal_performance?.win_rate?.toFixed(1) || 0}%`}
              subtitle="Tournament win percentage"
              icon={Target}
              loading={isLoading}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <ChartCard
              title="Performance Trends"
              description="Your ranking progression over time"
              loading={isLoading}
              className="lg:col-span-2"
              chartId="performance-trends-chart"
              onCopyImage={handleCopyChartImage}
            >
              {performanceData?.performance_trends && (
                <ChartContainer config={performanceTrendsConfig} className="min-h-[300px] w-full">
                  <LineChart data={performanceData.performance_trends.slice().reverse()}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="tournament_name"
                      angle={-45}
                      textAnchor="end"
                      height={100}
                      fontSize={12}
                    />
                    <YAxis reversed />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <ChartLegend content={<ChartLegendContent />} />
                    <Line
                      type="monotone"
                      dataKey="speaker_rank"
                      stroke="var(--color-speaker_rank)"
                      strokeWidth={3}
                      dot={{ fill: "var(--color-speaker_rank)", strokeWidth: 2, r: 4 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="team_rank"
                      stroke="var(--color-team_rank)"
                      strokeWidth={2}
                      dot={{ fill: "var(--color-team_rank)", strokeWidth: 2, r: 3 }}
                    />
                  </LineChart>
                </ChartContainer>
              )}
            </ChartCard>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Performance Summary</CardTitle>
                <CardDescription>Your debate statistics</CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="space-y-4">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-4 w-1/2" />
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Total Tournaments</span>
                      <span className="font-semibold">
                        {performanceData?.personal_performance?.total_tournaments || 0}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Total Wins</span>
                      <span className="font-semibold">
                        {performanceData?.personal_performance?.total_wins || 0}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Total Losses</span>
                      <span className="font-semibold">
                        {performanceData?.personal_performance?.total_losses || 0}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Consistency Score</span>
                      <span className="font-semibold">
                        {performanceData?.personal_performance?.consistency_score?.toFixed(1) || 0}%
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Points Earned</span>
                      <span className="font-semibold">
                        {performanceData?.personal_performance?.points_earned || 0}
                      </span>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Best Partners</CardTitle>
                <CardDescription>Your most successful debate partnerships</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {isLoading ? (
                    Array.from({ length: 3 }).map((_, i) => (
                      <PartnerCard key={i} loading={true} />
                    ))) : (
                    performanceData?.partner_analysis?.slice(0, 3)?.map((partner) => (
                      <PartnerCard key={partner.partner_id} partner={partner} loading={false} />
                    )) || (
                      <div className="text-center py-6 text-muted-foreground">
                        <Users className="h-8 w-8 mx-auto mb-2" />
                        <p>No partnership data available</p>
                      </div>
                    )
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">AI Insights</CardTitle>
                <CardDescription>Personalized analysis and recommendations</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {isLoading ? (
                    Array.from({ length: 2 }).map((_, i) => (
                      <InsightCard key={i} loading={true} />
                    ))
                  ) : (
                    performanceData?.insights?.slice(0, 2)?.map((insight, index) => (
                      <InsightCard key={index} insight={insight} loading={false} />
                    )) || (
                      <div className="text-center py-6 text-muted-foreground">
                        <Brain className="h-8 w-8 mx-auto mb-2" />
                        <p>No insights available yet</p>
                      </div>
                    )
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <ChartCard
              title="Tournament Format Performance"
              description="Your success in different debate formats"
              loading={isLoading}
              chartId="format-performance-chart"
              onCopyImage={handleCopyChartImage}
            >
              {performanceData?.tournament_analysis?.best_formats && (
                <ChartContainer config={{
                  avg_rank: { label: "Average Rank", color: "hsl(var(--chart-1))" },
                  participation_count: { label: "Tournaments", color: "hsl(var(--chart-2))" },
                }} className="min-h-[300px] w-full">
                  <BarChart data={performanceData.tournament_analysis.best_formats}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="format"
                      angle={-45}
                      textAnchor="end"
                      height={100}
                    />
                    <YAxis />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <ChartLegend content={<ChartLegendContent />} />
                    <Bar dataKey="avg_rank" fill="var(--color-avg_rank)" />
                  </BarChart>
                </ChartContainer>
              )}
            </ChartCard>

            <ChartCard
              title="Motion Performance Analysis"
              description="Your performance across different motion types"
              loading={isLoading}
              chartId="motion-performance-chart"
              onCopyImage={handleCopyChartImage}
            >
              {performanceData?.tournament_analysis?.motion_performance && (
                <ChartContainer config={{
                  avg_score: { label: "Average Score", color: "hsl(var(--chart-1))" },
                  win_rate: { label: "Win Rate", color: "hsl(var(--chart-2))" },
                }} className="min-h-[300px] w-full">
                  <BarChart data={performanceData.tournament_analysis.motion_performance}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="motion_category"
                      angle={-45}
                      textAnchor="end"
                      height={100}
                    />
                    <YAxis />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <ChartLegend content={<ChartLegendContent />} />
                    <Bar dataKey="avg_score" fill="var(--color-avg_score)" />
                  </BarChart>
                </ChartContainer>
              )}
            </ChartCard>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Judge Feedback Analysis</CardTitle>
              <CardDescription>What judges say about your performances</CardDescription>
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
                      <Zap className="h-4 w-4" />
                      Strengths
                    </h4>
                    {performanceData?.judge_feedback_analysis?.strengths?.length > 0 ? (
                      <div className="space-y-2">
                        {performanceData.judge_feedback_analysis.strengths.slice(0, 4).map((strength, index) => (
                          <div key={index} className="flex justify-between items-center">
                            <span className="text-sm capitalize">{strength.area}</span>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-muted-foreground">
                                {strength.frequency}x
                              </span>
                              {strength.improvement_rate > 0 && (
                                <Badge variant="outline" className="text-xs">
                                  +{strength.improvement_rate.toFixed(1)}%
                                </Badge>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">No strengths identified yet</p>
                    )}
                  </div>

                  <div>
                    <h4 className="font-semibold text-sm text-orange-600 mb-3 flex items-center gap-2">
                      <Target className="h-4 w-4" />
                      Areas to Improve
                    </h4>
                    {performanceData?.judge_feedback_analysis?.weaknesses?.length > 0 ? (
                      <div className="space-y-2">
                        {performanceData.judge_feedback_analysis.weaknesses.slice(0, 4).map((weakness, index) => (
                          <div key={index} className="flex justify-between items-center">
                            <span className="text-sm capitalize">{weakness.area}</span>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-muted-foreground">
                                {weakness.frequency}x
                              </span>
                              <Badge
                                variant={weakness.priority === "high" ? "destructive" : weakness.priority === "medium" ? "default" : "secondary"}
                                className="text-xs capitalize"
                              >
                                {weakness.priority}
                              </Badge>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">No areas for improvement identified</p>
                    )}
                  </div>
                </div>
              )}

              
              {performanceData?.judge_feedback_analysis?.judge_preferences && (
                <div className="mt-6 border-t pt-6">
                  <h4 className="font-semibold text-sm text-blue-600 mb-3 flex items-center gap-2">
                    <UserCheck className="h-4 w-4" />
                    Judge Preferences
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {performanceData.judge_feedback_analysis.judge_preferences.slice(0, 6).map((judge, index) => (
                      <div key={index} className="p-3 border rounded-lg">
                        <div className="flex justify-between items-start mb-2">
                          <h5 className="font-medium text-sm">{judge.judge_name}</h5>
                          <Badge variant="outline" className="text-xs">
                            {judge.avg_score_from_judge}/30
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span>Judged: {judge.times_judged} times</span>
                          <Badge
                            variant={judge.feedback_sentiment === "positive" ? "default" : judge.feedback_sentiment === "negative" ? "destructive" : "secondary"}
                            className="text-xs"
                          >
                            {judge.feedback_sentiment}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              
              {performanceData?.judge_feedback_analysis?.feedback_trends && (
                <div className="mt-6 border-t pt-6">
                  <h4 className="font-semibold text-sm text-purple-600 mb-3 flex items-center gap-2">
                    <TrendingUp className="h-4 w-4" />
                    Feedback Trends
                  </h4>
                  <div className="space-y-3">
                    {performanceData.judge_feedback_analysis.feedback_trends.slice(0, 4).map((trend, index) => (
                      <div key={index} className="flex justify-between items-center p-3 border rounded-lg">
                        <div>
                          <span className="font-medium text-sm">{trend.period}</span>
                          <div className="text-xs text-muted-foreground">
                            {trend.feedback_count} feedback received
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-semibold text-sm">
                            {trend.avg_score}/30
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Average Score
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Tournament Analysis Details</CardTitle>
              <CardDescription>Deep dive into your tournament performance patterns</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                
                <div>
                  <h4 className="font-semibold text-sm text-blue-600 mb-3 flex items-center gap-2">
                    <School className="h-4 w-4" />
                    Regional Performance
                  </h4>
                  {regionalPerformance.length > 0 ? (
                    <div className="space-y-2">
                      {regionalPerformance.map((region, index) => (
                        <div key={index} className="flex justify-between items-center p-2 border rounded">
                          <div>
                            <span className="font-medium text-sm">{region.region}</span>
                            <div className="text-xs text-muted-foreground">
                              {region.tournaments} tournaments
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-sm font-semibold">#{region.avg_rank}</div>
                            <div className="text-xs text-muted-foreground">Best: #{region.best_rank}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No regional data available</p>
                  )}
                </div>

                
                <div>
                  <h4 className="font-semibold text-sm text-orange-600 mb-3 flex items-center gap-2">
                    <Trophy className="h-4 w-4" />
                    Difficulty Analysis
                  </h4>
                  {performanceData?.tournament_analysis?.difficulty_analysis && (
                    <div className="space-y-2">
                      <div className="flex justify-between items-center p-2 border rounded">
                        <div>
                          <span className="font-medium text-sm">Beginner</span>
                          <div className="text-xs text-muted-foreground">
                            {performanceData.tournament_analysis.difficulty_analysis.beginner_tournaments.count} tournaments
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-semibold">
                            #{performanceData.tournament_analysis.difficulty_analysis.beginner_tournaments.avg_rank}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {performanceData.tournament_analysis.difficulty_analysis.beginner_tournaments.win_rate}% win rate
                          </div>
                        </div>
                      </div>

                      <div className="flex justify-between items-center p-2 border rounded">
                        <div>
                          <span className="font-medium text-sm">Intermediate</span>
                          <div className="text-xs text-muted-foreground">
                            {performanceData.tournament_analysis.difficulty_analysis.intermediate_tournaments.count} tournaments
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-semibold">
                            #{performanceData.tournament_analysis.difficulty_analysis.intermediate_tournaments.avg_rank}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {performanceData.tournament_analysis.difficulty_analysis.intermediate_tournaments.win_rate}% win rate
                          </div>
                        </div>
                      </div>

                      <div className="flex justify-between items-center p-2 border rounded">
                        <div>
                          <span className="font-medium text-sm">Advanced</span>
                          <div className="text-xs text-muted-foreground">
                            {performanceData.tournament_analysis.difficulty_analysis.advanced_tournaments.count} tournaments
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-semibold">
                            #{performanceData.tournament_analysis.difficulty_analysis.advanced_tournaments.avg_rank}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {performanceData.tournament_analysis.difficulty_analysis.advanced_tournaments.win_rate}% win rate
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                
                <div>
                  <h4 className="font-semibold text-sm text-green-600 mb-3 flex items-center gap-2">
                    <Medal className="h-4 w-4" />
                    Format Mastery
                  </h4>
                  {bestFormats.length > 0 ? (
                    <div className="space-y-2">
                      {bestFormats.slice(0, 4).map((format, index) => (
                        <div key={index} className="flex justify-between items-center p-2 border rounded">
                          <div>
                            <span className="font-medium text-sm">{format.format}</span>
                            <div className="text-xs text-muted-foreground">
                              {format.participation_count} tournaments
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-sm font-semibold">#{format.avg_rank.toFixed(1)}</div>
                            <div className="text-xs text-muted-foreground">Average rank</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No format data available</p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </Card>
    </div>
  )
}