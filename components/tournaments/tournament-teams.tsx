"use client"

import React, { useState, useEffect, useMemo } from "react"
import { useQuery, useMutation } from "convex/react"
import { api } from "@/convex/_generated/api"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Checkbox } from "@/components/ui/checkbox"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Users,
  UserPlus,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Ban,
  XCircle,
  Clock,
  School,
  Share,
  CreditCard,
  CircleDollarSign,
  AlertTriangle,
  LogOut,
  QrCode,
  Ticket,
  CircleCheck,
  PencilLine,
  FileSpreadsheet, FileText, Download,
  Loader2
} from "lucide-react";
import { downloadExcel } from "@/lib/export/excel";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { useDebounce } from "@/hooks/use-debounce"
import { DataToolbar } from "@/components/shared/data-toolbar"
import { MultiSelectFilter } from "@/components/ui/multi-select-filter"
import { toast } from "sonner"
import { Id } from "@/convex/_generated/dataModel"
import { CardLayoutWithToolbar } from "@/components/shared/card-layout-with-toolbar"
import { formatDistanceToNow } from "date-fns"
import { TeamManagementDialog } from "@/components/tournaments/team-management-dialog"
import { JoinTeamDialog } from "@/components/tournaments/join-team-dialog"
import { ShareTeamDialog } from "@/components/tournaments/share-team-dialog"
import { WaiverCodeDialog } from "@/components/tournaments/waiver-code-dialog";
import { useOffline } from "@/hooks/use-offline";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "../ui/label"

interface TournamentTeamsProps {
  tournament: any;
  userRole: "admin" | "school_admin" | "volunteer" | "student";
  token?: string | null;
  userId?: string;
  schoolId?: string;
}

const TEAM_STATUS_OPTIONS = [
  { label: "Active", value: "active" },
  { label: "Withdrawn", value: "withdrawn" },
  { label: "Disqualified", value: "disqualified" }
];

const PAYMENT_STATUS_OPTIONS = [
  { label: "Pending", value: "pending" },
  { label: "Paid", value: "paid" },
  { label: "Waived", value: "waived" }
];

function ExportDialog({
  open,
  onOpenChange,
  format,
  onFormatChange,
  onExport,
  isExporting,
  hasTeams,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  format: 'csv' | 'pdf';
  onFormatChange: (format: 'csv' | 'pdf') => void;
  onExport: () => void;
  isExporting: boolean;
  hasTeams: boolean;
}) {
  return (
<Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-w-md">
      <DialogHeader>
        <DialogTitle>Export Teams</DialogTitle>
      </DialogHeader>
      <div className="space-y-4">
        <div className="space-y-3">
          <Label>Export Format</Label>
          <div className="space-y-2">
            <div className="flex items-center space-x-2">
              <input
                type="radio"
                id="csv"
                name="format"
                checked={format === 'csv'}
                onChange={() => onFormatChange('csv')}
              />
              <Label htmlFor="csv">Excel (.xlsx)</Label>
            </div>
            <div className="flex items-center space-x-2">
              <input
                type="radio"
                id="pdf"
                name="format"
                checked={format === 'pdf'}
                onChange={() => onFormatChange('pdf')}
              />
              <Label htmlFor="pdf">PDF (.pdf)</Label>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Button
            onClick={onExport}
            disabled={isExporting || !hasTeams}
            className="flex items-center gap-2"
          >
            {isExporting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : format === 'csv' ? (
              <FileSpreadsheet className="h-4 w-4" />
            ) : (
              <FileText className="h-4 w-4" />
            )}
            Export
          </Button>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
        </div>
      </div>
    </DialogContent>
  </Dialog>
  );
}

function TeamsSkeleton() {
  return (
    <div className="w-full overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10">
              <Skeleton className="h-4 w-4" />
            </TableHead>
            <TableHead>Team</TableHead>
            <TableHead>Members</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Payment</TableHead>
            <TableHead>Created</TableHead>
            <TableHead className="w-32"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {[1, 2, 3, 4, 5].map((i) => (
            <TableRow key={i}>
              <TableCell><Skeleton className="h-4 w-4" /></TableCell>
              <TableCell>
                <div className="space-y-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-24" />
                </div>
              </TableCell>
              <TableCell>
                <div className="flex -space-x-2">
                  {[1, 2, 3].map((j) => (
                    <Skeleton key={j} className="h-8 w-8 rounded-full" />
                  ))}
                </div>
              </TableCell>
              <TableCell><Skeleton className="h-6 w-20" /></TableCell>
              <TableCell><Skeleton className="h-6 w-16" /></TableCell>
              <TableCell><Skeleton className="h-4 w-24" /></TableCell>
              <TableCell>
                <div className="flex gap-2">
                  <Skeleton className="h-8 w-8" />
                  <Skeleton className="h-8 w-8" />
                  <Skeleton className="h-8 w-8" />
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function getStatusColor(status: string) {
  switch (status) {
    case "active":
      return "bg-green-100 text-green-800";
    case "withdrawn":
      return "bg-yellow-100 text-yellow-800";
    case "disqualified":
      return "bg-red-100 text-red-800";
    default:
      return "bg-gray-100 text-gray-800";
  }
}

function getStatusIcon(status: string) {
  switch (status) {
    case "active":
      return CircleCheck;
    case "withdrawn":
      return XCircle;
    case "disqualified":
      return Ban;
    default:
      return Clock;
  }
}

function getPaymentStatusColor(status: string) {
  switch (status) {
    case "pending":
      return "bg-yellow-100 text-yellow-800";
    case "paid":
      return "bg-green-100 text-green-800";
    case "waived":
      return "bg-blue-100 text-blue-800";
    default:
      return "bg-gray-100 text-gray-800";
  }
}

function getPaymentStatusIcon(status: string) {
  switch (status) {
    case "pending":
      return Clock;
    case "paid":
      return CircleCheck;
    case "waived":
      return CircleDollarSign;
    default:
      return AlertTriangle;
  }
}

function TeamsPageSkeleton() {
  return (
    <div className="space-y-4">
      
      <div className="flex bg-brown rounded-t-md flex-col lg:flex-row lg:items-center lg:justify-between gap-4 p-3">
        <div>
          <Skeleton className="h-6 w-48 mb-2" />
          <div className="flex items-center gap-4 text-xs flex-wrap">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-32" />
          </div>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-8 w-20" />
          <Skeleton className="h-8 w-28" />
          <Skeleton className="h-8 w-8" />
        </div>
      </div>

      
      <div className="border rounded-md">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Skeleton className="h-4 w-4" />
              </TableHead>
              <TableHead>Team</TableHead>
              <TableHead>School</TableHead>
              <TableHead>Members</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Performance</TableHead>
              <TableHead className="w-32">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: 8 }).map((_, i) => (
              <TableRow key={i}>
                <TableCell>
                  <Skeleton className="h-4 w-4" />
                </TableCell>
                <TableCell>
                  <div className="space-y-2">
                    <Skeleton className="h-5 w-32" />
                    <div className="flex items-center gap-2">
                      <Skeleton className="h-4 w-16" />
                      <Skeleton className="h-4 w-20" />
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="space-y-1">
                    <Skeleton className="h-4 w-28" />
                    <Skeleton className="h-3 w-20" />
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    <Skeleton className="h-6 w-6 rounded-full" />
                    <Skeleton className="h-6 w-6 rounded-full" />
                    <Skeleton className="h-6 w-6 rounded-full" />
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-5 w-16" />
                    <Skeleton className="h-5 w-20" />
                  </div>
                </TableCell>
                <TableCell>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Skeleton className="h-4 w-8" />
                      <Skeleton className="h-4 w-8" />
                      <Skeleton className="h-4 w-8" />
                    </div>
                    <Skeleton className="h-2 w-20" />
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Skeleton className="h-8 w-8" />
                    <Skeleton className="h-8 w-8" />
                    <Skeleton className="h-8 w-8" />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

export function TournamentTeams({
                                  tournament,
                                  userRole,
                                  token,
                                  userId,
                                  schoolId
                                }: TournamentTeamsProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [paymentFilter, setPaymentFilter] = useState<string[]>([]);
  const [schoolFilter, setSchoolFilter] = useState<string[]>([]);
  const [selectedTeams, setSelectedTeams] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showJoinDialog, setShowJoinDialog] = useState(false);
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [showWaiverDialog, setShowWaiverDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showBulkDialog, setShowBulkDialog] = useState(false);
  const [teamToEdit, setTeamToEdit] = useState<any>(null);
  const [teamToDelete, setTeamToDelete] = useState<string | null>(null);
  const [teamToShare, setTeamToShare] = useState<any>(null);
  const [bulkAction, setBulkAction] = useState<string>("");
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [exportFormat, setExportFormat] = useState<'csv' | 'pdf'>('csv');
  const [isExporting, setIsExporting] = useState(false);

  const debouncedSearch = useDebounce(searchTerm, 300);

  const isAdmin = userRole === "admin";
  const isSchoolAdmin = userRole === "school_admin";
  const isStudent = userRole === "student";
  const hasToken = Boolean(token);

  const canCreateTeams = isAdmin ||
    (isSchoolAdmin && tournament.league?.type !== "Dreams Mode") ||
    (isStudent && tournament.league?.type === "Dreams Mode");

  const canUseFilters = isAdmin;
  const canUseBulkActions = isAdmin;
  const canAccessWaiverCodes = isAdmin && tournament.league?.type !== "Dreams Mode";
  const canJoinTeams = isStudent && tournament.league?.type === "Dreams Mode";

  const teamsData = useOffline(useQuery(
    api.functions.teams.getTournamentTeams,
    hasToken ? {
      token: token as string,
      tournament_id: tournament._id,
      search: canUseFilters ? debouncedSearch : "",
      status: canUseFilters && statusFilter.length === 1 ? statusFilter[0] as any : undefined,
      payment_status: canUseFilters && paymentFilter.length === 1 ? paymentFilter[0] as any : undefined,
      school_id: canUseFilters && schoolFilter.length === 1 ? schoolFilter[0] as Id<"schools"> : undefined,
      page,
      limit: 20,
    } : "skip"
  ), "tournament-teams");

  const tournamentSchools = useQuery(
    api.functions.tournaments.getTournamentSchools,
    hasToken && canUseFilters ? {
      token: token as string,
      tournament_id: tournament._id,
    } : "skip"
  );

  const deleteTeam = useMutation(isAdmin ? api.functions.admin.teams.deleteTeam : api.functions.teams.deleteUserTeam);
  const bulkUpdateTeams = useMutation(api.functions.admin.teams.bulkUpdateTeams);
  const leaveTeam = useMutation(api.functions.teams.leaveTeam);

  // Back to the first page when the filters change, without a second render
  // pass to correct an out-of-range page.
  const filterKey = JSON.stringify([debouncedSearch, statusFilter, paymentFilter, schoolFilter]);
  const [pagedFor, setPagedFor] = useState(filterKey);

  if (canUseFilters && filterKey !== pagedFor) {
    setPagedFor(filterKey);
    setPage(1);
  }

  const schoolOptions: { value: string; label: string; icon?: React.ReactNode }[] = useMemo(() => {
    if (!tournamentSchools || !canUseFilters) return [];

    return tournamentSchools
      .filter((school): school is { id: Id<"schools">; name: string; type: "Private" | "Public" | "Government Aided" | "International"; location: string } => school != null)
      .map(school => ({
        label: school.name,
        value: school.id,
        icon: React.createElement(School, { className: "h-4 w-4" }),
      }));
  }, [tournamentSchools, canUseFilters]);

  const handleSearchChange = (value: string) => {
    if (canUseFilters) {
      setSearchTerm(value);
    }
  };

  const handleReset = () => {
    if (canUseFilters) {
      setSearchTerm("");
      setStatusFilter([]);
      setPaymentFilter([]);
      setSchoolFilter([]);
      setPage(1);
    }
  };

  const handleSelectTeam = (teamId: string, checked: boolean) => {
    if (!canUseBulkActions) return;

    const newSelected = new Set(selectedTeams);
    if (checked) {
      newSelected.add(teamId);
    } else {
      newSelected.delete(teamId);
    }
    setSelectedTeams(newSelected);
  };

  const handleSelectAll = (checked: boolean) => {
    if (!canUseBulkActions) return;

    if (checked && teamsData?.teams) {
      setSelectedTeams(new Set(teamsData.teams.map(team => team._id)));
    } else {
      setSelectedTeams(new Set());
    }
  };

  const handleEditTeam = (team: any) => {
    setTeamToEdit(team);
    setShowEditDialog(true);
  };

  const handleDeleteTeam = async () => {
    if (!teamToDelete || !token) return;

    try {
      if (isAdmin) {
        await deleteTeam({
          admin_token: token,
          team_id: teamToDelete as Id<"teams">,
        });
      } else {
        await deleteTeam({
          token,
          team_id: teamToDelete as Id<"teams">,
        });
      }
      toast.success("Team deleted successfully");
      setShowDeleteDialog(false);
      setTeamToDelete(null);
    } catch (error: any) {
      toast.error(error.message?.split("Uncaught Error:")[1]?.split(/\.|Called by client/)[0]?.trim() || "Failed to delete team");
    }
  };

  const handleLeaveTeam = async (teamId: string) => {
    if (!token) return;

    try {
      await leaveTeam({
        token,
        team_id: teamId as Id<"teams">,
      });
      toast.success("Left team successfully");
    } catch (error: any) {
      toast.error(error.message || "Failed to leave team");
    }
  };

  const handleBulkAction = async () => {
    if (!canUseBulkActions || !bulkUpdateTeams || selectedTeams.size === 0 || !bulkAction || !token) return;

    try {
      const result = await bulkUpdateTeams({
        admin_token: token,
        team_ids: Array.from(selectedTeams) as Id<"teams">[],
        action: bulkAction as any,
      });

      const successCount = result.results.filter(r => r.success).length;
      const failureCount = result.results.filter(r => !r.success).length;

      if (successCount > 0) {
        toast.success(`${successCount} teams updated successfully`);
      }
      if (failureCount > 0) {
        toast.error(`${failureCount} teams failed to update`);
      }

      setSelectedTeams(new Set());
      setShowBulkDialog(false);
      setBulkAction("");
    } catch (error: any) {
      toast.error(error.message || "Failed to perform bulk action");
    }
  };

  const handleShareTeam = (team: any) => {
    setTeamToShare(team);
    setShowShareDialog(true);
  };

  const exportToExcel = async () => {
    setIsExporting(true);
    try {
      const data = teams.map((team) => ({
        'Team Name': team.name,
        'School': team.school?.name || 'N/A',
        'School Type': team.school?.type || 'N/A',
        'Members': `${team.memberCount}/${tournament.team_size}`,
        'Status': team.status.charAt(0).toUpperCase() + team.status.slice(1),
        'Payment Status': tournament.league?.type !== "Dreams Mode" ?
          team.payment_status.charAt(0).toUpperCase() + team.payment_status.slice(1) : 'N/A',
        'Created': formatDistanceToNow(new Date(team.created_at), { addSuffix: true }),
        'Invitation Code': team.invitation_code || 'N/A'
      }));

      await downloadExcel(
        [{ name: "Teams", rows: data }],
        `${tournament.name}_Teams.xlsx`
      );

      toast.success("Excel file downloaded!");
    } catch (error) {
      toast.error("Failed to export Excel file");
    } finally {
      setIsExporting(false);
    }
  };

  const exportToPDF = async () => {
    setIsExporting(true);
    try {
      const doc = new jsPDF();

      doc.setFontSize(16);
      doc.text(`${tournament.name} - Teams`, 20, 20);

      const tableData = teams.map((team) => [
        team.name,
        team.school?.name || 'N/A',
        team.school?.type || 'N/A',
        `${team.memberCount}/${tournament.team_size}`,
        team.status.charAt(0).toUpperCase() + team.status.slice(1),
        tournament.league?.type !== "Dreams Mode" ?
          team.payment_status.charAt(0).toUpperCase() + team.payment_status.slice(1) : 'N/A',
        formatDistanceToNow(new Date(team.created_at), { addSuffix: true })
      ]);

      const columns = [
        'Team Name',
        'School',
        'School Type',
        'Members',
        'Status',
        ...(tournament.league?.type !== "Dreams Mode" ? ['Payment'] : []),
        'Created'
      ];

      autoTable(doc, {
        head: [columns],
        body: tableData.map(row => tournament.league?.type === "Dreams Mode" ?
          [row[0], row[1], row[2], row[3], row[4], row[6]] : // Skip payment column
          row
        ),
        startY: 40,
        styles: { fontSize: 8 },
        headStyles: { fillColor: [66, 139, 202] },
        margin: { left: 20, right: 20 }
      });

      const fileName = `${tournament.name}_Teams.pdf`;
      doc.save(fileName);

      toast.success("PDF file downloaded!");
    } catch (error) {
      toast.error("Failed to export PDF file");
    } finally {
      setIsExporting(false);
    }
  };

  const canEditTeam = (team: any) => {
    if (isAdmin) return true;
    if (isSchoolAdmin && team.school?._id === schoolId) return true;
    return !!(isStudent && tournament.league?.type === "Dreams Mode" && team.members.some((m: any) => m._id === userId));
  };

  const canDeleteTeam = (team: any) => {
    return canEditTeam(team);
  };

  const canLeaveTeam = (team: any) => {
    return isStudent && team.members.some((m: any) => m._id === userId);
  };

  const canShareTeam = (team: any) => {
    return tournament.league?.type === "Dreams Mode" && team.invitation_code && (
      isAdmin ||
      (isStudent && team.members.some((m: any) => m._id === userId))
    );
  };

  const isLoading = teamsData === undefined;
  const teams = teamsData?.teams || [];
  const totalCount = teamsData?.totalCount || 0;
  const hasMore = teamsData?.hasMore || false;

  const filters = canUseFilters ? [
    <MultiSelectFilter
      key="status"
      title="Status"
      options={TEAM_STATUS_OPTIONS.map(option => ({
        ...option,
        icon: React.createElement(getStatusIcon(option.value), { className: "h-4 w-4" })
      }))}
      selected={statusFilter}
      onSelectionChange={setStatusFilter}
    />,
    <MultiSelectFilter
      key="payment"
      title="Payment"
      options={PAYMENT_STATUS_OPTIONS.map(option => ({
        ...option,
        icon: React.createElement(getPaymentStatusIcon(option.value), { className: "h-4 w-4" })
      }))}
      selected={paymentFilter}
      onSelectionChange={setPaymentFilter}
    />,
    <MultiSelectFilter
      key="school"
      title="School"
      options={schoolOptions}
      selected={schoolFilter}
      onSelectionChange={setSchoolFilter}
    />
  ] : [];

  const actions = [

    ...(canAccessWaiverCodes ? [{
      key: "waiver",
      component: (
        <Button
          variant="outline"
          size="sm"
          className="h-8 border-white/20"
          onClick={() => setShowWaiverDialog(true)}
        >
          <Ticket className="h-4 w-4" />
          <span className="hidden md:block">Waiver Codes</span>
        </Button>
      )
    }] : []),

    ...(canJoinTeams ? [{
      key: "join",
      component: (
        <Button
          variant="outline"
          size="sm"
          className="h-8 border-white/20"
          onClick={() => setShowJoinDialog(true)}
        >
          <QrCode className="h-4 w-4" />
          <span className="hidden md:block">Join Team</span>
        </Button>
      )
    }] : []),

    ...(canCreateTeams ? [{
      key: "create",
      component: (
        <Button
          size="sm"
          className="h-8 hover:bg-white hover:text-foreground"
          onClick={() => setShowCreateDialog(true)}
        >
          <UserPlus className="h-4 w-4" />
          <span className="hidden md:block">Create Team</span>
        </Button>
      )
    }] : []),
    {
      key: "export",
      component: (
        <Button
          variant="outline"
          size="sm"
          className="h-8 border-white/20"
          onClick={() => setShowExportDialog(true)}
          disabled={teams.length === 0}
        >
          <Download className="h-4 w-4" />
          <span className="hidden md:block">Export</span>
        </Button>
      )
    },
  ].map(action => action.component);

  const bulkActions = canUseBulkActions ? [
    {
      label: "Activate Teams",
      icon: <CircleCheck className="h-4 w-4" />,
      onClick: () => {
        setBulkAction("activate");
        setShowBulkDialog(true);
      }
    },
    {
      label: "Withdraw Teams",
      icon: <XCircle className="h-4 w-4" />,
      onClick: () => {
        setBulkAction("withdraw");
        setShowBulkDialog(true);
      }
    },
    {
      label: "Disqualify Teams",
      icon: <Ban className="h-4 w-4" />,
      onClick: () => {
        setBulkAction("disqualify");
        setShowBulkDialog(true);
      },
      variant: "destructive" as const
    },
    {
      label: "Mark as Paid",
      icon: <CreditCard className="h-4 w-4" />,
      onClick: () => {
        setBulkAction("mark_paid");
        setShowBulkDialog(true);
      }
    },
    {
      label: "Waive Fee",
      icon: <CircleDollarSign className="h-4 w-4" />,
      onClick: () => {
        setBulkAction("waive_fee");
        setShowBulkDialog(true);
      }
    },
    {
      label: "Delete Teams",
      icon: <Trash2 className="h-4 w-4" />,
      onClick: () => {
        setBulkAction("delete");
        setShowBulkDialog(true);
      },
      variant: "destructive" as const
    }
  ] : [];

  const toolbar = (
    <DataToolbar
      searchTerm={canUseFilters ? searchTerm : ""}
      onSearchChange={handleSearchChange}
      onReset={handleReset}
      filters={filters}
      actions={actions}
      isLoading={isLoading}
      selectedCount={selectedTeams.size}
      bulkActions={bulkActions}
      searchPlaceholder="Search teams..."
      hideSearch={!canUseFilters}
    />
  );

  if (isLoading) {
    return <TeamsPageSkeleton />;
  }



  return (
    <CardLayoutWithToolbar toolbar={toolbar}>
      <div className="w-full bg-background">
        {isLoading ? (
          <TeamsSkeleton />
        ) : (
          <>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    
                    {canUseBulkActions && (
                      <TableHead className="w-12">
                        <Checkbox
                          checked={selectedTeams.size === teams.length && teams.length > 0}
                          onCheckedChange={handleSelectAll}
                        />
                      </TableHead>
                    )}
                    <TableHead>Team</TableHead>
                    <TableHead className="hidden sm:table-cell">Members</TableHead>
                    <TableHead>Status</TableHead>
                    
                    {tournament.league?.type !== "Dreams Mode" && (
                      <TableHead>Payment</TableHead>
                    )}
                    <TableHead className="hidden lg:table-cell">Created</TableHead>
                    <TableHead className="w-32">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {teams.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={tournament.league?.type === "Dreams Mode" ? (canUseBulkActions ? 5 : 4) : (canUseBulkActions ? 6 : 5)} className="text-center py-12">
                        <div className="flex flex-col items-center justify-center">
                          <Users className="h-12 w-12 text-muted-foreground mb-4" />
                          <h3 className="font-medium mb-2">No teams found</h3>
                          <p className="text-muted-foreground text-center text-sm max-w-sm">
                            {searchTerm || statusFilter.length > 0 || paymentFilter.length > 0 || schoolFilter.length > 0
                              ? "Try adjusting your search criteria or filters"
                              : canCreateTeams
                                ? "Get started by creating your first team"
                                : "No teams have been created for this tournament yet"
                            }
                          </p>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    teams.map((team) => {
                      const StatusIcon = getStatusIcon(team.status);
                      const PaymentIcon = getPaymentStatusIcon(team.payment_status);

                      return (
                        <TableRow key={team._id}>
                          
                          {canUseBulkActions && (
                            <TableCell>
                              <Checkbox
                                checked={selectedTeams.has(team._id)}
                                onCheckedChange={(checked) =>
                                  handleSelectTeam(team._id, checked as boolean)
                                }
                              />
                            </TableCell>
                          )}
                          <TableCell>
                            <div className="space-y-2">
                              <div className="flex flex-col custom:flex-row items-center gap-2">
                                <span className="font-medium">{team.name}</span>
                                {team.school && (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Badge variant="outline" className="text-xs max-w-[160px] overflow-hidden">
                                        <School className="h-3 w-3 mr-1 flex-shrink-0" />
                                        <span className="truncate">{team.school.name}</span>
                                      </Badge>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      {team.school.name}
                                    </TooltipContent>
                                  </Tooltip>
                                )}
                              </div>
                              {team.invitation_code && tournament.league?.type === "Dreams Mode" && (
                                <div className="text-xs text-muted-foreground">
                                  Code: {team.invitation_code}
                                </div>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="hidden sm:table-cell">
                            <div className="flex -space-x-2">
                              {team.members.slice(0, 3).map((member: any) => (
                                <Tooltip key={member._id}>
                                  <TooltipTrigger asChild>
                                    <Avatar className="h-8 w-8 border-2 border-background">
                                      <AvatarFallback className="text-xs">
                                        {member.name.charAt(0).toUpperCase()}
                                      </AvatarFallback>
                                    </Avatar>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    {member.name}
                                  </TooltipContent>
                                </Tooltip>
                              ))}

                              {team.members.length > 3 && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <div className="flex items-center justify-center h-8 w-8 rounded-full bg-muted border-2 border-background text-xs text-muted-foreground cursor-default">
                                      +{team.members.length - 3}
                                    </div>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    {(() => {
                                      const extra = team.members.slice(3);
                                      const names = extra.map((m: any) => m.name);
                                      const preview = names.slice(0, 2); // Show first 2 names
                                      const remaining = names.length - preview.length;

                                      if (remaining > 0) {
                                        return `${preview.join(', ')}${remaining === 1 ? `, and 1 more` : `, ...and ${remaining} more`}`;
                                      } else {
                                        return preview.join(', ');
                                      }
                                    })()}
                                  </TooltipContent>
                                </Tooltip>
                              )}
                            </div>

                            <div className="text-xs text-muted-foreground mt-1">
                              {team.memberCount}/{tournament.team_size} members
                            </div>
                          </TableCell>

                          <TableCell>
                            <Badge variant="secondary" className={getStatusColor(team.status)}>
                              <StatusIcon className="h-3 w-3 mr-1" />
                              {team.status.charAt(0).toUpperCase() + team.status.slice(1)}
                            </Badge>
                          </TableCell>
                          
                          {tournament.league?.type !== "Dreams Mode" && (
                            <TableCell>
                              <Badge variant="secondary" className={getPaymentStatusColor(team.payment_status)}>
                                <PaymentIcon className="h-3 w-3 mr-1" />
                                {team.payment_status.charAt(0).toUpperCase() + team.payment_status.slice(1)}
                              </Badge>
                            </TableCell>
                          )}
                          <TableCell className="hidden lg:table-cell">
                            <div className="text-sm text-muted-foreground">
                              {formatDistanceToNow(new Date(team.created_at), { addSuffix: true })}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              
                              {canEditTeam(team) && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 w-8 p-0"
                                  onClick={() => handleEditTeam(team)}
                                >
                                  <PencilLine className="h-4 w-4" />
                                </Button>
                              )}

                              
                              {canShareTeam(team) && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 w-8 p-0"
                                  onClick={() => handleShareTeam(team)}
                                >
                                  <Share className="h-4 w-4" />
                                </Button>
                              )}

                              
                              {canLeaveTeam(team) && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 w-8 p-0 text-orange-600 hover:text-orange-700"
                                  onClick={() => handleLeaveTeam(team._id)}
                                >
                                  <LogOut className="h-4 w-4" />
                                </Button>
                              )}

                              
                              {canDeleteTeam(team) && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 w-8 p-0 text-red-600 hover:text-red-700"
                                  onClick={() => {
                                    setTeamToDelete(team._id);
                                    setShowDeleteDialog(true);
                                  }}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>

            
            {(hasMore || page > 1) && (
              <div className="flex items-center justify-center gap-4 space-x-4 mt-6 p-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(Math.max(1, page - 1))}
                  disabled={page === 1 || isLoading}
                  className="h-8"
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Previous
                </Button>

                <span className="text-sm text-foreground">
                  {totalCount > 0 && (
                    <span className="text-muted-foreground">
                      {teams.length} of {totalCount} teams
                    </span>
                  )}
                </span>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(page + 1)}
                  disabled={!hasMore || isLoading}
                  className="h-8"
                >
                  Next
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            )}
          </>
        )}
      </div>

      
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Team</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this team? This action cannot be undone and will permanently remove the team and all associated data.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteTeam}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete Team
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      
      {canUseBulkActions && (
        <AlertDialog open={showBulkDialog} onOpenChange={setShowBulkDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Bulk Action</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to {bulkAction} {selectedTeams.size} selected team{selectedTeams.size > 1 ? 's' : ''}?
                This action will be applied to all selected teams.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleBulkAction}>
                {bulkAction === "delete" ? "Delete Teams" : `${bulkAction.charAt(0).toUpperCase() + bulkAction.slice(1).replace('_', ' ')} Teams`}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      
      {(canCreateTeams || teamToEdit) && (
        <TeamManagementDialog
          open={showCreateDialog || showEditDialog}
          onOpenChange={(open) => {
            if (!open) {
              setShowCreateDialog(false);
              setShowEditDialog(false);
              setTeamToEdit(null);
            }
          }}
          tournament={tournament}
          team={teamToEdit}
          mode={showCreateDialog ? "create" : "edit"}
          userRole={userRole}
          token={token}
          userId={userId}
          schoolId={schoolId}
        />
      )}

      
      {canJoinTeams && (
        <JoinTeamDialog
          open={showJoinDialog}
          onOpenChange={setShowJoinDialog}
          tournament={tournament}
          token={token}
        />
      )}

      
      {teamToShare && canShareTeam(teamToShare) && (
        <ShareTeamDialog
          open={showShareDialog}
          onOpenChange={setShowShareDialog}
          team={teamToShare}
          tournament={tournament}
        />
      )}

      
      {canAccessWaiverCodes && (
        <WaiverCodeDialog
          open={showWaiverDialog}
          onOpenChange={setShowWaiverDialog}
          tournament={tournament}
          token={token}
        />
      )}
      {(canCreateTeams || teamToEdit) && (
        <ExportDialog
          open={showExportDialog}
          onOpenChange={setShowExportDialog}
          format={exportFormat}
          onFormatChange={setExportFormat}
          onExport={exportFormat === 'csv' ? exportToExcel : exportToPDF}
          isExporting={isExporting}
          hasTeams={teams.length > 0}
        />
      )}

    </CardLayoutWithToolbar>
  );
}