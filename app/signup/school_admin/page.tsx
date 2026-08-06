"use client"

import { motion } from "framer-motion"
import Image from "next/image"
import dynamic from "next/dynamic";
import AppLoader from "@/components/app-loader";
import React from "react";

const SchoolAdminSignUpForm = dynamic(() =>
    import("@/components/auth/signup/school-signup-form").then(mod => mod.SchoolAdminSignUpForm),
  {
    loading: () => <div><AppLoader /></div>,
    ssr: false,
  }
)

export default function SchoolAdminSignUp() {
  return (
    <div className="flex min-h-screen dark:bg-gray-900">

      <div className="hidden md:block md:w-1/2 bg-cover bg-center relative overflow-hidden">

        <Image
          src="/images/school-signup.png"
          alt="School Admin signup background"
          fill
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
              Register Your School for Debate Tournaments
            </h2>

            <div className="space-y-4 text-left">
              <div className="bg-white/80 dark:bg-gray-800/80 p-4 rounded-lg shadow">
                <h3 className="font-medium text-primary mb-2">Why join as a School Admin?</h3>
                <ul className="text-sm text-gray-600 dark:text-gray-300 space-y-2 pl-5 list-disc">
                  <li>Register multiple debate teams</li>
                  <li>Track student performance metrics</li>
                  <li>Manage tournament registration</li>
                </ul>
              </div>

              <div className="bg-white/80 dark:bg-gray-800/80 p-4 rounded-lg shadow">
                <p className="text-sm text-gray-600 dark:text-gray-300">
                  &#34;Give your students access to world-class debate opportunities. Our platform streamlines tournament management so you can focus on coaching.&#34;
                </p>
              </div>
            </div>
          </motion.div>
        </div>
      </div>

      <div className="w-full md:w-1/2 flex items-center justify-center p-6">
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-md"
        >
          <SchoolAdminSignUpForm />
        </motion.div>
      </div>
    </div>
  )
}