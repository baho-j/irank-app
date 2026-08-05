"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useOffline } from "@/hooks/use-offline";
import type { Id } from "@/convex/_generated/dataModel";

export function useNames(token: string, userIds: string[]) {
  return useOffline(useQuery(api.functions.ballots.getUserNames, {
    token,
    user_ids: userIds as Id<"users">[],
  }), "speaker names");
}
