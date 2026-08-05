import { getDb } from "./db";
import { readCache, cacheKeys } from "./cache";
import { pending } from "./outbox";

export const BUNDLE_VERSION = 1;

export type BundleEntityType =
  | "ballot"
  | "draft"
  | "lineup"
  | "ranking"
  | "payment";

export interface BundleEntity {
  type: BundleEntityType;
  /** Stable across devices, so the receiver can tell an update from an addition. */
  id: string;
  label: string;
  payload: unknown;
  updated_at: number;
}

export interface Bundle {
  version: number;
  tournament_id?: string;
  origin_device: string;
  created_at: number;
  entities: BundleEntity[];
  checksum: string;
}

/**
 * A stable, order-independent digest. Used to detect a partial or corrupted
 * transfer, particularly a QR scan that captured only some chunks.
 */
export function checksumOf(entities: BundleEntity[]): string {
  const canonical = entities
    .map((entity) => `${entity.type}:${entity.id}:${entity.updated_at}`)
    .sort()
    .join("|");

  let hash = 5381;

  for (let index = 0; index < canonical.length; index += 1) {
    hash = ((hash << 5) + hash + canonical.charCodeAt(index)) >>> 0;
  }

  return `${hash.toString(36)}-${entities.length}`;
}

export function deviceId(): string {
  if (typeof localStorage === "undefined") return "unknown-device";

  const existing = localStorage.getItem("irank_device_id");
  if (existing) return existing;

  const generated =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  localStorage.setItem("irank_device_id", generated);

  return generated;
}

export interface BuildBundleOptions {
  tournamentId?: string;
  include?: BundleEntityType[];
}

/**
 * Collects what this device knows into a transferable bundle.
 *
 * Rankings are included because a coordinator without connectivity needs the
 * standings as much as the ballots behind them, and only released ones are
 * ever cached locally in the first place.
 */
export async function buildBundle(options: BuildBundleOptions = {}): Promise<Bundle> {
  const include = options.include ?? ["ballot", "draft", "lineup", "ranking"];
  const entities: BundleEntity[] = [];
  const db = getDb();

  if (include.includes("ballot")) {
    const queued = await pending();

    queued
      .filter((entry) => entry.mutation.toLowerCase().includes("ballot"))
      .forEach((entry) => {
        entities.push({
          type: "ballot",
          id: entry.idempotency_key,
          label: "Ballot awaiting sync",
          payload: { mutation: entry.mutation, args: entry.args },
          updated_at: entry.updated_at,
        });
      });
  }

  if (include.includes("draft") && db) {
    const drafts = options.tournamentId
      ? await db.drafts.toArray()
      : await db.drafts.toArray();

    drafts.forEach((draft) => {
      entities.push({
        type: "draft",
        id: draft.key,
        label: `In-progress ballot`,
        payload: draft.payload,
        updated_at: draft.updated_at,
      });
    });
  }

  if (include.includes("ranking")) {
    for (const scope of ["student", "school", "volunteer"] as const) {
      const cached = await readCache(cacheKeys.leaderboard(scope));

      if (cached) {
        entities.push({
          type: "ranking",
          id: cacheKeys.leaderboard(scope),
          label: `${scope} rankings`,
          payload: cached.value,
          updated_at: cached.updated_at,
        });
      }
    }

    const tiers = await readCache(cacheKeys.tierTable());

    if (tiers) {
      entities.push({
        type: "ranking",
        id: cacheKeys.tierTable(),
        label: "School tiers",
        payload: tiers.value,
        updated_at: tiers.updated_at,
      });
    }
  }

  return {
    version: BUNDLE_VERSION,
    tournament_id: options.tournamentId,
    origin_device: deviceId(),
    created_at: Date.now(),
    entities,
    checksum: checksumOf(entities),
  };
}

export type BundleRejection =
  | "unsupported_version"
  | "corrupt"
  | "wrong_tournament"
  | "same_device";

export interface BundleValidation {
  valid: boolean;
  reason?: BundleRejection;
  message?: string;
}

/**
 * A bundle is rejected outright rather than partially applied, because half a
 * round of ballots is worse than none.
 */
export function validateBundle(
  bundle: Bundle,
  expected: { tournamentId?: string; deviceId?: string } = {}
): BundleValidation {
  if (bundle.version !== BUNDLE_VERSION) {
    return {
      valid: false,
      reason: "unsupported_version",
      message: `This bundle was made by a different version of iRank (v${bundle.version}). Update both devices and try again.`,
    };
  }

  if (checksumOf(bundle.entities) !== bundle.checksum) {
    return {
      valid: false,
      reason: "corrupt",
      message: "The transfer is incomplete or damaged. Scan or import it again.",
    };
  }

  if (
    expected.tournamentId &&
    bundle.tournament_id &&
    bundle.tournament_id !== expected.tournamentId
  ) {
    return {
      valid: false,
      reason: "wrong_tournament",
      message: "This bundle is from a different tournament.",
    };
  }

  if (expected.deviceId && bundle.origin_device === expected.deviceId) {
    return {
      valid: false,
      reason: "same_device",
      message: "This bundle came from this device.",
    };
  }

  return { valid: true };
}

export interface ReviewItem {
  entity: BundleEntity;
  /** What this device already holds, so the receiver can compare. */
  mine: { payload: unknown; updated_at: number } | null;
  status: "new" | "newer" | "older" | "identical";
}

/**
 * Prepares the review the receiver acts on. Nothing is applied here: the
 * receiver decides per item, so a coordinator can take one judge's ballots
 * without taking everything else on that device.
 */
export async function prepareReview(bundle: Bundle): Promise<ReviewItem[]> {
  const db = getDb();

  return await Promise.all(
    bundle.entities.map(async (entity): Promise<ReviewItem> => {
      let mine: ReviewItem["mine"] = null;

      if (entity.type === "draft" && db) {
        const existing = await db.drafts.get(entity.id);
        if (existing) {
          mine = { payload: existing.payload, updated_at: existing.updated_at };
        }
      }

      if (entity.type === "ranking") {
        const existing = await readCache(entity.id);
        if (existing) {
          mine = { payload: existing.value, updated_at: existing.updated_at };
        }
      }

      if (!mine) return { entity, mine: null, status: "new" };

      if (JSON.stringify(mine.payload) === JSON.stringify(entity.payload)) {
        return { entity, mine, status: "identical" };
      }

      return {
        entity,
        mine,
        status: entity.updated_at > mine.updated_at ? "newer" : "older",
      };
    })
  );
}
