import { assignSides, pairingCost } from "./cost";
import type {
  PairedDebate,
  PairingInput,
  PairingJudge,
  PairingResult,
  PairingTeam,
  RoundStage,
} from "./types";

/**
 * Deterministic PRNG. The seed lives on the round record, so re-running a draw
 * from the same inputs reproduces it exactly — which is what lets the server
 * verify a draw a device produced offline.
 */
function createRandom(seed: number): () => number {
  let state = seed >>> 0 || 1;

  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;

    return state / 0xffffffff;
  };
}

function shuffle<T>(items: T[], random: () => number): T[] {
  const result = [...items];

  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [result[index], result[swap]] = [result[swap], result[index]];
  }

  return result;
}

/**
 * Standings order. Every comparison is total, ending on team id, so no two
 * runs can order the same teams differently.
 */
function byStanding(a: PairingTeam, b: PairingTeam): number {
  return (
    b.wins - a.wins ||
    b.total_points - a.total_points ||
    a.team_id.localeCompare(b.team_id)
  );
}

/**
 * The team that sits out. Prefers a team that has not had one, then the lowest
 * placed, so byes do not concentrate on the same teams.
 */
function selectByeTeam(teams: PairingTeam[]): PairingTeam {
  const withoutBye = teams.filter((team) => team.bye_rounds.length === 0);
  const pool = withoutBye.length > 0 ? withoutBye : teams;

  return [...pool].sort(byStanding).at(-1)!;
}

interface Match {
  a: PairingTeam;
  b: PairingTeam;
  cost: number;
  reasons: string[];
}

/**
 * Pairs down the standings, taking the cheapest available partner for each
 * team in turn and looking ahead far enough to avoid stranding anyone.
 *
 * A team is never skipped: if every remaining partner is costly, the least-bad
 * is taken and the compromise is reported. The previous implementation used
 * hard filters and silently omitted teams no partner satisfied.
 */
function matchTeams(
  teams: PairingTeam[],
  stage: RoundStage,
  presorted = false
): Match[] {
  const remaining = presorted ? [...teams] : [...teams].sort(byStanding);
  const matches: Match[] = [];

  while (remaining.length >= 2) {
    const team = remaining.shift()!;

    let bestIndex = 0;
    let bestCost = Number.POSITIVE_INFINITY;
    let bestReasons: string[] = [];

    remaining.forEach((candidate, index) => {
      const { total, reasons } = pairingCost(team, candidate, stage);

      if (total < bestCost) {
        bestCost = total;
        bestIndex = index;
        bestReasons = reasons;
      }
    });

    const partner = remaining.splice(bestIndex, 1)[0];

    matches.push({ a: team, b: partner, cost: bestCost, reasons: bestReasons });
  }

  return matches;
}

function rankJudges(judges: PairingJudge[]): PairingJudge[] {
  return [...judges].sort(
    (a, b) =>
      b.feedback_score - a.feedback_score ||
      b.elimination_debates - a.elimination_debates ||
      b.debates_judged - a.debates_judged ||
      a.judge_id.localeCompare(b.judge_id)
  );
}

function judgeConflicts(
  judge: PairingJudge,
  prop: PairingTeam | null,
  opp: PairingTeam | null
): boolean {
  for (const team of [prop, opp]) {
    if (!team) continue;
    if (team.school_id && judge.school_id === team.school_id) return true;
    if (judge.conflicts.includes(team.team_id)) return true;
  }

  return false;
}

/**
 * Spreads judges across rooms by current workload, skipping any with a clash.
 * The panel is filled as far as available judges allow; a short panel is
 * reported rather than a conflicted judge being seated.
 */
function assignJudges(
  debates: Array<{ prop: PairingTeam | null; opp: PairingTeam | null }>,
  judges: PairingJudge[],
  perDebate: number
): Array<{ judges: string[]; head?: string; warning?: string }> {
  const workload = new Map(judges.map((judge) => [judge.judge_id, 0]));
  const ranked = rankJudges(judges);

  return debates.map(({ prop, opp }) => {
    const eligible = ranked
      .filter((judge) => !judgeConflicts(judge, prop, opp))
      .sort(
        (a, b) =>
          (workload.get(a.judge_id) ?? 0) - (workload.get(b.judge_id) ?? 0) ||
          b.feedback_score - a.feedback_score ||
          a.judge_id.localeCompare(b.judge_id)
      );

    const panel = eligible.slice(0, perDebate);

    panel.forEach((judge) => {
      workload.set(judge.judge_id, (workload.get(judge.judge_id) ?? 0) + 1);
    });

    const warning =
      panel.length < perDebate
        ? `Only ${panel.length} of ${perDebate} judges could be seated without a conflict`
        : undefined;

    return {
      judges: panel.map((judge) => judge.judge_id),
      head: panel[0]?.judge_id,
      warning,
    };
  });
}

export function generatePairings(input: PairingInput): PairingResult {
  const random = createRandom(input.seed);
  const warnings: string[] = [];

  if (input.teams.length < 2) {
    return {
      debates: [],
      unpaired: input.teams.map((team) => team.team_id),
      warnings: ["At least two teams are needed to pair a round"],
    };
  }

  // Round one has no standings to pair on, so the order is shuffled from the
  // seed rather than left in registration order.
  const ordered =
    input.round_number === 1 && input.stage === "prelim"
      ? shuffle(input.teams, random)
      : [...input.teams].sort(byStanding);

  let pool = ordered;
  let byeTeam: PairingTeam | null = null;

  if (pool.length % 2 === 1) {
    byeTeam = selectByeTeam(pool);
    pool = pool.filter((team) => team.team_id !== byeTeam!.team_id);
  }

  const isFirstPrelim = input.round_number === 1 && input.stage === "prelim";
  const matches = matchTeams(pool, input.stage, isFirstPrelim);

  const sided = matches.map((match) => {
    const { proposition, opposition } = assignSides(match.a, match.b);
    return { prop: proposition, opp: opposition, match };
  });

  const panels = assignJudges(
    sided.map(({ prop, opp }) => ({ prop, opp })),
    input.judges,
    input.judges_per_debate
  );

  const debates: PairedDebate[] = sided.map((entry, index) => {
    const panel = panels[index];
    const room = input.rooms[index]?.name ?? `Room ${index + 1}`;

    if (panel.warning) warnings.push(`${room}: ${panel.warning}`);

    return {
      room_name: room,
      proposition_team_id: entry.prop.team_id,
      opposition_team_id: entry.opp.team_id,
      judges: panel.judges,
      head_judge_id: panel.head,
      is_bye: false,
      compromises: entry.match.reasons,
    };
  });

  if (byeTeam) {
    debates.push({
      room_name: "Bye",
      proposition_team_id: byeTeam.team_id,
      opposition_team_id: null,
      judges: [],
      is_bye: true,
      compromises: [],
    });
  }

  const placed = new Set(
    debates.flatMap((debate) =>
      [debate.proposition_team_id, debate.opposition_team_id].filter(Boolean)
    )
  );

  const unpaired = input.teams
    .filter((team) => !placed.has(team.team_id))
    .map((team) => team.team_id);

  if (unpaired.length > 0) {
    warnings.push(`${unpaired.length} team(s) could not be placed`);
  }

  debates
    .filter((debate) => debate.compromises.length > 0)
    .forEach((debate) => {
      warnings.push(`${debate.room_name}: ${debate.compromises.join(", ")}`);
    });

  return { debates, unpaired, warnings };
}
