"use client"

import React, { useState, useMemo, useCallback } from "react"
import { useQuery, useMutation } from "convex/react"
import { api } from "@/convex/_generated/api"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
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
  Pie,
  PieChart,
  Cell,
  CartesianGrid,
  XAxis,
  YAxis
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
  Share,
  Activity,
  Building,
  Loader2,
  FileSpreadsheet,
  FileText,
  ChevronDown,
  Camera,
  AlertTriangle, SquareChartGantt, DollarSign, BarChart2, Copy, Check
} from "lucide-react";
import { downloadExcel } from '@/lib/export/excel'
import html2canvas from 'html2canvas'
import jsPDF from 'jspdf'
import { useDebounce } from "@/hooks/use-debounce"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Doc, Id } from "@/convex/_generated/dataModel";
import { useOffline } from "@/hooks/use-offline";

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
                    loading = false
                  }: {
  title: string
  value: string | number
  subtitle: string
  trend?: number
  icon: React.ElementType
  loading?: boolean
}) {
  if (loading) {
    return (
      <Card>
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
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <div className="flex items-center gap-2">
              <p className="text-2xl font-bold">{value}</p>
              {trend !== undefined && (
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
                     chartId,
                     onCopyImage,
                     loading = false
                   }: {
  title: string
  description?: string
  children: React.ReactNode
  chartId: string
  onCopyImage: (chartId: string) => void
  loading?: boolean
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-lg">{title}</CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </div>
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
      </CardHeader>
      <CardContent id={chartId}>
        {loading ? <ChartSkeleton /> : children}
      </CardContent>
    </Card>
  )
}

function ShareReportDialog({
                             open,
                             onOpenChange,
                             selectedSections,
                             selectedDateRange,
                             selectedFilters
                           }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  selectedSections: string[]
  selectedDateRange?: DateTimeRange
  selectedFilters: any
}) {
  const [reportTitle, setReportTitle] = useState("");
  const [reportSections, setReportSections] = useState<string[]>(selectedSections);
  const [expirationDays, setExpirationDays] = useState("30");
  const [maxViews, setMaxViews] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [showLinkDialog, setShowLinkDialog] = useState(false);
  const [copied, setCopied] = useState(false);


  const { token } = useAuth();
  const generateShareableReport = useMutation(api.functions.admin.analytics.generateShareableReport);

  const sections = [
    { id: "overview", label: "Dashboard Overview" },
    { id: "tournaments", label: "Tournament Analytics" },
    { id: "users", label: "User Analytics" },
    { id: "financial", label: "Financial Analytics" },
    { id: "performance", label: "Performance Analytics" },
  ]

  const handleSectionToggle = (sectionId: string) => {
    setReportSections(prev =>
      prev.includes(sectionId)
        ? prev.filter(id => id !== sectionId)
        : [...prev, sectionId]
    )
  }

  const handleGenerateReport = async () => {
    if (!reportTitle.trim() || reportSections.length === 0) {
      toast.error("Please provide a title and select at least one section")
      return
    }

    setIsGenerating(true)
    try {
      const expiresAt = Date.now() + (parseInt(expirationDays) * 24 * 60 * 60 * 1000)

      const result = await generateShareableReport({
        token: token!,
        report_config: {
          title: reportTitle,
          sections: reportSections,
          date_range: selectedDateRange ? {
            start: selectedDateRange.from?.getTime() || Date.now() - (30 * 24 * 60 * 60 * 1000),
            end: selectedDateRange.to?.getTime() || Date.now(),
          } : undefined,
          filters: selectedFilters,
        },
        access_settings: {
          expires_at: expiresAt,
          allowed_views: maxViews ? parseInt(maxViews) : undefined,
          visible_to_roles: ["public"],
        }
      })
      setShareLink(result.share_url);
      setShowLinkDialog(true);
      onOpenChange(false);
    } catch (error: any) {
      toast.error(error.message || "Failed to generate report")
    } finally {
      setIsGenerating(false)
    }
  }

  const handleCopy = () => {
    if (!shareLink) return;

    navigator.clipboard.writeText(shareLink);
    setCopied(true);
    toast.success("Link copied to clipboard!");

    setTimeout(() => setCopied(false), 2000);
  };


  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Share className="h-5 w-5" />
              Share Analytics Report
            </DialogTitle>
            <DialogDescription>
              Create a shareable link for this analytics report that can be accessed without login
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="report-title">Report Title</Label>
              <Input
                id="report-title"
                value={reportTitle}
                onChange={(e) => setReportTitle(e.target.value)}
                placeholder="e.g., Q1 2024 Tournament Analytics"
              />
            </div>

            <div className="space-y-3">
              <Label>Sections to Include</Label>
              <div className="grid grid-cols-2 gap-3">
                {sections.map((section) => (
                  <div key={section.id} className="flex items-center space-x-2">
                    <Checkbox
                      id={section.id}
                      checked={reportSections.includes(section.id)}
                      onCheckedChange={() => handleSectionToggle(section.id)}
                    />
                    <Label htmlFor={section.id} className="text-sm">
                      {section.label}
                    </Label>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="expiration">Expires in (days)</Label>
                <Select value={expirationDays} onValueChange={setExpirationDays}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="7">7 days</SelectItem>
                    <SelectItem value="30">30 days</SelectItem>
                    <SelectItem value="90">90 days</SelectItem>
                    <SelectItem value="365">1 year</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="max-views">Max Views (optional)</Label>
                <Input
                  id="max-views"
                  type="number"
                  min="1"
                  value={maxViews}
                  onChange={(e) => setMaxViews(e.target.value)}
                  placeholder="Unlimited"
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handleGenerateReport} disabled={isGenerating}>
              {isGenerating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Generating...
                </>
              ) : (
                <>
                  <Share className="h-4 w-4 mr-2" />
                  Generate Report
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={showLinkDialog} onOpenChange={setShowLinkDialog}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Shareable Report Link</DialogTitle>
            <DialogDescription>
              This link can be shared with others to access the report. It is viewable without login.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <Label className="text-sm">Link</Label>
            <div className="flex items-center gap-2">
              <Input
                value={shareLink ?? ""}
                readOnly
                className="flex-1 text-sm"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopy}
              >
                {copied ? (
                  <Check className="h-4 w-4 text-green-600" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Anyone with this link can view the report until it expires or the view limit is reached.
            </p>
          </div>

          <div className="flex justify-end">
            <Button onClick={() => setShowLinkDialog(false)}>Done</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>

  )
}

export default function AdminAnalyticsPage() {
  const { token, user } = useAuth()
  const [dateRange, setDateRange] = useState<DateTimeRange | undefined>({
    from: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
    to: new Date(),
  })
  const [selectedLeague, setSelectedLeague] = useState<string>("all")
  const [selectedCurrency, setSelectedCurrency] = useState<"RWF" | "USD">("RWF")
  const [activeTab, setActiveTab] = useState("overview")
  const [showShareDialog, setShowShareDialog] = useState(false)
  const [openCommand, setOpenCommand] = useState(false);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);

  const currentFilters = useMemo(() => ({
    league_id: selectedLeague !== "all" ? selectedLeague as any : undefined,
    currency: selectedCurrency,
  }), [selectedLeague, selectedCurrency])

  const activeSections = useMemo(() => {
    const sections = []
    if (activeTab === "overview" || activeTab === "all") sections.push("overview")
    if (activeTab === "tournaments" || activeTab === "all") sections.push("tournaments")
    if (activeTab === "users" || activeTab === "all") sections.push("users")
    if (activeTab === "financial" || activeTab === "all") sections.push("financial")
    if (activeTab === "performance" || activeTab === "all") sections.push("performance")
    return sections
  }, [activeTab])

  const overviewData = useOffline(useQuery(
    api.functions.admin.analytics.getDashboardOverview,
    token && activeTab === "overview" ? {
      token,
      date_range: dateRange ? {
        start: dateRange.from?.getTime() || Date.now() - (30 * 24 * 60 * 60 * 1000),
        end: dateRange.to?.getTime() || Date.now(),
      } : undefined,
    } : "skip"
  ), "analytics-overview");

  const tournamentData = useOffline(useQuery(
    api.functions.admin.analytics.getTournamentAnalytics,
    token && activeTab === "tournaments" ? {
      token,
      date_range: dateRange ? {
        start: dateRange.from?.getTime() || Date.now() - (30 * 24 * 60 * 60 * 1000),
        end: dateRange.to?.getTime() || Date.now(),
      } : undefined,
      league_id: selectedLeague !== "all" ? selectedLeague as any : undefined,
    } : "skip"
  ), "analytics-tournament");

  const userData = useOffline(useQuery(
    api.functions.admin.analytics.getUserAnalytics,
    token && activeTab === "users" ? {
      token,
      date_range: dateRange ? {
        start: dateRange.from?.getTime() || Date.now() - (30 * 24 * 60 * 60 * 1000),
        end: dateRange.to?.getTime() || Date.now(),
      } : undefined,
    } : "skip"
  ), "analytics-users");

  const financialData = useOffline(useQuery(
    api.functions.admin.analytics.getFinancialAnalytics,
    token && activeTab === "financial" ? {
      token,
      date_range: dateRange ? {
        start: dateRange.from?.getTime() || Date.now() - (30 * 24 * 60 * 60 * 1000),
        end: dateRange.to?.getTime() || Date.now(),
      } : undefined,
      currency: selectedCurrency,
    } : "skip"
  ), "analytics-financial");

  const performanceData = useOffline(useQuery(
    api.functions.admin.analytics.getPerformanceAnalytics,
    token && activeTab === "performance" ? {
      token,
      date_range: dateRange ? {
        start: dateRange.from?.getTime() || Date.now() - (30 * 24 * 60 * 60 * 1000),
        end: dateRange.to?.getTime() || Date.now(),
      } : undefined,
    } : "skip"
  ), "analytics-performance");

  const exportData = useQuery(
    api.functions.admin.analytics.exportAnalyticsData,
    token ? {
      token,
      export_format: "csv" as const,
      sections: activeSections,
      date_range: dateRange ? {
        start: dateRange.from?.getTime() || Date.now() - (30 * 24 * 60 * 60 * 1000),
        end: dateRange.to?.getTime() || Date.now(),
      } : undefined,
      filters: currentFilters,
    } : "skip"
  )

  const getLeagues = useOffline(useQuery(api.functions.leagues.getLeagues, {
    search: debouncedSearch,
    page: 1,
    limit: 20,
  }), "analytics-leagues");

  const isSuperAdminResult = useOffline(useQuery(
    api.functions.admin.superadmin.isSuperAdmin,
    token && user?.role === "admin" ? {
      token: token,
      user_id: user.id as Id<"users">
    } : "skip"
  ), "super-admin");

  const isSuperAdminUser = isSuperAdminResult === true;

  const leagues: Doc<"leagues">[] = getLeagues?.leagues || [];


  const tournamentTrendsConfig = {
    total: { label: "Total", color: "hsl(var(--chart-1))" },
    completed: { label: "Completed", color: "hsl(var(--chart-2))" },
    in_progress: { label: "In Progress", color: "hsl(var(--chart-3))" },
    published: { label: "Published", color: "hsl(var(--chart-4))" },
  } satisfies ChartConfig

  const formatDistributionConfig = useMemo(() => {
    const config: ChartConfig = {}
    tournamentData?.format_distribution?.forEach((item, index) => {
      config[item.format] = {
        label: item.format,
        color: CHART_COLORS[index % CHART_COLORS.length],
      }
    })
    return config
  }, [tournamentData?.format_distribution])

  const userGrowthConfig = {
    students: { label: "Students", color: "hsl(var(--chart-1))" },
    volunteers: { label: "Volunteers", color: "hsl(var(--chart-2))" },
    school_admins: { label: "School Admins", color: "hsl(var(--chart-3))" },
    admins: { label: "Admins", color: "hsl(var(--chart-4))" },
    total: { label: "Total", color: "hsl(var(--chart-5))" },
  } satisfies ChartConfig

  const revenueConfig = {
    revenue: { label: "Revenue", color: "hsl(var(--chart-1))" },
    transactions: { label: "Transactions", color: "hsl(var(--chart-2))" },
  } satisfies ChartConfig

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
    if (!exportData) {
      toast.error("No data available for export")
      return
    }

    try {
      const timestamp = new Date().toISOString().split('T')[0]

      const overviewRows = exportData.overview
        ? [
          { Metric: "Total Tournaments", Value: exportData.overview.total_tournaments },
          { Metric: "Active Tournaments", Value: exportData.overview.active_tournaments },
          { Metric: "Total Users", Value: exportData.overview.total_users },
          { Metric: "Total Schools", Value: exportData.overview.total_schools },
          { Metric: "Total Debates", Value: exportData.overview.total_debates },
        ]
        : []

      await downloadExcel([
        { name: "Overview", rows: overviewRows },
        { name: "Tournament Trends", rows: exportData.tournaments?.tournament_trends ?? [] },
        { name: "Format Distribution", rows: exportData.tournaments?.format_distribution ?? [] },
        { name: "User Growth", rows: exportData.users?.user_growth ?? [] },
        { name: "Role Distribution", rows: exportData.users?.role_distribution ?? [] },
        { name: "Revenue Trends", rows: exportData.financial?.revenue_trends ?? [] },
        { name: "Payment Methods", rows: exportData.financial?.payment_distribution ?? [] },
        { name: "Tournament Revenue", rows: exportData.financial?.tournament_revenue ?? [] },
        {
          name: "Tournament Rankings",
          rows: (exportData.performance?.tournament_rankings ?? []).map((t: { tournament_name: any; format: any; date: string | number | Date; team_rankings: string | any[]; speaker_rankings: string | any[] }) => ({
            tournament: t.tournament_name,
            format: t.format,
            date: new Date(t.date).toLocaleDateString(),
            teams_count: t.team_rankings.length,
            speakers_count: t.speaker_rankings.length,
          })),
        },
        {
          name: "Judge Consistency",
          rows: exportData.performance?.judge_performance?.consistency_scores ?? [],
        },
      ], `iRankHub-Analytics-${timestamp}.xlsx`)

      toast.success("Excel file downloaded successfully!")
    } catch (error) {
      console.error('Error exporting to Excel:', error)
      toast.error("Failed to export Excel file")
    }
  }, [exportData])

  const exportToPDF = useCallback(async () => {
    if (!exportData) {
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
      pdf.text('iRankHub Analytics Report', pageWidth / 2, yPosition, { align: 'center' })

      yPosition += 15
      pdf.setFontSize(12)
      pdf.setFont('helvetica', 'normal')
      const reportPeriod = `${dateRange?.from?.toLocaleDateString()} - ${dateRange?.to?.toLocaleDateString()}`
      pdf.text(`Report Period: ${reportPeriod}`, pageWidth / 2, yPosition, { align: 'center' })

      yPosition += 10
      pdf.text(`Generated: ${new Date().toLocaleString()}`, pageWidth / 2, yPosition, { align: 'center' })

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

      if (exportData.overview) {
        if (yPosition > pageHeight - 60) {
          pdf.addPage()
          yPosition = margin
        }

        pdf.setFontSize(16)
        pdf.setFont('helvetica', 'bold')
        pdf.text('Overview Summary', margin, yPosition)
        yPosition += 10

        pdf.setFontSize(10)
        pdf.setFont('helvetica', 'normal')

        const overviewDataItems = [
          [`Total Tournaments`, `${exportData.overview.total_tournaments}`],
          [`Active Tournaments`, `${exportData.overview.active_tournaments}`],
          [`Total Users`, `${exportData.overview.total_users}`],
          [`Total Schools`, `${exportData.overview.total_schools}`],
          [`Total Debates`, `${exportData.overview.total_debates}`],
        ]

        overviewDataItems.forEach(([label, value]) => {
          pdf.text(`${label}: ${value}`, margin, yPosition)
          yPosition += 5
        })
      }

      const timestamp = new Date().toISOString().split('T')[0]
      const filename = `iRankHub-Analytics-${timestamp}.pdf`

      pdf.save(filename)
      toast.success("PDF report downloaded successfully!")
    } catch (error) {
      console.error('Error exporting to PDF:', error)
      toast.error("Failed to export PDF report")
    }
  }, [exportData, dateRange])

  const exportToCSV = useCallback(() => {
    if (!exportData) {
      toast.error("No data available for export")
      return
    }

    try {
      let csvContent = "data:text/csv;charset=utf-8,"

      if (exportData.overview) {
        csvContent += "Overview Metrics\n"
        csvContent += "Metric,Value\n"
        csvContent += `Total Tournaments,${exportData.overview.total_tournaments}\n`
        csvContent += `Active Tournaments,${exportData.overview.active_tournaments}\n`
        csvContent += `Total Users,${exportData.overview.total_users}\n`
        csvContent += `Total Schools,${exportData.overview.total_schools}\n`
        csvContent += `Total Debates,${exportData.overview.total_debates}\n\n`
      }

      if (exportData.tournaments?.tournament_trends) {
        csvContent += "Tournament Trends\n"
        csvContent += "Date,Total,Completed,In Progress,Published\n"
        exportData.tournaments.tournament_trends.forEach((trend: any) => {
          csvContent += `${trend.date},${trend.total},${trend.completed},${trend.in_progress},${trend.published}\n`
        })
        csvContent += "\n"
      }

      if (exportData.users?.user_growth) {
        csvContent += "User Growth\n"
        csvContent += "Date,Students,Volunteers,School Admins,Admins,Total\n"
        exportData.users.user_growth.forEach((growth: any) => {
          csvContent += `${growth.date},${growth.students},${growth.volunteers},${growth.school_admins},${growth.admins},${growth.total}\n`
        })
        csvContent += "\n"
      }

      if (exportData.financial?.revenue_trends) {
        csvContent += "Revenue Trends\n"
        csvContent += "Date,Revenue,Transactions\n"
        exportData.financial.revenue_trends.forEach((revenue: any) => {
          csvContent += `${revenue.date},${revenue.revenue},${revenue.transactions}\n`
        })
        csvContent += "\n"
      }

      const encodedUri = encodeURI(csvContent)
      const link = document.createElement("a")
      link.setAttribute("href", encodedUri)
      link.setAttribute("download", `iRankHub-Analytics-${new Date().toISOString().split('T')[0]}.csv`)
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)

      toast.success("CSV file downloaded successfully!")
    } catch (error) {
      console.error('Error exporting to CSV:', error)
      toast.error("Failed to export CSV file")
    }
  }, [exportData])

  if (!token || !user || user.role !== "admin") {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <AlertTriangle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h1 className="text-xl font-semibold mb-2">Access Denied</h1>
          <p className="text-muted-foreground">Only administrators can access analytics.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <p className="text-muted-foreground">
        Comprehensive insights into platform performance and usage
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

          <div className="flex items-center gap-3 flex-wrap">
            {isSuperAdminUser && (
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
              )}

            <Button
              size="sm"
              onClick={() => setShowShareDialog(true)}
              className="gap-2 bg-background text-foreground hover:bg-muted"
            >
              <Share className="h-4 w-4" />
              Share Report
            </Button>
          </div>
        </div>

        <div className="p-6 space-y-6">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
            <TabsList className="hidden md:grid w-full grid-cols-5">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="tournaments">Tournaments</TabsTrigger>
              <TabsTrigger value="users">Users</TabsTrigger>
              <TabsTrigger value="financial">Financial</TabsTrigger>
              <TabsTrigger value="performance">Performance</TabsTrigger>
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
                  onClick={() => setActiveTab("tournaments")}
                  className={cn(
                    "flex-1 min-w-0 flex flex-col items-center gap-1 py-2 px-1 text-xs transition-colors",
                    activeTab === "tournaments"
                      ? "text-primary font-medium"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Trophy className="h-4 w-4 shrink-0" />
                  <span className="truncate text-[10px]">Tournaments</span>
                </button>

                <button
                  onClick={() => setActiveTab("users")}
                  className={cn(
                    "flex-1 min-w-0 flex flex-col items-center gap-1 py-2 px-1 text-xs transition-colors",
                    activeTab === "users"
                      ? "text-primary font-medium"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Users className="h-4 w-4 shrink-0" />
                  <span className="truncate text-[10px]">Users</span>
                </button>

                <button
                  onClick={() => setActiveTab("financial")}
                  className={cn(
                    "flex-1 min-w-0 flex flex-col items-center gap-1 py-2 px-1 text-xs transition-colors",
                    activeTab === "financial"
                      ? "text-primary font-medium"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <DollarSign className="h-4 w-4 shrink-0" />
                  <span className="truncate text-[10px]">Finance</span>
                </button>

                <button
                  onClick={() => setActiveTab("performance")}
                  className={cn(
                    "flex-1 min-w-0 flex flex-col items-center gap-1 py-2 px-1 text-xs transition-colors",
                    activeTab === "performance"
                      ? "text-primary font-medium"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <BarChart2 className="h-4 w-4 shrink-0" />
                  <span className="truncate text-[10px]">Performance</span>
                </button>
              </div>
            </div>

            <TabsContent value="overview" className="space-y-6">
              <div className="grid grid-cols-1 custom:grid-cols-2 lg:grid-cols-2 xl:grid-cols-4 gap-4">
                <StatCard
                  title="Total Tournaments"
                  value={overviewData?.total_tournaments?.toLocaleString() || "0"}
                  subtitle="All time"
                  trend={overviewData?.growth_metrics?.tournaments}
                  icon={Trophy}
                  loading={!overviewData}
                />
                <StatCard
                  title="Active Tournaments"
                  value={overviewData?.active_tournaments?.toLocaleString() || "0"}
                  subtitle="Currently running"
                  icon={Activity}
                  loading={!overviewData}
                />
                <StatCard
                  title="Total Users"
                  value={overviewData?.total_users?.toLocaleString() || "0"}
                  subtitle="Platform users"
                  trend={overviewData?.growth_metrics?.users}
                  icon={Users}
                  loading={!overviewData}
                />
                <StatCard
                  title="Total Schools"
                  value={overviewData?.total_schools?.toLocaleString() || "0"}
                  subtitle="Registered schools"
                  trend={overviewData?.growth_metrics?.schools}
                  icon={Building}
                  loading={!overviewData}
                />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <ChartCard
                  title="Total Debates"
                  description="All time debate count"
                  chartId="total-debates-chart"
                  onCopyImage={handleCopyChartImage}
                  loading={!overviewData}
                >
                  <div className="text-center py-8">
                    <div className="text-4xl font-bold text-primary">
                      {overviewData?.total_debates?.toLocaleString() || "0"}
                    </div>
                    <p className="text-sm text-muted-foreground mt-2">
                      Total debates hosted on the platform
                    </p>
                  </div>
                </ChartCard>

                <ChartCard
                  title="Platform Growth"
                  description="Growth metrics overview"
                  chartId="growth-metrics-chart"
                  onCopyImage={handleCopyChartImage}
                  loading={!overviewData}
                >
                  <div className="space-y-4 py-4">
                    <div className="grid grid-cols-3 gap-4 text-center">
                      <div>
                        <div className="text-2xl font-bold text-green-600">
                          {overviewData?.growth_metrics?.tournaments != null
                            ? `${overviewData.growth_metrics.tournaments > 0 ? '+' : ''}${overviewData.growth_metrics.tournaments.toFixed(1)}%`
                            : '0%'}
                        </div>
                        <p className="text-xs text-muted-foreground">Tournaments</p>
                      </div>
                      <div>
                        <div className="text-2xl font-bold text-blue-600">
                          {overviewData?.growth_metrics?.users != null
                           ? `${overviewData?.growth_metrics?.users > 0 ? '+' : ''}${overviewData?.growth_metrics?.users?.toFixed(1) || '0'}%`
                            : '0%'}
                        </div>
                        <p className="text-xs text-muted-foreground">Users</p>
                      </div>
                      <div>
                        <div className="text-2xl font-bold text-purple-600">
                          {overviewData?.growth_metrics?.schools != null
                            ? `${overviewData?.growth_metrics?.schools > 0 ? '+' : ''}${overviewData?.growth_metrics?.schools?.toFixed(1) || '0'}%`
                            : '0%'}
                        </div>
                        <p className="text-xs text-muted-foreground">Schools</p>
                      </div>
                    </div>
                  </div>
                </ChartCard>
              </div>
            </TabsContent>

            <TabsContent value="tournaments" className="space-y-6">
              <div className="flex items-center gap-4 mb-6">
                <Popover open={openCommand} onOpenChange={setOpenCommand}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="text-sm"
                      onClick={() => setOpenCommand(true)}
                    >
                      <span className="truncate max-w-48">
                      {selectedLeague === "all"
                        ? "All Leagues"
                        : leagues?.find(l => l._id === selectedLeague)?.name || "All Leagues"}
                      </span>
                      <ChevronDown
                        className={cn(
                          "h-4 w-4 transition-transform duration-200",
                          openCommand && "rotate-180"
                        )}
                      />
                    </Button>
                  </PopoverTrigger>

                  <PopoverContent className="w-48 p-0">
                    <Command>
                      <CommandInput
                        placeholder="Search leagues..."
                        value={search}
                        onValueChange={setSearch}
                      />
                      <CommandList>
                        <CommandEmpty>No leagues found.</CommandEmpty>

                        <CommandItem
                          key="all"
                          onSelect={() => {
                            setSelectedLeague("all");
                            setOpenCommand(false);
                          }}
                        >
                          All Leagues
                        </CommandItem>

                        {leagues?.map(league => (
                          <CommandItem
                            key={league._id}
                            onSelect={() => {
                              setSelectedLeague(league._id);
                              setOpenCommand(false);
                            }}
                          >
                            <span className="truncate max-w-48 block">{league.name}</span>
                          </CommandItem>
                        ))}
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <ChartCard
                  title="Tournament Trends"
                  description="Daily tournament creation and completion"
                  chartId="tournament-trends-chart"
                  onCopyImage={handleCopyChartImage}
                  loading={!tournamentData}
                >
                  {tournamentData?.tournament_trends && (
                    <ChartContainer config={tournamentTrendsConfig} className="min-h-[300px] w-full">
                      <AreaChart data={tournamentData.tournament_trends}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis
                          dataKey="date"
                          tickFormatter={(value) => new Date(value).toLocaleDateString()}
                        />
                        <YAxis />
                        <ChartTooltip
                          content={<ChartTooltipContent />}
                          labelFormatter={(value) => new Date(value).toLocaleDateString()}
                        />
                        <ChartLegend content={<ChartLegendContent />} />
                        <Area
                          type="monotone"
                          dataKey="total"
                          stackId="1"
                          stroke="var(--color-total)"
                          fill="var(--color-total)"
                          fillOpacity={0.6}
                        />
                        <Area
                          type="monotone"
                          dataKey="completed"
                          stackId="1"
                          stroke="var(--color-completed)"
                          fill="var(--color-completed)"
                          fillOpacity={0.6}
                        />
                        <Area
                          type="monotone"
                          dataKey="in_progress"
                          stackId="1"
                          stroke="var(--color-in_progress)"
                          fill="var(--color-in_progress)"
                          fillOpacity={0.6}
                        />
                      </AreaChart>
                    </ChartContainer>
                  )}
                </ChartCard>

                <ChartCard
                  title="Format Distribution"
                  description="Tournament formats usage"
                  chartId="format-distribution-chart"
                  onCopyImage={handleCopyChartImage}
                  loading={!tournamentData}
                >
                  {tournamentData?.format_distribution && (
                    <ChartContainer config={formatDistributionConfig} className="min-h-[300px] w-full">
                      <PieChart>
                        <Pie
                          data={tournamentData.format_distribution}
                          dataKey="count"
                          nameKey="format"
                          cx="50%"
                          cy="50%"
                          outerRadius={100}
                          label={({ format, percentage }) => `${format}: ${percentage}%`}
                        >
                          {tournamentData.format_distribution.map((entry: any, index: number) => (
                            <Cell key={`cell-${entry}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                          ))}
                        </Pie>
                        <ChartTooltip content={<ChartTooltipContent />} />
                        <ChartLegend content={<ChartLegendContent />} />
                      </PieChart>
                    </ChartContainer>
                  )}
                </ChartCard>

                <ChartCard
                  title="Virtual vs Physical"
                  description="Tournament format preference"
                  chartId="virtual-physical-chart"
                  onCopyImage={handleCopyChartImage}
                  loading={!tournamentData}
                >
                  {tournamentData?.virtual_vs_physical && (
                    <ChartContainer
                      config={{
                        virtual: { label: "Virtual", color: "hsl(var(--chart-1))" },
                        physical: { label: "Physical", color: "hsl(var(--chart-2))" }
                      }}
                      className="min-h-[300px] w-full"
                    >
                      <PieChart>
                        <Pie
                          data={[
                            { name: "Virtual", value: tournamentData.virtual_vs_physical.virtual },
                            { name: "Physical", value: tournamentData.virtual_vs_physical.physical }
                          ]}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          outerRadius={100}
                          label={({ name, value }) => `${name}: ${value}`}
                        >
                          <Cell fill="hsl(var(--chart-1))" />
                          <Cell fill="hsl(var(--chart-2))" />
                        </Pie>
                        <ChartTooltip content={<ChartTooltipContent />} />
                        <ChartLegend content={<ChartLegendContent />} />
                      </PieChart>
                    </ChartContainer>
                  )}
                </ChartCard>

                <ChartCard
                  title="Participation Metrics"
                  description="Schools and students participation"
                  chartId="participation-chart"
                  onCopyImage={handleCopyChartImage}
                  loading={!tournamentData}
                >
                  {tournamentData?.participation_metrics && (
                    <div className="space-y-6 py-4">
                      <div className="grid grid-cols-2 gap-4 text-center">
                        <div>
                          <div className="text-3xl font-bold text-primary">
                            {tournamentData.participation_metrics.schools_participated}
                          </div>
                          <p className="text-sm text-muted-foreground">Schools Participated</p>
                        </div>
                        <div>
                          <div className="text-3xl font-bold text-primary">
                            {tournamentData.participation_metrics.total_students}
                          </div>
                          <p className="text-sm text-muted-foreground">Total Students</p>
                        </div>
                      </div>

                      {tournamentData.participation_metrics.school_participation_breakdown?.length > 0 && (
                        <div className="space-y-2">
                          <h4 className="text-sm font-medium">Top Participating Schools</h4>
                          {tournamentData.participation_metrics.school_participation_breakdown.slice(0, 5).map((school: any, index: number) => (
                            <div key={index} className="flex justify-between items-center text-sm">
                              <span className="truncate">{school.school_name}</span>
                              <Badge variant="outline">{school.students_count} students</Badge>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </ChartCard>
              </div>
            </TabsContent>

            <TabsContent value="users" className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <ChartCard
                  title="User Growth"
                  description="Daily user registration trends"
                  chartId="user-growth-chart"
                  onCopyImage={handleCopyChartImage}
                  loading={!userData}
                >
                  {userData?.user_growth && (
                    <ChartContainer config={userGrowthConfig} className="min-h-[300px] w-full">
                      <AreaChart data={userData.user_growth}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis
                          dataKey="date"
                          tickFormatter={(value) => new Date(value).toLocaleDateString()}
                        />
                        <YAxis />
                        <ChartTooltip
                          content={<ChartTooltipContent />}
                          labelFormatter={(value) => new Date(value).toLocaleDateString()}
                        />
                        <ChartLegend content={<ChartLegendContent />} />
                        <Area
                          type="monotone"
                          dataKey="students"
                          stackId="1"
                          stroke="var(--color-students)"
                          fill="var(--color-students)"
                          fillOpacity={0.6}
                        />
                        <Area
                          type="monotone"
                          dataKey="volunteers"
                          stackId="1"
                          stroke="var(--color-volunteers)"
                          fill="var(--color-volunteers)"
                          fillOpacity={0.6}
                        />
                        <Area
                          type="monotone"
                          dataKey="school_admins"
                          stackId="1"
                          stroke="var(--color-school_admins)"
                          fill="var(--color-school_admins)"
                          fillOpacity={0.6}
                        />
                        <Area
                          type="monotone"
                          dataKey="admins"
                          stackId="1"
                          stroke="var(--color-admins)"
                          fill="var(--color-admins)"
                          fillOpacity={0.6}
                        />
                      </AreaChart>
                    </ChartContainer>
                  )}
                </ChartCard>

                <ChartCard
                  title="Role Distribution"
                  description="User distribution by role"
                  chartId="role-distribution-chart"
                  onCopyImage={handleCopyChartImage}
                  loading={!userData}
                >
                  {userData?.role_distribution && (
                    <ChartContainer
                      config={userData.role_distribution.reduce((acc: ChartConfig, role: any, index: number) => {
                        acc[role.role] = {
                          label: role.role.replace('_', ' '),
                          color: CHART_COLORS[index % CHART_COLORS.length]
                        }
                        return acc
                      }, {})}
                      className="min-h-[300px] w-full"
                    >
                      <PieChart>
                        <Pie
                          data={userData.role_distribution}
                          dataKey="count"
                          nameKey="role"
                          cx="50%"
                          cy="50%"
                          outerRadius={100}
                          label={({ role, percentage }) => `${role.replace('_', ' ')}: ${percentage}%`}
                        >
                          {userData.role_distribution.map((item: any, index: number) => (
                            <Cell key={`cell-${item}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                          ))}
                        </Pie>
                        <ChartTooltip content={<ChartTooltipContent />} />
                        <ChartLegend content={<ChartLegendContent />} />
                      </PieChart>
                    </ChartContainer>
                  )}
                </ChartCard>

                <ChartCard
                  title="Engagement Metrics"
                  description="User activity and participation"
                  chartId="engagement-chart"
                  onCopyImage={handleCopyChartImage}
                  loading={!userData}
                >
                  {userData?.engagement_metrics && (
                    <div className="space-y-6 py-4">
                      <div className="text-center">
                        <div className="text-3xl font-bold text-primary">
                          {userData.engagement_metrics.active_users?.toLocaleString() || '0'}
                        </div>
                        <p className="text-sm text-muted-foreground">Active Users (Last 30 days)</p>
                      </div>

                      {userData.engagement_metrics.tournament_participation?.length > 0 && (
                        <div className="space-y-3">
                          <h4 className="text-sm font-medium">Tournament Participation by Role</h4>
                          {userData.engagement_metrics.tournament_participation.map((item: any, index: number) => (
                            <div key={index} className="flex justify-between items-center">
                              <span className="text-sm capitalize">{item.role.replace('_', ' ')}</span>
                              <Badge variant="outline">{item.participation_rate}%</Badge>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </ChartCard>

                <ChartCard
                  title="Login Activity"
                  description="User login frequency"
                  chartId="login-activity-chart"
                  onCopyImage={handleCopyChartImage}
                  loading={!userData}
                >
                  {userData?.engagement_metrics?.login_frequency && (
                    <ChartContainer
                      config={{
                        logins: { label: "Logins", color: "hsl(var(--chart-1))" }
                      }}
                      className="min-h-[300px] w-full"
                    >
                      <BarChart data={userData.engagement_metrics.login_frequency}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="period" />
                        <YAxis />
                        <ChartTooltip content={<ChartTooltipContent />} />
                        <Bar dataKey="logins" fill="var(--color-logins)" />
                      </BarChart>
                    </ChartContainer>
                  )}
                </ChartCard>
              </div>
            </TabsContent>

            <TabsContent value="financial" className="space-y-6">
              <div className="flex items-center gap-4 mb-6">
                <Select value={selectedCurrency} onValueChange={(value: any) => setSelectedCurrency(value)}>
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="RWF">RWF</SelectItem>
                    <SelectItem value="USD">USD</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <ChartCard
                  title="Revenue Trends"
                  description="Daily revenue and transaction volume"
                  chartId="revenue-trends-chart"
                  onCopyImage={handleCopyChartImage}
                  loading={!financialData}
                >
                  {financialData?.revenue_trends && (
                    <ChartContainer config={revenueConfig} className="min-h-[300px] w-full">
                      <AreaChart data={financialData.revenue_trends}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis
                          dataKey="date"
                          tickFormatter={(value) => new Date(value).toLocaleDateString()}
                        />
                        <YAxis />
                        <ChartTooltip
                          content={<ChartTooltipContent />}
                          labelFormatter={(value) => new Date(value).toLocaleDateString()}
                        />
                        <ChartLegend content={<ChartLegendContent />} />
                        <Area
                          type="monotone"
                          dataKey="revenue"
                          stroke="var(--color-revenue)"
                          fill="var(--color-revenue)"
                          fillOpacity={0.6}
                        />
                      </AreaChart>
                    </ChartContainer>
                  )}
                </ChartCard>

                <ChartCard
                  title="Payment Methods"
                  description="Payment method distribution"
                  chartId="payment-methods-chart"
                  onCopyImage={handleCopyChartImage}
                  loading={!financialData}
                >
                  {financialData?.payment_distribution && (
                    <ChartContainer
                      config={financialData.payment_distribution.reduce((acc: ChartConfig, method: any, index: number) => {
                        acc[method.method] = {
                          label: method.method,
                          color: CHART_COLORS[index % CHART_COLORS.length]
                        }
                        return acc
                      }, {})}
                      className="min-h-[300px] w-full"
                    >
                      <PieChart>
                        <Pie
                          data={financialData.payment_distribution}
                          dataKey="amount"
                          nameKey="method"
                          cx="50%"
                          cy="50%"
                          outerRadius={100}
                          label={({ method, percentage }) => `${method}: ${percentage}%`}
                        >
                          {financialData.payment_distribution.map((item: any, index: number) => (
                            <Cell key={`cell-${item}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                          ))}
                        </Pie>
                        <ChartTooltip content={<ChartTooltipContent />} />
                        <ChartLegend content={<ChartLegendContent />} />
                      </PieChart>
                    </ChartContainer>
                  )}
                </ChartCard>

                <ChartCard
                  title="Tournament Revenue"
                  description="Revenue by tournament"
                  chartId="tournament-revenue-chart"
                  onCopyImage={handleCopyChartImage}
                  loading={!financialData}
                >
                  {financialData?.tournament_revenue && (
                    <ChartContainer
                      config={{
                        revenue: { label: "Revenue", color: "hsl(var(--chart-1))" }
                      }}
                      className="min-h-[300px] w-full"
                    >
                      <BarChart data={financialData.tournament_revenue.slice(0, 10)}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis
                          dataKey="tournament_name"
                          angle={-45}
                          textAnchor="end"
                          height={100}
                        />
                        <YAxis />
                        <ChartTooltip content={<ChartTooltipContent />} />
                        <Bar dataKey="revenue" fill="var(--color-revenue)" />
                      </BarChart>
                    </ChartContainer>
                  )}
                </ChartCard>

                <ChartCard
                  title="Regional Revenue"
                  description="Revenue distribution by country"
                  chartId="regional-revenue-chart"
                  onCopyImage={handleCopyChartImage}
                  loading={!financialData}
                >
                  {financialData?.regional_revenue && (
                    <ChartContainer
                      config={{
                        revenue: { label: "Revenue", color: "hsl(var(--chart-1))" }
                      }}
                      className="min-h-[300px] w-full"
                    >
                      <BarChart data={financialData.regional_revenue}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="country" />
                        <YAxis />
                        <ChartTooltip content={<ChartTooltipContent />} />
                        <Bar dataKey="revenue" fill="var(--color-revenue)" />
                      </BarChart>
                    </ChartContainer>
                  )}
                </ChartCard>
              </div>

              {financialData && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">Outstanding Payments</CardTitle>
                      <CardDescription>Pending payment analysis</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        <div className="text-center">
                          <div className="text-2xl font-bold text-orange-600">
                            {financialData.outstanding_payments?.total_amount?.toLocaleString() || 0} {selectedCurrency}
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {financialData.outstanding_payments?.count || 0} pending payments
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">Waiver Usage</CardTitle>
                      <CardDescription>Fee waivers granted</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        <div className="text-center">
                          <div className="text-2xl font-bold text-blue-600">
                            {financialData.waiver_usage?.total_waivers || 0}
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {financialData.waiver_usage?.total_amount_waived?.toLocaleString() || 0} {selectedCurrency} waived
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">Payment Summary</CardTitle>
                      <CardDescription>Financial overview</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        <div className="flex justify-between">
                          <span className="text-sm text-muted-foreground">Total Revenue</span>
                          <span className="text-sm font-medium">
                            {financialData.revenue_trends?.reduce((sum: number, day: any) => sum + day.revenue, 0)?.toLocaleString() || 0} {selectedCurrency}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm text-muted-foreground">Total Transactions</span>
                          <span className="text-sm font-medium">
                            {financialData.revenue_trends?.reduce((sum: number, day: any) => sum + day.transactions, 0)?.toLocaleString() || 0}
                          </span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}
            </TabsContent>

            <TabsContent value="performance" className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <ChartCard
                  title="Top Schools Performance"
                  description="Cross-tournament school rankings"
                  chartId="top-schools-chart"
                  onCopyImage={handleCopyChartImage}
                  loading={!performanceData}
                >
                  {performanceData?.cross_tournament_rankings?.top_schools && (
                    <div className="space-y-3">
                      {performanceData.cross_tournament_rankings.top_schools.slice(0, 10).map((school: any, index: number) => (
                        <div key={index} className="flex justify-between items-center p-3 border rounded">
                          <div>
                            <p className="font-medium">{school.school_name}</p>
                            <p className="text-xs text-muted-foreground">
                              {school.tournaments_participated} tournaments • Avg rank: {school.average_rank}
                            </p>
                          </div>
                          <div className="text-right">
                            <Badge variant="outline">#{index + 1}</Badge>
                            <p className="text-xs text-muted-foreground mt-1">
                              {school.consistency_score.toFixed(1)}% consistency
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </ChartCard>

                <ChartCard
                  title="Top Speakers Performance"
                  description="Cross-tournament speaker rankings"
                  chartId="top-speakers-chart"
                  onCopyImage={handleCopyChartImage}
                  loading={!performanceData}
                >
                  {performanceData?.cross_tournament_rankings?.top_speakers && (
                    <div className="space-y-3">
                      {performanceData.cross_tournament_rankings.top_speakers.slice(0, 10).map((speaker: any, index: number) => (
                        <div key={index} className="flex justify-between items-center p-3 border rounded">
                          <div>
                            <p className="font-medium">{speaker.speaker_name}</p>
                            <p className="text-xs text-muted-foreground">
                              {speaker.school_name} • {speaker.tournaments_participated} tournaments
                            </p>
                          </div>
                          <div className="text-right">
                            <Badge variant="outline">#{index + 1}</Badge>
                            <p className="text-xs text-muted-foreground mt-1">
                              Best: #{speaker.best_rank} • Avg: {speaker.average_rank}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </ChartCard>

                <ChartCard
                  title="Judge Consistency"
                  description="Top performing judges"
                  chartId="judge-consistency-chart"
                  onCopyImage={handleCopyChartImage}
                  loading={!performanceData}
                >
                  {performanceData?.judge_performance?.consistency_scores && (
                    <div className="space-y-3">
                      {performanceData.judge_performance.consistency_scores.slice(0, 10).map((judge: any, index: number) => (
                        <div key={index} className="flex justify-between items-center p-3 border rounded">
                          <div>
                            <p className="font-medium">{judge.judge_name}</p>
                            <p className="text-xs text-muted-foreground">
                              {judge.debates_judged} debates • {judge.tournaments_participated} tournaments
                            </p>
                          </div>
                          <div className="text-right">
                            <Badge variant="outline">{judge.consistency.toFixed(1)}%</Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </ChartCard>

                <ChartCard
                  title="Judge Feedback Quality"
                  description="Judge performance based on feedback"
                  chartId="judge-feedback-chart"
                  onCopyImage={handleCopyChartImage}
                  loading={!performanceData}
                >
                  {performanceData?.judge_performance?.feedback_quality && (
                    <div className="space-y-3">
                      {performanceData.judge_performance.feedback_quality.slice(0, 10).map((judge: any, index: number) => (
                        <div key={index} className="flex justify-between items-center p-3 border rounded">
                          <div>
                            <p className="font-medium">{judge.judge_name}</p>
                            <p className="text-xs text-muted-foreground">
                              {judge.total_feedback_received} reviews • {judge.response_time_avg}h avg response
                            </p>
                          </div>
                          <div className="text-right">
                            <Badge variant="outline">{judge.avg_feedback_score.toFixed(1)}/5</Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </ChartCard>
              </div>

              {performanceData?.tournament_rankings && (
                <ChartCard
                  title="Recent Tournament Results"
                  description="Latest tournament rankings and outcomes"
                  chartId="recent-tournaments-chart"
                  onCopyImage={handleCopyChartImage}
                  loading={!performanceData}
                >
                  <div className="space-y-4">
                    {performanceData.tournament_rankings.slice(0, 5).map((tournament: any, index: number) => (
                      <div key={index} className="border rounded p-4">
                        <div className="flex justify-between items-start mb-3">
                          <div>
                            <h4 className="font-medium">{tournament.tournament_name}</h4>
                            <p className="text-sm text-muted-foreground">
                              {tournament.format} • {new Date(tournament.date).toLocaleDateString()}
                            </p>
                          </div>
                          <div className="text-right text-sm">
                            <span>{tournament.team_rankings.length} teams</span>
                            <br />
                            <span className="text-muted-foreground">{tournament.speaker_rankings.length} speakers</span>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <h5 className="text-sm font-medium mb-2">Top Teams</h5>
                            <div className="space-y-1">
                              {tournament.team_rankings.slice(0, 3).map((team: any, teamIndex: number) => (
                                <div key={teamIndex} className="flex justify-between text-xs">
                                  <span>#{team.rank} {team.team_name}</span>
                                  <span>{team.wins}W {team.total_points}pts</span>
                                </div>
                              ))}
                            </div>
                          </div>

                          <div>
                            <h5 className="text-sm font-medium mb-2">Top Speakers</h5>
                            <div className="space-y-1">
                              {tournament.speaker_rankings.slice(0, 3).map((speaker: any, speakerIndex: number) => (
                                <div key={speakerIndex} className="flex justify-between text-xs">
                                  <span>#{speaker.rank} {speaker.speaker_name}</span>
                                  <span>{speaker.total_points}pts</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </ChartCard>
              )}

              {performanceData?.cross_tournament_rankings?.top_teams && (
                <ChartCard
                  title="Top Team Combinations"
                  description="Most successful team partnerships"
                  chartId="top-teams-chart"
                  onCopyImage={handleCopyChartImage}
                  loading={!performanceData}
                >
                  <div className="space-y-3">
                    {performanceData.cross_tournament_rankings.top_teams.slice(0, 10).map((team: any, index: number) => (
                      <div key={index} className="flex justify-between items-center p-3 border rounded">
                        <div>
                          <p className="font-medium">{team.team_composition}</p>
                          <p className="text-xs text-muted-foreground">
                            {team.school_name} • {team.tournaments_together} tournaments together
                          </p>
                        </div>
                        <div className="text-right">
                          <Badge variant="outline">{team.win_rate}% wins</Badge>
                          <p className="text-xs text-muted-foreground mt-1">
                            {team.combined_points} total points
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </ChartCard>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </Card>

      <ShareReportDialog
        open={showShareDialog}
        onOpenChange={setShowShareDialog}
        selectedSections={activeSections}
        selectedDateRange={dateRange}
        selectedFilters={currentFilters}
      />
    </div>
  )
}