"use client"

import { useParams } from "next/navigation";
import SignInForm from "@/components/auth/sign-in-form"
import { motion } from "framer-motion"
import Image from "next/image"

export default function SignIn() {
  const params = useParams<{ role: string }>()
  const role = params.role as "student" | "school_admin" | "volunteer" | "admin"

  const getRoleHeading = () => {
    switch (role) {
      case "student":
        return "Welcome Back, Student!"
      case "school_admin":
        return "School Admin Portal"
      case "volunteer":
        return "Volunteer Sign In"
      case "admin":
        return "Admin Dashboard Access"
      default:
        return "Sign In to iRankHub"
    }
  }

  const getRoleImage = () => {
    switch (role) {
      case "student":
        return "/images/students-signup.png"
      case "school_admin":
        return "/images/school-signup.png"
      case "volunteer":
        return "/images/volunteer1.jpg"
      case "admin":
        return "/images/admin-signup.png"
      default:
        return "/images/volunteer3.jpg"
    }
  }

  const getRoleDescription = () => {
    switch (role) {
      case "student":
        return "Access your debate competitions and track your progress"
      case "school_admin":
        return "Manage your school's debate teams and tournament participation"
      case "volunteer":
        return "Access your judging assignments and feedback history"
      case "admin":
        return "Manage the iRankHub platform and user accounts"
      default:
        return "Sign in to continue"
    }
  }

    return (
      <div className="flex min-h-dvh dark:bg-gray-900">
        <div className="hidden md:block md:w-1/2 bg-cover bg-center relative overflow-hidden">
          <Image
            src={getRoleImage()}
            alt={`${role} signin background`}
            fill
            sizes="(max-width: 768px) 0px, 50vw"
            className="object-cover"
            priority
          />

          <div className="absolute inset-0 bg-muted-foreground/70 backdrop-blur-sm"></div>
          <div className="absolute inset-0 flex flex-col items-center justify-center p-12 text-center">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="max-w-md"
            >
              <Image
                src="/images/logo.png"
                alt="iRankHub Logo"
                width={120}
                height={120}
                className="mx-auto mb-6"
              />
              <h2 className="text-3xl font-bold text-primary-foreground dark:text-white mb-4">
                {getRoleHeading()}
              </h2>
              <p className="text-lg text-primary-foreground dark:text-white mb-8">
                {getRoleDescription()}
              </p>

              <div className="bg-white/80 dark:bg-gray-800/80 p-6 rounded-lg shadow">
                <h3 className="font-medium text-primary mb-2 text-lg">Did you know?</h3>
                <p className="text-sm text-gray-600 dark:text-gray-300">
                  iRankHub is the premiere platform for debate tournaments, helping students develop critical thinking
                  skills and connect with debaters worldwide.
                </p>
              </div>
            </motion.div>
          </div>
        </div>

        <div className="w-full md:w-1/2 flex items-center justify-center overflow-y-auto p-4 sm:p-6">
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5 }}
            className="w-full max-w-md"
          >
            <SignInForm role={role} />
          </motion.div>
        </div>
      </div>
    )
  }