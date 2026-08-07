"use client"

import { useState } from "react"
import { z } from "zod"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation } from "convex/react"
import { api } from "@/convex/_generated/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Loader2, Copy, Check, Eye, EyeOff } from "lucide-react"
import { toast } from "sonner"
import { useAuth } from "@/hooks/use-auth"
import { SchoolSelector, VolunteerSchoolSelector } from "@/components/school-selector";
import { LocationSelector } from "@/components/location-selector"
import { Id } from "@/convex/_generated/dataModel"
import { Label } from "@/components/ui/label"
import DatePicker from "../date-picker"
import { subYears } from "date-fns"

const baseUserSchema = z.object({
  name: z.string().min(2, { message: "Full name is required" }),
  email: z.string().email({ message: "Invalid email address" }),
  phone: z.string().min(10, { message: "Valid phone number is required" }),
  gender: z.enum(["male", "female", "non_binary"], {
    required_error: "Please select a gender"
  }).optional(),
  role: z.enum(["student", "school_admin", "volunteer", "admin"], {
    required_error: "Please select a role"
  })
})

const studentSchema = baseUserSchema.extend({
  role: z.literal("student"),
  school_id: z.string().min(1, { message: "School selection is required" }),
  grade: z.string().min(1, { message: "Grade/Class is required" }),
  security_question: z.string().min(5, { message: "Security question is required" }),
  security_answer: z.string().min(2, { message: "Security answer is required" }),
})

const schoolStudentSchema = baseUserSchema.extend({
  role: z.literal("student"),
  grade: z.string().min(1, { message: "Grade/Class is required" }),
  security_question: z.string().min(5, { message: "Security question is required" }),
  security_answer: z.string().min(2, { message: "Security answer is required" }),
})

const schoolAdminSchema = baseUserSchema.extend({
  role: z.literal("school_admin"),
  position: z.string().min(2, { message: "Position is required" }),
  schoolName: z.string().min(2, { message: "School name is required" }),
  schoolType: z.enum(["Private", "Public", "Government Aided", "International"], {
    required_error: "Please select school type"
  }),
  country: z.string().min(1, { message: "Country is required" }),
  province: z.string().min(1, { message: "Province is required" }),
  district: z.string().min(1, { message: "District is required" }),
  sector: z.string().optional(),
  cell: z.string().optional(),
  village: z.string().optional(),
  contactName: z.string().min(2, { message: "Contact name is required" }),
  contactEmail: z.string().email({ message: "Valid contact email is required" }),
  contactPhone: z.string().optional(),
})

const volunteerSchema = baseUserSchema.extend({
  role: z.literal("volunteer"),
  date_of_birth: z.string().min(1, { message: "Date of birth is required" }),
  national_id: z.string().min(5, { message: "National ID/Passport is required" }),
  high_school_attended: z.string().min(2, { message: "High school attended is required" }),
})

const adminSchema = baseUserSchema.extend({
  role: z.literal("admin")
})

interface AddUserDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onUserAdded?: () => void
  userType?: "admin" | "school"
}

export function AddUserDialog({ open, onOpenChange, onUserAdded, userType = "admin" }: AddUserDialogProps) {
  const [loading, setLoading] = useState(false)
  const [selectedRole, setSelectedRole] = useState<"student" | "school_admin" | "volunteer" | "admin">("student")
  const [generatedPassword, setGeneratedPassword] = useState<string>("")
  const [resetLink, setResetLink] = useState<string>("")
  const [showResults, setShowResults] = useState(false)
  const [copiedPassword, setCopiedPassword] = useState(false)
  const [copiedLink, setCopiedLink] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  const { token } = useAuth()
  const createUser = useMutation(
    userType === "admin"
      ? api.functions.admin.users.createUser
      : api.functions.school.students.createStudent
  )

  const getSchema = () => {
    if (userType === "school") {
      return schoolStudentSchema
    }

    switch (selectedRole) {
      case "student": return studentSchema
      case "school_admin": return schoolAdminSchema
      case "volunteer": return volunteerSchema
      case "admin": return adminSchema
      default: return baseUserSchema
    }
  }

  const form = useForm<any>({
    resolver: zodResolver(getSchema()),
    defaultValues: {
      name: "",
      email: "",
      phone: "",
      gender: undefined,
      role: selectedRole,

      school_id: "",
      grade: "",
      security_question: "",
      security_answer: "",

      position: "",
      schoolName: "",
      schoolType: undefined,
      country: "",
      province: "",
      district: "",
      sector: "",
      cell: "",
      village: "",
      contactName: "",
      contactEmail: "",
      contactPhone: "",

      date_of_birth: "",
      national_id: "",
      high_school_attended: "",
    }
  })

  const securityQuestions = [
    "What was the name of your first pet?",
    "What is your mother's maiden name?",
    "What was the name of your elementary school?",
    "What is your favorite book?",
    "In what city were you born?",
    "What is your favorite color?",
    "What was your first car?",
    "What is your favorite food?",
  ]

  const handleRoleChange = (role: string) => {
    if (userType === "school") return
    setSelectedRole(role as any)
    form.setValue("role", role)
    form.clearErrors()
  }

  const handleSubmit = async (values: any) => {
    setLoading(true)

    try {
      let payload: any = {
        [userType === "admin" ? "admin_token" : "school_admin_token"]: token!,
        name: values.name,
        email: values.email,
        phone: values.phone,
        gender: values.gender,
      }

      if (userType === "admin") {
        payload.role = values.role
      }

      if (values.role === "student" || userType === "school") {
        payload = {
          ...payload,
          ...(userType === "admin" && { school_id: values.school_id as Id<"schools"> }),
          grade: values.grade,
          security_question: values.security_question,
          security_answer: values.security_answer,
        }
      } else if (values.role === "school_admin") {
        payload = {
          ...payload,
          position: values.position,
          school_data: {
            name: values.schoolName,
            type: values.schoolType,
            country: values.country,
            province: values.province,
            district: values.district,
            sector: values.sector,
            cell: values.cell,
            village: values.village,
            contact_name: values.contactName,
            contact_email: values.contactEmail,
            contact_phone: values.contactPhone,
          }
        }
      } else if (values.role === "volunteer") {
        payload = {
          ...payload,
          date_of_birth: values.date_of_birth,
          national_id: values.national_id,
          high_school_attended: values.high_school_attended,
        }
      }

      const result = await createUser(payload)

      if (result.success) {
        setGeneratedPassword(result.tempPassword)
        setResetLink(result.resetLink)
        setShowResults(true)
        toast.success(`${userType === "school" ? "Student" : "User"} created successfully!`)

        if (onUserAdded) {
          onUserAdded()
        }
      }
    } catch (error: any) {
      toast.error(error.message?.split("Uncaught Error:")[1]?.split(/\.|Called by client/)[0]?.trim() || `Failed to create ${userType === "school" ? "student" : "user"}`)
    } finally {
      setLoading(false)
    }
  }

  const handleCopy = async (text: string, type: "password" | "link") => {
    try {
      await navigator.clipboard.writeText(text)
      if (type === "password") {
        setCopiedPassword(true)
        setTimeout(() => setCopiedPassword(false), 2000)
      } else {
        setCopiedLink(true)
        setTimeout(() => setCopiedLink(false), 2000)
      }
      toast.success("Copied to clipboard!")
    } catch (error) {
      toast.error("Failed to copy")
    }
  }

  const handleClose = () => {
    form.reset()
    setShowResults(false)
    setGeneratedPassword("")
    setResetLink("")
    setCopiedPassword(false)
    setCopiedLink(false)
    onOpenChange(false)
  }

  if (showResults) {
    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{userType === "school" ? "Student" : "User"} Created Successfully</DialogTitle>
            <DialogDescription>
              Share these credentials with the {userType === "school" ? "student" : "user"}. They will need to use the reset link to set their password.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Temporary Password</Label>
              <div className="flex items-center gap-2">
                <Input
                  type={showPassword ? "text" : "password"}
                  value={generatedPassword}
                  readOnly
                  className="flex-1"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleCopy(generatedPassword, "password")}
                >
                  {copiedPassword ? (
                    <Check className="h-4 w-4 text-green-600" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Reset Password Link</Label>
              <div className="flex items-center gap-2">
                <Input
                  value={resetLink}
                  readOnly
                  className="flex-1 text-sm"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleCopy(resetLink, "link")}
                >
                  {copiedLink ? (
                    <Check className="h-4 w-4 text-green-600" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                This link will expire in 24 hours. The {userType === "school" ? "student" : "user"} should use this to set their new password.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button onClick={handleClose}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add New {userType === "school" ? "Student" : "User"}</DialogTitle>
          <DialogDescription>
            Create a new {userType === "school" ? "student" : "user"} account. A temporary password will be generated and they&#39;ll receive a reset link.
          </DialogDescription>
        </DialogHeader>

        {userType === "admin" ? (
          <Tabs value={selectedRole} onValueChange={handleRoleChange} className="w-full">
            <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4">
              <TabsTrigger value="student">Student</TabsTrigger>
              <TabsTrigger value="school_admin">School Admin</TabsTrigger>
              <TabsTrigger value="volunteer">Volunteer</TabsTrigger>
              <TabsTrigger value="admin">Admin</TabsTrigger>
            </TabsList>

            <Form {...form}>
              <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4 mt-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Full Name</FormLabel>
                        <FormControl>
                          <Input placeholder="John Doe" {...field} disabled={loading} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email Address</FormLabel>
                        <FormControl>
                          <Input type="email" placeholder="john@example.com" {...field} disabled={loading} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="phone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Phone Number</FormLabel>
                        <FormControl>
                          <Input placeholder="+250 7XXXXXXXX" {...field} disabled={loading} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="gender"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Gender (Optional)</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value} disabled={loading}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select gender" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="male">Male</SelectItem>
                            <SelectItem value="female">Female</SelectItem>
                            <SelectItem value="non_binary">Non-binary</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <TabsContent value="student" className="space-y-4 mt-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="grade"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Grade/Class</FormLabel>
                          <FormControl>
                            <Input placeholder="e.g. Grade 10, S4" {...field} disabled={loading} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="school_id"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>School</FormLabel>
                          <FormControl>
                            <SchoolSelector
                              value={field.value}
                              onValueChange={field.onChange}
                              placeholder="Search for school..."
                              disabled={loading}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="security_question"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Security Question</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value} disabled={loading}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select a security question" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {securityQuestions.map((question, index) => (
                                <SelectItem key={index} value={question}>
                                  {question}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="security_answer"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Security Answer</FormLabel>
                          <FormControl>
                            <Input placeholder="Enter answer" {...field} disabled={loading} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </TabsContent>

                <TabsContent value="school_admin" className="space-y-4 mt-4">
                  <FormField
                    control={form.control}
                    name="position"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Position at School</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g. Principal, Debate Coach" {...field} disabled={loading} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="space-y-4">
                    <h4 className="font-medium">School Information</h4>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="schoolName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>School Name</FormLabel>
                            <FormControl>
                              <Input placeholder="Enter school name" {...field} disabled={loading} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="schoolType"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>School Type</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value} disabled={loading}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select school type" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="Private">Private</SelectItem>
                                <SelectItem value="Public">Public</SelectItem>
                                <SelectItem value="Government Aided">Government Aided</SelectItem>
                                <SelectItem value="International">International</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label className="text-sm font-medium">School Location</Label>
                      <LocationSelector
                        country={form.watch("country")}
                        province={form.watch("province")}
                        district={form.watch("district")}
                        sector={form.watch("sector")}
                        cell={form.watch("cell")}
                        village={form.watch("village")}
                        onCountryChange={(country) => {
                          form.setValue("country", country)
                          form.setValue("province", "")
                          form.setValue("district", "")
                          form.setValue("sector", "")
                          form.setValue("cell", "")
                          form.setValue("village", "")
                        }}
                        onProvinceChange={(province) => {
                          form.setValue("province", province)
                          form.setValue("district", "")
                          form.setValue("sector", "")
                          form.setValue("cell", "")
                          form.setValue("village", "")
                        }}
                        onDistrictChange={(district) => {
                          form.setValue("district", district)
                          form.setValue("sector", "")
                          form.setValue("cell", "")
                          form.setValue("village", "")
                        }}
                        onSectorChange={(sector) => {
                          form.setValue("sector", sector || "")
                          form.setValue("cell", "")
                          form.setValue("village", "")
                        }}
                        onCellChange={(cell) => {
                          form.setValue("cell", cell || "")
                          form.setValue("village", "")
                        }}
                        onVillageChange={(village) => {
                          form.setValue("village", village || "")
                        }}
                        countryError={form.formState.errors.country?.message as string | undefined}
                        provinceError={form.formState.errors.province?.message as string | undefined}
                        districtError={form.formState.errors.district?.message as string | undefined}
                        cellError={form.formState.errors.cell?.message as string | undefined}
                        villageError={form.formState.errors.village?.message as string | undefined}
                        includeRwandaDetails={form.watch("country") === "RW"}
                      />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="contactName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Contact Person Name</FormLabel>
                            <FormControl>
                              <Input placeholder="Contact person's full name" {...field} disabled={loading} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="contactEmail"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Contact Email</FormLabel>
                            <FormControl>
                              <Input type="email" placeholder="contact@school.com" {...field} disabled={loading} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="contactPhone"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Contact Phone (Optional)</FormLabel>
                            <FormControl>
                              <Input placeholder="+250 7XXXXXXXX" {...field} disabled={loading} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="volunteer" className="space-y-4 mt-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="date_of_birth"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Date of Birth</FormLabel>
                          <FormControl>
                            <DatePicker
                              date={field.value ? new Date(field.value) : undefined}
                              onDateChange={(date) => field.onChange(date?.toISOString().split("T")[0])}
                              disabled={loading}
                              maxDate={subYears(new Date(), 16)}
                              error={form.formState.errors.date_of_birth?.message as string | undefined}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="national_id"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>National ID/Passport</FormLabel>
                          <FormControl>
                            <Input placeholder="Enter ID number" {...field} disabled={loading} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="high_school_attended"
                      render={({ field }) => (
                        <FormItem className="md:col-span-2">
                          <FormLabel>High School Attended</FormLabel>
                          <FormControl>
                            <VolunteerSchoolSelector
                              value={field.value}
                              onValueChange={field.onChange}
                              placeholder="Enter your high school name..."
                              disabled={loading}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </TabsContent>

                <TabsContent value="admin" className="mt-4">
                  <p className="text-sm text-muted-foreground">
                    No additional fields required for admin users.
                  </p>
                </TabsContent>

                <DialogFooter>
                  <Button type="button" variant="outline" onClick={handleClose} disabled={loading}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={loading}>
                    {loading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Creating User...
                      </>
                    ) : (
                      "Create User"
                    )}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </Tabs>
        ) : (

          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4 mt-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Full Name</FormLabel>
                      <FormControl>
                        <Input placeholder="John Doe" {...field} disabled={loading} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email Address</FormLabel>
                      <FormControl>
                        <Input type="email" placeholder="john@example.com" {...field} disabled={loading} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Phone Number</FormLabel>
                      <FormControl>
                        <Input placeholder="+250 7XXXXXXXX" {...field} disabled={loading} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="gender"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Gender (Optional)</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value} disabled={loading}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select gender" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="male">Male</SelectItem>
                          <SelectItem value="female">Female</SelectItem>
                          <SelectItem value="non_binary">Non-binary</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="grade"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Grade/Class</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. Grade 10, S4" {...field} disabled={loading} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="security_question"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Security Question</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value} disabled={loading}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a security question" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {securityQuestions.map((question, index) => (
                            <SelectItem key={index} value={question}>
                              {question}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="security_answer"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Security Answer</FormLabel>
                      <FormControl>
                        <Input placeholder="Enter answer" {...field} disabled={loading} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={handleClose} disabled={loading}>
                  Cancel
                </Button>
                <Button type="submit" disabled={loading}>
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Creating Student...
                    </>
                  ) : (
                    "Create Student"
                  )}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        )}
      </DialogContent>
    </Dialog>
  )
}