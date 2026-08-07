import { Brain, Target, Users2 } from "lucide-react";

/** Presentation for the three WSDC criteria; the ranges live in lib/scoring/wsdc. */
export const SCORING_CATEGORIES = [
  {
    key: "style" as const,
    label: "Style",
    icon: Users2,
    description: "Delivery, clarity, pace, volume, and engagement",
    color: "text-blue-600",
    weight: "40%",
  },
  {
    key: "content" as const,
    label: "Content",
    icon: Brain,
    description: "Arguments, evidence, analysis, and rebuttal",
    color: "text-green-600",
    weight: "40%",
  },
  {
    key: "strategy" as const,
    label: "Strategy",
    icon: Target,
    description: "Structure, prioritisation, timing, and role fulfilment",
    color: "text-purple-600",
    weight: "20%",
  },
];
