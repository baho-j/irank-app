"use client"

import React, { useMemo, useEffect, Suspense, useState, useRef } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useQuery, useMutation } from "convex/react"
import { api } from "@/convex/_generated/api"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Separator } from "@/components/ui/separator"
import { Alert, AlertDescription } from "@/components/ui/alert"
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
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import {
  TrendingUp,
  TrendingDown,
  Users,
  Trophy,
  BarChart3,
  Activity,
  Building,
  AlertTriangle,
  Eye,
  Clock,
  ExternalLink,
  Share2
} from "lucide-react"
import AppLoader from "@/components/app-loader";

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
                     loading = false
                   }: {
  title: string
  description?: string
  children: React.ReactNode
  loading?: boolean
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>
        {loading ? <ChartSkeleton /> : children}
      </CardContent>
    </Card>
  )
}

function AccessInfoBanner({ accessInfo }: { accessInfo: any }) {
  return (
    <Alert className="mb-6">
      <div className="flex items-center justify-between md:justify-start gap-2">
        <Eye className="h-4 w-4 hidden md:block" />
        <AlertDescription className="flex flex-col md:flex-row items-center justify-between w-full">
          <div className="flex flex-col md:flex-row items-center justify-between w-full">
            <div className="flex flex-col md:flex-row items-center gap-4">
              <span>This is a shared analytics report</span>
              {accessInfo.views_remaining && (
                <>
                  <Badge variant="default">
            <span className="text-xs text-muted-foreground">
              {accessInfo.views_remaining} views remaining
            </span>
                  </Badge>
                </>
              )}
              {accessInfo.expires_at && (
                <>
                  <Badge variant="outline">
            <span className="text-xs text-muted-foreground">
              Expires: {new Date(accessInfo.expires_at).toLocaleDateString()}
            </span>
                  </Badge>
                </>
              )}
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                navigator.clipboard.writeText(window.location.href)
                toast.success("Report link copied to clipboard!")
              }}
            >
              <Share2 className="h-4 w-4 mr-2" />
              Share
            </Button>
          </div>
        </AlertDescription>
      </div>
    </Alert>
  )
}

function ErrorDisplay({ error }: { error: string }) {
  const router = useRouter();
  const getErrorDetails = (errorMessage: string) => {
    if (errorMessage.includes("Maximum views exceeded")) {
      return {
        title: "Maximum Views Reached",
        description: "This report has reached its maximum view limit. Please contact the report owner for a new link.",
        icon: Eye,
      }
    }

    if (errorMessage.includes("expired") || errorMessage.includes("Report access has expired")) {
      return {
        title: "Report Expired",
        description: "This report link has expired. Please request a new report link from the owner.",
        icon: Clock,
      }
    }

    if (errorMessage.includes("Invalid access token")) {
      return {
        title: "Invalid Report Link",
        description: "This report link is invalid or malformed. Please check the URL and try again.",
        icon: AlertTriangle,
      }
    }

    return {
      title: "Unable to Load Report",
      description: "There was an error loading this report. Please try again or contact support if the issue persists.",
      icon: AlertTriangle,
    }
  }

  const { title, description, icon: Icon } = getErrorDetails(error)

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="text-center max-w-md">
        <Icon className="h-8 w-8 text-muted-foreground mx-auto mb-4" />
        <h1 className="text-lg font-semibold mb-2">{title}</h1>
        <p className="text-muted-foreground text-xs mb-4">{description}</p>
        <div className="flex gap-2 justify-center">
          <Button variant="outline" onClick={() => router.push('/')}>
            Go Back
          </Button>
        </div>
      </div>
    </div>
  )
}

function PublicReports() {
  const params = useParams()
  const searchParams = useSearchParams()
  const token = params.token as string
  const viewIncrementedRef = useRef(false)

  const sections = useMemo(() => {
    const sectionsParam = searchParams.get('sections')
    return sectionsParam ? sectionsParam.split(',') : []
  }, [searchParams])

  const reportData = useQuery(
    api.functions.analytics.getSharedReportData,
    token ? { access_token: token } : "skip"
  )

  // Derived from the query rather than mirrored into state by an effect.
  const reportError =
    reportData && !reportData.success
      ? reportData.error || "Unknown error occurred"
      : null

  const incrementViewCount = useMutation(api.functions.admin.analytics.incrementViewCount)

  useEffect(() => {
    if (token && reportData?.success && !viewIncrementedRef.current) {
      viewIncrementedRef.current = true
      incrementViewCount({ access_token: token }).catch((error) => {
        console.error("Failed to increment view count:", error)
      })
    }
  }, [token, reportData, incrementViewCount])

  const tournamentTrendsConfig = {
    total: { label: "Total", color: "hsl(var(--chart-1))" },
    completed: { label: "Completed", color: "hsl(var(--chart-2))" },
    in_progress: { label: "In Progress", color: "hsl(var(--chart-3))" },
    published: { label: "Published", color: "hsl(var(--chart-4))" },
  } satisfies ChartConfig

  const formatDistributionConfig = useMemo(() => {
    const config: ChartConfig = {}
    reportData?.sections?.tournaments?.format_distribution?.forEach((item: any, index: number) => {
      config[item.format] = {
        label: item.format,
        color: CHART_COLORS[index % CHART_COLORS.length],
      }
    })
    return config
  }, [reportData?.sections?.tournaments?.format_distribution])

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


  if (!token) {
    return <ErrorDisplay error="Invalid access token" />
  }

  if (reportError) {
    return <ErrorDisplay error={reportError} />
  }

  if (!reportData) {
    return <AppLoader />
  }

  if (!reportData.success) {
    return <ErrorDisplay error={reportData.error || "Unknown error"} />
  }

  if (!reportData.title) {
    return <ErrorDisplay error="Report not found" />
  }

  const { overview, tournaments, users, financial, performance } = reportData.sections || {}

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b bg-card">
        <div className="container mx-auto px-6 py-8">
          <div className="flex flex-col md:flex-row items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-primary">{reportData.title}</h1>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="gap-1">
                <BarChart3 className="h-3 w-3" />
                Analytics Report
              </Badge>
              <Badge variant="outline" className="gap-1">
                <Clock className="h-3 w-3" />
                {reportData.generated_at ? new Date(reportData.generated_at).toLocaleTimeString() : "N/A"}
              </Badge>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-6 py-8 space-y-8">
        <AccessInfoBanner accessInfo={reportData.access_info} />

        {(sections.length === 0 || sections.includes('overview')) && overview && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-bold mb-2">Overview</h2>
              <Separator />
            </div>

            <div className="grid grid-cols-1 custom:grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard
                title="Total Tournaments"
                value={overview.total_tournaments?.toLocaleString() || "0"}
                subtitle="All time"
                trend={overview.growth_metrics?.tournaments}
                icon={Trophy}
              />
              <StatCard
                title="Active Tournaments"
                value={overview.active_tournaments?.toLocaleString() || "0"}
                subtitle="Currently running"
                icon={Activity}
              />
              <StatCard
                title="Total Users"
                value={overview.total_users?.toLocaleString() || "0"}
                subtitle="Platform users"
                trend={overview.growth_metrics?.users}
                icon={Users}
              />
              <StatCard
                title="Total Schools"
                value={overview.total_schools?.toLocaleString() || "0"}
                subtitle="Registered schools"
                trend={overview.growth_metrics?.schools}
                icon={Building}
              />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <ChartCard
                title="Total Debates"
                description="All time debate count"
              >
                <div className="text-center py-8">
                  <div className="text-4xl font-bold text-primary">
                    {overview.total_debates?.toLocaleString() || "0"}
                  </div>
                  <p className="text-sm text-muted-foreground mt-2">
                    Total debates hosted on the platform
                  </p>
                </div>
              </ChartCard>

              <ChartCard
                title="Platform Growth"
                description="Growth metrics overview"
              >
                <div className="space-y-4 py-4">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-center">
                    <div>
                      <div className="text-2xl font-bold text-green-600">
                        {overview.growth_metrics?.tournaments > 0 ? '+' : ''}{overview.growth_metrics?.tournaments?.toFixed(1) || '0'}%
                      </div>
                      <p className="text-xs text-muted-foreground">Tournaments</p>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-blue-600">
                        {overview.growth_metrics?.users > 0 ? '+' : ''}{overview.growth_metrics?.users?.toFixed(1) || '0'}%
                      </div>
                      <p className="text-xs text-muted-foreground">Users</p>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-purple-600">
                        {overview.growth_metrics?.schools > 0 ? '+' : ''}{overview.growth_metrics?.schools?.toFixed(1) || '0'}%
                      </div>
                      <p className="text-xs text-muted-foreground">Schools</p>
                    </div>
                  </div>
                </div>
              </ChartCard>
            </div>
          </div>
        )}

        {(sections.length === 0 || sections.includes('tournaments')) && tournaments && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-bold mb-2">Tournament Analytics</h2>
              <Separator />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {tournaments.tournament_trends && (
                <ChartCard
                  title="Tournament Trends"
                  description="Daily tournament creation and completion"
                >
                  <ChartContainer config={tournamentTrendsConfig} className="min-h-[300px] w-full">
                    <AreaChart data={tournaments.tournament_trends}>
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
                </ChartCard>
              )}

              {tournaments.format_distribution && (
                <ChartCard
                  title="Format Distribution"
                  description="Tournament formats usage"
                >
                  <ChartContainer config={formatDistributionConfig} className="min-h-[300px] w-full">
                    <PieChart>
                      <Pie
                        data={tournaments.format_distribution}
                        dataKey="count"
                        nameKey="format"
                        cx="50%"
                        cy="50%"
                        outerRadius={100}
                        label={({ format, percentage }) => `${format}: ${percentage}%`}
                      >
                        {tournaments.format_distribution.map((item: any, index: number) => (
                          <Cell key={`cell-${item}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <ChartLegend content={<ChartLegendContent />} />
                    </PieChart>
                  </ChartContainer>
                </ChartCard>
              )}

              {tournaments.virtual_vs_physical && (
                <ChartCard
                  title="Virtual vs Physical"
                  description="Tournament format preference"
                >
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
                          { name: "Virtual", value: tournaments.virtual_vs_physical.virtual },
                          { name: "Physical", value: tournaments.virtual_vs_physical.physical }
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
                </ChartCard>
              )}

              {tournaments.participation_metrics && (
                <ChartCard
                  title="Participation Metrics"
                  description="Schools and students participation"
                >
                  <div className="space-y-6 py-4">
                    <div className="grid grid-cols-2 gap-4 text-center">
                      <div>
                        <div className="text-3xl font-bold text-primary">
                          {tournaments.participation_metrics.schools_participated}
                        </div>
                        <p className="text-sm text-muted-foreground">Schools Participated</p>
                      </div>
                      <div>
                        <div className="text-3xl font-bold text-primary">
                          {tournaments.participation_metrics.total_students}
                        </div>
                        <p className="text-sm text-muted-foreground">Total Students</p>
                      </div>
                    </div>

                    {tournaments.participation_metrics.school_participation_breakdown?.length > 0 && (
                      <div className="space-y-2">
                        <h4 className="text-sm font-medium">Top Participating Schools</h4>
                        {tournaments.participation_metrics.school_participation_breakdown.slice(0, 5).map((school: any, index: number) => (
                          <div key={index} className="flex justify-between items-center text-sm">
                            <span className="truncate">{school.school_name}</span>
                            <Badge variant="outline">{school.students_count} students</Badge>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </ChartCard>
              )}
            </div>
          </div>
        )}

        {(sections.length === 0 || sections.includes('users')) && users && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-bold mb-2">User Analytics</h2>
              <Separator />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {users.user_growth && (
                <ChartCard
                  title="User Growth"
                  description="Daily user registration trends"
                >
                  <ChartContainer config={userGrowthConfig} className="min-h-[300px] w-full">
                    <AreaChart data={users.user_growth}>
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
                </ChartCard>
              )}

              {users.role_distribution && (
                <ChartCard
                  title="Role Distribution"
                  description="User distribution by role"
                >
                  <ChartContainer
                    config={users.role_distribution.reduce((acc: ChartConfig, role: any, index: number) => {
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
                        data={users.role_distribution}
                        dataKey="count"
                        nameKey="role"
                        cx="50%"
                        cy="50%"
                        outerRadius={100}
                        label={({ role, percentage }) => `${role.replace('_', ' ')}: ${percentage}%`}
                      >
                        {users.role_distribution.map((item: any, index: number) => (
                          <Cell key={`cell-${item}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <ChartLegend content={<ChartLegendContent />} />
                    </PieChart>
                  </ChartContainer>
                </ChartCard>
              )}

              {users.engagement_metrics && (
                <ChartCard
                  title="Engagement Metrics"
                  description="User activity and participation"
                >
                  <div className="space-y-6 py-4">
                    <div className="text-center">
                      <div className="text-3xl font-bold text-primary">
                        {users.engagement_metrics.active_users?.toLocaleString() || '0'}
                      </div>
                      <p className="text-sm text-muted-foreground">Active Users (Last 30 days)</p>
                    </div>

                    {users.engagement_metrics.tournament_participation?.length > 0 && (
                      <div className="space-y-3">
                        <h4 className="text-sm font-medium">Tournament Participation by Role</h4>
                        {users.engagement_metrics.tournament_participation.map((item: any, index: number) => (
                          <div key={index} className="flex justify-between items-center">
                            <span className="text-sm capitalize">{item.role.replace('_', ' ')}</span>
                            <Badge variant="outline">{item.participation_rate}%</Badge>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </ChartCard>
              )}

              {users.engagement_metrics?.login_frequency && (
                <ChartCard
                  title="Login Activity"
                  description="User login frequency"
                >
                  <ChartContainer
                    config={{
                      logins: { label: "Logins", color: "hsl(var(--chart-1))" }
                    }}
                    className="min-h-[300px] w-full"
                  >
                    <BarChart data={users.engagement_metrics.login_frequency}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="period" />
                      <YAxis />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Bar dataKey="logins" fill="var(--color-logins)" />
                    </BarChart>
                  </ChartContainer>
                </ChartCard>
              )}
            </div>
          </div>
        )}

        {(sections.length === 0 || sections.includes('financial')) && financial && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-bold mb-2">Financial Analytics</h2>
              <Separator />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {financial.revenue_trends && (
                <ChartCard
                  title="Revenue Trends"
                  description="Daily revenue and transaction volume"
                >
                  <ChartContainer config={revenueConfig} className="min-h-[300px] w-full">
                    <AreaChart data={financial.revenue_trends}>
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
                </ChartCard>
              )}

              {financial.payment_distribution && (
                <ChartCard
                  title="Payment Methods"
                  description="Payment method distribution"
                >
                  <ChartContainer
                    config={financial.payment_distribution.reduce((acc: ChartConfig, method: any, index: number) => {
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
                        data={financial.payment_distribution}
                        dataKey="amount"
                        nameKey="method"
                        cx="50%"
                        cy="50%"
                        outerRadius={100}
                        label={({ method, percentage }) => `${method}: ${percentage}%`}
                      >
                        {financial.payment_distribution.map((item: any, index: number) => (
                          <Cell key={`cell-${item}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <ChartLegend content={<ChartLegendContent />} />
                    </PieChart>
                  </ChartContainer>
                </ChartCard>
              )}

              {financial.tournament_revenue && (
                <ChartCard
                  title="Tournament Revenue"
                  description="Revenue by tournament"
                >
                  <ChartContainer
                    config={{
                      revenue: { label: "Revenue", color: "hsl(var(--chart-1))" }
                    }}
                    className="min-h-[300px] w-full"
                  >
                    <BarChart data={financial.tournament_revenue.slice(0, 10)}>
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
                </ChartCard>
              )}

              {financial.regional_revenue && (
                <ChartCard
                  title="Regional Revenue"
                  description="Revenue distribution by country"
                >
                  <ChartContainer
                    config={{
                      revenue: { label: "Revenue", color: "hsl(var(--chart-1))" }
                    }}
                    className="min-h-[300px] w-full"
                  >
                    <BarChart data={financial.regional_revenue}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="country" />
                      <YAxis />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Bar dataKey="revenue" fill="var(--color-revenue)" />
                    </BarChart>
                  </ChartContainer>
                </ChartCard>
              )}
            </div>

            {financial && (
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
                          {financial.outstanding_payments?.total_amount?.toLocaleString() || 0}
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {financial.outstanding_payments?.count || 0} pending payments
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
                          {financial.waiver_usage?.total_waivers || 0}
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {financial.waiver_usage?.total_amount_waived?.toLocaleString() || 0} waived
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
                          {financial.revenue_trends?.reduce((sum: number, day: any) => sum + day.revenue, 0)?.toLocaleString() || 0}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-muted-foreground">Total Transactions</span>
                        <span className="text-sm font-medium">
                          {financial.revenue_trends?.reduce((sum: number, day: any) => sum + day.transactions, 0)?.toLocaleString() || 0}
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </div>
        )}

        {(sections.length === 0 || sections.includes('performance')) && performance && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-bold mb-2">Performance Analytics</h2>
              <Separator />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {performance.cross_tournament_rankings?.top_schools && (
                <ChartCard
                  title="Top Schools Performance"
                  description="Cross-tournament school rankings"
                >
                  <div className="space-y-3">
                    {performance.cross_tournament_rankings.top_schools.slice(0, 10).map((school: any, index: number) => (
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
                </ChartCard>
              )}

              {performance.cross_tournament_rankings?.top_speakers && (
                <ChartCard
                  title="Top Speakers Performance"
                  description="Cross-tournament speaker rankings"
                >
                  <div className="space-y-3">
                    {performance.cross_tournament_rankings.top_speakers.slice(0, 10).map((speaker: any, index: number) => (
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
                </ChartCard>
              )}

              {performance.judge_performance?.consistency_scores && (
                <ChartCard
                  title="Judge Consistency"
                  description="Top performing judges"
                >
                  <div className="space-y-3">
                    {performance.judge_performance.consistency_scores.slice(0, 10).map((judge: any, index: number) => (
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
                </ChartCard>
              )}

              {performance.judge_performance?.feedback_quality && (
                <ChartCard
                  title="Judge Feedback Quality"
                  description="Judge performance based on feedback"
                >
                  <div className="space-y-3">
                    {performance.judge_performance.feedback_quality.slice(0, 10).map((judge: any, index: number) => (
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
                </ChartCard>
              )}
            </div>

            {performance.tournament_rankings && (
              <ChartCard
                title="Recent Tournament Results"
                description="Latest tournament rankings and outcomes"
              >
                <div className="space-y-4">
                  {performance.tournament_rankings.slice(0, 5).map((tournament: any, index: number) => (
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

            {performance.cross_tournament_rankings?.top_teams && (
              <ChartCard
                title="Top Team Combinations"
                description="Most successful team partnerships"
              >
                <div className="space-y-3">
                  {performance.cross_tournament_rankings.top_teams.slice(0, 10).map((team: any, index: number) => (
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
          </div>
        )}

        <div className="mt-12 pt-8 border-t">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <BarChart3 className="h-4 w-4" />
              <span>iRankHub Analytics — a product by iDebate Rwanda</span>
            </div>
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <span>Generated: {reportData.generated_at ? new Date(reportData.generated_at).toLocaleDateString() : "N/A"}</span>
              <Button
                variant="ghost"
                size="sm"
                className="gap-2"
                onClick={() => window.open('https://debaterwanda.org', '_blank')}
              >
                <ExternalLink className="h-3 w-3" />
                Visit iDebate Rwanda
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function PublicReportsPage() {
  return (
    <Suspense fallback={<AppLoader />}>
      <PublicReports />
    </Suspense>
  )
}