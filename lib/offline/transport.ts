import { Bundle, BUNDLE_VERSION, checksumOf } from "./bundle";

/**
 * A QR code holds only so much, so a tournament bundle travels as a sequence
 * of frames the receiving device reassembles. Each frame carries the transfer
 * id and its position, so frames can arrive in any order and out of sequence
 * scans are discarded rather than silently merged.
 */
export interface QrChunk {
  /** Identifies this transfer, so frames from two exports never mix. */
  transfer: string;
  index: number;
  total: number;
  /** The bundle checksum, repeated so a partial scan can be detected. */
  checksum: string;
  data: string;
}

/**
 * Bytes per frame. A QR code at error-correction level M tops out near 2,300
 * characters; staying well below keeps the code readable on a cracked phone
 * screen in poor light, which is the usual condition at a venue.
 */
export const CHUNK_SIZE = 800;

export function encodeBundle(bundle: Bundle): string {
  return JSON.stringify(bundle);
}

export function chunkBundle(bundle: Bundle, chunkSize = CHUNK_SIZE): QrChunk[] {
  const encoded = encodeBundle(bundle);
  const transfer = `${bundle.origin_device}-${bundle.created_at}`;
  const total = Math.max(1, Math.ceil(encoded.length / chunkSize));

  return Array.from({ length: total }, (_, index) => ({
    transfer,
    index,
    total,
    checksum: bundle.checksum,
    data: encoded.slice(index * chunkSize, (index + 1) * chunkSize),
  }));
}

export function encodeChunk(chunk: QrChunk): string {
  return JSON.stringify(chunk);
}

export function decodeChunk(raw: string): QrChunk | null {
  try {
    const parsed = JSON.parse(raw) as QrChunk;

    const valid =
      typeof parsed.transfer === "string" &&
      typeof parsed.checksum === "string" &&
      typeof parsed.data === "string" &&
      Number.isInteger(parsed.index) &&
      Number.isInteger(parsed.total) &&
      parsed.index >= 0 &&
      parsed.total > 0 &&
      parsed.index < parsed.total;

    return valid ? parsed : null;
  } catch {
    return null;
  }
}

export interface ScanProgress {
  transfer: string | null;
  received: number;
  total: number;
  complete: boolean;
  bundle: Bundle | null;
  error: string | null;
}

export const EMPTY_SCAN: ScanProgress = {
  transfer: null,
  received: 0,
  total: 0,
  complete: false,
  bundle: null,
  error: null,
};

/**
 * Collects scanned frames until the set is complete.
 *
 * Frames from a different transfer replace the collection rather than merging
 * into it: scanning a second device's export mid-way through the first would
 * otherwise assemble a bundle from two sources.
 */
export class ChunkCollector {
  private transfer: string | null = null;
  private total = 0;
  private checksum = "";
  private chunks = new Map<number, string>();

  get progress(): ScanProgress {
    return {
      transfer: this.transfer,
      received: this.chunks.size,
      total: this.total,
      complete: this.total > 0 && this.chunks.size === this.total,
      bundle: null,
      error: null,
    };
  }

  reset(): void {
    this.transfer = null;
    this.total = 0;
    this.checksum = "";
    this.chunks.clear();
  }

  accept(raw: string): ScanProgress {
    const chunk = decodeChunk(raw);

    if (!chunk) {
      return { ...this.progress, error: "That code is not part of an iRank transfer." };
    }

    if (this.transfer && chunk.transfer !== this.transfer) {
      this.reset();
    }

    this.transfer = chunk.transfer;
    this.total = chunk.total;
    this.checksum = chunk.checksum;
    this.chunks.set(chunk.index, chunk.data);

    if (this.chunks.size < this.total) return this.progress;

    const assembled = Array.from({ length: this.total }, (_, index) => this.chunks.get(index) ?? "").join("");

    try {
      const bundle = JSON.parse(assembled) as Bundle;

      if (checksumOf(bundle.entities) !== this.checksum) {
        return {
          ...this.progress,
          complete: true,
          error: "The scan did not come through cleanly. Start the transfer again.",
        };
      }

      return { ...this.progress, complete: true, bundle };
    } catch {
      return {
        ...this.progress,
        complete: true,
        error: "The scan did not come through cleanly. Start the transfer again.",
      };
    }
  }
}

export function bundleFileName(bundle: Bundle): string {
  const stamp = new Date(bundle.created_at).toISOString().slice(0, 19).replace(/[:T]/g, "-");

  return `irank-${bundle.tournament_id ?? "tournament"}-${stamp}.irank.json`;
}

export function bundleToBlob(bundle: Bundle): Blob {
  return new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
}

export type FileRejection = "unreadable" | "not_a_bundle" | "corrupt";

export interface FileReadResult {
  bundle: Bundle | null;
  rejection: FileRejection | null;
}

export function parseBundleFile(contents: string): FileReadResult {
  let parsed: Bundle;

  try {
    parsed = JSON.parse(contents) as Bundle;
  } catch {
    return { bundle: null, rejection: "unreadable" };
  }

  const looksLikeBundle =
    typeof parsed?.version === "number" &&
    typeof parsed?.origin_device === "string" &&
    Array.isArray(parsed?.entities);

  if (!looksLikeBundle) return { bundle: null, rejection: "not_a_bundle" };

  if (checksumOf(parsed.entities) !== parsed.checksum) {
    return { bundle: null, rejection: "corrupt" };
  }

  return { bundle: parsed, rejection: null };
}

export function describeFileRejection(rejection: FileRejection): string {
  switch (rejection) {
    case "unreadable":
      return "That file could not be read.";
    case "not_a_bundle":
      return "That file is not an iRank transfer.";
    case "corrupt":
      return "That file is incomplete or was changed after it was exported.";
  }
}

export { BUNDLE_VERSION };
