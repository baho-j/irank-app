import { Doc } from "../_generated/dataModel";

export type RankingEntity = "teams" | "schools" | "students" | "volunteers";
export type RankingScope = "prelims" | "full_tournament";

/**
 * Whether a tournament's results may appear in a ranking for this viewer.
 *
 * Three conditions, all required: the tournament is finished, the coordinator
 * has released that entity's rankings for that scope, and the viewer's role is
 * one the release was made visible to. Global leaderboards previously applied
 * none of them, so unreleased and in-progress results reached students and
 * schools immediately.
 */
export function isTournamentCountable(
  tournament: Doc<"tournaments">,
  entity: RankingEntity,
  role: string,
  scope: RankingScope = "full_tournament"
): boolean {
  if (tournament.status !== "completed") return false;

  const release = tournament.ranking_released;

  if (!release) return false;
  if (!release.visible_to_roles.includes(role)) return false;

  return release[scope][entity] === true;
}

/** Admins see everything, including results not yet released. */
export function countableForRole(
  tournament: Doc<"tournaments">,
  entity: RankingEntity,
  role: string,
  scope: RankingScope = "full_tournament"
): boolean {
  if (role === "admin") return tournament.status === "completed";

  return isTournamentCountable(tournament, entity, role, scope);
}

/**
 * A ballot only counts once the judge has submitted it. Drafts were previously
 * summed into public leaderboards.
 */
export function isCountableBallot(ballot: Doc<"judging_scores">): boolean {
  return ballot.submission_state === "submitted";
}
