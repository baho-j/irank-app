"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Check, CloudOff, Loader2, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SaveStatus } from "./use-autosave";

const PRESENTATION: Record<
  Exclude<SaveStatus, "idle">,
  { icon: typeof Check; label: string; className: string }
> = {
  pending: { icon: Pencil, label: "Unsaved changes", className: "text-muted-foreground" },
  saving: { icon: Loader2, label: "Saving draft…", className: "text-muted-foreground" },
  saved: { icon: Check, label: "Draft saved", className: "text-green-600" },
  error: { icon: CloudOff, label: "Saved on this device only", className: "text-amber-600" },
};

interface SaveIndicatorProps {
  status: SaveStatus;
  className?: string;
}

export function SaveIndicator({ status, className }: SaveIndicatorProps) {
  const reduceMotion = useReducedMotion();

  if (status === "idle") return null;

  const { icon: Icon, label, className: tone } = PRESENTATION[status];

  return (
    <AnimatePresence mode="wait">
      <motion.span
        key={status}
        initial={reduceMotion ? false : { opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        exit={reduceMotion ? undefined : { opacity: 0, y: -4 }}
        transition={{ duration: 0.18 }}
        role="status"
        aria-live="polite"
        className={cn("flex items-center gap-1.5 text-xs", tone, className)}
      >
        <Icon className={cn("h-3.5 w-3.5", status === "saving" && "animate-spin")} />
        {label}
      </motion.span>
    </AnimatePresence>
  );
}
