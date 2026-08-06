"use client"

import { useEffect, useState } from "react";
import Link from "next/link"
import { z } from "zod"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Eye,
  EyeOff,
  Loader2,
  Search,
  Users,
  Mail,
  Shield,
  AlertCircle, Phone, Link2, ChevronLeft
} from "lucide-react";
import { Label } from "@/components/ui/label"
import { motion } from "framer-motion"
import Image from "next/image"
import { useAuth } from "@/hooks/use-auth"
import { useQuery } from "convex/react"
import { api } from "@/convex/_generated/api"
import { useDebounce } from "@/hooks/use-debounce"
import { cn } from "@/lib/utils"
import { Alert, AlertDescription } from "@/components/ui/alert"

type UserRole = "student" | "school_admin" | "volunteer" | "admin"

interface SignInFormProps {
  role: UserRole
}

const emailFormSchema = z.object({
  email: z.string().email({ message: "Invalid email address" }),
  password: z.string().min(1, { message: "Password is required" }),
})

const phoneFormSchema = z.object({
  nameSearch: z.string().min(2, { message: "Enter at least 2 characters to search" }),
  selectedUserId: z.string().min(1, { message: "Please select a student" }),
  phone: z.string().min(10, { message: "Valid phone number is required" }),
  securityAnswer: z.string().min(1, { message: "Security answer is required" }),
})

const mfaFormSchema = z.object({
  mfaCode: z.string().min(1, { message: "Security answer is required" }),
})

const magicLinkFormSchema = z.object({
  email: z.string().email({ message: "Invalid email address" }),
})

type EmailFormValues = z.infer<typeof emailFormSchema>
type PhoneFormValues = z.infer<typeof phoneFormSchema>
type MfaFormValues = z.infer<typeof mfaFormSchema>
type MagicLinkFormValues = z.infer<typeof magicLinkFormSchema>

const SignInForm = ({ role }: SignInFormProps) => {
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [rememberMe, setRememberMe] = useState(false)
  const [authMethod, setAuthMethod] = useState<"email" | "phone" | "magic" | "biometric">("email")
  const [requiresMFA, setRequiresMFA] = useState(false)
  const [mfaUserId, setMfaUserId] = useState<string | null>(null)
  const [, setSelectedStudent] = useState<any>(null)
  const [securityQuestion, setSecurityQuestion] = useState<string>("")
  const [dialogOpen, setDialogOpen] = useState(false)

  const { signIn, signInWithPhone, generateMagicLink } = useAuth()

  const emailForm = useForm<EmailFormValues>({
    resolver: zodResolver(emailFormSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  })

  const phoneForm = useForm<PhoneFormValues>({
    resolver: zodResolver(phoneFormSchema),
    defaultValues: {
      nameSearch: "",
      selectedUserId: "",
      phone: "",
      securityAnswer: "",
    },
  })

  const mfaForm = useForm<MfaFormValues>({
    resolver: zodResolver(mfaFormSchema),
    defaultValues: {
      mfaCode: "",
    },
  })

  const magicLinkForm = useForm<MagicLinkFormValues>({
    resolver: zodResolver(magicLinkFormSchema),
    defaultValues: {
      email: "",
    },
  })

  const nameSearch = phoneForm.watch("nameSearch")
  const debouncedSearch = useDebounce(nameSearch, 300)

  const studentsQuery = useQuery(
    api.functions.auth.searchUsersByName,
    role === "student" && authMethod === "phone" && debouncedSearch.length >= 2
      ? { name: debouncedSearch }
      : "skip"
  )

  const selectedUserId = phoneForm.watch("selectedUserId")
  const phone = phoneForm.watch("phone")

  const securityQuestionQuery = useQuery(
    api.functions.auth.getSecurityQuestion,
    selectedUserId && phone && phone.length >= 10
      ? { user_id: selectedUserId as any, phone }
      : "skip"
  )

  useEffect(() => {
    if (securityQuestionQuery?.error) {
      setSecurityQuestion("⚠️ " + securityQuestionQuery.error);
    } else if (securityQuestionQuery?.question) {
      setSecurityQuestion(securityQuestionQuery.question);
    } else {
      setSecurityQuestion("");
    }
  }, [securityQuestionQuery]);

  const handleEmailSignIn = async (values: EmailFormValues) => {
    setLoading(true)
    setError(null)

    try {
      const result = await signIn(values.email, values.password, rememberMe, undefined, role)

      if (result.requiresMFA) {
        setRequiresMFA(true)
        setMfaUserId(result.userId || null)
        setSecurityQuestion(result.securityQuestion || "")
      }
    } catch (error: any) {
      console.error("Signin error:", error)
      setError(error.message)
    } finally {
      setLoading(false)
    }
  }

  const handleMFASignIn = async (values: MfaFormValues) => {
    if (!mfaUserId) return

    setLoading(true)
    setError(null)

    try {
      const emailValues = emailForm.getValues()
      await signIn(emailValues.email, emailValues.password, rememberMe, values.mfaCode, role)
    } catch (error: any) {
      console.error("MFA signin error:", error)
      setError(error.message)
    } finally {
      setLoading(false)
    }
  }

  const handlePhoneSignIn = async (values: PhoneFormValues) => {
    setLoading(true)
    setError(null)

    try {
      await signInWithPhone({
        name_search: values.nameSearch,
        selected_user_id: values.selectedUserId as any,
        phone: values.phone,
        security_answer: values.securityAnswer,
      }, role)
    } catch (error: any) {
      console.error("Phone signin error:", error)
      setError(error.message)
    } finally {
      setLoading(false)
    }
  }

  const handleMagicLinkRequest = async (values: MagicLinkFormValues) => {
    setLoading(true)
    setError(null)

    try {
      await generateMagicLink(values.email, "login")
    } catch (error: any) {
      console.error("Magic link error:", error)
      setError(error.message)
    } finally {
      setLoading(false)
    }
  }

  const handleStudentSelect = (student: any) => {
    phoneForm.setValue("selectedUserId", student.id)
    setSelectedStudent(student)
    setDialogOpen(false)
  }

  const handleBackToEmail = () => {
    setRequiresMFA(false)
    setMfaUserId(null)
    setError(null)
    mfaForm.reset()
  }

  const displayedStudents = studentsQuery?.slice(0, 3) || []
  const hasMoreStudents = studentsQuery && studentsQuery.length > 3

  if (requiresMFA) {
    return (
      <div className="flex min-h-screen">
        <div className="w-full flex items-center justify-center p-6">
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5 }}
            className="w-full max-w-md space-y-4"
          >
            <Image
              src="/images/logo.png"
              alt="iRankHub Logo"
              width={80}
              height={80}
              className="mx-auto md:hidden"
            />

            <div className="text-center">
              <Shield className="mx-auto h-12 w-12 text-primary mb-4" />
              <h2 className="text-base md:text-lg font-bold">
                Multi-Factor Authentication
              </h2>
              <p className="text-sm text-muted-foreground mt-2">
                Please provide your security answer to complete sign in
              </p>
            </div>

            <Form {...mfaForm}>
              <form onSubmit={mfaForm.handleSubmit(handleMFASignIn)} className="space-y-4">

                {securityQuestion && (
                  <div className="flex flex-col space-y-1">
                  <Label>Security Question</Label>
                    <span className="text-muted-foreground">{securityQuestion}</span>
                  </div>
                )}
                <FormField
                  control={mfaForm.control}
                  name="mfaCode"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Security Answer</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Enter your security answer"
                          {...field}
                          disabled={loading}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button type="submit" disabled={loading} className="w-full">
                  {loading ? (
                    <span className="flex items-center justify-center">
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Verifying...
                    </span>
                  ) : (
                    "Complete Sign In"
                  )}
                </Button>

                <Button
                  type="button"
                  variant="ghost"
                  onClick={handleBackToEmail}
                  className="w-full text-primary"
                  disabled={loading}
                >
                  <ChevronLeft className="mr-2 h-4 w-4" />
                  Back to Sign In
                </Button>
              </form>
            </Form>

            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </motion.div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen">
      <div className="w-full flex items-center justify-center p-6">
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-md space-y-4"
        >
          <Image
            src="/images/logo.png"
            alt="iRankHub Logo"
            width={80}
            height={80}
            className="mx-auto md:hidden"
          />

          <div className="text-center">
            <h2 className="text-base md:text-lg font-bold dark:text-primary-foreground">
              Sign in as {role === 'school_admin' ? 'School Admin' : role.charAt(0).toUpperCase() + role.slice(1)}
            </h2>
            <p className="text-sm text-muted-foreground mt-2">Welcome back! Please sign in to continue</p>
          </div>

          {role === "student" ? (
            <Tabs value={authMethod} onValueChange={(value) => setAuthMethod(value as "email" | "magic")} className="w-full">
              <TabsList className="grid w-full grid-cols-3 text-xs sm:text-sm">
                <TabsTrigger value="email">
                  <Mail className="h-4 w-4 md:hidden" />
                  <span className="hidden md:inline">Email</span>
                </TabsTrigger>
                <TabsTrigger value="phone">
                  <Phone className="h-4 w-4 md:hidden" />
                  <span className="hidden md:inline">Phone</span>
                </TabsTrigger>
                <TabsTrigger value="magic">
                  <Link2 className="h-4 w-4 md:hidden" />
                  <span className="hidden md:inline">Magic Link</span>
                </TabsTrigger>
              </TabsList>

              <TabsContent value="email" className="space-y-4">
                <Form {...emailForm}>
                  <form onSubmit={emailForm.handleSubmit(handleEmailSignIn)} className="space-y-4">
                    <FormField
                      control={emailForm.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Email address</FormLabel>
                          <FormControl>
                            <Input
                              type="email"
                              placeholder="name@example.com"
                              {...field}
                              disabled={loading}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={emailForm.control}
                      name="password"
                      render={({ field }) => (
                        <FormItem>
                          <div className="flex items-center justify-between">
                            <FormLabel>Password</FormLabel>
                            <Link
                              href={`/forgot-password?role=${role}`}
                              className="text-xs text-primary hover:underline inline-flex items-center min-h-10 sm:min-h-0"
                            >
                              Forgot password?
                            </Link>
                          </div>
                          <div className="relative">
                            <FormControl>
                              <Input
                                type={showPassword ? "text" : "password"}
                                placeholder="••••••••"
                                {...field}
                                disabled={loading}
                                className="pr-10"
                              />
                            </FormControl>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="absolute right-0 top-0 h-full px-3 py-2 text-muted-foreground hover:text-foreground"
                              onClick={() => setShowPassword(!showPassword)}
                              tabIndex={-1}
                              disabled={loading}
                            >
                              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                            </Button>
                          </div>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="rememberMe"
                        checked={rememberMe}
                        onCheckedChange={(checked) => setRememberMe(checked as boolean)}
                        disabled={loading}
                      />
                      <Label
                        htmlFor="rememberMe"
                        className="text-xs font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                      >
                        Remember me
                      </Label>
                    </div>

                    <Button type="submit" disabled={loading} className="w-full">
                      {loading ? (
                        <span className="flex items-center justify-center">
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Signing in...
                        </span>
                      ) : (
                        "Sign in"
                      )}
                    </Button>
                  </form>
                </Form>
              </TabsContent>

              <TabsContent value="phone" className="space-y-4">
                <Form {...phoneForm}>
                  <form onSubmit={phoneForm.handleSubmit(handlePhoneSignIn)} className="space-y-4">
                    <FormField
                      control={phoneForm.control}
                      name="nameSearch"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Search Your Name</FormLabel>
                          <FormControl>
                            <div className="relative">
                              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                              <Input
                                placeholder="Type your name to search..."
                                {...field}
                                disabled={loading}
                                className="pl-10"
                              />
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {studentsQuery && studentsQuery.length > 0 && (
                      <FormField
                        control={phoneForm.control}
                        name="selectedUserId"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Select Your Account</FormLabel>
                            <div className="space-y-2">
                              {displayedStudents.map((student) => (
                                <div
                                  key={student.id}
                                  className={cn(
                                    "p-3 cursor-pointer rounded-lg border-2 transition-all duration-200",
                                    field.value === student.id
                                      ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                                      : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800'
                                  )}
                                  onClick={() => handleStudentSelect(student)}
                                >
                                  <p className="font-medium">{student.name}</p>
                                  <p className="text-xs text-muted-foreground">
                                    Phone ending: ...{student.phone}
                                  </p>
                                </div>
                              ))}

                              {hasMoreStudents && (
                                <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                                  <DialogTrigger asChild>
                                    <Button
                                      variant="outline"
                                      className="w-full"
                                      type="button"
                                    >
                                      <Users className="w-4 h-4 mr-2" />
                                      Show {studentsQuery!.length - 3} more students
                                    </Button>
                                  </DialogTrigger>
                                  <DialogContent className="max-w-md max-h-[60vh]">
                                    <DialogHeader>
                                      <DialogTitle>Select Your Account</DialogTitle>
                                    </DialogHeader>
                                    <div className="space-y-2 max-h-96 overflow-y-auto">
                                      {studentsQuery!.map((student) => (
                                        <div
                                          key={student.id}
                                          className={cn(
                                            "p-3 cursor-pointer rounded-lg border-2 transition-all duration-200",
                                            field.value === student.id
                                              ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                                              : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800'
                                          )}
                                          onClick={() => handleStudentSelect(student)}
                                        >
                                          <p className="font-medium">{student.name}</p>
                                          <p className="text-xs text-muted-foreground">
                                            Phone ending: ...{student.phone}
                                          </p>
                                        </div>
                                      ))}
                                    </div>
                                  </DialogContent>
                                </Dialog>
                              )}
                            </div>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    )}

                    {debouncedSearch.length >= 2 && (!studentsQuery || studentsQuery.length === 0) && (
                      <Alert>
                        <AlertCircle className="h-4 w-4" />
                        <AlertDescription>
                          No students found with that name. Please check your spelling or try a different search term.
                        </AlertDescription>
                      </Alert>
                    )}

                    <FormField
                      control={phoneForm.control}
                      name="phone"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Phone Number</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="+250 7XXXXXXXX"
                              {...field}
                              disabled={loading}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    {securityQuestion && (
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Security Question</Label>
                        <p className="text-sm text-muted-foreground bg-gray-50 dark:bg-gray-800 p-3 rounded-md">
                          {securityQuestion}
                        </p>
                      </div>
                    )}

                    <FormField
                      control={phoneForm.control}
                      name="securityAnswer"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Security Answer</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="Enter your answer"
                              {...field}
                              disabled={loading || !securityQuestion}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <Button type="submit" disabled={loading || !securityQuestion} className="w-full">
                      {loading ? (
                        <span className="flex items-center justify-center">
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Signing in...
                        </span>
                      ) : (
                        "Sign in"
                      )}
                    </Button>
                  </form>
                </Form>
              </TabsContent>

              <TabsContent value="magic" className="space-y-4">
                <div className="text-center mb-4">
                  <Mail className="mx-auto h-12 w-12 text-primary mb-2" />
                  <p className="text-sm text-muted-foreground">
                    We&#39;ll send you a secure link to sign in without a password
                  </p>
                </div>

                <Form {...magicLinkForm}>
                  <form onSubmit={magicLinkForm.handleSubmit(handleMagicLinkRequest)} className="space-y-4">
                    <FormField
                      control={magicLinkForm.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Email address</FormLabel>
                          <FormControl>
                            <Input
                              type="email"
                              placeholder="name@example.com"
                              {...field}
                              disabled={loading}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <Button type="submit" disabled={loading} className="w-full">
                      {loading ? (
                        <span className="flex items-center justify-center">
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Sending...
                        </span>
                      ) : (
                        <>
                          <Mail className="mr-2 h-4 w-4" />
                          Send Magic Link
                        </>
                      )}
                    </Button>
                  </form>
                </Form>
              </TabsContent>
            </Tabs>
          ) : (
            <Tabs value={authMethod} onValueChange={(value) => setAuthMethod(value as "email" | "magic")} className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="email">
                  <Mail className="h-4 w-4 md:hidden" />
                  <span className="hidden md:inline">Email</span>
                </TabsTrigger>
                <TabsTrigger value="magic">
                  <Link2 className="h-4 w-4 md:hidden" />
                  <span className="hidden md:inline">Magic Link</span>
                </TabsTrigger>
              </TabsList>

              <TabsContent value="email" className="space-y-4">
                <Form {...emailForm}>
                  <form onSubmit={emailForm.handleSubmit(handleEmailSignIn)} className="space-y-4">
                    <FormField
                      control={emailForm.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Email address</FormLabel>
                          <FormControl>
                            <Input
                              type="email"
                              placeholder="name@example.com"
                              {...field}
                              disabled={loading}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={emailForm.control}
                      name="password"
                      render={({ field }) => (
                        <FormItem>
                          <div className="flex items-center justify-between">
                            <FormLabel>Password</FormLabel>
                            <Link
                              href={`/forgot-password?role=${role}`}
                              className="text-xs text-primary hover:underline inline-flex items-center min-h-10 sm:min-h-0"
                            >
                              Forgot password?
                            </Link>
                          </div>
                          <div className="relative">
                            <FormControl>
                              <Input
                                type={showPassword ? "text" : "password"}
                                placeholder="••••••••"
                                {...field}
                                disabled={loading}
                                className="pr-10"
                              />
                            </FormControl>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="absolute right-0 top-0 h-full px-3 py-2 text-muted-foreground hover:text-foreground"
                              onClick={() => setShowPassword(!showPassword)}
                              tabIndex={-1}
                              disabled={loading}
                            >
                              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                            </Button>
                          </div>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="rememberMe"
                        checked={rememberMe}
                        onCheckedChange={(checked) => setRememberMe(checked as boolean)}
                        disabled={loading}
                      />
                      <Label
                        htmlFor="rememberMe"
                        className="text-xs font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                      >
                        Remember me
                      </Label>
                    </div>

                    <Button type="submit" disabled={loading} className="w-full">
                      {loading ? (
                        <span className="flex items-center justify-center">
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Signing in...
                        </span>
                      ) : (
                        "Sign in"
                      )}
                    </Button>
                  </form>
                </Form>
              </TabsContent>

              <TabsContent value="magic" className="space-y-4">
                <div className="text-center mb-4">
                  <Mail className="mx-auto h-12 w-12 text-primary mb-2" />
                  <p className="text-sm text-muted-foreground">
                    We&#39;ll send you a secure link to sign in without a password
                  </p>
                </div>

                <Form {...magicLinkForm}>
                  <form onSubmit={magicLinkForm.handleSubmit(handleMagicLinkRequest)} className="space-y-4">
                    <FormField
                      control={magicLinkForm.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Email address</FormLabel>
                          <FormControl>
                            <Input
                              type="email"
                              placeholder="name@example.com"
                              {...field}
                              disabled={loading}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <Button type="submit" disabled={loading} className="w-full">
                      {loading ? (
                        <span className="flex items-center justify-center">
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Sending...
                        </span>
                      ) : (
                        <>
                          <Mail className="mr-2 h-4 w-4" />
                          Send Magic Link
                        </>
                      )}
                    </Button>
                  </form>
                </Form>
              </TabsContent>
            </Tabs>
          )}

          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {role !== "admin" && (
          <div className="text-center text-sm">
            <span className="text-muted-foreground">Don&apos;t have an account? </span>
            <Link href={`/signup/${role}`} className="text-primary hover:underline inline-flex items-center min-h-10 sm:min-h-0">
              Sign up
            </Link>
          </div>
            )}

          <div className="text-center">
            <Link
              href="/"
              className="inline-flex items-center min-h-10 sm:min-h-0 text-sm text-primary hover:underline"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="mr-1"
              >
                <path d="m15 18-6-6 6-6" />
              </svg>
              Back to role selection
            </Link>
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default SignInForm;