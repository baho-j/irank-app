"use client"

import { useEffect, useState } from "react"
import VolunteerSignUpForm from "@/components/auth/signup/volunteer-signup-form"
import { motion } from "framer-motion"
import Image from "next/image"
import { useHydrated } from "@/hooks/use-hydrated"

export default function VolunteerSignUp() {
  // Chosen once per visit on the device. Picking during the first render
  // would give the server and the client different images.
  const hydrated = useHydrated()
  const [pick] = useState(() => Math.random())

  const volunteerImages = [
    "/images/volunteer1.jpg",
    "/images/volunteer2.jpg",
    "/images/volunteer3.jpg",
  ]

  const volunteerImage = hydrated
    ? volunteerImages[Math.floor(pick * volunteerImages.length)]
    : volunteerImages[0]

  return (
    <div className="flex min-h-dvh dark:bg-gray-900">
      <div className="hidden md:block md:w-1/2 bg-cover bg-center relative overflow-hidden">
        <Image
          src={volunteerImage}
          alt="Volunteer signup background"
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
              Become an iDebate Volunteer
            </h2>

            <div className="space-y-4 text-left">
              <div className="bg-white/80 dark:bg-gray-800/80 p-4 rounded-lg shadow">
                <h3 className="font-medium text-primary mb-2">Why join as a Volunteer?</h3>
                <ul className="text-sm text-gray-600 dark:text-gray-300 space-y-2 pl-5 list-disc">
                  <li>Judge debates across various formats</li>
                  <li>Track judging history and feedback</li>
                  <li>Contribute to student development</li>
                </ul>
              </div>

              <div className="bg-white/80 dark:bg-gray-800/80 p-4 rounded-lg shadow">
                <p className="text-sm text-gray-600 dark:text-gray-300">
                  &#34;Your expertise shapes future speakers, thinkers, and leaders. Join our network of dedicated volunteers and make a real difference.&#34;
                </p>
              </div>
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
          <VolunteerSignUpForm />
        </motion.div>
      </div>
    </div>
  )
}