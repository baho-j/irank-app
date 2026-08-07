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
 * Pairs the field at the lowest total cost.
 *
 * Taking each team's cheapest partner in turn is not enough: a choice that
 * looks cheap at the top of the standings can strand two teams at the bottom
 * who have already met, forcing a repeat the field as a whole did not require.
 * So the greedy pass is only a starting point, and pairs are then swapped
 * wherever a swap lowers the combined cost.
 *
 * A team is never skipped. If every partner is costly the least-bad is taken
 * and the compromise is reported.
 */
function matchTeams(
  teams: PairingTeam[],
  stage: RoundStage,
  presorted = false
): Match[] {
  const ordered = presorted ? [...teams] : [...teams].sort(byStanding);
  const remaining = [...ordered];
  const pairs: Array<[PairingTeam, PairingTeam]> = [];

  while (remaining.length >= 2) {
    const team = remaining.shift()!;

    let bestIndex = 0;
    let bestCost = Number.POSITIVE_INFINITY;

    remaining.forEach((candidate, index) => {
      const { total } = pairingCost(team, candidate, stage);

      if (total < bestCost) {
        bestCost = total;
        bestIndex = index;
      }
    });

    pairs.push([team, remaining.splice(bestIndex, 1)[0]]);
  }

  improve(pairs, stage);

  return pairs.map(([a, b]) => {
    const { total, reasons } = pairingCost(a, b, stage);

    return { a, b, cost: total, reasons };
  });
}

/** The cost of a pairing, taken as the worse of the two directions. */
function costOf(a: PairingTeam, b: PairingTeam, stage: RoundStage): number {
  return Math.max(pairingCost(a, b, stage).total, pairingCost(b, a, stage).total);
}

/**
 * Repeatedly swaps partners between two pairs whenever doing so lowers their
 * combined cost, until no swap helps. Pairs are visited in a fixed order and
 * only a strict improvement is accepted, so the result stays deterministic.
 */
function improve(pairs: Array<[PairingTeam, PairingTeam]>, stage: RoundStage): void {
  const maxPasses = 20;

  for (let pass = 0; pass < maxPasses; pass += 1) {
    let improved = false;

    for (let i = 0; i < pairs.length; i += 1) {
      for (let j = i + 1; j < pairs.length; j += 1) {
        const [a1, a2] = pairs[i];
        const [b1, b2] = pairs[j];

        const current = costOf(a1, a2, stage) + costOf(b1, b2, stage);
        const swapFirst = costOf(a1, b1, stage) + costOf(a2, b2, stage);
        const swapSecond = costOf(a1, b2, stage) + costOf(a2, b1, stage);

        if (swapFirst < current && swapFirst <= swapSecond) {
          pairs[i] = [a1, b1];
          pairs[j] = [a2, b2];
          improved = true;
        } else if (swapSecond < current) {
          pairs[i] = [a1, b2];
          pairs[j] = [a2, b1];
          improved = true;
        }
      }
    }

    if (!improved) return;
  }
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

  // Rooms run at the same time, so a judge cannot cover more than one of them.
  const judgesNeeded = sided.length * input.judges_per_debate;

  if (input.judges.length < judgesNeeded) {
    warnings.push(
      `${input.judges.length} judges available for ${sided.length} rooms needing ${judgesNeeded}. Some judges are assigned to rooms running at the same time.`
    );
  }

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
