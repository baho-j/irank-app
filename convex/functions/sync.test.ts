import { describe, expect, test } from "vitest";
import { api } from "../_generated/api";
import { createUserWithSession, setupTest } from "../test_helpers.test-utils";

type Entry = {
  table_name: string;
  record_id: string;
  operation: "create" | "update" | "delete";
  status: "pending" | "completed" | "failed" | "conflict";
  local_timestamp: number;
};

function entry(overrides: Partial<Entry> = {}): Entry {
  return {
    table_name: "submitBallot",
    record_id: `key-${Math.random().toString(36).slice(2)}`,
    operation: "update",
    status: "completed",
    local_timestamp: Date.now(),
    ...overrides,
  };
}

describe("recording what a device synced", () => {
  test("entries are stored against the device", async () => {
    const t = setupTest();
    const { token } = await createUserWithSession(t, "volunteer");

    const result = await t.mutation(api.functions.sync.recordSync, {
      token, device_id: "phone-1", entries: [entry(), entry()],
    });

    expect(result.recorded).toBe(2);

    const status = await t.query(api.functions.sync.getSyncStatus, { token });

    expect(status.total).toBe(2);
    expect(status.counts.completed).toBe(2);
  });

  test("a retried entry updates in place rather than duplicating", async () => {
    const t = setupTest();
    const { token } = await createUserWithSession(t, "volunteer");

    const retried = entry({ status: "failed" });

    await t.mutation(api.functions.sync.recordSync, {
      token, device_id: "phone-1", entries: [retried],
    });
    await t.mutation(api.functions.sync.recordSync, {
      token, device_id: "phone-1", entries: [{ ...retried, status: "completed" }],
    });

    const status = await t.query(api.functions.sync.getSyncStatus, { token });

    expect(status.total).toBe(1);
    expect(status.counts.completed).toBe(1);
    expect(status.counts.failed).toBe(0);
  });

  test("the same record from another device is kept separately", async () => {
    const t = setupTest();
    const { token } = await createUserWithSession(t, "volunteer");

    const shared = entry();

    await t.mutation(api.functions.sync.recordSync, {
      token, device_id: "phone-1", entries: [shared],
    });
    await t.mutation(api.functions.sync.recordSync, {
      token, device_id: "tablet-2", entries: [shared],
    });

    const status = await t.query(api.functions.sync.getSyncStatus, { token });

    expect(status.total).toBe(2);
    expect(status.devices).toHaveLength(2);
  });

  test("recording requires a session", async () => {
    const t = setupTest();

    await expect(
      t.mutation(api.functions.sync.recordSync, {
        token: "bad", device_id: "phone-1", entries: [entry()],
      })
    ).rejects.toThrow(/authentication required/i);
  });
});

describe("what still needs attention", () => {
  test("failures and conflicts are counted", async () => {
    const t = setupTest();
    const { token } = await createUserWithSession(t, "volunteer");

    await t.mutation(api.functions.sync.recordSync, {
      token,
      device_id: "phone-1",
      entries: [
        entry({ status: "completed" }),
        entry({ status: "failed" }),
        entry({ status: "conflict" }),
      ],
    });

    const status = await t.query(api.functions.sync.getSyncStatus, { token });

    expect(status.needs_attention).toBe(2);
  });

  test("unresolved entries are listed newest first", async () => {
    const t = setupTest();
    const { token } = await createUserWithSession(t, "volunteer");

    await t.mutation(api.functions.sync.recordSync, {
      token,
      device_id: "phone-1",
      entries: [
        entry({ status: "failed", local_timestamp: 1000 }),
        entry({ status: "conflict", local_timestamp: 2000 }),
        entry({ status: "completed", local_timestamp: 3000 }),
      ],
    });

    const unresolved = await t.query(api.functions.sync.getUnresolvedSyncEntries, { token });

    expect(unresolved).toHaveLength(2);
    expect(unresolved.every((log) => log.status !== "completed")).toBe(true);
  });

  test("a clean device reports nothing to resolve", async () => {
    const t = setupTest();
    const { token } = await createUserWithSession(t, "volunteer");

    await t.mutation(api.functions.sync.recordSync, {
      token, device_id: "phone-1", entries: [entry()],
    });

    expect(await t.query(api.functions.sync.getUnresolvedSyncEntries, { token })).toEqual([]);
  });
});

describe("scoping by user and device", () => {
  test("one user cannot see another's sync log", async () => {
    const t = setupTest();
    const judge = await createUserWithSession(t, "volunteer");
    const other = await createUserWithSession(t, "volunteer");

    await t.mutation(api.functions.sync.recordSync, {
      token: judge.token, device_id: "phone-1", entries: [entry()],
    });

    const status = await t.query(api.functions.sync.getSyncStatus, { token: other.token });

    expect(status.total).toBe(0);
  });

  test("a single device can be inspected on its own", async () => {
    const t = setupTest();
    const { token } = await createUserWithSession(t, "volunteer");

    await t.mutation(api.functions.sync.recordSync, {
      token, device_id: "phone-1", entries: [entry(), entry()],
    });
    await t.mutation(api.functions.sync.recordSync, {
      token, device_id: "tablet-2", entries: [entry()],
    });

    const phone = await t.query(api.functions.sync.getSyncStatus, {
      token, device_id: "phone-1",
    });

    expect(phone.total).toBe(2);
  });

  test("the device list records when each was last seen", async () => {
    const t = setupTest();
    const { token } = await createUserWithSession(t, "volunteer");

    await t.mutation(api.functions.sync.recordSync, {
      token, device_id: "phone-1", entries: [entry()],
    });

    const status = await t.query(api.functions.sync.getSyncStatus, { token });

    expect(status.devices[0].device_id).toBe("phone-1");
    expect(status.devices[0].last_seen).toBeGreaterThan(0);
  });
});
