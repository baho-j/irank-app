import { describe, expect, test } from "vitest";
import { generatePairings } from "./engine";
import type { PairingTeam } from "./types";

function field(count: number, round: number): PairingTeam[] {
  return Array.from({ length: count }, (_, i) => ({
    team_id: `t${i.toString().padStart(4, "0")}`,
    name: `Team ${i}`,
    school_id: `school${Math.floor(i / 3)}`,
    wins: (i * 7) % round,
    total_points: 2000 - ((i * 13) % 200),
    opponents_faced: Array.from({ length: round - 1 }, (_, r) => `t${((i + r + 1) % count).toString().padStart(4, "0")}`),
    prior_opponents: [`t${((i + 5) % count).toString().padStart(4, "0")}`],
    side_history: Array.from({ length: round - 1 }, (_, r): "proposition" | "opposition" =>
      r % 2 === 0 ? "proposition" : "opposition"
    ),
    bye_rounds: [],
  }));
}

/**
 * A Dreams camp of roughly five hundred students is about 166 teams, and tab
 * pairs a round on a laptop or phone while the room waits. A draw that takes
 * minutes is unusable however correct it is.
 */
describe("pairing a large field stays fast", () => {
  test.each([64, 166, 250, 400])("%i teams pairs in under two seconds", (count) => {
    const teams = field(count, 4);

    const start = Date.now();
    const result = generatePairings({
      teams, judges: [], rooms: [],
      round_number: 4, stage: "prelim", judges_per_debate: 1, seed: 11,
    });
    const elapsed = Date.now() - start;

    expect(result.debates.length).toBe(Math.floor(count / 2));
    expect(elapsed).toBeLessThan(2000);
  });
});
