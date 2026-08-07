"use client"

import React, { useState, useEffect, useMemo } from "react"
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "@/convex/_generated/api"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Checkbox } from "@/components/ui/checkbox"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
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
  Send,
  Users,
  UserCheck,
  UserX,
  ChevronLeft,
  ChevronRight,
  School,
  GraduationCap,
  UserCog,
  Clock,
  CheckCircle,
  Mail,
  AlertTriangle,
  Copy,
  CircleX,
  CircleCheck
} from "lucide-react";
import { useDebounce } from "@/hooks/use-debounce"
import { DataToolbar } from "@/components/shared/data-toolbar"
import { MultiSelectFilter } from "@/components/ui/multi-select-filter"
import { toast } from "sonner"
import { Id } from "@/convex/_generated/dataModel"
import { CardLayoutWithToolbar } from "@/components/shared/card-layout-with-toolbar"
import { formatDistanceToNow, format } from "date-fns"

interface TournamentInvitationsProps {
  tournament: any;
  userRole: "admin" | "school_admin" | "volunteer" | "student";
  token?: string | null;
  userId?: string;
  schoolId?: string;
}

const TARGET_TYPE_OPTIONS = [
  { label: "Schools", value: "school", icon: School },
  { label: "Students", value: "student", icon: GraduationCap },
  { label: "Volunteers", value: "volunteer", icon: UserCog }
];

const INVITATION_STATUS_OPTIONS = [
  { label: "Pending", value: "pending" },
  { label: "Accepted", value: "accepted" },
  { label: "Declined", value: "declined" }
];

function InvitationsSkeleton() {
  return (
    <div className="w-full overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10">
              <Skeleton className="h-4 w-4" />
            </TableHead>
            <TableHead>Name</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Date</TableHead>
            <TableHead className="w-32"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {[1, 2, 3, 4, 5].map((i) => (
            <TableRow key={i}>
              <TableCell><Skeleton className="h-4 w-4" /></TableCell>
              <TableCell>
                <div className="flex items-center gap-3">
                  <Skeleton className="h-10 w-10 rounded-full" />
                  <Skeleton className="h-4 w-32" />
                </div>
              </TableCell>
              <TableCell><Skeleton className="h-6 w-20" /></TableCell>
              <TableCell><Skeleton className="h-6 w-20" /></TableCell>
              <TableCell><Skeleton className="h-4 w-24" /></TableCell>
              <TableCell>
                <div className="flex gap-2">
                  <Skeleton className="h-8 w-20" />
                  <Skeleton className="h-8 w-20" />
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
    case "pending":
      return "bg-yellow-100 text-yellow-800";
    case "accepted":
      return "bg-green-100 text-green-800";
    case "declined":
      return "bg-red-100 text-red-800";
    default:
      return "bg-gray-100 text-gray-800";
  }
}


function getTypeIcon(type: string) {
  switch (type) {
    case "school":
      return School;
    case "student":
      return GraduationCap;
    case "volunteer":
      return UserCog;
    default:
      return Users;
  }
}

function getTypeColor(type: string) {
  switch (type) {
    case "school":
      return "bg-violet-100 text-violet-800 dark:bg-violet-900 dark:text-violet-100";
    case "student":
      return "bg-sky-100 text-sky-800 dark:bg-sky-900 dark:text-sky-100";
    case "volunteer":
      return "bg-fuchsia-100 text-fuchsia-800 dark:bg-fuchsia-900 dark:text-fuchsia-100";
    default:
      return "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-100";
  }
}

function CopyableEmail({ email }: { email: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(email);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast.success("Email copied!");
    } catch (error) {
      toast.error("Failed to copy email");
    }
  };

  return (
    <div className="flex items-center gap-1 group">
      <span
        className="text-sm text-muted-foreground cursor-pointer text-xs hover:text-primary hover:underline"
        onClick={() => window.location.href = `mailto:${email}`}
      >
        {email}
      </span>
      <Button
        variant="ghost"
        size="sm"
        className="h-4 w-4 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={handleCopy}
      >
        {copied ? (
          <CheckCircle className="h-3 w-3 text-green-600" />
        ) : (
          <Copy className="h-3 w-3" />
        )}
      </Button>
    </div>
  );
}

function InvitationsPageSkeleton() {
  return (
    <div className="space-y-4">
      
      <div className="flex bg-brown rounded-t-md flex-col lg:flex-row lg:items-center lg:justify-between gap-4 p-3">
        <div>
          <Skeleton className="h-6 w-56 mb-2" />
          <div className="flex items-center gap-4 text-xs flex-wrap">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-28" />
          </div>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <Skeleton className="h-8 w-28" />
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-8 w-8" />
        </div>
      </div>

      
      <div className="w-full">
        <div className="grid w-full grid-cols-2 mb-6 h-10 bg-muted rounded-lg p-1">
          <Skeleton className="h-8 rounded-md" />
          <Skeleton className="h-8 rounded-md" />
        </div>

        
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">
                  <Skeleton className="h-4 w-4" />
                </TableHead>
                <TableHead>Invitee</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Invited</TableHead>
                <TableHead>Invited By</TableHead>
                <TableHead className="w-32">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {Array.from({ length: 6 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell>
                    <Skeleton className="h-4 w-4" />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Skeleton className="h-10 w-10 rounded-full" />
                      <div className="min-w-0 space-y-1">
                        <div className="flex items-center gap-2">
                          <Skeleton className="h-4 w-32" />
                          <Skeleton className="h-5 w-16 rounded-full" />
                        </div>
                        <Skeleton className="h-3 w-40" />
                        <Skeleton className="h-3 w-28" />
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="space-y-2">
                      <Skeleton className="h-6 w-20 rounded-full" />
                      {i % 3 === 0 && <Skeleton className="h-5 w-16 rounded-full" />}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="space-y-1">
                      <Skeleton className="h-4 w-24" />
                      <Skeleton className="h-3 w-20" />
                    </div>
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-24" />
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Skeleton className="h-8 w-8" />
                      <Skeleton className="h-8 w-8" />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        
        <div className="flex items-center justify-center gap-4 space-x-4 mt-6 p-4">
          <Skeleton className="h-8 w-20" />
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-8 w-16" />
        </div>
      </div>
    </div>
  );
}

export function TournamentInvitations({
                                        tournament,
                                        userRole,
                                        token,
                                        userId,
                                        schoolId
                                      }: TournamentInvitationsProps) {
  const [activeTab, setActiveTab] = useState("invitations");
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [typeFilter, setTypeFilter] = useState<string[]>([]);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const [showBulkInviteDialog, setShowBulkInviteDialog] = useState(false);
  const [showResponseDialog, setShowResponseDialog] = useState(false);
  const [responseAction, setResponseAction] = useState<"accepted" | "declined">("accepted");
  const [, setSelectedInvitation] = useState<string | null>(null);

  const debouncedSearch = useDebounce(searchTerm, 300);
  const isAdmin = userRole === "admin";
  const canSendInvitations = isAdmin && tournament.status === "published";
  const canRespondToInvitations = tournament.status !== "completed" && tournament.status !== "cancelled";

  const availableTabs = useMemo(() => {
    const tabs = [];

    tabs.push({ value: "invitations", label: "Invitations", icon: Mail });

    if (isAdmin && tournament.status === "published") {
      tabs.push({ value: "potential", label: "Potential Invitees", icon: Users });
    }

    return tabs;
  }, [isAdmin, tournament.status]);

  // Falls back to the first available tab when the chosen one disappears,
  // applied while rendering so no pass shows an empty panel.
  if (availableTabs.length > 0 && !availableTabs.some(tab => tab.value === activeTab)) {
    setActiveTab(availableTabs[0].value);
  }

  const invitationsQuery = isAdmin
    ? api.functions.admin.invitations.getTournamentInvitations
    : (userRole === "school_admin" && schoolId)
      ? api.functions.invitations.getSchoolTournamentInvitations
      : api.functions.invitations.getUserTournamentInvitations;

  const invitationsData = useQuery(
    invitationsQuery,
    activeTab === "invitations"
      ? isAdmin
        ? {
          tournament_id: tournament._id,
          status: statusFilter.length === 1 ? statusFilter[0] as any : undefined,
          target_type: typeFilter.length === 1 ? typeFilter[0] as any : undefined,
          search: debouncedSearch,
          page,
          limit: 20
        }
        : userRole === "school_admin" && schoolId
          ? {
            tournament_id: tournament._id,
            school_id: schoolId as Id<"schools">
          }
          : {
            tournament_id: tournament._id,
            user_id: userId as Id<"users">
          }
      : "skip"
  );

  const potentialInviteesData = useQuery(
    api.functions.admin.invitations.getPotentialInvitees,
    activeTab === "potential" && isAdmin
      ? {
        tournament_id: tournament._id,
        target_type: typeFilter.length === 1 ? typeFilter[0] as any : undefined,
        search: debouncedSearch,
        page,
        limit: 20
      }
      : "skip"
  );

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const invitationId = urlParams.get('id');
    const response = urlParams.get('response');

    if (invitationId && response && (response === 'accepted' || response === 'declined')) {
      const invitations = isAdmin
        ? (invitationsData as any)?.invitations || []
        : invitationsData || [];

      const invitation = invitations.find((inv: any) => inv._id === invitationId);

      if (invitation) {
        const isExpired = invitation.expires_at && Date.now() > invitation.expires_at;

        if (!isAdmin && isExpired) {
          toast.error("This invitation has expired and cannot be responded to.");
          window.history.replaceState({}, document.title, window.location.pathname + window.location.hash);
          return;
        }
        const canRespond = (isAdmin || invitation.target_id === userId) && canRespondToInvitations;

        if (canRespond) {
          handleRespondToInvitation(invitationId as Id<"tournament_invitations">, response as "accepted" | "declined");
        } else if (invitation.status !== "pending") {
          toast.info(`This invitation has already been ${invitation.status}.`);
        } else {
          toast.error("You don't have permission to respond to this invitation.");
        }
      } else {
        toast.error("Invitation not found.");
      }

      window.history.replaceState({}, document.title, window.location.pathname + window.location.hash);
    }
  }, [invitationsData, isAdmin, userId, token]);

  const sendInvitation = useMutation(api.functions.admin.invitations.sendInvitation);
  const bulkSendInvitations = useMutation(api.functions.admin.invitations.bulkSendInvitations);
  const updateInvitationStatus = useMutation(api.functions.invitations.updateInvitationStatus);
  const sendInvitationEmail = useAction(api.functions.email.sendTournamentInvitationEmail);
  const sendBulkInvitationEmails = useAction(api.functions.email.sendBulkTournamentInvitationEmails);

  // Back to the first page when the filters change, without a second render
  // pass to correct an out-of-range page.
  const filterKey = JSON.stringify([debouncedSearch, statusFilter, typeFilter, activeTab]);
  const [pagedFor, setPagedFor] = useState(filterKey);

  if (filterKey !== pagedFor) {
    setPagedFor(filterKey);
    setPage(1);
  }

  const currentData = activeTab === "invitations" ? invitationsData : potentialInviteesData;
  const isLoading = currentData === undefined;

  const handleSearchChange = (value: string) => {
    setSearchTerm(value);
  };

  const handleReset = () => {
    setSearchTerm("");
    setStatusFilter([]);
    setTypeFilter([]);
    setPage(1);
  };

  const handleSelectItem = (itemId: string, checked: boolean) => {
    const newSelected = new Set(selectedItems);
    if (checked) {
      newSelected.add(itemId);
    } else {
      newSelected.delete(itemId);
    }
    setSelectedItems(newSelected);
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked && currentData) {
      const items = activeTab === "invitations"
        ? (currentData as any).invitations || []
        : (currentData as any).users || [];
      setSelectedItems(new Set(items.map((item: any) => item._id)));
    } else {
      setSelectedItems(new Set());
    }
  };

  const handleSendInvitation = async (targetId: Id<"users">, targetType: "school" | "volunteer" | "student") => {
    if (!token) return;

    try {
      const result = await sendInvitation({
        admin_token: token,
        tournament_id: tournament._id,
        target_type: targetType,
        target_id: targetId
      });

      if (result.success) {
        const target = potentialInviteesData?.users.find(u => u._id === targetId);
        if (target) {
          try {
            await sendInvitationEmail({
              to: target.email,
              recipientName: target.name,
              tournamentName: tournament.name,
              tournamentSlug: tournament.slug,
              tournamentDate: format(new Date(tournament.start_date), "PPP"),
              tournamentLocation: tournament.location,
              isVirtual: tournament.is_virtual,
              invitationType: targetType,
              expiresAt: format(new Date(tournament.start_date), "PPP"),
              invitationId: result.invitation_id
            });
          } catch (emailError) {
            console.error("Failed to send invitation email:", emailError);
          }
        }

        toast.success("Invitation sent successfully");
        setSelectedItems(new Set());
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to send invitation");
    }
  };

  const handleBulkSendInvitations = async () => {
    if (selectedItems.size === 0 || !token) return;

    try {
      const potentialInvitees = potentialInviteesData?.users || [];
      const selectedUsers = potentialInvitees.filter(user => selectedItems.has(user._id));

      const invitations = selectedUsers.map(user => ({
        target_type: user.role === "school_admin" ? "school" as const : user.role as "volunteer" | "student",
        target_id: user._id as Id<"users">
      }));

      const result = await bulkSendInvitations({
        admin_token: token,
        tournament_id: tournament._id,
        invitations
      });

      const successCount = result.results.filter((r) => r.success).length;
      const failureCount = result.results.filter((r) => !r.success).length;

      if (successCount > 0) {
        const emailData = result.results
          .filter((r) => r.success)
          .map((r) => {
            const user = selectedUsers.find(u => u._id === r.target_id)
            if (!user) return null

            return {
              to: user.email,
              recipientName: user.name,
              tournamentName: tournament.name,
              tournamentSlug: tournament.slug,
              tournamentDate: format(new Date(tournament.start_date), "PPP"),
              tournamentLocation: tournament.location,
              isVirtual: tournament.is_virtual,
              invitationType: user.role === "school_admin" ? "school" as const : user.role as "volunteer" | "student",
              expiresAt: format(new Date(tournament.start_date), "PPP"),
              invitationId: r.invitation_id!,
            }
          })
          .filter(Boolean) as any[]

        try {
          await sendBulkInvitationEmails({ emails: emailData })
        } catch (emailError) {
          console.error("Failed to send bulk invitation emails:", emailError)
        }
      }

      if (successCount > 0) {
        toast.success(`${successCount} invitations sent successfully`)
      }
      if (failureCount > 0) {
        toast.error(`${failureCount} invitations failed to send`)
      }

      setSelectedItems(new Set())
      setShowBulkInviteDialog(false)
    } catch (error: any) {
      toast.error(error.message || "Failed to send invitations")
    }
  }

  const handleRespondToInvitation = async (invitationId: Id<"tournament_invitations">, status: "accepted" | "declined") => {
    if (!token) return

    try {
      await updateInvitationStatus({
        token,
        invitation_id: invitationId,
        status,
      })

      toast.success(`Invitation ${status} successfully`)
      setShowResponseDialog(false)
      setSelectedInvitation(null)
    } catch (error: any) {
      toast.error(error.message || `Failed to ${status.toLowerCase()} invitation`)
    }
  }

  const getAvailableTypes = () => {
    if (!tournament.league_id) {
      return TARGET_TYPE_OPTIONS
    }

    if (tournament.league?.type === "Dreams Mode") {
      return TARGET_TYPE_OPTIONS.filter(option => option.value !== "school")
    } else {
      return TARGET_TYPE_OPTIONS.filter(option => option.value !== "student")
    }
  }

  const renderInvitationsTab = () => {
    const invitations = isAdmin
      ? (invitationsData as any)?.invitations || []
      : invitationsData || []

    return (
      <div className="space-y-2">
        {isLoading ? (
          <InvitationsSkeleton />
        ) : invitations.length === 0 ? (
          <div className="text-center py-12">
            <Mail className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="font-medium mb-2">No Invitations</h3>
            <p className="text-sm text-muted-foreground">
              {tournament.status === "published"
                ? "No invitations have been sent for this tournament yet."
                : "Invitations can only be sent for published tournaments."
              }
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    {isAdmin && <TableHead className="w-12">
                      <Checkbox
                        checked={selectedItems.size === invitations.length && invitations.length > 0}
                        onCheckedChange={handleSelectAll}
                      />
                    </TableHead>}
                    <TableHead>Invitee</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Invited</TableHead>
                    {isAdmin && <TableHead>Invited By</TableHead>}
                    <TableHead className="w-32">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invitations.map((invitation: any) => {
                    const TypeIcon = getTypeIcon(invitation.target_type)
                    const isExpired = invitation.expires_at && Date.now() > invitation.expires_at
                    const isInvitee = invitation.target_id === userId;
                    const canRespond =
                      canRespondToInvitations &&
                      (
                        isAdmin ||
                        (isInvitee && !isExpired)
                      );

                    return (
                      <TableRow key={invitation._id}>
                        {isAdmin && (
                          <TableCell>
                            <Checkbox
                              checked={selectedItems.has(invitation._id)}
                              onCheckedChange={(checked) =>
                                handleSelectItem(invitation._id, checked as boolean)
                              }
                            />
                          </TableCell>
                        )}
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <Avatar className="w-10 h-10">
                              <AvatarFallback className="bg-primary text-white">
                                {invitation.target?.name?.charAt(0).toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <div className="font-medium truncate">
                                  {invitation.target?.name}
                                </div>
                                <Badge variant="secondary" className={getTypeColor(invitation.target_type)}>
                                  <TypeIcon className="w-3 h-3 mr-1" />
                                  {invitation.target_type.charAt(0).toUpperCase() + invitation.target_type.slice(1)}
                                </Badge>
                              </div>
                              <CopyableEmail email={invitation.target?.email} />
                              {invitation.target?.school && (
                                <div className="text-xs font-medium text-muted-foreground truncate">
                                  {invitation.target.school.name}
                                </div>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="grid grid-cols-1 gap-2">
                            <Badge variant="secondary" className={`max-w-24 ${getStatusColor(invitation.status)}`}>
                              {invitation.status === "pending" ? (
                                <Clock className="w-3 h-3 mr-1" />
                              ) : invitation.status === "accepted" ? (
                                <CircleCheck className="w-3 h-3 mr-1" />
                              ) : (
                                <CircleX className="w-3 h-3 mr-1" />
                              )}
                              {invitation.status.charAt(0).toUpperCase() + invitation.status.slice(1)}
                            </Badge>
                            {isExpired && (
                              <Badge variant="outline" className="bg-orange-50 max-w-16 text-orange-600 border-orange-200">
                                <AlertTriangle className="w-3 h-3" />
                                Expired
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">
                            <div>{formatDistanceToNow(new Date(invitation.invited_at), { addSuffix: true })}</div>
                            {invitation.responded_at && (
                              <div className="text-xs text-muted-foreground">
                                Replied {formatDistanceToNow(new Date(invitation.responded_at), { addSuffix: true })}
                              </div>
                            )}
                          </div>
                        </TableCell>
                        {isAdmin && (
                          <TableCell>
                            <div className="text-sm text-muted-foreground">
                              {invitation.invited_by_user?.name}
                            </div>
                          </TableCell>
                        )}
                        <TableCell>
                          <div className="flex gap-2">
                            {!canRespond && isExpired && !isAdmin ? (
                              <span className="text-sm text-muted-foreground">Expired</span>
                            ) : canRespond ? (
                              <>
                                {invitation.status !== "accepted" && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleRespondToInvitation(invitation._id, "accepted")}
                                    className="text-green-600 hover:bg-green-50"
                                  >
                                    <UserCheck className="w-4 h-4" />
                                  </Button>
                                )}
                                {invitation.status !== "declined" && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleRespondToInvitation(invitation._id, "declined")}
                                    className="text-red-600 hover:bg-red-50"
                                  >
                                    <UserX className="w-4 h-4" />
                                  </Button>
                                )}
                              </>
                            ) : null}
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>

            {isAdmin && (currentData as any)?.hasMore && (
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
                <span className="text-muted-foreground">
                  Page {page} • {(currentData as any)?.totalCount || 0} total
                </span>
              </span>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(page + 1)}
                  disabled={!(currentData as any)?.hasMore || isLoading}
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
    )
  }

  const renderPotentialInviteesTab = () => {
    const users = potentialInviteesData?.users || []

    return (
      <div className="w-full">
        {isLoading ? (
          <InvitationsSkeleton />
        ) : users.length === 0 ? (
          <div className="text-center py-12">
            <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="font-medium mb-2">No Potential Invitees</h3>
            <p className="text-sm text-muted-foreground">
              {searchTerm || typeFilter.length > 0
                ? "No users match your search criteria."
                : "All eligible users have already been invited to this tournament."
              }
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">
                      <Checkbox
                        checked={selectedItems.size === users.length && users.length > 0}
                        onCheckedChange={handleSelectAll}
                      />
                    </TableHead>
                    <TableHead>User</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>School</TableHead>
                    <TableHead className="w-32">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((user: any) => {
                    const TypeIcon = getTypeIcon(user.role === "school_admin" ? "school" : user.role)
                    const targetType = user.role === "school_admin" ? "school" : user.role

                    return (
                      <TableRow key={user._id}>
                        <TableCell>
                          <Checkbox
                            checked={selectedItems.has(user._id)}
                            onCheckedChange={(checked) =>
                              handleSelectItem(user._id, checked as boolean)
                            }
                          />
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <Avatar className="w-10 h-10">
                              <AvatarFallback className="bg-primary text-white">
                                {user.name.charAt(0).toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <div className="min-w-0">
                              <div className="font-medium truncate">{user.name}</div>
                              <CopyableEmail email={user.email} />
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className={getTypeColor(targetType)}>
                            <TypeIcon className="w-3 h-3 mr-1" />
                            {targetType.charAt(0).toUpperCase() + targetType.slice(1)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {user.school ? (
                            <div className="text-sm">
                              <div className="font-medium">{user.school.name}</div>
                              <div className="text-xs text-muted-foreground">{user.school.type}</div>
                            </div>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleSendInvitation(user._id, targetType)}
                            disabled={!canSendInvitations}
                          >
                            <Send className="w-4 h-4 mr-1" />
                            Invite
                          </Button>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>

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
                <span className="text-muted-foreground">
                  Page {page} • {potentialInviteesData?.totalCount || 0} total
                </span>
              </span>

              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(page + 1)}
                disabled={!potentialInviteesData?.hasMore || isLoading}
                className="h-8"
              >
                Next
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </>
        )}
      </div>
    )
  }

  const availableTypeOptions = getAvailableTypes()
  const filters = isAdmin ? [
    <MultiSelectFilter
      key="status"
      title="Status"
      options={INVITATION_STATUS_OPTIONS}
      selected={statusFilter}
      onSelectionChange={setStatusFilter}
    />,
    <MultiSelectFilter
      key="type"
      title="Type"
      options={availableTypeOptions.map(option => ({
        ...option,
        icon: React.createElement(option.icon, { className: "h-4 w-4" })
      }))}
      selected={typeFilter}
      onSelectionChange={setTypeFilter}
    />
  ] : [];

  const actions = []
  if (canSendInvitations && activeTab === "potential") {
    actions.push(
      <Button
        key="bulk-invite"
        size="sm"
        className="h-8 hover:bg-white hover:text-foreground"
        onClick={() => setShowBulkInviteDialog(true)}
        disabled={selectedItems.size === 0}
      >
        <Send className="h-4 w-4" />
        <span className="hidden md:block">Send Invitations ({selectedItems.size})</span>
      </Button>
    )
  }

  const bulkActions = []
  if (isAdmin && activeTab === "invitations") {
    bulkActions.push({
      label: "Accept Invitations",
      icon: <UserCheck className="h-4 w-4" />,
      onClick: () => {
        setResponseAction("accepted")
        setShowResponseDialog(true)
      }
    })
    bulkActions.push({
      label: "Decline Invitations",
      icon: <UserX className="h-4 w-4" />,
      onClick: () => {
        setResponseAction("declined")
        setShowResponseDialog(true)
      },
      variant: "destructive" as const
    })
  }

  const toolbar = (
    <DataToolbar
      searchTerm={searchTerm}
      onSearchChange={handleSearchChange}
      onReset={handleReset}
      filters={filters}
      actions={actions}
      isLoading={isLoading}
      selectedCount={selectedItems.size}
      bulkActions={bulkActions}
      searchPlaceholder={activeTab === "invitations" ? "Search invitations..." : "Search users..."}
      hideSearch={!isAdmin}
    />
  )

  if (isLoading) {
    return <InvitationsPageSkeleton />;
  }

  return (
    <CardLayoutWithToolbar toolbar={toolbar}>
      <div className="w-full bg-background">
        {availableTabs.length > 1 ? (
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-6">
              {availableTabs.map((tab) => {
                const Icon = tab.icon
                return (
                  <TabsTrigger key={tab.value} value={tab.value} className="flex items-center gap-2">
                    <Icon className="h-4 w-4" />
                    {tab.label}
                  </TabsTrigger>
                )
              })}
            </TabsList>

            <TabsContent value="invitations" className="mt-0">
              {renderInvitationsTab()}
            </TabsContent>

            <TabsContent value="potential" className="mt-0">
              {renderPotentialInviteesTab()}
            </TabsContent>
          </Tabs>
        ) : (
          <div className="w-full">
            {activeTab === "invitations" ? renderInvitationsTab() : renderPotentialInviteesTab()}
          </div>
        )}
      </div>

      <AlertDialog open={showBulkInviteDialog} onOpenChange={setShowBulkInviteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Send Bulk Invitations</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to send invitations to {selectedItems.size} selected user{selectedItems.size > 1 ? 's' : ''}?
              Email notifications will be sent to all invitees.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleBulkSendInvitations}>
              Send {selectedItems.size} Invitation{selectedItems.size > 1 ? 's' : ''}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showResponseDialog} onOpenChange={setShowResponseDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {responseAction === "accepted" ? "Accept" : "Decline"} Invitations
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to {responseAction === "accepted" ? "accept" : "decline"} {selectedItems.size} selected invitation{selectedItems.size > 1 ? 's' : ''}?
              This action will be performed on behalf of the invitees.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                const invitations = (invitationsData as any)?.invitations || []
                const selectedInvitations = invitations.filter((inv: any) => selectedItems.has(inv._id))

                for (const invitation of selectedInvitations) {
                  try {
                    await handleRespondToInvitation(invitation._id, responseAction)
                  } catch (error) {
                    console.error(`Failed to ${responseAction} invitation:`, error)
                  }
                }

                setSelectedItems(new Set())
                setShowResponseDialog(false)
              }}
              className={responseAction === "declined" ? "bg-red-600 hover:bg-red-700" : ""}
            >
              {responseAction === "accepted" ? "Accept" : "Decline"} {selectedItems.size} Invitation{selectedItems.size > 1 ? 's' : ''}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </CardLayoutWithToolbar>
  )
}