"use client"

import React, { useState, useMemo, useCallback } from "react"
import { useQuery } from "convex/react"
import { api } from "@/convex/_generated/api"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
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
  Area,
  AreaChart,
  Bar,
  BarChart,
  Line,
  LineChart,
  Pie,
  PieChart,
  Cell,
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
  Activity,
  Target,
  Lightbulb,
  Crown,
  Medal,
  Star,
  ArrowUp,
  ArrowDown,
  Minus,
  Calendar,
  AlertTriangle,
  DollarSign,
  BarChart2,
  ChevronDown,
  Camera,
  FileText,
  FileSpreadsheet,
  Shield,
  Award,
  Eye,
  EyeOff,
  Info,
  SquareChartGantt,
  NotebookTabs,
} from "lucide-react";
import { downloadExcel } from '@/lib/export/excel'
import html2canvas from 'html2canvas'
import jsPDF from 'jspdf'
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger, DropdownMenuItem } from "@/components/ui/dropdown-menu"

interface DateTimeRange {
  from?: Date
  to?: Date
}

const CHART_COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
]

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
        return Info
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

  const Icon = getInsightIcon(insight.type)
  const colorClass = getInsightColor(insight.type)

  return (
    <Card>
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
            </div>
            <p className="text-sm text-muted-foreground mb-3">{insight.description}</p>
            {insight.actionable_suggestions?.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">Recommendations:</p>
                <ul className="text-xs text-muted-foreground space-y-1">
                  {insight.actionable_suggestions.slice(0, 2).map((suggestion: string, index: number) => (
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

function StudentCard({ student, loading }: { student?: any; loading: boolean }) {
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

  if (!student) return null

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case "improving":
        return <ArrowUp className="h-3 w-3 text-green-600" />
      case "declining":
        return <ArrowDown className="h-3 w-3 text-red-600" />
      default:
        return <Minus className="h-3 w-3 text-gray-600" />
    }
  }

  const getTrendColor = (trend: string) => {
    switch (trend) {
      case "improving":
        return "text-green-600 bg-green-600/10"
      case "declining":
        return "text-red-600 bg-red-600/10"
      default:
        return "text-gray-600 bg-gray-600/10"
    }
  }

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <Avatar>
            <AvatarFallback>
              {student.student_name.split(' ').map((n: string) => n[0]).join('').toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h4 className="font-semibold text-sm truncate">{student.student_name}</h4>
              <Badge variant="outline" className={cn("gap-1", getTrendColor(student.improvement_trajectory.trend))}>
                {getTrendIcon(student.improvement_trajectory.trend)}
                <span className="capitalize">{student.improvement_trajectory.trend}</span>
              </Badge>
            </div>
            <div className="flex items-center gap-4 mt-1">
              <span className="text-xs text-muted-foreground">
                Best Rank: #{student.current_performance.best_rank}
              </span>
              <span className="text-xs text-muted-foreground">
                Avg Score: {student.current_performance.avg_speaker_score.toFixed(1)}
              </span>
            </div>
            {student.predicted_next_performance.confidence > 60 && (
              <div className="mt-2">
                <p className="text-xs font-medium">
                  Predicted Next Rank: #{student.predicted_next_performance.likely_rank_range.min}-{student.predicted_next_performance.likely_rank_range.max}
                </p>
                <Progress
                  value={student.predicted_next_performance.confidence}
                  className="h-1 mt-1"
                />
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function AchievementBadge({ achievement, loading }: { achievement?: any; loading: boolean }) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 p-3 border rounded-lg">
        <Skeleton className="h-8 w-8 rounded" />
        <div className="space-y-1">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-3 w-16" />
        </div>
      </div>
    )
  }

  if (!achievement) return null

  const getRarityColor = (rarity: string) => {
    switch (rarity) {
      case "legendary":
        return "from-yellow-400 to-orange-500"
      case "epic":
        return "from-purple-400 to-pink-500"
      case "rare":
        return "from-blue-400 to-cyan-500"
      default:
        return "from-gray-400 to-gray-500"
    }
  }

  const getIcon = (iconName: string) => {
    switch (iconName) {
      case "trophy":
        return Trophy
      case "star":
        return Star
      case "calendar":
        return Calendar
      case "crown":
        return Crown
      case "users":
        return Users
      default:
        return Medal
    }
  }

  const Icon = getIcon(achievement.icon)

  return (
    <div className={cn(
      "flex items-center gap-3 p-3 border rounded-lg",
      achievement.criteria_met ? "bg-gradient-to-r " + getRarityColor(achievement.rarity) + " text-white" : "bg-muted/50"
    )}>
      <div className={cn(
        "p-2 rounded",
        achievement.criteria_met ? "bg-white/20" : "bg-primary/10"
      )}>
        <Icon className={cn(
          "h-5 w-5",
          achievement.criteria_met ? "text-white" : "text-primary"
        )} />
      </div>
      <div className="flex-1 min-w-0">
        <h4 className={cn(
          "font-semibold text-sm",
          achievement.criteria_met ? "text-white" : "text-foreground"
        )}>
          {achievement.title}
        </h4>
        <p className={cn(
          "text-xs",
          achievement.criteria_met ? "text-white/80" : "text-muted-foreground"
        )}>
          {achievement.description}
        </p>
        {!achievement.criteria_met && (
          <div className="mt-2">
            <Progress value={achievement.progress} className="h-1" />
            <p className="text-xs text-muted-foreground mt-1">
              {achievement.progress}% complete
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

export default function SchoolAnalyticsPage() {
  const { token, user } = useAuth()
  const [dateRange, setDateRange] = useState<DateTimeRange | undefined>({
    from: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
    to: new Date(),
  })
  const [activeTab, setActiveTab] = useState("overview")

  const performanceData = useQuery(
    api.functions.school.analytics.getSchoolPerformanceAnalytics,
    token && user?.role === "school_admin" ? {
      token,
      date_range: dateRange ? {
        start: dateRange.from?.getTime() || Date.now() - (90 * 24 * 60 * 60 * 1000),
        end: dateRange.to?.getTime() || Date.now(),
      } : undefined,
      compare_to_previous_period: true,
    } : "skip"
  )

  const operationalData = useQuery(
    api.functions.school.analytics.getSchoolOperationalAnalytics,
    token && user?.role === "school_admin" && activeTab === "operational" ? {
      token,
      date_range: dateRange ? {
        start: dateRange.from?.getTime() || Date.now() - (90 * 24 * 60 * 60 * 1000),
        end: dateRange.to?.getTime() || Date.now(),
      } : undefined,
    } : "skip"
  )

  const achievementsData = useQuery(
    api.functions.school.analytics.getSchoolAchievementsAndBadges,
    token && user?.role === "school_admin" && activeTab === "achievements" ? {
      token,
    } : "skip"
  )

  const performanceTrendsConfig = useMemo(() => ({
    avg_team_rank: { label: "Avg Team Rank", color: "hsl(var(--chart-1))" },
    avg_speaker_score: { label: "Avg Speaker Score", color: "hsl(var(--chart-2))" },
    win_rate: { label: "Win Rate %", color: "hsl(var(--chart-3))" },
  } as ChartConfig), [])

  const engagementConfig = useMemo(() => ({
    active_count: { label: "Active Students", color: "hsl(var(--chart-1))" },
    participation_rate: { label: "Participation Rate %", color: "hsl(var(--chart-2))" },
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
    if (!performanceData) {
      toast.error("No data available for export")
      return
    }

    try {
      const timestamp = new Date().toISOString().split('T')[0]

      await downloadExcel([
        {
          name: "Performance Trends",
          rows: performanceData.performance_trends ?? [],
        },
        {
          name: "Student Development",
          rows: (performanceData.student_development ?? []).map(student => ({
            student_name: student.student_name,
            avg_speaker_score: student.current_performance.avg_speaker_score,
            total_tournaments: student.current_performance.total_tournaments,
            best_rank: student.current_performance.best_rank,
            trend: student.improvement_trajectory.trend,
            improvement_rate: student.improvement_trajectory.improvement_rate,
            consistency_score: student.current_performance.consistency_score,
          })),
        },
        {
          name: "Team Performance",
          rows: (performanceData.team_performance ?? []).map(team => ({
            team_name: team.team_name,
            tournament_name: team.tournament_name,
            rank: team.performance.rank,
            wins: team.performance.wins,
            total_points: team.performance.total_points,
            avg_speaker_score: team.performance.avg_speaker_score,
            debates_count: team.performance.debates_count,
          })),
        },
      ], `school-analytics-${timestamp}.xlsx`)

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
      pdf.text('School Analytics Report', pageWidth / 2, yPosition, { align: 'center' })

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
      const filename = `school-analytics-${timestamp}.pdf`

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
        csvContent += "Period,Avg Team Rank,Avg Speaker Score,Win Rate,Tournaments,Total Points\n"
        performanceData.performance_trends.forEach((trend: any) => {
          csvContent += `${trend.period},${trend.avg_team_rank},${trend.avg_speaker_score},${trend.win_rate},${trend.tournaments_participated},${trend.total_points}\n`
        })
        csvContent += "\n"
      }

      if (performanceData.student_development) {
        csvContent += "Student Performance\n"
        csvContent += "Student,Avg Score,Tournaments,Best Rank,Trend,Improvement Rate,Consistency\n"
        performanceData.student_development.forEach((student: any) => {
          csvContent += `${student.student_name},${student.current_performance?.avg_speaker_score || 0},${student.current_performance?.total_tournaments || 0},${student.current_performance?.best_rank || 0},${student.improvement_trajectory?.trend || 'stable'},${student.improvement_trajectory?.improvement_rate || 0},${student.current_performance?.consistency_score || 0}\n`
        })
        csvContent += "\n"
      }

      const encodedUri = encodeURI(csvContent)
      const link = document.createElement("a")
      link.setAttribute("href", encodedUri)
      link.setAttribute("download", `school-analytics-${new Date().toISOString().split('T')[0]}.csv`)
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)

      toast.success("CSV file downloaded successfully!")
    } catch (error) {
      console.error('Error exporting to CSV:', error)
      toast.error("Failed to export CSV file")
    }
  }, [performanceData])

  if (!token || !user || user.role !== "school_admin") {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Shield className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h1 className="text-xl font-semibold mb-2">Access Denied</h1>
          <p className="text-muted-foreground">Only school administrators can access analytics.</p>
        </div>
      </div>
    )
  }

  const isLoading = performanceData === undefined

  return (
    <div className="space-y-6">
      <div>
        <p className="text-muted-foreground">
          Comprehensive insights into your school&#39;s debate performance
        </p>
      </div>

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
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
            <TabsList className="hidden md:grid w-full grid-cols-3">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="operational">Operations</TabsTrigger>
              <TabsTrigger value="achievements">Achievements</TabsTrigger>
            </TabsList>

            <div className="md:hidden fixed bottom-0 left-0 right-0 bg-background border-t z-50">
              <div className="flex overflow-x-auto">
                <button
                  onClick={() => setActiveTab("overview")}
                  className={cn(
                    "flex-1 min-w-0 flex flex-col items-center gap-1 py-2 px-1 text-xs transition-colors",
                    activeTab === "overview"
                      ? "text-primary font-medium"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <SquareChartGantt className="h-4 w-4 shrink-0" />
                  <span className="truncate text-[10px]">Overview</span>
                </button>

                <button
                  onClick={() => setActiveTab("operational")}
                  className={cn(
                    "flex-1 min-w-0 flex flex-col items-center gap-1 py-2 px-1 text-xs transition-colors",
                    activeTab === "operational"
                      ? "text-primary font-medium"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <NotebookTabs className="h-4 w-4 shrink-0" />
                  <span className="truncate text-[10px]">Operations</span>
                </button>

                <button
                  onClick={() => setActiveTab("achievements")}
                  className={cn(
                    "flex-1 min-w-0 flex flex-col items-center gap-1 py-2 px-1 text-xs transition-colors",
                    activeTab === "achievements"
                      ? "text-primary font-medium"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Medal className="h-4 w-4 shrink-0" />
                  <span className="truncate text-[10px]">Achievements</span>
                </button>
              </div>
            </div>

            <TabsContent value="overview" className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard
                  title="Active Debaters"
                  value={performanceData?.summary_stats?.total_students || 0}
                  subtitle="Total students in program"
                  trend={performanceData?.summary_stats?.trends?.students}
                  icon={Users}
                  loading={isLoading}
                />
                <StatCard
                  title="Avg Team Rank"
                  value={performanceData?.summary_stats?.avg_team_rank ? performanceData.summary_stats.avg_team_rank.toFixed(1) : "N/A"}
                  subtitle="Latest tournament performance"
                  trend={performanceData?.summary_stats?.trends?.performance}
                  icon={Trophy}
                  loading={isLoading}
                />
                <StatCard
                  title="Active Students"
                  value={performanceData?.summary_stats?.active_students || 0}
                  subtitle="Participated in last 6 months"
                  icon={Activity}
                  loading={isLoading}
                />
                <StatCard
                  title="Total Tournaments"
                  value={performanceData?.summary_stats?.total_tournaments || 0}
                  subtitle="Tournaments participated"
                  trend={performanceData?.summary_stats?.trends?.tournaments}
                  icon={Target}
                  loading={isLoading}
                />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <ChartCard
                  title="Performance Trends"
                  description="Team ranking and speaker performance over time"
                  loading={isLoading}
                  className="lg:col-span-2"
                  chartId="performance-trends-chart"
                  onCopyImage={handleCopyChartImage}
                >
                  {performanceData?.performance_trends && (
                    <ChartContainer config={performanceTrendsConfig} className="min-h-[300px] w-full">
                      <AreaChart data={performanceData.performance_trends}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="period" />
                        <YAxis />
                        <ChartTooltip content={<ChartTooltipContent />} />
                        <ChartLegend content={<ChartLegendContent />} />
                        <Area
                          type="monotone"
                          dataKey="avg_team_rank"
                          stackId="1"
                          stroke="var(--color-avg_team_rank)"
                          fill="var(--color-avg_team_rank)"
                          fillOpacity={0.6}
                        />
                        <Area
                          type="monotone"
                          dataKey="avg_speaker_score"
                          stackId="2"
                          stroke="var(--color-avg_speaker_score)"
                          fill="var(--color-avg_speaker_score)"
                          fillOpacity={0.6}
                        />
                      </AreaChart>
                    </ChartContainer>
                  )}
                </ChartCard>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Financial Overview</CardTitle>
                    <CardDescription>Investment and ROI metrics</CardDescription>
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
                          <span className="text-sm text-muted-foreground">Total Investment</span>
                          <span className="font-semibold">
                            {performanceData?.financial_analytics?.total_investment?.toLocaleString() || 0} RWF
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-muted-foreground">Cost per Student</span>
                          <span className="font-semibold">
                            {performanceData?.financial_analytics?.cost_per_student?.toLocaleString() || 0} RWF
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-muted-foreground">Cost per Tournament</span>
                          <span className="font-semibold">
                            {performanceData?.financial_analytics?.cost_per_tournament?.toLocaleString() || 0} RWF
                          </span>
                        </div>
                        <div className="pt-2 border-t">
                          <div className="flex items-center gap-2">
                            <DollarSign className="h-4 w-4 text-green-600" />
                            <span className="text-sm font-medium">
                              ROI: {performanceData?.financial_analytics?.roi_metrics?.ranking_improvement_per_rwf?.toFixed(2) || 0} rank improvement per 1K RWF
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
                    <CardTitle className="text-lg">Top Performing Students</CardTitle>
                    <CardDescription>Students showing the best improvement and performance</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {isLoading ? (
                        Array.from({ length: 3 }).map((_, i) => (
                          <StudentCard key={i} loading={true} />
                        ))
                      ) : (
                        performanceData?.student_development
                          ?.filter(s => s.improvement_trajectory.trend === "improving")
                          ?.slice(0, 3)
                          ?.map((student) => (
                            <StudentCard key={student.student_id} student={student} loading={false} />
                          )) || (
                          <div className="text-center py-6 text-muted-foreground">
                            <Users className="h-8 w-8 mx-auto mb-2" />
                            <p>No student performance data available</p>
                          </div>
                        )
                      )}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">AI Insights</CardTitle>
                    <CardDescription>Automated analysis and recommendations</CardDescription>
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
                            <Lightbulb className="h-8 w-8 mx-auto mb-2" />
                            <p>No insights available yet</p>
                          </div>
                        )
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Recent Tournament Performance</CardTitle>
                  <CardDescription>Your teams&#39; performance in recent tournaments</CardDescription>
                </CardHeader>
                <CardContent>
                  {isLoading ? (
                    <div className="space-y-3">
                      {Array.from({ length: 3 }).map((_, i) => (
                        <div key={i} className="flex items-center gap-4 p-3 border rounded">
                          <Skeleton className="h-4 w-32" />
                          <Skeleton className="h-4 w-24" />
                          <Skeleton className="h-4 w-16" />
                          <Skeleton className="h-4 w-20" />
                        </div>
                      ))}
                    </div>
                  ) : performanceData?.team_performance?.length ? (
                    <div className="space-y-3">
                      {performanceData.team_performance.slice(0, 5).map((team) => (
                        <div key={team.team_id} className="flex items-center justify-between p-3 border rounded hover:bg-muted/50">
                          <div className="flex-1">
                            <h4 className="font-semibold text-sm">{team.team_name}</h4>
                            <p className="text-xs text-muted-foreground">{team.tournament_name}</p>
                          </div>
                          <div className="flex items-center gap-4 text-sm">
                            <div className="text-center">
                              <p className="font-semibold">#{team.performance.rank}</p>
                              <p className="text-xs text-muted-foreground">Rank</p>
                            </div>
                            <div className="text-center">
                              <p className="font-semibold">{team.performance.wins}</p>
                              <p className="text-xs text-muted-foreground">Wins</p>
                            </div>
                            <div className="text-center">
                              <p className="font-semibold">{team.performance.avg_speaker_score.toFixed(1)}</p>
                              <p className="text-xs text-muted-foreground">Avg Score</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      <Trophy className="h-12 w-12 mx-auto mb-3" />
                      <p>No recent tournament data available</p>
                      <p className="text-xs">Participate in tournaments to see performance metrics</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">School Performance Benchmarking</CardTitle>
                  <CardDescription>How your school compares to similar institutions</CardDescription>
                </CardHeader>
                <CardContent>
                  {isLoading ? (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {Array.from({ length: 3 }).map((_, i) => (
                        <div key={i} className="space-y-2">
                          <Skeleton className="h-4 w-20" />
                          <Skeleton className="h-8 w-12" />
                          <Skeleton className="h-3 w-24" />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <div className="text-center">
                        <p className="text-sm font-medium text-muted-foreground">Regional Rank</p>
                        <p className="text-2xl font-bold text-primary">
                          #{performanceData?.benchmarking?.school_rank_in_region || "N/A"}
                        </p>
                        <p className="text-xs text-muted-foreground">Among regional schools</p>
                      </div>
                      <div className="text-center">
                        <p className="text-sm font-medium text-muted-foreground">School Type Rank</p>
                        <p className="text-2xl font-bold text-primary">
                          #{performanceData?.benchmarking?.school_rank_by_type || "N/A"}
                        </p>
                        <p className="text-xs text-muted-foreground">Among similar schools</p>
                      </div>
                      <div className="text-center">
                        <p className="text-sm font-medium text-muted-foreground">Performance Percentile</p>
                        <p className="text-2xl font-bold text-primary">
                          {performanceData?.benchmarking?.performance_percentile || 0}th
                        </p>
                        <p className="text-xs text-muted-foreground">Percentile</p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="operational" className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard
                  title="Total Students"
                  value={operationalData?.student_engagement?.total_students || 0}
                  subtitle="Registered in program"
                  icon={Users}
                  loading={!operationalData}
                />
                <StatCard
                  title="Active Students"
                  value={operationalData?.student_engagement?.active_students || 0}
                  subtitle="Participated in last 30 days"
                  icon={Activity}
                  loading={!operationalData}
                />
                <StatCard
                  title="Dropout Rate"
                  value={`${operationalData?.student_engagement?.dropout_rate?.toFixed(1) || 0}%`}
                  subtitle="Students who left program"
                  icon={TrendingDown}
                  loading={!operationalData}
                />
                <StatCard
                  title="New Registrations"
                  value={operationalData?.student_engagement?.new_registrations || 0}
                  subtitle="This period"
                  icon={TrendingUp}
                  loading={!operationalData}
                />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <ChartCard
                  title="Student Engagement Trends"
                  description="Active participation and tournament signups over time"
                  loading={!operationalData}
                  chartId="engagement-trends-chart"
                  onCopyImage={handleCopyChartImage}
                >
                  {operationalData?.student_engagement?.engagement_trends && (
                    <ChartContainer config={engagementConfig} className="min-h-[300px] w-full">
                      <LineChart data={operationalData.student_engagement.engagement_trends}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="period" />
                        <YAxis />
                        <ChartTooltip content={<ChartTooltipContent />} />
                        <ChartLegend content={<ChartLegendContent />} />
                        <Line
                          type="monotone"
                          dataKey="active_count"
                          stroke="var(--color-active_count)"
                          strokeWidth={2}
                          dot={{ fill: "var(--color-active_count)" }}
                        />
                        <Line
                          type="monotone"
                          dataKey="participation_rate"
                          stroke="var(--color-participation_rate)"
                          strokeWidth={2}
                          dot={{ fill: "var(--color-participation_rate)" }}
                        />
                      </LineChart>
                    </ChartContainer>
                  )}
                </ChartCard>

                <ChartCard
                  title="Activity Distribution"
                  description="Student engagement levels"
                  loading={!operationalData}
                  chartId="activity-distribution-chart"
                  onCopyImage={handleCopyChartImage}
                >
                  {operationalData?.student_engagement?.student_activity_distribution && (
                    <ChartContainer config={{
                      high: { label: "High Activity", color: "hsl(var(--chart-1))" },
                      medium: { label: "Medium Activity", color: "hsl(var(--chart-2))" },
                      low: { label: "Low Activity", color: "hsl(var(--chart-3))" },
                      inactive: { label: "Inactive", color: "hsl(var(--chart-4))" },
                    }} className="min-h-[300px] w-full">
                      <PieChart>
                        <Pie
                          data={operationalData.student_engagement.student_activity_distribution}
                          dataKey="count"
                          nameKey="activity_level"
                          cx="50%"
                          cy="50%"
                          outerRadius={100}
                          label={({ activity_level, percentage }) => `${activity_level}: ${percentage}%`}
                        >
                          {operationalData.student_engagement.student_activity_distribution.map((entry, index) => (
                            <Cell key={`cell-${entry}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                          ))}
                        </Pie>
                        <ChartTooltip content={<ChartTooltipContent />} />
                        <ChartLegend content={<ChartLegendContent />} />
                      </PieChart>
                    </ChartContainer>
                  )}
                </ChartCard>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Resource Utilization</CardTitle>
                    <CardDescription>How effectively resources are being used</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {!operationalData ? (
                      <div className="space-y-3">
                        <Skeleton className="h-4 w-full" />
                        <Skeleton className="h-4 w-3/4" />
                        <Skeleton className="h-4 w-1/2" />
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <div className="flex justify-between">
                          <span className="text-sm text-muted-foreground">Tournaments Participated</span>
                          <span className="font-semibold">{operationalData.resource_utilization.tournaments_participated}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm text-muted-foreground">Teams Formed</span>
                          <span className="font-semibold">{operationalData.resource_utilization.teams_formed}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm text-muted-foreground">Avg Team Size</span>
                          <span className="font-semibold">{operationalData.resource_utilization.avg_team_size.toFixed(1)}</span>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Team Formation Patterns</CardTitle>
                    <CardDescription>Efficiency of team formation across tournaments</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {!operationalData ? (
                      <div className="space-y-3">
                        <Skeleton className="h-4 w-full" />
                        <Skeleton className="h-4 w-3/4" />
                        <Skeleton className="h-4 w-1/2" />
                      </div>
                    ) : operationalData.resource_utilization.team_formation_patterns?.length > 0 ? (
                      <div className="space-y-3">
                        {operationalData.resource_utilization.team_formation_patterns.slice(0, 3).map((pattern, index) => (
                          <div key={index} className="space-y-2">
                            <div className="flex justify-between text-sm">
                              <span className="truncate font-medium">{pattern.tournament_name}</span>
                              <span className="text-muted-foreground">{pattern.teams_registered} teams</span>
                            </div>
                            <div className="flex justify-between text-xs text-muted-foreground">
                              <span>{pattern.students_participated} students</span>
                              <span>{pattern.formation_efficiency}% efficiency</span>
                            </div>
                            <Progress value={pattern.formation_efficiency} className="h-1" />
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-6 text-muted-foreground">
                        <BarChart2 className="h-8 w-8 mx-auto mb-2" />
                        <p className="text-sm">No team formation data available</p>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Tournament Preferences</CardTitle>
                    <CardDescription>Most popular tournament formats and performance</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {!operationalData ? (
                      <div className="space-y-3">
                        <Skeleton className="h-4 w-full" />
                        <Skeleton className="h-4 w-3/4" />
                        <Skeleton className="h-4 w-1/2" />
                      </div>
                    ) : operationalData.seasonal_trends?.tournament_preferences?.length > 0 ? (
                      <div className="space-y-3">
                        {operationalData.seasonal_trends.tournament_preferences.slice(0, 3).map((pref, index) => (
                          <div key={index} className="space-y-2">
                            <div className="flex justify-between text-sm">
                              <span className="font-medium capitalize">{pref.tournament_format}</span>
                              <span className="text-muted-foreground">{pref.participation_count} entries</span>
                            </div>
                            <div className="flex justify-between text-xs text-muted-foreground">
                              <span>Avg Performance: {pref.avg_performance}%</span>
                              <span>Score: {pref.preference_score}</span>
                            </div>
                            <Progress value={pref.preference_score} className="h-1" />
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-6 text-muted-foreground">
                        <Target className="h-8 w-8 mx-auto mb-2" />
                        <p className="text-sm">No tournament preference data</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              <ChartCard
                title="Seasonal Performance Trends"
                description="Performance variations throughout the academic year"
                loading={!operationalData}
                chartId="seasonal-trends-chart"
                onCopyImage={handleCopyChartImage}
              >
                {operationalData?.seasonal_trends?.performance_by_season && (
                  <ChartContainer config={{
                    tournaments_participated: { label: "Tournaments", color: "hsl(var(--chart-1))" },
                    avg_performance: { label: "Avg Performance", color: "hsl(var(--chart-2))" },
                    student_participation: { label: "Student Participation", color: "hsl(var(--chart-3))" },
                  }} className="min-h-[300px] w-full">
                    <BarChart data={operationalData.seasonal_trends.performance_by_season}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="season" />
                      <YAxis />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <ChartLegend content={<ChartLegendContent />} />
                      <Bar dataKey="tournaments_participated" fill="var(--color-tournaments_participated)" />
                      <Bar dataKey="avg_performance" fill="var(--color-avg_performance)" />
                      <Bar dataKey="student_participation" fill="var(--color-student_participation)" />
                    </BarChart>
                  </ChartContainer>
                )}
              </ChartCard>
            </TabsContent>

            <TabsContent value="achievements" className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card className="md:col-span-2">
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Crown className="h-5 w-5 text-yellow-500" />
                      School Level Progress
                    </CardTitle>
                    <CardDescription>Your school&#39;s achievement level and experience points</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {!achievementsData ? (
                      <div className="space-y-4">
                        <Skeleton className="h-8 w-32" />
                        <Skeleton className="h-4 w-full" />
                        <Skeleton className="h-4 w-3/4" />
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <h3 className="text-2xl font-bold">Level {achievementsData.school_level.current_level}</h3>
                            <p className="text-sm text-muted-foreground">
                              {achievementsData.school_level.experience_points.toLocaleString()} XP
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-medium">Next Level</p>
                            <p className="text-xs text-muted-foreground">
                              {achievementsData.school_level.points_to_next_level.toLocaleString()} XP to go
                            </p>
                          </div>
                        </div>
                        <Progress
                          value={(achievementsData.school_level.experience_points / (achievementsData.school_level.experience_points + achievementsData.school_level.points_to_next_level)) * 100}
                          className="h-3"
                        />
                        <div className="space-y-2">
                          <p className="text-sm font-medium">Level Benefits:</p>
                          <ul className="text-xs text-muted-foreground space-y-1">
                            {achievementsData.school_level.level_benefits.slice(0, 2).map((benefit, index) => (
                              <li key={index} className="flex items-center gap-2">
                                <Star className="h-3 w-3 text-primary" />
                                {benefit}
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Leaderboard Position</CardTitle>
                    <CardDescription>Your ranking among schools</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {!achievementsData ? (
                      <div className="space-y-3">
                        <Skeleton className="h-8 w-16" />
                        <Skeleton className="h-4 w-24" />
                        <Skeleton className="h-4 w-20" />
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <div className="text-center">
                          <div className="text-3xl font-bold text-primary">
                            #{achievementsData.leaderboard_position.regional_rank}
                          </div>
                          <p className="text-sm text-muted-foreground">Regional Rank</p>
                        </div>
                        <div className="space-y-2">
                          <div className="flex justify-between text-sm">
                            <span>National Rank</span>
                            <span className="font-semibold">#{achievementsData.leaderboard_position.national_rank}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span>Improvement Rank</span>
                            <span className="font-semibold">#{achievementsData.leaderboard_position.improvement_rank}</span>
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
                    <CardTitle className="text-lg">Achievements Earned</CardTitle>
                    <CardDescription>Milestones your school has accomplished</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {!achievementsData ? (
                        Array.from({ length: 3 }).map((_, i) => (
                          <AchievementBadge key={i} loading={true} />
                        ))
                      ) : achievementsData.achievements.filter(a => a.criteria_met).length > 0 ? (
                        achievementsData.achievements
                          .filter(a => a.criteria_met)
                          .slice(0, 4)
                          .map((achievement) => (
                            <AchievementBadge key={achievement.id} achievement={achievement} loading={false} />
                          ))
                      ) : (
                        <div className="text-center py-6 text-muted-foreground">
                          <Award className="h-8 w-8 mx-auto mb-2" />
                          <p className="text-sm">No achievements earned yet</p>
                          <p className="text-xs">Keep participating to unlock achievements!</p>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Available Badges</CardTitle>
                    <CardDescription>Badges you can work towards earning</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {!achievementsData ? (
                        Array.from({ length: 3 }).map((_, i) => (
                          <div key={i} className="flex items-center gap-3 p-3 border rounded-lg">
                            <Skeleton className="h-10 w-10 rounded" />
                            <div className="flex-1 space-y-2">
                              <Skeleton className="h-4 w-24" />
                              <Skeleton className="h-3 w-32" />
                              <Skeleton className="h-2 w-full" />
                            </div>
                          </div>
                        ))
                      ) : (
                        achievementsData.available_badges.slice(0, 4).map((badge) => (
                          <div key={badge.id} className="p-3 border rounded-lg space-y-3">
                            <div className="flex items-center gap-3">
                              <div className={cn(
                                "p-2 rounded-full",
                                badge.locked ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary"
                              )}>
                                {badge.locked ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                              </div>
                              <div className="flex-1 min-w-0">
                                <h4 className="font-semibold text-sm">{badge.title}</h4>
                                <p className="text-xs text-muted-foreground">{badge.description}</p>
                              </div>
                            </div>
                            {!badge.locked && (
                              <div className="space-y-2">
                                <div className="flex justify-between text-xs">
                                  <span>Progress</span>
                                  <span>{badge.progress}/{badge.max_progress}</span>
                                </div>
                                <Progress value={(badge.progress / badge.max_progress) * 100} className="h-2" />
                              </div>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>

              
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Achievement Progress Overview</CardTitle>
                  <CardDescription>Track your progress across different achievement categories</CardDescription>
                </CardHeader>
                <CardContent>
                  {!achievementsData ? (
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                      {Array.from({ length: 4 }).map((_, i) => (
                        <div key={i} className="space-y-2">
                          <Skeleton className="h-4 w-20" />
                          <Skeleton className="h-8 w-12" />
                          <Skeleton className="h-2 w-full" />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                      {["performance", "participation", "improvement", "milestone"].map((type) => {
                        const typeAchievements = achievementsData.achievements.filter(a => a.type === type);
                        const earnedCount = typeAchievements.filter(a => a.criteria_met).length;
                        const totalCount = typeAchievements.length;
                        const percentage = totalCount > 0 ? (earnedCount / totalCount) * 100 : 0;

                        return (
                          <div key={type} className="text-center space-y-2">
                            <h4 className="text-sm font-medium capitalize">{type}</h4>
                            <div className="text-2xl font-bold">
                              {earnedCount}/{totalCount}
                            </div>
                            <Progress value={percentage} className="h-2" />
                            <p className="text-xs text-muted-foreground">
                              {percentage.toFixed(0)}% Complete
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </Card>
    </div>
  )
}