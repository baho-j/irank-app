"use client"

import React, { useState, useEffect, useMemo } from "react"
import { useQuery, useMutation } from "convex/react"
import { api } from "@/convex/_generated/api"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Checkbox } from "@/components/ui/checkbox"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
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
  Download,
  Upload,
  UserPlus,
  Ban,
  Trash2,
  Copy,
  Check,
  Link,
  ChevronLeft,
  ChevronRight,
  UserCheck,
  Share,
  UserX, BadgeCheck, CircleMinus, CircleCheck
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth"
import { useDebounce } from "@/hooks/use-debounce"
import { DataToolbar } from "@/components/shared/data-toolbar"
import { MultiSelectFilter } from "@/components/ui/multi-select-filter"
import {
  USER_ROLE_OPTIONS,
  USER_STATUS_OPTIONS,
  USER_VERIFICATION_OPTIONS,
  getRoleIcon,
  getStatusColor
} from "@/lib/constants"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { Id } from "@/convex/_generated/dataModel"
import { CardLayoutWithToolbar } from "@/components/shared/card-layout-with-toolbar";
import { AddUserDialog } from "@/components/users/add-user-dialog"
import { ImportUsersDialog } from "@/components/users/import-users-dialog"
import { ExportUsersDialog } from "@/components/users/export-users-dialog"
import { formatDistanceToNow } from "date-fns"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useOffline } from "@/hooks/use-offline";

function UserTableSkeleton() {
  return (
    <div className="w-full overflow-x-auto">
      <Table className="min-w-full table-auto">
        <TableHeader>
          <TableRow>
            <TableHead className="w-10">
              <Skeleton className="h-4 w-4" />
            </TableHead>
            <TableHead>Full Name</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Phone</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Verified</TableHead>
            <TableHead>Last Login</TableHead>
            <TableHead className="w-32"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {[1, 2, 3, 4, 5].map((i) => (
            <TableRow key={i}>
              <TableCell>
                <Skeleton className="h-4 w-4" />
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-3">
                  <Skeleton className="h-10 w-10 rounded-full" />
                  <Skeleton className="h-4 w-full max-w-[120px]" />
                </div>
              </TableCell>
              <TableCell>
                <Skeleton className="h-4 w-full max-w-[160px]" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-4 w-full max-w-[120px]" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-6 w-full max-w-[80px]" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-6 w-full max-w-[70px]" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-6 w-full max-w-[70px]" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-4 w-full max-w-[100px]" />
              </TableCell>
              <TableCell>
                <div className="flex gap-2">
                  <Skeleton className="h-8 w-10" />
                  <Skeleton className="h-8 w-10" />
                  <Skeleton className="h-8 w-10" />
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>

      </Table>
    </div>
  );
}

function CopyableField({ value, type = "text" }: { value: string, type?: "email" | "phone" | "text" }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (error) {
      toast.error("Failed to copy")
    }
  }

  const handleClick = () => {
    if (type === "email") {
      window.location.href = `mailto:${value}`
    } else if (type === "phone") {
      window.location.href = `tel:${value}`
    }
  }

  return (
    <div className="flex items-center gap-1 group">
      <span
        className={cn(
          "truncate",
          (type === "email" || type === "phone") && "cursor-pointer text-xs hover:text-primary hover:underline"
        )}
        onClick={handleClick}
      >
        {value}
      </span>
      <Button
        variant="ghost"
        size="sm"
        className="h-4 w-4 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={handleCopy}
      >
        {copied ? (
          <Check className="h-3 w-3 text-green-600" />
        ) : (
          <Copy className="h-3 w-3" />
        )}
      </Button>
    </div>
  )
}

function UserActionButton({
                            icon: Icon,
                            label,
                            onClick,
                            variant = "ghost",
                            disabled = false
                          }: {
  icon: React.ElementType
  label: string
  onClick: () => void
  variant?: "ghost" | "destructive"
  disabled?: boolean
}) {
  return (
    <Button
      variant={"ghost"}
      size="sm"
      className="h-auto p-1 flex flex-col items-center gap-1"
      onClick={onClick}
      disabled={disabled}
    >
      <Icon className={cn("h-1 w-1",variant === "destructive" ? "text-red-500" : "text-foreground")} />
      <span
        className={cn(
          "text-[10px]",
          variant === "destructive" ? "text-red-500" : "text-muted-foreground"
        )}
      >
        {label}
      </span>
    </Button>
  )
}

export default function UsersPage() {
  const { token, user } = useAuth()
  const [searchTerm, setSearchTerm] = useState("")
  const [roleFilter, setRoleFilter] = useState<string[]>([])
  const [statusFilter, setStatusFilter] = useState<string[]>([])
  const [verificationFilter, setVerificationFilter] = useState<string[]>([])
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set())
  const [page, setPage] = useState(1)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [userToDelete, setUserToDelete] = useState<string | null>(null)
  const [showBulkDialog, setShowBulkDialog] = useState(false)
  const [bulkAction, setBulkAction] = useState<string>("")
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [showImportDialog, setShowImportDialog] = useState(false)
  const [showExportDialog, setShowExportDialog] = useState(false)
  const [showResetLinksDialog, setShowResetLinksDialog] = useState(false)
  const [resetLinks, setResetLinks] = useState<Array<{name: string, email: string, link: string}>>([])
  const [copiedResetLinks, setCopiedResetLinks] = useState<Set<number>>(new Set())

  const debouncedSearch = useDebounce(searchTerm, 300)

  const usersData = useOffline(useQuery(
    api.functions.admin.users.getUsers,
    token ? {
      admin_token: token,
      search: debouncedSearch,
      role: roleFilter.length === 1 ? roleFilter[0] as any : undefined,
      status: statusFilter.length === 1 ? statusFilter[0] as any : undefined,
      verified: verificationFilter.length === 1 ? verificationFilter[0] as any : undefined,
      page,
      limit: 20,
    } : "skip"
  ), "users");

  const isSuperAdminResult = useOffline(useQuery(
    api.functions.admin.superadmin.isSuperAdmin,
    token && user?.role === "admin" ? {
      token: token,
      user_id: user.id as Id<"users">
    } : "skip"
  ), "super-admin");

  const isSuperAdminUser = isSuperAdminResult === true;

  const updateUserStatus = useMutation(api.functions.admin.users.updateUserStatus)
  const verifyUser = useMutation(api.functions.admin.users.verifyUser)
  const deleteUser = useMutation(api.functions.admin.users.deleteUser)
  const bulkUpdateUsers = useMutation(api.functions.admin.users.bulkUpdateUsers)
  const generateResetLink = useMutation(api.functions.admin.users.generateResetLink)
  const getUrl = useMutation(api.files.getUrl)

  // Back to the first page when the filters change, without a second render
  // pass to correct an out-of-range page.
  const filterKey = JSON.stringify([debouncedSearch, roleFilter, statusFilter, verificationFilter])
  const [pagedFor, setPagedFor] = useState(filterKey)

  if (filterKey !== pagedFor) {
    setPagedFor(filterKey)
    setPage(1)
  }

  const allUsers = usersData?.users

  const filteredUsers = useMemo(() => {
    if (!allUsers) return []

    return allUsers.filter(user => {
      if (roleFilter.length > 0 && !roleFilter.includes(user.role)) {
        return false
      }

      if (statusFilter.length > 0 && !statusFilter.includes(user.status)) {
        return false
      }

      if (verificationFilter.length > 0) {
        const userVerificationStatus = user.verified ? "verified" : "pending"
        if (!verificationFilter.includes(userVerificationStatus)) {
          return false
        }
      }

      return true
    })
  }, [allUsers, roleFilter, statusFilter, verificationFilter])

  useEffect(() => {
    async function fetchImageUrl() {
      if (user?.profile_image) {
        try {
          const url = await getUrl({ storageId: user.profile_image as Id<"_storage"> })
          setImageUrl(url)
        } catch (error) {
          console.error("Failed to fetch profile image URL:", error)
        }
      }
    }

    fetchImageUrl()
  }, [user?.profile_image, getUrl])

  const handleSearchChange = (value: string) => {
    setSearchTerm(value)
  }

  const handleReset = () => {
    setSearchTerm("")
    setRoleFilter([])
    setStatusFilter([])
    setVerificationFilter([])
    setPage(1)
  }

  const handleSelectUser = (userId: string, checked: boolean) => {
    const newSelected = new Set(selectedUsers)
    if (checked) {
      newSelected.add(userId)
    } else {
      newSelected.delete(userId)
    }
    setSelectedUsers(newSelected)
  }

  const handleSelectAll = (checked: boolean) => {
    if (checked && filteredUsers) {
      setSelectedUsers(new Set(filteredUsers.map(u => u._id)))
    } else {
      setSelectedUsers(new Set())
    }
  }

  const handleStatusChange = async (userId: Id<"users">, status: "active" | "inactive" | "banned") => {
    if (user?.id === userId) {
      toast.error("You cannot change your own status")
      return
    }

    try {
      await updateUserStatus({
        admin_token: token!,
        user_id: userId,
        status,
      })
      toast.success("User status updated successfully")
    } catch (error: any) {
      toast.error(error.message?.split("Uncaught Error:")[1]?.split(/\.|Called by client/)[0]?.trim() || "Failed to update user status")
    }
  }

  const handleVerifyUser = async (userId: Id<"users">, verified: boolean) => {
    try {
      await verifyUser({
        admin_token: token!,
        user_id: userId,
        verified,
      })
      toast.success(`User ${verified ? 'verified' : 'unverified'} successfully`)
    } catch (error: any) {
      toast.error(error.message?.split("Uncaught Error:")[1]?.split(/\.|Called by client/)[0]?.trim() || "Failed to update user verification")
    }
  }

  const handleDeleteUser = async () => {
    if (!userToDelete) return

    try {
      await deleteUser({
        admin_token: token!,
        user_id: userToDelete as Id<"users">,
      })
      toast.success("User deleted successfully")
      setShowDeleteDialog(false)
      setUserToDelete(null)
    } catch (error: any) {
      toast.error(error.message?.split("Uncaught Error:")[1]?.split(/\.|Called by client/)[0]?.trim() || "Failed to delete user")
    }
  }

  const handleBulkAction = async () => {
    if (selectedUsers.size === 0 || !bulkAction) return

    try {
      const result = await bulkUpdateUsers({
        admin_token: token!,
        user_ids: Array.from(selectedUsers) as Id<"users">[],
        action: bulkAction as any,
      })

      const successCount = result.results.filter(r => r.success).length
      const failureCount = result.results.filter(r => !r.success).length

      if (successCount > 0) {
        toast.success(`${successCount} users updated successfully`)
      }
      if (failureCount > 0) {
        toast.error(`${failureCount} users failed to update`)
      }

      setSelectedUsers(new Set())
      setShowBulkDialog(false)
      setBulkAction("")
    } catch (error: any) {
      toast.error(error.message?.split("Uncaught Error:")[1]?.split(/\.|Called by client/)[0]?.trim() || "Failed to perform bulk action")
    }
  }

  const handleSingleResetLink = async (userId: Id<"users">, userName: string, userEmail: string) => {
    try {
      const result = await generateResetLink({
        admin_token: token!,
        user_id: userId,
      })

      if (result.success) {
        setResetLinks([{
          name: userName,
          email: userEmail,
          link: result.resetLink
        }])
        setShowResetLinksDialog(true)
        toast.success("Reset link generated successfully")
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to generate reset link")
    }
  }

  const handleBulkResetLinks = async () => {
    if (selectedUsers.size === 0) return

    try {
      const links: Array<{name: string, email: string, link: string}> = []

      for (const userId of Array.from(selectedUsers)) {
        const user = users.find(u => u._id === userId)
        if (user && user.verified && user.status === "inactive") {
          try {
            const result = await generateResetLink({
              admin_token: token!,
              user_id: userId as Id<"users">,
            })

            if (result.success) {
              links.push({
                name: user.name,
                email: user.email,
                link: result.resetLink
              })
            }
          } catch (error) {
            console.error(`Failed to generate link for ${user.name}:`, error)
          }
        }
      }

      if (links.length > 0) {
        setResetLinks(links)
        setShowResetLinksDialog(true)
        toast.success(`Generated ${links.length} reset links`)
      } else {
        toast.error("No eligible users selected (must be verified and inactive)")
      }

      setSelectedUsers(new Set())
    } catch (error: any) {
      toast.error("Failed to generate reset links")
    }
  }

  const handleCopyResetLink = async (link: string, index: number) => {
    try {
      await navigator.clipboard.writeText(link)
      setCopiedResetLinks(prev => {
        const newSet = new Set(Array.from(prev));
        newSet.add(index);
        return newSet
      })
      setTimeout(() => {
        setCopiedResetLinks(prev => {
          const newSet = new Set(prev)
          newSet.delete(index)
          return newSet
        })
      }, 2000)
      toast.success("Reset link copied!")
    } catch (error) {
      toast.error("Failed to copy link")
    }
  }

  const handleCopyAllResetLinks = async () => {
    try {
      const allLinks = resetLinks.map(item =>
        `${item.name} (${item.email}): ${item.link}`
      ).join('\n\n')

      await navigator.clipboard.writeText(allLinks)
      toast.success("All reset links copied!")
    } catch (error) {
      toast.error("Failed to copy links")
    }
  }

  const isLoading = usersData === undefined
  const users = filteredUsers || []
  const totalCount = usersData?.totalCount || 0
  const hasMore = usersData?.hasMore || false

  const filters = [
    <MultiSelectFilter
      key="role"
      title="Role"
      options={USER_ROLE_OPTIONS.map(option => ({
        ...option,
        icon: React.createElement(option.icon, { className: "h-4 w-4" })
      }))}
      selected={roleFilter}
      onSelectionChange={setRoleFilter}
    />,
    <MultiSelectFilter
      key="status"
      title="Status"
      options={USER_STATUS_OPTIONS}
      selected={statusFilter}
      onSelectionChange={setStatusFilter}
    />,
    <MultiSelectFilter
      key="verification"
      title="Valid"
      options={USER_VERIFICATION_OPTIONS}
      selected={verificationFilter}
      onSelectionChange={setVerificationFilter}
    />
  ]

  const actions = [
    <Button
      key="import"
      variant="outline"
      size="sm"
      className="h-8 border-white/20"
      onClick={() => setShowImportDialog(true)}
    >
      <Upload className="h-4 w-4" />
      <span className="hidden md:block">Import</span>
    </Button>,
    isSuperAdminUser && (
      <Button
        key="export"
        variant="outline"
        size="sm"
        className="h-8 border-white/20"
        onClick={() => setShowExportDialog(true)}
      >
        <Download className="h-4 w-4" />
        <span className="hidden md:block">Export</span>
      </Button>
    ),
    <Button
      key="add"
      size="sm"
      className="h-8 hover:bg-white hover:text-foreground"
      onClick={() => setShowAddDialog(true)}
    >
      <UserPlus className="h-4 w-4" />
      <span className="hidden md:block">Add User</span>
    </Button>
  ]

  const bulkActions = [
    {
      label: "Verify Users",
      icon: <BadgeCheck className="h-4 w-4" />,
      onClick: () => {
        setBulkAction("verify")
        setShowBulkDialog(true)
      }
    },
    {
      label: "Unverify Users",
      icon: <CircleMinus className="h-4 w-4" />,
      onClick: () => {
        setBulkAction("unverify")
        setShowBulkDialog(true)
      }
    },
    ...(isSuperAdminUser ? [
      {
        label: "Activate Users",
        icon: <CircleCheck className="h-4 w-4" />,
        onClick: () => {
          setBulkAction("activate")
          setShowBulkDialog(true)
        }
      },
      {
        label: "Ban Users",
        icon: <Ban className="h-4 w-4" />,
        onClick: () => {
          setBulkAction("ban")
          setShowBulkDialog(true)
        },
        variant: "destructive" as const
      }
    ] : []),
    {
      label: "Generate Reset Links",
      icon: <Share className="h-4 w-4" />,
      onClick: () => handleBulkResetLinks()
    }
  ]

  const toolbar = (
    <DataToolbar
      searchTerm={searchTerm}
      onSearchChange={handleSearchChange}
      onReset={handleReset}
      filters={filters}
      actions={actions}
      isLoading={isLoading}
      selectedCount={selectedUsers.size}
      bulkActions={bulkActions}
      searchPlaceholder="Search users..."
    />
  )

  return (
    <CardLayoutWithToolbar toolbar={toolbar} description="Manage platform users and their permissions">
      <div className="w-full bg-background">
        {isLoading ? (
          <UserTableSkeleton />
        ) : (
          <>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">
                      <Checkbox
                        checked={selectedUsers.size === users.length && users.length > 0}
                        onCheckedChange={handleSelectAll}
                      />
                    </TableHead>
                    <TableHead>Full Name</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="hidden sm:table-cell">Verified</TableHead>
                    <TableHead className="hidden lg:table-cell">Last Login</TableHead>
                    <TableHead className="w-32"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center py-12">
                        <div className="flex flex-col items-center justify-center">
                          <UserX className="h-12 w-12 text-muted-foreground mb-4" />
                          <h3 className=" font-medium mb-2">No users found</h3>
                          <p className="text-muted-foreground text-center text-sm max-w-sm">
                            {searchTerm || roleFilter.length > 0 || statusFilter.length > 0 || verificationFilter.length > 0
                              ? "Try adjusting your search criteria or filters"
                              : "Get started by adding your first user to the platform"
                            }
                          </p>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    users.map((currentUser) => {
                      const RoleIcon = getRoleIcon(currentUser.role)
                      const isCurrentUser = currentUser._id === user?.id
                      return (
                        <TableRow key={currentUser._id}>
                          <TableCell>
                            <Checkbox
                              checked={selectedUsers.has(currentUser._id)}
                              onCheckedChange={(checked) =>
                                handleSelectUser(currentUser._id, checked as boolean)
                              }
                            />
                          </TableCell>
                          <TableCell >
                            <div className="flex items-start gap-4">
                              <Avatar className="w-12 h-12 mt-1 shrink-0">
                                {currentUser.profile_image ? (
                                  <AvatarImage src={imageUrl || ""} alt={currentUser.name} />
                                ) : (
                                  <AvatarFallback className="bg-primary text-white">
                                    {currentUser.name.charAt(0).toUpperCase()}
                                  </AvatarFallback>
                                )}
                              </Avatar>

                              <div className="flex flex-col gap-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1 flex-wrap">
                                  <Badge variant="secondary" className={`w-fit ${
                                    currentUser.role.includes('admin')
                                      ? currentUser.role === 'admin'
                                        ? 'bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-100'
                                        : 'bg-violet-100 text-violet-800 dark:bg-violet-900 dark:text-violet-100'
                                      : currentUser.role === 'student'
                                        ? 'bg-sky-100 text-sky-800 dark:bg-sky-900 dark:text-sky-100'
                                        : currentUser.role === 'volunteer'
                                          ? 'bg-fuchsia-100 text-fuchsia-800 dark:bg-fuchsia-900 dark:text-fuchsia-100'
                                          : 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-100'
                                  }`}>
                                    <div className="flex items-center gap-1">
                                      <RoleIcon className="h-4 w-4" />
                                      <span className="capitalize">{currentUser.role.replace('_', ' ')}</span>
                                    </div>
                                  </Badge>

                                  {(currentUser.role === "student" || currentUser.role === "school_admin") && currentUser.school && (
                                    <Badge variant="default" className="bg-primary text-primary-foreground">
                                      <div className="flex items-center gap-1">
                                        <span className="text-xs truncate max-w-[150px]" title={currentUser.school.name}>
                                          {currentUser.school.name}
                                        </span>
                                      </div>
                                    </Badge>
                                  )}
                                </div>

                                <span className="font-medium truncate max-w-[250px]">
                                  {currentUser.name}
                                </span>

                                <CopyableField value={currentUser.email} type="email"/>

                                {currentUser.phone ? (
                                  <CopyableField value={currentUser.phone} type="phone" />
                                ) : (
                                  <span className="text-muted-foreground">-</span>
                                )}
                              </div>
                            </div>
                          </TableCell>

                          <TableCell>
                            <Badge variant="secondary" className={getStatusColor(currentUser.status)}>
                              {currentUser.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="hidden sm:table-cell">
                            <Badge
                              variant="secondary"
                              className={currentUser.verified ? "text-green-600 bg-green-100" : "text-orange-600 bg-orange-100"}
                            >
                              {currentUser.verified ? "Verified" : "Pending"}
                            </Badge>
                          </TableCell>
                          <TableCell className="hidden lg:table-cell">
                            {currentUser.last_login_at ? (
                              <span className="text-sm text-muted-foreground">
                                {formatDistanceToNow(new Date(currentUser.last_login_at), { addSuffix: true })}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">Never</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              {currentUser.verified ? (
                                <UserActionButton
                                  icon={CircleMinus}
                                  label="Unverify"
                                  onClick={() => handleVerifyUser(currentUser._id, false)}
                                  disabled={isCurrentUser}
                                />
                              ) : (
                                <UserActionButton
                                  icon={BadgeCheck}
                                  label="Verify"
                                  onClick={() => handleVerifyUser(currentUser._id, true)}
                                  disabled={isCurrentUser}
                                />
                              )}

                              {isSuperAdminUser && (
                                currentUser.status === "active" ? (
                                  <UserActionButton
                                    icon={Ban}
                                    label="Ban"
                                    onClick={() => handleStatusChange(currentUser._id, "banned")}
                                    disabled={isCurrentUser}
                                  />
                                ) : (
                                  <UserActionButton
                                    icon={UserCheck}
                                    label="Activate"
                                    onClick={() => handleStatusChange(currentUser._id, "active")}
                                    disabled={isCurrentUser}
                                  />
                                ))}
                              {currentUser.verified && currentUser.status === "inactive" && (
                                <UserActionButton
                                  icon={Link}
                                  label="Reset Link"
                                  onClick={() => handleSingleResetLink(currentUser._id, currentUser.name, currentUser.email)}
                                  disabled={isCurrentUser}
                                />
                              )}
                              {isSuperAdminUser && (
                                <UserActionButton
                                  icon={Trash2}
                                  label="Delete"
                                  onClick={() => {
                                    setUserToDelete(currentUser._id)
                                    setShowDeleteDialog(true)
                                  }}
                                  variant="destructive"
                                  disabled={isCurrentUser}
                                />
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      )
                    })
                  )}
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
                {totalCount > 0 && (
                  <span className="text-muted-foreground">
                    {users.length} of {totalCount} users
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
          </>
        )}
      </div>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete User</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this user? This action cannot be undone and will permanently remove the user and all associated data.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteUser}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete User
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showBulkDialog} onOpenChange={setShowBulkDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Bulk Action</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to {bulkAction} {selectedUsers.size} selected user{selectedUsers.size > 1 ? 's' : ''}?
              This action will be applied to all selected users.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleBulkAction}>
              {bulkAction === "ban" ? "Ban Users" : `${bulkAction.charAt(0).toUpperCase() + bulkAction.slice(1)} Users`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AddUserDialog
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
      />

      <ImportUsersDialog
        open={showImportDialog}
        onOpenChange={setShowImportDialog}
      />

      <ExportUsersDialog
        open={showExportDialog}
        onOpenChange={setShowExportDialog}
      />

      <Dialog open={showResetLinksDialog} onOpenChange={setShowResetLinksDialog}>
        <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Reset Password Links</DialogTitle>
            <DialogDescription>
              Share these links with users so they can set their passwords. Links expire in 24 hours.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex justify-between items-center">
          <span className="text-sm text-muted-foreground">
            {resetLinks.length} reset link{resetLinks.length > 1 ? 's' : ''} generated
          </span>
              <Button variant="outline" size="sm" onClick={handleCopyAllResetLinks}>
                <Copy className="h-4 w-4 mr-2" />
                Copy All
              </Button>
            </div>

            <div className="space-y-3">
              {resetLinks.map((item, index) => (
                <div key={index} className="border rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-medium">{item.name}</h4>
                      <p className="text-sm text-muted-foreground">{item.email}</p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-sm">Reset Password Link</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        value={item.link}
                        readOnly
                        className="flex-1 text-sm"
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleCopyResetLink(item.link, index)}
                      >
                        {copiedResetLinks.has(index) ? (
                          <Check className="h-4 w-4 text-green-600" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      This link will expire in 24 hours. The user should use this to set their new password.
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end">
            <Button onClick={() => setShowResetLinksDialog(false)}>Done</Button>
          </div>
        </DialogContent>
      </Dialog>

    </CardLayoutWithToolbar>
  )
}