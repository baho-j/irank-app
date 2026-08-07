import { describe, expect, test } from "vitest";
import {
  CHUNK_SIZE,
  ChunkCollector,
  bundleFileName,
  chunkBundle,
  decodeChunk,
  encodeChunk,
  parseBundleFile,
} from "./transport";
import { checksumOf, type Bundle, type BundleEntity } from "./bundle";

function entities(count: number): BundleEntity[] {
  return Array.from({ length: count }, (_, i) => ({
    type: "ballot" as const,
    id: `ballot${i}`,
    label: `Ballot ${i}`,
    payload: { scores: Array.from({ length: 6 }, (_, s) => ({ speaker: s, total: 70 })) },
    updated_at: 1_700_000_000_000 + i,
  }));
}

function bundle(count = 12): Bundle {
  const list = entities(count);

  return {
    version: 1,
    tournament_id: "tournament1",
    origin_device: "device-a",
    created_at: 1_700_000_000_000,
    entities: list,
    checksum: checksumOf(list),
  };
}

function scanAll(collector: ChunkCollector, chunks: ReturnType<typeof chunkBundle>) {
  let progress = collector.progress;

  for (const chunk of chunks) {
    progress = collector.accept(encodeChunk(chunk));
  }

  return progress;
}

describe("splitting a bundle across codes", () => {
  test("a small bundle still produces one frame", () => {
    const chunks = chunkBundle({ ...bundle(0), entities: [], checksum: checksumOf([]) });

    expect(chunks).toHaveLength(1);
    expect(chunks[0].total).toBe(1);
  });

  test("a large bundle is split", () => {
    const chunks = chunkBundle(bundle(200));

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.data.length <= CHUNK_SIZE)).toBe(true);
  });

  test("every frame carries the same transfer id and checksum", () => {
    const source = bundle(60);
    const chunks = chunkBundle(source);

    expect(new Set(chunks.map((c) => c.transfer)).size).toBe(1);
    expect(chunks.every((chunk) => chunk.checksum === source.checksum)).toBe(true);
  });

  test("frames are numbered from zero without gaps", () => {
    const chunks = chunkBundle(bundle(80));

    expect(chunks.map((chunk) => chunk.index)).toEqual(
      Array.from({ length: chunks.length }, (_, i) => i)
    );
  });
});

describe("reassembling a scan", () => {
  test("scanning every frame rebuilds the bundle", () => {
    const source = bundle(40);
    const progress = scanAll(new ChunkCollector(), chunkBundle(source));

    expect(progress.complete).toBe(true);
    expect(progress.error).toBeNull();
    expect(progress.bundle?.entities).toHaveLength(40);
  });

  test("frames scanned out of order still rebuild", () => {
    const source = bundle(40);
    const chunks = chunkBundle(source);
    const collector = new ChunkCollector();

    const progress = scanAll(collector, [...chunks].reverse());

    expect(progress.bundle?.entities).toHaveLength(40);
  });

  test("a repeated frame does not count twice", () => {
    const chunks = chunkBundle(bundle(40));
    const collector = new ChunkCollector();

    collector.accept(encodeChunk(chunks[0]));
    const progress = collector.accept(encodeChunk(chunks[0]));

    expect(progress.received).toBe(1);
    expect(progress.complete).toBe(false);
  });

  test("an incomplete scan reports progress and no bundle", () => {
    const chunks = chunkBundle(bundle(60));
    const collector = new ChunkCollector();

    const progress = collector.accept(encodeChunk(chunks[0]));

    expect(progress.complete).toBe(false);
    expect(progress.bundle).toBeNull();
    expect(progress.total).toBe(chunks.length);
  });

  test("a code from another app is rejected", () => {
    const progress = new ChunkCollector().accept("https://example.com");

    expect(progress.error).toMatch(/not part of an iRank transfer/i);
    expect(progress.bundle).toBeNull();
  });

  test("starting a second transfer discards the first", () => {
    const collector = new ChunkCollector();
    const first = chunkBundle(bundle(40));
    const second = chunkBundle({ ...bundle(40), origin_device: "device-b", created_at: 2 });

    collector.accept(encodeChunk(first[0]));
    const progress = collector.accept(encodeChunk(second[0]));

    expect(progress.received).toBe(1);
    expect(progress.transfer).toBe(second[0].transfer);
  });

  test("a tampered frame fails the checksum", () => {
    const source = bundle(20);
    const chunks = chunkBundle(source);
    const collector = new ChunkCollector();

    for (const chunk of chunks.slice(0, -1)) collector.accept(encodeChunk(chunk));

    const last = chunks[chunks.length - 1];
    const progress = collector.accept(
      encodeChunk({ ...last, data: last.data.replace(/\d/, "9") })
    );

    expect(progress.error).toMatch(/did not come through cleanly/i);
    expect(progress.bundle).toBeNull();
  });

  test("resetting clears a part-finished scan", () => {
    const collector = new ChunkCollector();
    collector.accept(encodeChunk(chunkBundle(bundle(40))[0]));

    collector.reset();

    expect(collector.progress.received).toBe(0);
    expect(collector.progress.transfer).toBeNull();
  });
});

describe("decoding a frame", () => {
  test("malformed text is rejected", () => {
    expect(decodeChunk("not json")).toBeNull();
  });

  test("a frame numbered beyond its total is rejected", () => {
    expect(
      decodeChunk(JSON.stringify({ transfer: "a", index: 5, total: 3, checksum: "c", data: "d" }))
    ).toBeNull();
  });

  test("a frame missing its data is rejected", () => {
    expect(
      decodeChunk(JSON.stringify({ transfer: "a", index: 0, total: 1, checksum: "c" }))
    ).toBeNull();
  });
});

describe("file transfer", () => {
  test("a written file reads back identically", () => {
    const source = bundle(30);
    const result = parseBundleFile(JSON.stringify(source));

    expect(result.rejection).toBeNull();
    expect(result.bundle?.entities).toHaveLength(30);
  });

  test("text that is not JSON is rejected", () => {
    expect(parseBundleFile("hello").rejection).toBe("unreadable");
  });

  test("JSON that is not a bundle is rejected", () => {
    expect(parseBundleFile(JSON.stringify({ hello: "world" })).rejection).toBe("not_a_bundle");
  });

  test("a bundle edited after export is rejected", () => {
    const source = bundle(10);
    const tampered = {
      ...source,
      entities: [...source.entities, entities(1)[0]],
    };

    expect(parseBundleFile(JSON.stringify(tampered)).rejection).toBe("corrupt");
  });

  test("an altered score is rejected, not just a missing record", () => {
    // A digest over ids alone would accept this: same entity, same timestamp,
    // different marks.
    const source = bundle(10);
    const tampered = {
      ...source,
      entities: source.entities.map((entity, index) =>
        index === 0 ? { ...entity, payload: { scores: [{ speaker: 0, total: 80 }] } } : entity
      ),
    };

    expect(parseBundleFile(JSON.stringify(tampered)).rejection).toBe("corrupt");
  });

  test("the file name identifies the tournament", () => {
    expect(bundleFileName(bundle())).toMatch(/^irank-tournament1-.*\.irank\.json$/);
  });
});
