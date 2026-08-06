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
  UserX,
  BadgeCheck,
  CircleMinus,
  CircleCheck,
  GraduationCap,
  Zap
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth"
import { useDebounce } from "@/hooks/use-debounce"
import { DataToolbar } from "@/components/shared/data-toolbar"
import { MultiSelectFilter } from "@/components/ui/multi-select-filter"
import {
  USER_STATUS_OPTIONS,
  USER_VERIFICATION_OPTIONS,
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
    <div className="flex items-center gap-2 group">
      <span
        className={cn(
          "truncate",
          (type === "email" || type === "phone") && "cursor-pointer hover:text-primary hover:underline"
        )}
        onClick={handleClick}
      >
        {value}
      </span>
      <Button
        variant="ghost"
        size="sm"
        className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
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

function StudentActionButton({
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
      <Icon className={cn("h-4 w-4",variant === "destructive" ? "text-red-500" : "text-foreground")} />
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

function StudentTableSkeleton() {
  return (
    <div className="w-full overflow-x-auto">
      <Table className="min-w-full table-auto">
        <TableHeader>
          <TableRow>
            <TableHead className="w-10">
              <Skeleton className="h-4 w-4" />
            </TableHead>
            <TableHead>Student Info</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Verified</TableHead>
            <TableHead>Debate Activity</TableHead>
            <TableHead className="hidden lg:table-cell">Last Login</TableHead>
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
                <Skeleton className="h-6 w-full max-w-[70px]" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-6 w-full max-w-[70px]" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-6 w-full max-w-[80px]" />
              </TableCell>
              <TableCell className="hidden lg:table-cell">
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

export default function StudentsPage() {
  const { token, user } = useAuth()
  const [searchTerm, setSearchTerm] = useState("")
  const [statusFilter, setStatusFilter] = useState<string[]>([])
  const [verificationFilter, setVerificationFilter] = useState<string[]>([])
  const [gradeFilter, setGradeFilter] = useState<string[]>([])
  const [selectedStudents, setSelectedStudents] = useState<Set<string>>(new Set())
  const [page, setPage] = useState(1)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [studentToDelete, setStudentToDelete] = useState<string | null>(null)
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

  const studentsData = useQuery(
    api.functions.school.students.getStudents,
    token ? {
      school_admin_token: token,
      search: debouncedSearch,
      status: statusFilter.length === 1 ? statusFilter[0] as any : undefined,
      verified: verificationFilter.length === 1 ? verificationFilter[0] as any : undefined,
      grade: gradeFilter.length === 1 ? gradeFilter[0] : undefined,
      page,
      limit: 20,
    } : "skip"
  )

  const gradesData = useQuery(
    api.functions.school.students.getGradesList,
    token ? { school_admin_token: token } : "skip"
  )

  const updateStudentStatus = useMutation(api.functions.school.students.updateStudentStatus)
  const verifyStudent = useMutation(api.functions.school.students.verifyStudent)
  const deleteStudent = useMutation(api.functions.school.students.deleteStudent)
  const bulkUpdateStudents = useMutation(api.functions.school.students.bulkUpdateStudents)
  const generateResetLink = useMutation(api.functions.school.students.generateStudentResetLink)
  const getUrl = useMutation(api.files.getUrl)

  // Back to the first page when the filters change, without a second render
  // pass to correct an out-of-range page.
  const filterKey = JSON.stringify([debouncedSearch, statusFilter, verificationFilter, gradeFilter])
  const [pagedFor, setPagedFor] = useState(filterKey)

  if (filterKey !== pagedFor) {
    setPagedFor(filterKey)
    setPage(1)
  }

  const allStudents = studentsData?.students

  const filteredStudents = useMemo(() => {
    if (!allStudents) return []

    return allStudents.filter(student => {
      if (statusFilter.length > 0 && !statusFilter.includes(student.status)) {
        return false
      }

      if (verificationFilter.length > 0) {
        const studentVerificationStatus = student.verified ? "verified" : "pending"
        if (!verificationFilter.includes(studentVerificationStatus)) {
          return false
        }
      }

      return !(gradeFilter.length > 0 && !gradeFilter.includes(student.grade || ""));


    })
  }, [allStudents, statusFilter, verificationFilter, gradeFilter])

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
    setStatusFilter([])
    setVerificationFilter([])
    setGradeFilter([])
    setPage(1)
  }

  const handleSelectStudent = (studentId: string, checked: boolean) => {
    const newSelected = new Set(selectedStudents)
    if (checked) {
      newSelected.add(studentId)
    } else {
      newSelected.delete(studentId)
    }
    setSelectedStudents(newSelected)
  }

  const handleSelectAll = (checked: boolean) => {
    if (checked && filteredStudents) {
      setSelectedStudents(new Set(filteredStudents.map(s => s._id)))
    } else {
      setSelectedStudents(new Set())
    }
  }

  const handleStatusChange = async (studentId: Id<"users">, status: "active" | "inactive" | "banned") => {
    try {
      await updateStudentStatus({
        school_admin_token: token!,
        student_id: studentId,
        status,
      })
      toast.success("Student status updated successfully")
    } catch (error: any) {
      toast.error(error.message?.split("Uncaught Error:")[1]?.split(/\.|Called by client/)[0]?.trim() || "Failed to update student status")
    }
  }

  const handleVerifyStudent = async (studentId: Id<"users">, verified: boolean) => {
    try {
      await verifyStudent({
        school_admin_token: token!,
        student_id: studentId,
        verified,
      })
      toast.success(`Student ${verified ? 'verified' : 'unverified'} successfully`)
    } catch (error: any) {
      toast.error(error.message?.split("Uncaught Error:")[1]?.split(/\.|Called by client/)[0]?.trim() || "Failed to update student verification")
    }
  }

  const handleDeleteStudent = async () => {
    if (!studentToDelete) return

    try {
      await deleteStudent({
        school_admin_token: token!,
        student_id: studentToDelete as Id<"users">,
      })
      toast.success("Student deleted successfully")
      setShowDeleteDialog(false)
      setStudentToDelete(null)
    } catch (error: any) {
      toast.error(error.message?.split("Uncaught Error:")[1]?.split(/\.|Called by client/)[0]?.trim() || "Failed to delete student")
    }
  }

  const handleBulkAction = async () => {
    if (selectedStudents.size === 0 || !bulkAction) return

    try {
      const result = await bulkUpdateStudents({
        school_admin_token: token!,
        student_ids: Array.from(selectedStudents) as Id<"users">[],
        action: bulkAction as any,
      })

      const successCount = result.results.filter(r => r.success).length
      const failureCount = result.results.filter(r => !r.success).length

      if (successCount > 0) {
        toast.success(`${successCount} students updated successfully`)
      }
      if (failureCount > 0) {
        toast.error(`${failureCount} students failed to update`)
      }

      setSelectedStudents(new Set())
      setShowBulkDialog(false)
      setBulkAction("")
    } catch (error: any) {
      toast.error(error.message?.split("Uncaught Error:")[1]?.split(/\.|Called by client/)[0]?.trim() || "Failed to perform bulk action")
    }
  }

  const handleSingleResetLink = async (studentId: Id<"users">, studentName: string, studentEmail: string) => {
    try {
      const result = await generateResetLink({
        school_admin_token: token!,
        student_id: studentId,
      })

      if (result.success) {
        setResetLinks([{
          name: studentName,
          email: studentEmail,
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
    if (selectedStudents.size === 0) return

    try {
      const links: Array<{name: string, email: string, link: string}> = []

      for (const studentId of Array.from(selectedStudents)) {
        const student = students.find(s => s._id === studentId)
        if (student && student.verified && student.status === "inactive") {
          try {
            const result = await generateResetLink({
              school_admin_token: token!,
              student_id: studentId as Id<"users">,
            })

            if (result.success) {
              links.push({
                name: student.name,
                email: student.email,
                link: result.resetLink
              })
            }
          } catch (error) {
            console.error(`Failed to generate link for ${student.name}:`, error)
          }
        }
      }

      if (links.length > 0) {
        setResetLinks(links)
        setShowResetLinksDialog(true)
        toast.success(`Generated ${links.length} reset links`)
      } else {
        toast.error("No eligible students selected (must be verified and inactive)")
      }

      setSelectedStudents(new Set())
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

  const isLoading = studentsData === undefined
  const students = filteredStudents || []
  const totalCount = studentsData?.totalCount || 0
  const hasMore = studentsData?.hasMore || false

  const availableGrades = gradesData?.grades || []

  const GRADE_OPTIONS = availableGrades.map(grade => ({
    label: grade,
    value: grade,
  }))

  const filters = [
    <MultiSelectFilter
      key="status"
      title="Status"
      options={USER_STATUS_OPTIONS}
      selected={statusFilter}
      onSelectionChange={setStatusFilter}
    />,
    <MultiSelectFilter
      key="verification"
      title="Verified"
      options={USER_VERIFICATION_OPTIONS}
      selected={verificationFilter}
      onSelectionChange={setVerificationFilter}
    />,
    <MultiSelectFilter
      key="grade"
      title="Grade"
      options={GRADE_OPTIONS}
      selected={gradeFilter}
      onSelectionChange={setGradeFilter}
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
    <Button
      key="export"
      variant="outline"
      size="sm"
      className="h-8 border-white/20"
      onClick={() => setShowExportDialog(true)}
    >
      <Download className="h-4 w-4" />
      <span className="hidden md:block">Export</span>
    </Button>,
    <Button
      key="add"
      size="sm"
      className="h-8 hover:bg-white hover:text-foreground"
      onClick={() => setShowAddDialog(true)}
    >
      <UserPlus className="h-4 w-4" />
      <span className="hidden md:block">Add Student</span>
    </Button>
  ]

  const bulkActions = [
    {
      label: "Verify Students",
      icon: <BadgeCheck className="h-4 w-4" />,
      onClick: () => {
        setBulkAction("verify")
        setShowBulkDialog(true)
      }
    },
    {
      label: "Unverify Students",
      icon: <CircleMinus className="h-4 w-4" />,
      onClick: () => {
        setBulkAction("unverify")
        setShowBulkDialog(true)
      }
    },
    {
      label: "Activate Students",
      icon: <CircleCheck className="h-4 w-4" />,
      onClick: () => {
        setBulkAction("activate")
        setShowBulkDialog(true)
      }
    },
    {
      label: "Ban Students",
      icon: <Ban className="h-4 w-4" />,
      onClick: () => {
        setBulkAction("ban")
        setShowBulkDialog(true)
      },
      variant: "destructive" as const
    },
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
      selectedCount={selectedStudents.size}
      bulkActions={bulkActions}
      searchPlaceholder="Search students..."
    />
  )

  return (
    <CardLayoutWithToolbar toolbar={toolbar} description="Manage your school's students and their accounts">
      <div className="w-full bg-background">
        {isLoading ? (
          <StudentTableSkeleton />
        ) : (
          <>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">
                      <Checkbox
                        checked={selectedStudents.size === students.length && students.length > 0}
                        onCheckedChange={handleSelectAll}
                      />
                    </TableHead>
                    <TableHead>Student Info</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="hidden sm:table-cell">Verified</TableHead>
                    <TableHead className="hidden md:table-cell">Debate Activity</TableHead>
                    <TableHead className="hidden lg:table-cell">Last Login</TableHead>
                    <TableHead className="w-32"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {students.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-12">
                        <div className="flex flex-col items-center justify-center">
                          <UserX className="h-12 w-12 text-muted-foreground mb-4" />
                          <h3 className="font-medium mb-2">No students found</h3>
                          <p className="text-muted-foreground text-center text-sm max-w-sm">
                            {searchTerm || statusFilter.length > 0 || verificationFilter.length > 0 || gradeFilter.length > 0
                              ? "Try adjusting your search criteria or filters"
                              : "Get started by adding your first student to your school"
                            }
                          </p>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    students.map((currentStudent) => (
                      <TableRow key={currentStudent._id}>
                        <TableCell>
                          <Checkbox
                            checked={selectedStudents.has(currentStudent._id)}
                            onCheckedChange={(checked) =>
                              handleSelectStudent(currentStudent._id, checked as boolean)
                            }
                          />
                        </TableCell>
                        <TableCell>
                          <div className="flex items-start gap-4">
                            <Avatar className="w-12 h-12 mt-1 shrink-0">
                              {currentStudent.profile_image ? (
                                <AvatarImage src={imageUrl || ""} alt={currentStudent.name} />
                              ) : (
                                <AvatarFallback className="bg-primary text-white">
                                  {currentStudent.name.charAt(0).toUpperCase()}
                                </AvatarFallback>
                              )}
                            </Avatar>

                            <div className="flex flex-col gap-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1 flex-wrap">
                                <Badge variant="secondary" className="w-fit bg-blue-100 text-blue-700">
                                  <div className="flex items-center gap-1">
                                    <GraduationCap className="h-4 w-4" />
                                    <span>{currentStudent.grade || "No Grade"}</span>
                                  </div>
                                </Badge>

                                <Badge
                                  variant="secondary"
                                  className={cn(
                                    "w-fit",
                                    currentStudent.has_debated
                                      ? "bg-green-100 text-green-700"
                                      : "bg-gray-100 text-gray-700"
                                  )}
                                >
                                  <div className="flex items-center gap-1">
                                    <Zap className="h-4 w-4" />
                                    <span>{currentStudent.has_debated ? "Active Debater" : "New Student"}</span>
                                  </div>
                                </Badge>
                              </div>

                              <span className="font-medium truncate max-w-[250px]">
                                {currentStudent.name}
                              </span>

                              <CopyableField value={currentStudent.email} type="email"/>

                              {currentStudent.phone ? (
                                <CopyableField value={currentStudent.phone} type="phone" />
                              ) : (
                                <span className="text-muted-foreground">-</span>
                              )}
                            </div>
                          </div>
                        </TableCell>

                        <TableCell>
                          <Badge variant="secondary" className={getStatusColor(currentStudent.status)}>
                            {currentStudent.status}
                          </Badge>
                        </TableCell>

                        <TableCell className="hidden sm:table-cell">
                          <Badge
                            variant="secondary"
                            className={currentStudent.verified ? "text-green-600 bg-green-100" : "text-orange-600 bg-orange-100"}
                          >
                            {currentStudent.verified ? "Verified" : "Pending"}
                          </Badge>
                        </TableCell>

                        <TableCell className="hidden md:table-cell">
                          <Badge
                            variant="secondary"
                            className={cn(
                              currentStudent.has_debated
                                ? "text-green-600 bg-green-100"
                                : "text-gray-600 bg-gray-100"
                            )}
                          >
                            {currentStudent.has_debated ? "Active" : "New"}
                          </Badge>
                        </TableCell>

                        <TableCell className="hidden lg:table-cell">
                          {currentStudent.last_login_at ? (
                            <span className="text-sm text-muted-foreground">
                              {formatDistanceToNow(new Date(currentStudent.last_login_at), { addSuffix: true })}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">Never</span>
                          )}
                        </TableCell>

                        <TableCell>
                          <div className="flex gap-1">
                            {currentStudent.verified ? (
                              <StudentActionButton
                                icon={CircleMinus}
                                label="Unverify"
                                onClick={() => handleVerifyStudent(currentStudent._id, false)}
                              />
                            ) : (
                              <StudentActionButton
                                icon={BadgeCheck}
                                label="Verify"
                                onClick={() => handleVerifyStudent(currentStudent._id, true)}
                              />
                            )}

                            {currentStudent.status === "active" ? (
                              <StudentActionButton
                                icon={Ban}
                                label="Ban"
                                onClick={() => handleStatusChange(currentStudent._id, "banned")}
                              />
                            ) : (
                              <StudentActionButton
                                icon={UserCheck}
                                label="Activate"
                                onClick={() => handleStatusChange(currentStudent._id, "active")}
                              />
                            )}

                            {currentStudent.verified && currentStudent.status === "inactive" && (
                              <StudentActionButton
                                icon={Link}
                                label="Reset Link"
                                onClick={() => handleSingleResetLink(currentStudent._id, currentStudent.name, currentStudent.email)}
                              />
                            )}

                            <StudentActionButton
                              icon={Trash2}
                              label="Delete"
                              onClick={() => {
                                setStudentToDelete(currentStudent._id)
                                setShowDeleteDialog(true)
                              }}
                              variant="destructive"
                            />
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
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
                    {students.length} of {totalCount} students
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
            <AlertDialogTitle>Delete Student</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this student? This action cannot be undone and will permanently remove the student and all associated data.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteStudent}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete Student
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showBulkDialog} onOpenChange={setShowBulkDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Bulk Action</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to {bulkAction} {selectedStudents.size} selected student{selectedStudents.size > 1 ? 's' : ''}?
              This action will be applied to all selected students.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleBulkAction}>
              {bulkAction === "ban" ? "Ban Students" : `${bulkAction.charAt(0).toUpperCase() + bulkAction.slice(1)} Students`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AddUserDialog
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
        onUserAdded={() => {

        }}
        userType="school"
      />

      <ImportUsersDialog
        open={showImportDialog}
        onOpenChange={setShowImportDialog}
        onUsersImported={() => {

        }}
        userType="school"
      />

      <ExportUsersDialog
        open={showExportDialog}
        onOpenChange={setShowExportDialog}
        userType="school"
      />

      <Dialog open={showResetLinksDialog} onOpenChange={setShowResetLinksDialog}>
        <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Reset Password Links</DialogTitle>
            <DialogDescription>
              Share these links with students so they can set their passwords. Links expire in 24 hours.
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
                      This link will expire in 24 hours. The student should use this to set their new password.
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