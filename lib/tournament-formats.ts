/**
 * Only World Schools is supported. Pairing, ballots and breaks are all built
 * around its two-team model, and `debates` has exactly one proposition and one
 * opposition team, so the other formats are structurally unavailable rather
 * than merely unimplemented.
 */
export const TOURNAMENT_FORMATS = [
  { value: "WorldSchools", label: "World Schools", supported: true },
  { value: "BritishParliamentary", label: "British Parliamentary", supported: false },
  { value: "PublicForum", label: "Public Forum", supported: false },
  { value: "LincolnDouglas", label: "Lincoln Douglas", supported: false },
  { value: "OxfordStyle", label: "Oxford Style", supported: false },
] as const;

export type TournamentFormat = (typeof TOURNAMENT_FORMATS)[number]["value"];

export const SUPPORTED_FORMATS = TOURNAMENT_FORMATS.filter((f) => f.supported).map(
  (f) => f.value
);

export function isSupportedFormat(format: string): boolean {
  return SUPPORTED_FORMATS.includes(format as never);
}

/** World Schools fields three speakers per team. */
export const WORLD_SCHOOLS_TEAM_SIZE = 3;
